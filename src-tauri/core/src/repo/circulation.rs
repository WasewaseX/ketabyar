//! Circulation & reservations — public API port of those sections of library.ts.

use super::*;
use crate::{exec, maybe_one, now_iso, one, select, uid, Result};
use rusqlite::Connection;
use serde_json::{json, Value as Json};

// ─────────────────────────────── Loans ───────────────────────────────

pub fn loans(conn: &Connection, open_only: bool) -> Result<Vec<Json>> {
    let sql = if open_only {
        "SELECT * FROM loan_details WHERE returned_at IS NULL ORDER BY borrowed_at DESC"
    } else {
        "SELECT * FROM loan_details ORDER BY borrowed_at DESC"
    };
    select(conn, sql, &[])
}

pub fn get_loans_for_member(conn: &Connection, member_id: &str) -> Result<Vec<Json>> {
    select(
        conn,
        "SELECT * FROM loan_details WHERE member_id = ? ORDER BY borrowed_at DESC",
        &[json!(member_id)],
    )
}

pub fn get_reservations_for_member(conn: &Connection, member_id: &str) -> Result<Vec<Json>> {
    select(
        conn,
        "SELECT * FROM reservation_details WHERE member_id = ? ORDER BY requested_at DESC",
        &[json!(member_id)],
    )
}

/// Direct-desk checkout (no reservation involved). Loan duration comes from library_settings.
/// All-or-nothing batch: one failed copy rolls back the whole batch
/// (v1.2.5 atomicity audit).
pub fn checkout(
    conn: &Connection,
    actor: &str,
    member_id: &str,
    copy_ids: &[String],
    limit: f64,
    scope: &str,
) -> Result<()> {
    super::in_transaction(conn, |conn| checkout_tx(conn, actor, member_id, copy_ids, limit, scope))
}

fn checkout_tx(
    conn: &Connection,
    actor: &str,
    member_id: &str,
    copy_ids: &[String],
    limit: f64,
    scope: &str,
) -> Result<()> {
    if copy_ids.is_empty() {
        return Ok(());
    }
    let open_n = scalar_i64(
        conn,
        "SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL AND scope = 'external'",
        &[json!(member_id)], "n",
    )?;
    if open_n as f64 + copy_ids.len() as f64 > limit {
        return Err(CommandError {
            message: format!("سقف امانت {} مورد رعایت نشده است.", limit),
        });
    }
    for copy_id in copy_ids {
        checkout_one(conn, actor, copy_id, member_id, scope)?;
    }
    Ok(())
}

/// All-or-nothing batch: every copy's return (loan update, copy status,
/// overdue fine, queue advance, audit) commits together or not at all.
pub fn return_copies(conn: &Connection, actor: &str, copy_ids: &[String]) -> Result<()> {
    super::in_transaction(conn, |conn| return_copies_tx(conn, actor, copy_ids))
}

fn return_copies_tx(conn: &Connection, actor: &str, copy_ids: &[String]) -> Result<()> {
    if copy_ids.is_empty() {
        return Ok(());
    }
    for copy_id in copy_ids {
        let loan = match maybe_one(
            conn,
            "SELECT * FROM loans WHERE copy_id = ? AND returned_at IS NULL",
            &[json!(copy_id)],
        )? {
            Some(l) => l,
            None => continue,
        };
        let loan_id = loan["id"].as_str().unwrap_or_default().to_string();
        let member_id = loan["member_id"].as_str().unwrap_or_default().to_string();
        let due_at = loan["due_at"].as_str().unwrap_or_default().to_string();
        exec(conn, "UPDATE loans SET returned_at = ?, received_by = ?, condition_in = condition_out WHERE id = ?",
            &[json!(now_iso()), json!(actor), json!(loan_id)])?;
        exec(
            conn,
            "UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?",
            &[json!(now_iso()), json!(copy_id)],
        )?;
        charge_overdue_fine(conn, actor, &loan_id, &member_id, &due_at)?;
        if let Some(copy) = maybe_one(
            conn,
            "SELECT book_id FROM copies WHERE id = ?",
            &[json!(copy_id)],
        )? {
            let book_id = copy["book_id"].as_str().unwrap_or_default().to_string();
            advance_reservation_queue(conn, actor, Some(&book_id))?;
        }
        audit(
            conn,
            actor,
            "return",
            "loan",
            &loan_id,
            json!({ "copy_id": copy_id }),
        )?;
    }
    Ok(())
}

