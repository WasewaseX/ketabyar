//! Integration tests for the ketabyar-core engine, run against a REAL SQLite
//! database with the production schema. Covers the full circulation lifecycle:
//! books → copies → members → checkout → return (+ fines) → reservations
//! (accept/queue/fulfil/expire) → backup/export/import → factory reset, plus
//! the empty-library boot case and every uniqueness/limit rule.

use ketabyar_core::repo::{books as b, circulation as c, members as m, support as s, *};
use ketabyar_core::*;
use serde_json::{json, Value};

fn db() -> rusqlite::Connection {
    open_memory_with_schema().expect("schema applies to a fresh database")
}

fn member_json(number: &str, role: &str) -> Value {
    json!({ "full_name": "عضو تستی", "role": role, "status": "active", "member_number": number })
}

fn book_json(title: &str) -> Value {
    json!({ "title": title, "language": "فارسی", "author": "نویسندهٔ آزمون", "category": "ریاضیات", "publisher": "انتشارات آزمون" })
}

#[test]
fn fresh_boot_is_empty_and_healthy() {
    let conn = db();
    assert!(b::books(&conn, "", "").unwrap().is_empty());
    assert!(m::members(&conn, "").unwrap().is_empty());
    assert!(c::loans(&conn, false).unwrap().is_empty());
    assert!(c::reservations(&conn, DEFAULT_ACTOR).unwrap().is_empty());
    assert!(s::fines(&conn).unwrap().is_empty());
    let d = s::dashboard(&conn).unwrap();
    assert_eq!(
        (d.titles, d.copies, d.on_loan, d.members, d.overdue),
        (0, 0, 0, 0, 0)
    );
    assert_eq!(d.activity.len(), 7);
    assert_eq!(d.circulation_rhythm.len(), 6);
    let settings = get_library_settings(&conn).unwrap();
    assert_eq!(settings.loan_days, 14.0);
    assert!(settings.fines_enabled);
}

#[test]
fn save_book_with_first_copy_and_tag_colors() {
    let conn = db();
    let mut input = book_json("ریاضیات عمومی");
    input["barcode"] = json!("BAR-1");
    input["accession"] = json!("ACC-1");
    input["tags"] = json!("تست, ریاضی, تست");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();

    let all = b::books(&conn, "", "").unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0]["title"], "ریاضیات عمومی");
    assert_eq!(all[0]["author"], "نویسندهٔ آزمون");
    assert_eq!(all[0]["total_copies"], 1);
    assert_eq!(all[0]["available_copies"], 1);

    // barcode/accession used, copy exists and is available
    let copies = b::copies(&conn, "").unwrap();
    assert_eq!(copies.len(), 1);
    assert_eq!(copies[0]["barcode"], "BAR-1");
    assert_eq!(copies[0]["status"], "available");
}

#[test]
fn duplicate_barcode_is_rejected() {
    let conn = db();
    let mut input = book_json("کتاب یک");
    input["barcode"] = json!("BAR-DUP");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let mut second = book_json("کتاب دو");
    second["barcode"] = json!("bar-dup"); // case-insensitive collision
    let err = b::save_book(&conn, DEFAULT_ACTOR, &second).unwrap_err();
    assert!(err.message.contains("بارکد"));
}

#[test]
fn duplicate_accession_is_rejected() {
    let conn = db();
    let mut input = book_json("کتاب یک");
    input["accession"] = json!("ACC-DUP");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let mut second = book_json("کتاب دو");
    second["accession"] = json!("acc-dup");
    let err = b::save_book(&conn, DEFAULT_ACTOR, &second).unwrap_err();
    assert!(err.message.contains("شماره دی‌سک"));
}

