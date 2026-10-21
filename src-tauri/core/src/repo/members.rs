//! Members — public API port of the Members section of library.ts.

use super::*;
use crate::{exec, now_iso, one, select, uid, Result};
use rusqlite::Connection;
use serde_json::{json, Value as Json};

fn map_member(mut row: Json) -> Json {
    crate::coerce_bool(&mut row, "reservation_banned");
    row
}

pub fn members(conn: &Connection, query: &str) -> Result<Vec<Json>> {
    // Persian-keyboard digits in the search term must match stored ASCII IDs.
    let term = normalize_digits(query.trim());
    let mut sql = "SELECT * FROM members WHERE archived_at IS NULL".to_string();
    let mut params: Vec<Json> = Vec::new();
    if !term.is_empty() {
        let like = format!("%{}%", term);
        sql.push_str(
            " AND (full_name LIKE ? OR member_number LIKE ? OR email LIKE ? OR department LIKE ?)",
        );
        for _ in 0..4 {
            params.push(json!(like));
        }
    }
    sql.push_str(" ORDER BY full_name COLLATE NOCASE");
    Ok(select(conn, &sql, &params)?
        .into_iter()
        .map(map_member)
        .collect())
}

pub fn save_member(conn: &Connection, actor: &str, input: &Json) -> Result<Json> {
    let member_number = match jstr(input, "member_number")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        Some(n) => clean_member_number(&n),
        None => generate_random_member_number(6),
    };
    let full_name = clean_text(jstr(input, "full_name").as_deref().unwrap_or(""));
    let email = jstr(input, "email")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let phone = jstr(input, "phone")
        .filter(|s| !s.is_empty())
        .map(|s| clean_phone(&s));
    let department = jstr(input, "department")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s));
    let role = jstr(input, "role")
        .filter(|s| !s.is_empty())
        .map(|s| clean_text(&s))
        .unwrap_or_else(|| "visitor".into());
    let id = uid();

    // Was the student ID typed by the librarian? Then a UNIQUE clash is a real
    // duplicate and must error out — random retry is only allowed when the
    // caller left the field empty (visitor quick-add).
    let provided = jstr(input, "member_number")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .is_some();

    // member_number is UNIQUE — retry with a random number only when the
    // number was auto-generated (never for an explicit student ID).
    let mut attempt = 0u32;
    loop {
        let number = if attempt == 0 {
            member_number.clone()
        } else {
            generate_random_member_number(6)
        };
        let result = exec(
            conn,
            "INSERT INTO members (id, member_number, full_name, email, phone, department, role, status, expiry_date, avatar_path, joined_at, created_at, updated_at) \
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            &[json!(id), json!(number), json!(full_name),
              email.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
              phone.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
              department.as_ref().map(|s| json!(s)).unwrap_or(Json::Null),
              json!(role),
              input.get("status").cloned().unwrap_or(json!("active")),
              input.get("expiry_date").cloned().unwrap_or(Json::Null),
              input.get("avatar_path").cloned().unwrap_or(Json::Null),
              json!(now_iso()), json!(now_iso()), json!(now_iso())],
        );
        match result {
            Ok(_) => break,
            Err(e) => {
                if provided || attempt >= 5 || !e.message.contains("member_number") {
                    return Err(e);
                }
                attempt += 1;
            }
        }
    }

    let row = one(conn, "SELECT * FROM members WHERE id = ?", &[json!(id)])?;
    let member = map_member(row);
    audit(
        conn,
        actor,
        "create_member",
        "member",
        &id,
        json!({
            "full_name": full_name,
            "member_number": member.get("member_number").cloned().unwrap_or(Json::Null),
            "role": role, "department": department,
        }),
    )?;
    Ok(member)
}