pub fn renew_loan(conn: &Connection, actor: &str, loan_id: &str) -> Result<()> {
    let loan = maybe_one(conn, "SELECT * FROM loans WHERE id = ?", &[json!(loan_id)])?.ok_or(
        CommandError {
            message: "امانت یافت نشد.".into(),
        },
    )?;
    if !loan.get("returned_at").map(|v| v.is_null()).unwrap_or(true) {
        return Err(CommandError {
            message: "این امانت قبلاً بازگردانده شده است.".into(),
        });
    }
    let settings = get_library_settings(conn)?;
    let renewed = loan
        .get("renewed_count")
        .and_then(|x| x.as_f64())
        .unwrap_or(0.0);
    if renewed >= settings.renew_limit {
        return Err(CommandError {
            message: format!("سقف تمدید ({} بار) پر شده است.", settings.renew_limit),
        });
    }
    let scope = loan
        .get("scope")
        .and_then(|x| x.as_str())
        .unwrap_or("external")
        .to_string();
    let days = if scope == "internal" {
        settings.reservation_internal_days
    } else {
        settings.loan_days
    };
    let due_at = loan["due_at"].as_str().unwrap_or_default().to_string();
    let base = iso_to_ms(&due_at).max(chrono::Utc::now().timestamp_millis());
    let new_due = iso_from_ms(base + ms(days));
    exec(
        conn,
        "UPDATE loans SET due_at = ?, renewed_count = renewed_count + 1 WHERE id = ?",
        &[json!(new_due), json!(loan_id)],
    )?;
    audit(
        conn,
        actor,
        "renew",
        "loan",
        loan_id,
        json!({ "due_at": new_due }),
    )?;
    Ok(())
}

pub fn update_loan_due_date(
    conn: &Connection,
    actor: &str,
    loan_id: &str,
    due_at: &str,
) -> Result<()> {
    exec(
        conn,
        "UPDATE loans SET due_at = ? WHERE id = ?",
        &[json!(due_at), json!(loan_id)],
    )?;
    audit(
        conn,
        actor,
        "update_loan_due",
        "loan",
        loan_id,
        json!({ "due_at": due_at }),
    )?;
    Ok(())
}

// ─────────────────────────────── Reservations ───────────────────────────────

/// Expiry sweep commits as one unit — a failure mid-sweep cannot leave some
/// reservations expired and their copies half-released.
pub fn sweep_reservations(conn: &Connection, actor: &str) -> Result<()> {
    super::in_transaction(conn, |conn| sweep_reservations_tx(conn, actor))
}

fn sweep_reservations_tx(conn: &Connection, actor: &str) -> Result<()> {
    let expired = select(
        conn,
        "SELECT id, copy_id FROM reservations WHERE status = 'ready' AND expires_at IS NOT NULL AND expires_at < ?",
        &[json!(now_iso())],
    )?;
    for res in expired {
        let res_id = res["id"].as_str().unwrap_or_default().to_string();
        exec(
            conn,
            "UPDATE reservations SET status = 'expired' WHERE id = ?",
            &[json!(res_id)],
        )?;
        if let Some(copy_id) = res.get("copy_id").and_then(|x| x.as_str()) {
            exec(
                conn,
                "UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved' \
                 AND NOT EXISTS (SELECT 1 FROM reservations WHERE copy_id = ? AND status = 'ready')",
                &[json!(now_iso()), json!(copy_id), json!(copy_id)],
            )?;
        }
        audit(
            conn,
            actor,
            "expire_reservation",
            "reservation",
            &res_id,
            json!({}),
        )?;
    }
    let has_queue = scalar_i64(
        conn,
        "SELECT COUNT(*) AS n FROM reservations WHERE status = 'queued'",
        &[],
        "n",
    )?;
    if has_queue > 0 {
        advance_reservation_queue(conn, actor, None)?;
    }
    Ok(())
}