#[test]
fn update_book_patch_semantics_and_author_swap() {
    let conn = db();
    b::save_book(&conn, DEFAULT_ACTOR, &book_json("عنوان قدیم")).unwrap();
    let id = b::books(&conn, "", "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();

    b::update_book(
        &conn,
        DEFAULT_ACTOR,
        &id,
        &json!({ "title": "عنوان نو", "author": "نویسندهٔ دوم", "publisher": "نشر نو" }),
    )
    .unwrap();
    let book = &b::books(&conn, "نو", "").unwrap()[0];
    assert_eq!(book["title"], "عنوان نو");
    assert_eq!(book["author"], "نویسندهٔ دوم");
    assert_eq!(book["publisher"], "نشر نو");
}

#[test]
fn archive_book_blocked_while_loaned() {
    let conn = db();
    let mut input = book_json("کتاب امانتی");
    input["barcode"] = json!("BAR-L");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let book_id = b::books(&conn, "", "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    m::save_member(&conn, DEFAULT_ACTOR, &member_json("111111", "student")).unwrap();
    let member_id = m::members(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let copy_id = b::copies(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();

    c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        &[copy_id],
        3.0,
        "external",
    )
    .unwrap();
    let err = b::delete_book(&conn, DEFAULT_ACTOR, &book_id).unwrap_err();
    assert!(err.message.contains("بازگردانده"));
}

#[test]
fn member_lifecycle_ban_and_hard_delete_rules() {
    let conn = db();
    let member = m::save_member(&conn, DEFAULT_ACTOR, &member_json("", "student")).unwrap();
    let id = member["id"].as_str().unwrap().to_string();
    assert!(!member["member_number"].as_str().unwrap().is_empty());
    assert_eq!(member["reservation_banned"], json!(false));

    m::ban_member(&conn, DEFAULT_ACTOR, &id, "تست").unwrap();
    let banned = &m::members(&conn, "").unwrap()[0];
    assert_eq!(banned["reservation_banned"], json!(true));
    assert_eq!(banned["ban_reason"], "تست");
    m::unban_member(&conn, DEFAULT_ACTOR, &id).unwrap();
    assert_eq!(
        m::members(&conn, "").unwrap()[0]["reservation_banned"],
        json!(false)
    );

    m::update_member(&conn, DEFAULT_ACTOR, &id, &json!({ "status": "suspended" })).unwrap();
    assert_eq!(m::members(&conn, "").unwrap()[0]["status"], "suspended");

    // archive path with no loans: allowed; hard delete also allowed (no loan history)
    m::delete_member(&conn, DEFAULT_ACTOR, &id).unwrap();
    assert!(m::members(&conn, "").unwrap().is_empty());
    let member2 = m::save_member(&conn, DEFAULT_ACTOR, &member_json("", "staff")).unwrap();
    m::hard_delete_member(&conn, DEFAULT_ACTOR, member2["id"].as_str().unwrap()).unwrap();
    assert!(m::members(&conn, "").unwrap().is_empty());
}

#[test]
fn member_saved_by_persian_digit_student_id_is_normalised_and_searchable() {
    let conn = db();
    // The librarian types the student ID on a Persian keyboard (۴۰۲۱۲۳۴۵).
    let member = m::save_member(&conn, DEFAULT_ACTOR, &member_json("۴۰۲۱۲۳۴۵", "student")).unwrap();
    // Stored ID must be ASCII so scans/searches/reports always match.
    assert_eq!(member["member_number"], json!("40212345"));

    // Persian-digit search terms find the ASCII-stored student.
    assert_eq!(m::members(&conn, "۴۰۲۱۲۳۴۵").unwrap().len(), 1);
    assert_eq!(m::members(&conn, "40212345").unwrap().len(), 1);

    // A duplicate Persian-digit entry collides with the ASCII original.
    let clash = m::save_member(&conn, DEFAULT_ACTOR, &member_json("40212345", "student"));
    assert!(clash.is_err(), "duplicate student ID must be rejected");

    // Editing the student ID works and normalises Persian digits too.
    let id = member["id"].as_str().unwrap().to_string();
    m::update_member(&conn, DEFAULT_ACTOR, &id, &json!({ "member_number": "۴۰۳۹۹۸۸۷" })).unwrap();
    let updated = &m::members(&conn, "").unwrap()[0];
    assert_eq!(updated["member_number"], json!("40399887"));

    // Editing onto another member's ID is rejected, not silently retried.
    m::save_member(&conn, DEFAULT_ACTOR, &member_json("111222333", "staff")).unwrap();
    let edit_clash = m::update_member(&conn, DEFAULT_ACTOR, &id, &json!({ "member_number": "111222333" }));
    assert!(edit_clash.is_err(), "duplicate student ID edit must be rejected");
}

#[test]
fn checkout_return_creates_overdue_fine_with_cap() {
    let conn = db();
    let mut input = book_json("کتاب جریمه");
    input["barcode"] = json!("BAR-F");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let copy_id = b::copies(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let member_id = m::save_member(&conn, DEFAULT_ACTOR, &member_json("222222", "student"))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();

    // Tight rules: 10 IRR/day, cap 50, no grace
    save_library_settings(&conn, DEFAULT_ACTOR, &json!({ "fines_enabled": true, "fine_per_day": 10, "max_fine_amount": 50, "grace_period_enabled": false })).unwrap();

    c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        std::slice::from_ref(&copy_id),
        3.0,
        "external",
    )
    .unwrap();
    assert_eq!(b::copies(&conn, "").unwrap()[0]["status"], "on-loan");

    // Backdate the loan 7 days past due (due was now+14d)
    let past_due = iso_from_ms(chrono::Utc::now().timestamp_millis() - ms(7.0));
    c::update_loan_due_date(&conn, DEFAULT_ACTOR, &open_loan_id(&conn), &past_due).unwrap();

    c::return_copies(&conn, DEFAULT_ACTOR, &[copy_id]).unwrap();
    assert_eq!(b::copies(&conn, "").unwrap()[0]["status"], "available");

    let fines = s::fines(&conn).unwrap();
    assert_eq!(fines.len(), 1);
    // 7 days late, 10/day = 70 capped at 50
    assert_eq!(fines[0]["amount"], 50.0);
    assert_eq!(fines[0]["status"], "open");

    // Pay it
    s::pay_fine(&conn, DEFAULT_ACTOR, fines[0]["id"].as_str().unwrap()).unwrap();
    assert_eq!(s::fines(&conn).unwrap()[0]["status"], "paid");
}

fn open_loan_id(conn: &rusqlite::Connection) -> String {
    crate::select(
        conn,
        "SELECT id FROM loans WHERE returned_at IS NULL LIMIT 1",
        &[],
    )
    .unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string()
}

#[test]
fn loan_limit_enforced() {
    let conn = db();
    save_library_settings(&conn, DEFAULT_ACTOR, &json!({ "loan_limit": 1 })).unwrap();
    let member_id = m::save_member(&conn, DEFAULT_ACTOR, &member_json("333333", "student"))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let mut copy_ids = Vec::new();
    for i in 1..=3 {
        let mut input = book_json(&format!("کتاب {}", i));
        input["barcode"] = json!(format!("BAR-{}", i));
        b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
        copy_ids.push(
            b::copies(&conn, &format!("BAR-{}", i)).unwrap()[0]["id"]
                .as_str()
                .unwrap()
                .to_string(),
        );
    }
    // Batch checkout of 2 against limit 1 → rejected
    let err = c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        &copy_ids[..2],
        1.0,
        "external",
    )
    .unwrap_err();
    assert!(err.message.contains("سقف امانت"));
    // One by one: first ok, second rejected (settings limit = 1)
    c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        &[copy_ids[0].clone()],
        1.0,
        "external",
    )
    .unwrap();
    let err = c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        std::slice::from_ref(&copy_ids[1]),
        1.0,
        "external",
    )
    .unwrap_err();
    assert!(err.message.contains("سقف امانت"));
}