pub fn update_member(
    conn: &Connection,
    actor: &str,
    member_id: &str,
    updates: &Json,
) -> Result<()> {
    let mut patch: Vec<(String, Json)> = Vec::new();
    if let Some(v) = updates.get("full_name") {
        patch.push((
            "full_name".into(),
            json!(clean_text(v.as_str().unwrap_or(""))),
        ));
    }
    if let Some(v) = updates.get("email") {
        patch.push((
            "email".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_text(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = updates.get("phone") {
        patch.push((
            "phone".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_phone(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = updates.get("department") {
        patch.push((
            "department".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_text(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = updates.get("role") {
        patch.push((
            "role".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_text(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if let Some(v) = updates.get("status") {
        if !v.is_null() {
            patch.push(("status".into(), v.clone()));
        }
    }
    // Student ID (کد دانشجویی) edits — cleaned, uniqueness-checked (parity
    // with updateMember() in the TS repository layer).
    if let Some(v) = updates.get("member_number") {
        if let Some(s) = v.as_str() {
            let number = clean_member_number(s);
            if number.is_empty() {
                return Err(CommandError {
                    message: "کد دانشجویی نمی‌تواند خالی باشد.".into(),
                });
            }
            let clash = scalar_i64(
                conn,
                "SELECT COUNT(*) AS n FROM members WHERE member_number = ? AND id != ?",
                &[json!(number), json!(member_id)],
                "n",
            )?;
            if clash > 0 {
                return Err(CommandError {
                    message: "این کد دانشجویی قبلاً ثبت شده است.".into(),
                });
            }
            patch.push(("member_number".into(), json!(number)));
        }
    }
    if let Some(v) = updates.get("expiry_date") {
        patch.push(("expiry_date".into(), v.clone()));
    }
    if let Some(v) = updates.get("avatar_path") {
        patch.push(("avatar_path".into(), v.clone()));
    }
    if let Some(v) = jbool(updates, "reservation_banned") {
        patch.push(("reservation_banned".into(), json!(if v { 1 } else { 0 })));
    }
    if let Some(v) = updates.get("ban_reason") {
        patch.push(("ban_reason".into(), v.clone()));
    }

    if !patch.is_empty() {
        let sets: Vec<String> = patch.iter().map(|(k, _)| format!("{} = ?", k)).collect();
        let mut params: Vec<Json> = patch.iter().map(|(_, v)| v.clone()).collect();
        params.push(json!(now_iso()));
        params.push(json!(member_id));
        exec(
            conn,
            &format!(
                "UPDATE members SET {}, updated_at = ? WHERE id = ?",
                sets.join(", ")
            ),
            &params,
        )?;
    }
    audit(
        conn,
        actor,
        "update_member",
        "member",
        member_id,
        updates.clone(),
    )?;
    Ok(())
}

pub fn delete_member(conn: &Connection, actor: &str, member_id: &str) -> Result<()> {
    let member = one(
        conn,
        "SELECT full_name, member_number FROM members WHERE id = ?",
        &[json!(member_id)],
    )?;
    let open = scalar_i64(
        conn,
        "SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL",
        &[json!(member_id)],
        "n",
    )?;
    if open > 0 {
        return Err(CommandError {
            message: "این عضو نسخه‌های امانت‌داری‌شده دارد. ابتدا همهٔ موارد باید بازگردانده شوند."
                .into(),
        });
    }
    exec(conn, "UPDATE reservations SET status = 'cancelled' WHERE member_id = ? AND status IN ('queued','ready','pending')", &[json!(member_id)])?;
    exec(
        conn,
        "UPDATE members SET archived_at = ?, status = 'archived', updated_at = ? WHERE id = ?",
        &[json!(now_iso()), json!(now_iso()), json!(member_id)],
    )?;
    audit(
        conn,
        actor,
        "archive_member",
        "member",
        member_id,
        json!({
            "full_name": member.get("full_name").cloned().unwrap_or(Json::Null),
            "member_number": member.get("member_number").cloned().unwrap_or(Json::Null),
        }),
    )?;
    Ok(())
}

pub fn hard_delete_member(conn: &Connection, actor: &str, member_id: &str) -> Result<()> {
    let member = one(
        conn,
        "SELECT full_name, member_number FROM members WHERE id = ?",
        &[json!(member_id)],
    )?;
    let any = scalar_i64(
        conn,
        "SELECT COUNT(*) AS n FROM loans WHERE member_id = ?",
        &[json!(member_id)],
        "n",
    )?;
    if any > 0 {
        return Err(CommandError { message: "این عضو سابقهٔ امانت دارد و نمی‌توان او را برای همیشه حذف کرد. از بایگانی استفاده کنید.".into() });
    }
    exec(
        conn,
        "DELETE FROM reservations WHERE member_id = ?",
        &[json!(member_id)],
    )?;
    exec(
        conn,
        "DELETE FROM fines WHERE member_id = ?",
        &[json!(member_id)],
    )?;
    exec(
        conn,
        "DELETE FROM members WHERE id = ?",
        &[json!(member_id)],
    )?;
    audit(
        conn,
        actor,
        "delete_member_permanent",
        "member",
        member_id,
        json!({
            "full_name": member.get("full_name").cloned().unwrap_or(Json::Null),
            "member_number": member.get("member_number").cloned().unwrap_or(Json::Null),
        }),
    )?;
    Ok(())
}

pub fn ban_member(conn: &Connection, actor: &str, member_id: &str, reason: &str) -> Result<()> {
    exec(conn, "UPDATE members SET reservation_banned = 1, ban_reason = ?, banned_at = ?, updated_at = ? WHERE id = ?",
        &[json!(reason), json!(now_iso()), json!(now_iso()), json!(member_id)])?;
    audit(
        conn,
        actor,
        "ban_member",
        "member",
        member_id,
        json!({ "reason": reason }),
    )?;
    Ok(())
}

pub fn unban_member(conn: &Connection, actor: &str, member_id: &str) -> Result<()> {
    exec(conn, "UPDATE members SET reservation_banned = 0, ban_reason = NULL, banned_at = NULL, updated_at = ? WHERE id = ?",
        &[json!(now_iso()), json!(member_id)])?;
    audit(conn, actor, "unban_member", "member", member_id, json!({}))?;
    Ok(())
}