pub fn reservations(conn: &Connection, actor: &str) -> Result<Vec<Json>> {
    sweep_reservations(conn, actor)?;
    select(
        conn,
        "SELECT * FROM reservation_details ORDER BY requested_at DESC",
        &[],
    )
}

pub fn add_reservation(
    conn: &Connection,
    actor: &str,
    book_id: &str,
    member_id: &str,
    scope: &str,
    expires_at: Option<&str>,
) -> Result<String> {
    let member = maybe_one(
        conn,
        "SELECT * FROM members WHERE id = ?",
        &[json!(member_id)],
    )?
    .ok_or(CommandError {
        message: "عضو یافت نشد.".into(),
    })?;
    if bool_col(&member, "reservation_banned") {
        return Err(CommandError {
            message: "این عضو از رزرو محروم است.".into(),
        });
    }
    let id = uid();
    exec(
        conn,
        "INSERT INTO reservations (id, book_id, member_id, scope, status, position, requested_at, expires_at) VALUES (?,?,?,?,?,0,?,?)",
        &[json!(id), json!(book_id), json!(member_id), json!(scope), json!("pending"), json!(now_iso()),
          expires_at.map(|e| json!(e)).unwrap_or(Json::Null)],
    )?;
    let book = maybe_one(
        conn,
        "SELECT title FROM books WHERE id = ?",
        &[json!(book_id)],
    )?;
    audit(
        conn,
        actor,
        "create_reservation",
        "reservation",
        &id,
        json!({
            "book_title": book.and_then(|b| b.get("title").cloned()).unwrap_or(Json::Null),
            "member_name": member.get("full_name").cloned().unwrap_or(Json::Null),
            "scope": scope,
        }),
    )?;
    Ok(id)
}

pub fn accept_reservation(
    conn: &Connection,
    actor: &str,
    reservation_id: &str,
    reason: Option<&str>,
) -> Result<Json> {
    let res = maybe_one(
        conn,
        "SELECT * FROM reservations WHERE id = ?",
        &[json!(reservation_id)],
    )?
    .ok_or(CommandError {
        message: "رزرو یافت نشد.".into(),
    })?;
    if str_col(&res, "status", "") != "pending" {
        return Err(CommandError {
            message: "این رزرو در وضعیت در انتظار نیست.".into(),
        });
    }
    let settings = get_library_settings(conn)?;
    let book_id = res["book_id"].as_str().unwrap_or_default().to_string();
    let copy = maybe_one(
        conn,
        "SELECT id FROM copies WHERE book_id = ? AND status = 'available' LIMIT 1",
        &[json!(book_id)],
    )?;
    match copy {
        Some(copy) => {
            let copy_id = copy["id"].as_str().unwrap_or_default().to_string();
            let expires_at = iso_from_ms(
                chrono::Utc::now().timestamp_millis() + ms(settings.reservation_hold_days),
            );
            exec(
                conn,
                "UPDATE reservations SET status = 'ready', copy_id = ?, reserved_at = ?, expires_at = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?",
                &[json!(copy_id), json!(now_iso()), json!(expires_at), json!(actor), json!(now_iso()),
                  reason.map(|r| json!(r)).unwrap_or(Json::Null), json!(reservation_id)],
            )?;
            exec(
                conn,
                "UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?",
                &[json!(now_iso()), json!(copy_id)],
            )?;
            insert_notification(conn, actor, "reservation_ready", reservation_id)?;
        }
        None => {
            let max_pos = maybe_one(
                conn,
                "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM reservations WHERE book_id = ? AND status = 'queued'",
                &[json!(book_id)],
            )?;
            let position = max_pos
                .and_then(|v| v.get("p").and_then(|x| x.as_f64()))
                .unwrap_or(1.0);
            exec(
                conn,
                "UPDATE reservations SET status = 'queued', position = ?, reserved_at = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?",
                &[json!(position), json!(now_iso()), json!(actor), json!(now_iso()),
                  reason.map(|r| json!(r)).unwrap_or(Json::Null), json!(reservation_id)],
            )?;
        }
    }
    audit(
        conn,
        actor,
        "accept_reservation",
        "reservation",
        reservation_id,
        json!({ "reason": reason }),
    )?;
    one(
        conn,
        "SELECT * FROM reservation_details WHERE id = ?",
        &[json!(reservation_id)],
    )
}