#[test]
fn visitor_cannot_checkout_external_but_internal_ok() {
    let conn = db();
    let member_id = m::save_member(&conn, DEFAULT_ACTOR, &member_json("444444", "visitor"))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let mut input = book_json("کتاب مهمان");
    input["barcode"] = json!("BAR-V");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let copy_id = b::copies(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();

    let err = c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        std::slice::from_ref(&copy_id),
        3.0,
        "external",
    )
    .unwrap_err();
    assert!(err.message.contains("مهمانان"));
    c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        &[copy_id],
        3.0,
        "internal",
    )
    .unwrap();
    assert_eq!(c::loans(&conn, true).unwrap()[0]["scope"], "internal");
}

#[test]
fn banned_member_cannot_checkout_external() {
    let conn = db();
    let member_id = m::save_member(&conn, DEFAULT_ACTOR, &member_json("555555", "student"))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    m::ban_member(&conn, DEFAULT_ACTOR, &member_id, "قانون").unwrap();
    let mut input = book_json("کتاب محروم");
    input["barcode"] = json!("BAR-B");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let copy_id = b::copies(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let err = c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        &[copy_id],
        3.0,
        "external",
    )
    .unwrap_err();
    assert!(err.message.contains("محروم"));
}

#[test]
fn renew_respects_limit_and_extends_from_max_of_due_and_now() {
    let conn = db();
    save_library_settings(
        &conn,
        DEFAULT_ACTOR,
        &json!({ "renew_limit": 1, "loan_days": 14 }),
    )
    .unwrap();
    let member_id = m::save_member(&conn, DEFAULT_ACTOR, &member_json("666666", "student"))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let mut input = book_json("کتاب تمدید");
    input["barcode"] = json!("BAR-R");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let copy_id = b::copies(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        &[copy_id],
        3.0,
        "external",
    )
    .unwrap();
    let loan_id = open_loan_id(&conn);
    let due0 = c::loans(&conn, true).unwrap()[0]["due_at"]
        .as_str()
        .unwrap()
        .to_string();

    c::renew_loan(&conn, DEFAULT_ACTOR, &loan_id).unwrap();
    let due1 = c::loans(&conn, true).unwrap()[0]["due_at"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(iso_to_ms(&due1) > iso_to_ms(&due0));
    assert_eq!(c::loans(&conn, true).unwrap()[0]["renewed_count"], 1);

    let err = c::renew_loan(&conn, DEFAULT_ACTOR, &loan_id).unwrap_err();
    assert!(err.message.contains("سقف تمدید"));
}

#[test]
fn reservation_full_lifecycle() {
    let conn = db();
    // one copy, on loan
    let mut input = book_json("کتاب رزرو");
    input["barcode"] = json!("BAR-RES");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let book_id = b::books(&conn, "", "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let copy_id = b::copies(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let holder = m::save_member(&conn, DEFAULT_ACTOR, &member_json("777001", "student")).unwrap()
        ["id"]
        .as_str()
        .unwrap()
        .to_string();
    let waiter = m::save_member(&conn, DEFAULT_ACTOR, &json!({ "full_name": "منتظر", "role": "student", "status": "active", "member_number": "777002" })).unwrap()["id"]
        .as_str().unwrap().to_string();
    c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &holder,
        std::slice::from_ref(&copy_id),
        3.0,
        "external",
    )
    .unwrap();

    // request → pending → accept with no copy → queued
    let res_id =
        c::add_reservation(&conn, DEFAULT_ACTOR, &book_id, &waiter, "external", None).unwrap();
    let row = c::reservations(&conn, DEFAULT_ACTOR)
        .unwrap()
        .into_iter()
        .find(|r| r["id"] == res_id)
        .unwrap();
    assert_eq!(row["status"], "pending");

    let accepted = c::accept_reservation(&conn, DEFAULT_ACTOR, &res_id, None).unwrap();
    assert_eq!(accepted["status"], "queued");
    assert_eq!(accepted["position"], 1);

    // banned member cannot reserve
    m::ban_member(&conn, DEFAULT_ACTOR, &waiter, "x").unwrap();
    let err =
        c::add_reservation(&conn, DEFAULT_ACTOR, &book_id, &waiter, "external", None).unwrap_err();
    assert!(err.message.contains("محروم"));
    m::unban_member(&conn, DEFAULT_ACTOR, &waiter).unwrap();

    // return the copy → queue advances → reservation becomes ready, copy reserved
    c::return_copies(&conn, DEFAULT_ACTOR, std::slice::from_ref(&copy_id)).unwrap();
    let row = c::reservations(&conn, DEFAULT_ACTOR)
        .unwrap()
        .into_iter()
        .find(|r| r["id"] == res_id)
        .unwrap();
    assert_eq!(row["status"], "ready");
    assert_eq!(row["copy_id"], json!(copy_id));
    assert_eq!(b::copies(&conn, "").unwrap()[0]["status"], "reserved");
    let notifs = s::notifications(&conn, 100).unwrap();
    assert!(notifs.iter().any(|n| n["type"] == "reservation_ready"));

    // fulfil → loan created for the waiter, reservation fulfilled
    let loan = c::fulfil_reservation(&conn, DEFAULT_ACTOR, &res_id).unwrap();
    assert_eq!(loan["member_id"], json!(waiter));
    let row = c::reservations(&conn, DEFAULT_ACTOR)
        .unwrap()
        .into_iter()
        .find(|r| r["id"] == res_id)
        .unwrap();
    assert_eq!(row["status"], "fulfilled");

    // decline path on a fresh pending reservation
    let res2 =
        c::add_reservation(&conn, DEFAULT_ACTOR, &book_id, &waiter, "internal", None).unwrap();
    let declined = c::decline_reservation(&conn, DEFAULT_ACTOR, &res2, Some("نیست")).unwrap();
    assert_eq!(declined["status"], "declined");
    assert_eq!(declined["decision_reason"], "نیست");

    // cancel + delete paths
    let res3 =
        c::add_reservation(&conn, DEFAULT_ACTOR, &book_id, &waiter, "external", None).unwrap();
    c::cancel_reservation(&conn, DEFAULT_ACTOR, &res3).unwrap();
    c::delete_reservation(&conn, DEFAULT_ACTOR, &res3).unwrap();
    assert!(c::reservations(&conn, DEFAULT_ACTOR)
        .unwrap()
        .iter()
        .all(|r| r["id"] != res3));
}

#[test]
fn ready_reservation_expires_and_frees_copy() {
    let conn = db();
    let mut input = book_json("کتاب انقضا");
    input["barcode"] = json!("BAR-EXP");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let book_id = b::books(&conn, "", "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let _copy_id_unused = 0;
    let member_id = m::save_member(&conn, DEFAULT_ACTOR, &member_json("888888", "student"))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();

    let res_id =
        c::add_reservation(&conn, DEFAULT_ACTOR, &book_id, &member_id, "external", None).unwrap();
    c::accept_reservation(&conn, DEFAULT_ACTOR, &res_id, None).unwrap(); // copy available → ready
    assert_eq!(b::copies(&conn, "").unwrap()[0]["status"], "reserved");

    // Force expiry: expires_at in the past
    exec(
        &conn,
        "UPDATE reservations SET expires_at = ? WHERE id = ?",
        &[json!(iso_from_ms(0)), json!(res_id)],
    )
    .unwrap();
    c::sweep_reservations(&conn, DEFAULT_ACTOR).unwrap();

    let statuses: Vec<String> = c::reservations(&conn, DEFAULT_ACTOR)
        .unwrap()
        .into_iter()
        .filter(|r| r["id"] == res_id)
        .map(|r| r["status"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(statuses, vec!["expired".to_string()]);
    assert_eq!(b::copies(&conn, "").unwrap()[0]["status"], "available");
}

#[test]
fn inventory_tree_rules() {
    let conn = db();
    let room = s::create_room(&conn, DEFAULT_ACTOR, "سالن اصلی", None).unwrap();
    let room_id = room["id"].as_str().unwrap().to_string();

    let _col_id =
        s::create_column(&conn, DEFAULT_ACTOR, &room_id, &["A".into(), "B".into()]).unwrap();
    let shelves = s::get_shelves(&conn).unwrap();
    assert_eq!(shelves.len(), 3); // S floor + A + B
    assert!(shelves
        .iter()
        .any(|sh| sh["code"] == "S" && sh["shelf_type"] == "floor"));

    s::rename_room(&conn, DEFAULT_ACTOR, &room_id, "سالن دوم").unwrap();
    assert_eq!(s::get_rooms(&conn).unwrap()[0]["name"], "سالن دوم");

    // invalid row code rejected
    let err = s::create_column(&conn, DEFAULT_ACTOR, &room_id, &["Z".into()]).unwrap_err();
    assert!(err.message.contains("نامعتبر"));

    // room with used shelf cannot be deleted
    let mut input = book_json("کتاب قفسه");
    input["barcode"] = json!("BAR-SH");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    let shelf_id = shelves.iter().find(|sh| sh["code"] == "A").unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let copy_id = b::copies(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    b::update_copy(
        &conn,
        DEFAULT_ACTOR,
        &copy_id,
        &json!({ "shelfId": shelf_id }),
    )
    .unwrap();
    let err = s::delete_room(&conn, DEFAULT_ACTOR, &room_id).unwrap_err();
    assert!(err.message.contains("جابه‌جا"));

    // free the shelf → deletion works
    b::update_copy(&conn, DEFAULT_ACTOR, &copy_id, &json!({ "shelfId": null })).unwrap();
    s::delete_room(&conn, DEFAULT_ACTOR, &room_id).unwrap();
    assert!(s::get_rooms(&conn).unwrap().is_empty());
}

#[test]
fn backup_roundtrip_and_factory_reset() {
    let conn = db();
    let mut input = book_json("کتاب پشتیبان");
    input["barcode"] = json!("BAR-BK");
    b::save_book(&conn, DEFAULT_ACTOR, &input).unwrap();
    m::save_member(&conn, DEFAULT_ACTOR, &member_json("999999", "student")).unwrap();
    let copy_id = b::copies(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let member_id = m::members(&conn, "").unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    c::checkout(
        &conn,
        DEFAULT_ACTOR,
        &member_id,
        &[copy_id],
        3.0,
        "external",
    )
    .unwrap();

    let backup = s::export_library_backup(&conn).unwrap();
    assert_eq!(backup["_version"], 1);

    // Wipe everything, verify empty, then restore
    let wiped = s::delete_all_library_data(&conn, DEFAULT_ACTOR).unwrap();
    assert_eq!(wiped["books"], 1);
    assert!(b::books(&conn, "", "").unwrap().is_empty());
    assert!(c::loans(&conn, false).unwrap().is_empty());

    let counts = s::import_library_backup(&conn, DEFAULT_ACTOR, &backup).unwrap();
    assert_eq!(counts["books"], 1);
    assert_eq!(counts["loans"], 1);
    assert_eq!(b::books(&conn, "", "").unwrap().len(), 1);
    assert_eq!(c::loans(&conn, false).unwrap().len(), 1);
    // loan restored as open
    assert!(c::loans(&conn, true).unwrap().len() == 1);
}

#[test]
fn settings_roundtrip_whitelist_and_bool_coercion() {
    let conn = db();
    save_library_settings(
        &conn,
        DEFAULT_ACTOR,
        &json!({
            "library_name": "کتابخانهٔ من",
            "loan_days": 21,
            "grace_period_enabled": true,
            "grace_period_days": 2,
            "fines_enabled": false,
            "evil_column": "should_be_ignored"
        }),
    )
    .unwrap();
    let settings = get_library_settings(&conn).unwrap();
    assert_eq!(settings.library_name, "کتابخانهٔ من");
    assert_eq!(settings.loan_days, 21.0);
    assert!(settings.grace_period_enabled);
    assert!(!settings.fines_enabled);
    // whitelist: unknown keys never reach SQL — proving it by SELECTing the
    // non-existent column (it was never added by the patch above)
    assert!(crate::select(
        &conn,
        "SELECT evil_column FROM library_settings WHERE id = 1",
        &[]
    )
    .is_err());
    // a second save with nothing new is a no-op
    save_library_settings(&conn, DEFAULT_ACTOR, &json!({})).unwrap();
}

#[test]
fn member_search_and_book_search() {
    let conn = db();
    b::save_book(&conn, DEFAULT_ACTOR, &json!({ "title": "شبکه‌های کامپیوتری", "language": "فارسی", "isbn13": "978-600-333-175-9" })).unwrap();
    m::save_member(&conn, DEFAULT_ACTOR, &json!({ "full_name": "زهرا محمدی", "department": "مهندسی کامپیوتر", "role": "student", "status": "active", "member_number": "123456" })).unwrap();

    assert_eq!(b::books(&conn, "شبکه", "").unwrap().len(), 1);
    assert_eq!(b::books(&conn, "9786003331759", "").unwrap().len(), 1);
    assert_eq!(b::books(&conn, "چیزی", "").unwrap().len(), 0);
    assert_eq!(m::members(&conn, "زهرا").unwrap().len(), 1);
    assert_eq!(m::members(&conn, "123456").unwrap().len(), 1);
    assert_eq!(m::members(&conn, "چیزی").unwrap().len(), 0);
}

#[test]
fn audit_trail_records_actions() {
    let conn = db();
    b::save_book(&conn, DEFAULT_ACTOR, &book_json("کتاب ممیزی")).unwrap();
    let log = s::audit_log(&conn, 500).unwrap();
    assert!(log
        .iter()
        .any(|r| r["action"] == "create" && r["entity_type"] == "book"));
    assert!(log.iter().all(|r| r["actor"] == "ketabdar"));
}

#[test]
fn isbn_and_phone_cleaning_match_ts() {
    assert_eq!(normalize_isbn("978-600-333-175-9"), "9786003331759");
    assert_eq!(normalize_isbn("0-306-40615-2"), "0306406152");
    assert_eq!(clean_barcode(" bar-1 "), "BAR-1");
    assert_eq!(clean_accession(" acc-1 "), "ACC-1");
    assert_eq!(clean_phone("0912 345 6789"), "09123456789");
    assert_eq!(clean_phone("+98 912 345"), "+98912345");
    assert_eq!(clean_member_number("۴۰۲۱۲۳۴۵"), "40212345");
    assert_eq!(clean_member_number("MB-123"), "MB-123"); // codes stored as typed
    assert_eq!(clean_member_number("abc"), "abc");
    assert_eq!(clean_member_number("402 123 45"), "40212345");
    assert_eq!(clean_text("  متن  "), "متن");
}

#[test]
fn notifications_mark_read_rules() {
    let conn = db();
    s::mark_all_notifications_read(&conn).unwrap(); // no-op on empty
    let err = s::mark_notification_read(&conn, "missing").unwrap_err();
    assert!(err.message.contains("اعلان"));
}

#[test]
fn batch_checkout_is_all_or_nothing() {
    let conn = db();
    let m = m::save_member(&conn, DEFAULT_ACTOR, &member_json("610300", "student")).unwrap();
    let member_id = m["id"].as_str().unwrap().to_string();
    let mut free_input = book_json("کتاب آزاد اتمی");
    free_input["barcode"] = json!("BAR-AT1");
    free_input["accession"] = json!("ACC-AT1");
    b::save_book(&conn, DEFAULT_ACTOR, &free_input).unwrap();
    let mut taken_input = book_json("کتاب اشغال اتمی");
    taken_input["barcode"] = json!("BAR-AT2");
    taken_input["accession"] = json!("ACC-AT2");
    b::save_book(&conn, DEFAULT_ACTOR, &taken_input).unwrap();

    let free_copy_id = b::copies(&conn, "").unwrap()
        .iter().find(|c| c["barcode"] == "BAR-AT1").unwrap()["id"]
        .as_str().unwrap().to_string();
    let taken_copy_id = b::copies(&conn, "").unwrap()
        .iter().find(|c| c["barcode"] == "BAR-AT2").unwrap()["id"]
        .as_str().unwrap().to_string();

    // The second copy goes to another member, so the batch MUST fail on it.
    let other = m::save_member(&conn, DEFAULT_ACTOR, &member_json("610301", "student")).unwrap();
    c::checkout(&conn, DEFAULT_ACTOR, other["id"].as_str().unwrap(), &[taken_copy_id.clone()], 3.0, "external").unwrap();

    let err = c::checkout(&conn, DEFAULT_ACTOR, &member_id, &[free_copy_id.clone(), taken_copy_id.clone()], 3.0, "external").unwrap_err();
    assert!(err.message.contains("در دسترس نیست"));

    // THE ATOMICITY CONTRACT: not a single loan for the batch member may exist.
    assert!(c::get_loans_for_member(&conn, &member_id).unwrap().is_empty());
    // And the free copy must still be available, not issued-then-forgotten.
    let free_copy = b::copies(&conn, "").unwrap()
        .into_iter().find(|c| c["id"] == json!(free_copy_id)).unwrap();
    assert_eq!(free_copy["status"], "available");
}

#[test]
fn backup_import_is_all_or_nothing() {
    let conn = db();
    assert!(m::members(&conn, "").unwrap().is_empty());
    // A valid members row followed by a loans row whose copy/member violate
    // the foreign keys: the import must fail and roll back the member too.
    let backup = json!({
        "_version": 1,
        "_exported_at": "2026-01-01T00:00:00.000Z",
        "tables": {
            "members": [{
                "id": "mem-atomic-1", "member_number": "610999", "full_name": "عضو بازگردانی",
                "role": "student", "status": "active", "reservation_banned": 0,
                "joined_at": "2026-01-01T00:00:00.000Z",
                "created_at": "2026-01-01T00:00:00.000Z", "updated_at": "2026-01-01T00:00:00.000Z"
            }],
            "loans": [{
                "id": "loan-atomic-1", "copy_id": "ghost-copy", "member_id": "mem-atomic-1",
                "scope": "external", "borrowed_at": "2026-01-01T00:00:00.000Z",
                "due_at": "2026-01-15T00:00:00.000Z", "renewed_count": 0
            }]
        }
    });
    assert!(s::import_library_backup(&conn, DEFAULT_ACTOR, &backup).is_err());
    // THE ATOMICITY CONTRACT: nothing from the failed import may remain.
    assert!(m::members(&conn, "").unwrap().is_empty());
    assert!(c::loans(&conn, false).unwrap().is_empty());
}