pub fn decline_reservation(
    conn: &Connection,
    actor: &str,
    reservation_id: &str,
    reason: Option<&str>,
) -> Result<Json> {
    let res = maybe_one(
        conn,
        "SELECT * FROM reservations WHERE id = ?",
        &[json!(reservation_id)],
    )?;
    let status_ok = res
        .as_ref()
        .and_then(|r| r.get("status").and_then(|s| s.as_str()))
        .map(|s| ["pending", "queued", "ready"].contains(&s))
        .unwrap_or(false);
    if !status_ok {
        return Err(CommandError {
            message: "رزرو یافت نشد یا قبلاً تصمیم‌گیری شده است.".into(),
        });
    }
    let res = res.unwrap();
    exec(
        conn,
        "UPDATE reservations SET status = 'declined', decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?",
        &[json!(actor), json!(now_iso()), reason.map(|r| json!(r)).unwrap_or(Json::Null), json!(reservation_id)],
    )?;
    if let Some(copy_id) = res.get("copy_id").and_then(|x| x.as_str()) {
        exec(
            conn,
            "UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?",
            &[json!(now_iso()), json!(copy_id)],
        )?;
        if let Some(b) = maybe_one(
            conn,
            "SELECT book_id FROM reservations WHERE id = ?",
            &[json!(reservation_id)],
        )? {
            let book_id = b["book_id"].as_str().unwrap_or_default().to_string();
            advance_reservation_queue(conn, actor, Some(&book_id))?;
        }
    }
    audit(
        conn,
        actor,
        "decline_reservation",
        "reservation",
        reservation_id,
        json!({ "reason": reason }),
    )?;
    one(
        conn,
        "SELECT * FROM reservation_details WHERE id = ?",
        &[json!(reservation_id)],
    )
}

/// Atomic fulfilment: freeing the held copy, issuing the loan, marking the
/// reservation fulfilled and the audit row commit together or not at all.
pub fn fulfil_reservation(conn: &Connection, actor: &str, reservation_id: &str) -> Result<Json> {
    super::in_transaction(conn, |conn| fulfil_reservation_tx(conn, actor, reservation_id))
}

fn fulfil_reservation_tx(conn: &Connection, actor: &str, reservation_id: &str) -> Result<Json> {
    let res = maybe_one(
        conn,
        "SELECT * FROM reservations WHERE id = ?",
        &[json!(reservation_id)],
    )?
    .ok_or(CommandError {
        message: "این رزرو آمادهٔ تحویل نیست.".into(),
    })?;
    let status = str_col(&res, "status", "");
    let copy_id = res
        .get("copy_id")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();
    if status != "ready" || copy_id.is_empty() {
        return Err(CommandError {
            message: "این رزرو آمادهٔ تحویل نیست.".into(),
        });
    }
    let member_id = res["member_id"].as_str().unwrap_or_default().to_string();
    let scope = res
        .get("scope")
        .and_then(|x| x.as_str())
        .unwrap_or("internal")
        .to_string();
    // The held copy sits in 'reserved' status — free it first so checkoutOne passes
    // (port of upstream migration 0020 fix_fulfil_reservation_copy_status).
    exec(conn, "UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'",
        &[json!(now_iso()), json!(copy_id)])?;
    checkout_one(conn, actor, &copy_id, &member_id, &scope)?;
    exec(
        conn,
        "UPDATE reservations SET status = 'fulfilled', fulfilled_at = ? WHERE id = ?",
        &[json!(now_iso()), json!(reservation_id)],
    )?;
    audit(
        conn,
        actor,
        "fulfil_reservation",
        "reservation",
        reservation_id,
        json!({}),
    )?;
    one(conn, "SELECT * FROM loan_details WHERE copy_id = ? AND returned_at IS NULL ORDER BY borrowed_at DESC LIMIT 1", &[json!(copy_id)])
}

pub fn extend_reservation(
    conn: &Connection,
    actor: &str,
    reservation_id: &str,
    days: f64,
) -> Result<()> {
    let res = maybe_one(
        conn,
        "SELECT expires_at FROM reservations WHERE id = ?",
        &[json!(reservation_id)],
    )?;
    let current = res
        .as_ref()
        .and_then(|r| r.get("expires_at").and_then(|x| x.as_str()))
        .map(iso_to_ms)
        .unwrap_or(0);
    let base = current.max(chrono::Utc::now().timestamp_millis());
    let new_expires = iso_from_ms(base + ms(days));
    exec(
        conn,
        "UPDATE reservations SET expires_at = ? WHERE id = ?",
        &[json!(new_expires), json!(reservation_id)],
    )?;
    audit(
        conn,
        actor,
        "extend_reservation",
        "reservation",
        reservation_id,
        json!({ "extended_days": days, "new_expires": new_expires }),
    )?;
    Ok(())
}

pub fn update_reservation(
    conn: &Connection,
    actor: &str,
    reservation_id: &str,
    patch: &Json,
) -> Result<()> {
    let mut update: Vec<(String, Json)> = Vec::new();
    if let Some(v) = patch.get("expiresAt") {
        if !v.is_null() {
            update.push(("expires_at".into(), v.clone()));
        }
    }
    if let Some(v) = patch.get("scope") {
        if !v.is_null() {
            update.push(("scope".into(), v.clone()));
        }
    }
    if update.is_empty() {
        return Ok(());
    }
    let sets: Vec<String> = update.iter().map(|(k, _)| format!("{} = ?", k)).collect();
    let mut params: Vec<Json> = update.iter().map(|(_, v)| v.clone()).collect();
    params.push(json!(reservation_id));
    exec(
        conn,
        &format!("UPDATE reservations SET {} WHERE id = ?", sets.join(", ")),
        &params,
    )?;
    let patch_json: Json = update
        .into_iter()
        .collect::<serde_json::Map<String, Json>>()
        .into();
    audit(
        conn,
        actor,
        "update_reservation",
        "reservation",
        reservation_id,
        patch_json,
    )?;
    Ok(())
}

pub fn cancel_reservation(conn: &Connection, actor: &str, reservation_id: &str) -> Result<()> {
    let res = maybe_one(
        conn,
        "SELECT copy_id, book_id FROM reservations WHERE id = ?",
        &[json!(reservation_id)],
    )?;
    exec(
        conn,
        "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
        &[json!(reservation_id)],
    )?;
    if let Some(res) = res {
        if let Some(copy_id) = res.get("copy_id").and_then(|x| x.as_str()) {
            exec(conn, "UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'",
                &[json!(now_iso()), json!(copy_id)])?;
            let book_id = res["book_id"].as_str().unwrap_or_default().to_string();
            advance_reservation_queue(conn, actor, Some(&book_id))?;
        }
    }
    audit(
        conn,
        actor,
        "cancel_reservation",
        "reservation",
        reservation_id,
        json!({ "status": "cancelled" }),
    )?;
    Ok(())
}

pub fn delete_reservation(conn: &Connection, actor: &str, reservation_id: &str) -> Result<()> {
    exec(
        conn,
        "DELETE FROM reservations WHERE id = ?",
        &[json!(reservation_id)],
    )?;
    audit(
        conn,
        actor,
        "delete_reservation",
        "reservation",
        reservation_id,
        json!({ "status": "deleted" }),
    )?;
    Ok(())
}
