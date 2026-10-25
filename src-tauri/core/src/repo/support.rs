//! Fines, notifications, audit log, inventory (rooms/columns/shelves),
//! backup/restore and the dashboard aggregate — remaining library.ts sections.

use super::*;
use crate::{exec, now_iso, one, select, uid, Result};
use rusqlite::Connection;
use serde_json::{json, Map, Value as Json};

// ─────────────────────────────── Fines ───────────────────────────────

pub fn fines(conn: &Connection) -> Result<Vec<Json>> {
    select(
        conn,
        "SELECT f.*, m.full_name AS member_name, m.member_number, b.title, c.barcode, l.due_at, l.returned_at \
         FROM fines f \
         JOIN members m ON m.id = f.member_id \
         JOIN loans l ON l.id = f.loan_id \
         JOIN copies c ON c.id = l.copy_id \
         JOIN books b ON b.id = c.book_id \
         ORDER BY f.created_at DESC",
        &[],
    )
}

pub fn pay_fine(conn: &Connection, actor: &str, fine_id: &str) -> Result<()> {
    exec(
        conn,
        "UPDATE fines SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?",
        &[json!(now_iso()), json!(now_iso()), json!(fine_id)],
    )?;
    audit(conn, actor, "pay_fine", "fine", fine_id, json!({}))?;
    Ok(())
}

pub fn waive_fine(conn: &Connection, actor: &str, fine_id: &str, reason: &str) -> Result<()> {
    exec(
        conn,
        "UPDATE fines SET status = 'waived', waived_reason = ?, updated_at = ? WHERE id = ?",
        &[json!(reason), json!(now_iso()), json!(fine_id)],
    )?;
    audit(
        conn,
        actor,
        "waive_fine",
        "fine",
        fine_id,
        json!({ "reason": reason }),
    )?;
    Ok(())
}

// ─────────────────────────────── Notifications ───────────────────────────────

pub fn notifications(conn: &Connection, limit: i64) -> Result<Vec<Json>> {
    let rows = select(
        conn,
        "SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?",
        &[json!(limit)],
    )?;
    Ok(rows
        .into_iter()
        .map(|mut r| {
            coerce_bool(&mut r, "is_read");
            r
        })
        .collect())
}

pub fn mark_notification_read(conn: &Connection, notification_id: &str) -> Result<()> {
    let n = exec(
        conn,
        "UPDATE notifications SET is_read = 1 WHERE id = ?",
        &[json!(notification_id)],
    )?;
    if n == 0 {
        return Err(CommandError {
            message: "اعلان پیدا نشد یا قبلاً خوانده شده است.".into(),
        });
    }
    Ok(())
}

pub fn mark_all_notifications_read(conn: &Connection) -> Result<()> {
    exec(
        conn,
        "UPDATE notifications SET is_read = 1 WHERE is_read = 0",
        &[],
    )?;
    Ok(())
}

// ─────────────────────────────── Audit ───────────────────────────────

pub fn audit_log(conn: &Connection, limit: i64) -> Result<Vec<Json>> {
    select(
        conn,
        "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?",
        &[json!(limit)],
    )
}

// ─────────────────────────────── Rooms / Columns / Shelves ───────────────────────────────

pub fn get_rooms(conn: &Connection) -> Result<Vec<Json>> {
    select(
        conn,
        "SELECT * FROM rooms ORDER BY name COLLATE NOCASE",
        &[],
    )
}

pub fn create_room(
    conn: &Connection,
    actor: &str,
    name: &str,
    notes: Option<&str>,
) -> Result<Json> {
    let id = uid();
    exec(
        conn,
        "INSERT INTO rooms (id, name, notes, created_at, updated_at) VALUES (?,?,?,?,?)",
        &[
            json!(id),
            json!(clean_text(name)),
            notes.map(|n| json!(clean_text(n))).unwrap_or(Json::Null),
            json!(now_iso()),
            json!(now_iso()),
        ],
    )?;
    audit(
        conn,
        actor,
        "create_room",
        "room",
        &id,
        json!({ "name": name }),
    )?;
    one(conn, "SELECT * FROM rooms WHERE id = ?", &[json!(id)])
}

pub fn rename_room(conn: &Connection, actor: &str, room_id: &str, new_name: &str) -> Result<()> {
    if new_name.trim().is_empty() {
        return Err(CommandError {
            message: "نام اتاق نمی‌تواند خالی باشد.".into(),
        });
    }
    exec(
        conn,
        "UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?",
        &[
            json!(clean_text(new_name)),
            json!(now_iso()),
            json!(room_id),
        ],
    )?;
    audit(
        conn,
        actor,
        "rename_room",
        "room",
        room_id,
        json!({ "name": new_name }),
    )?;
    Ok(())
}

pub fn delete_room(conn: &Connection, actor: &str, room_id: &str) -> Result<()> {
    let shelf_ids: Vec<String> = select(
        conn,
        "SELECT s.id FROM shelves s JOIN columns c ON c.id = s.column_id WHERE c.room_id = ?",
        &[json!(room_id)],
    )?
    .into_iter()
    .map(|s| s["id"].as_str().unwrap_or_default().to_string())
    .collect();
    if !shelf_ids.is_empty() {
        let placeholders: Vec<&str> = shelf_ids.iter().map(|_| "?").collect();
        let params: Vec<Json> = shelf_ids.iter().map(|s| json!(s)).collect();
        let used = scalar_i64(
            conn,
            &format!(
                "SELECT COUNT(*) AS n FROM copies WHERE shelf_id IN ({}) AND status != 'archived'",
                placeholders.join(",")
            ),
            &params,
            "n",
        )?;
        if used > 0 {
            return Err(CommandError {
                message:
                    "این اتاق همچنان نسخهٔ نگهداری‌شده دارد. ابتدا نسخه‌ها را جابه‌جا یا بایگانی کنید."
                        .into(),
            });
        }
    }
    exec(conn, "DELETE FROM rooms WHERE id = ?", &[json!(room_id)])?;
    audit(conn, actor, "delete_room", "room", room_id, json!({}))?;
    Ok(())
}

pub fn get_columns(conn: &Connection) -> Result<Vec<Json>> {
    select(conn, "SELECT * FROM columns ORDER BY room_id, number", &[])
}

pub fn create_column(
    conn: &Connection,
    actor: &str,
    room_id: &str,
    rows: &[String],
) -> Result<String> {
    if rows.is_empty() {
        return Err(CommandError {
            message: "حداقل یک ردیف (A تا F) برای قفسه انتخاب کنید.".into(),
        });
    }
    for row in rows {
        if !["A", "B", "C", "D", "E", "F"].contains(&row.as_str()) {
            return Err(CommandError {
                message: format!("کد ردیف نامعتبر است: {}", row),
            });
        }
    }
    let number = scalar_i64(
        conn,
        "SELECT COALESCE(MAX(number), 0) AS m FROM columns WHERE room_id = ?",
        &[json!(room_id)],
        "m",
    )? + 1;
    let id = uid();
    exec(
        conn,
        "INSERT INTO columns (id, room_id, number, created_at, updated_at) VALUES (?,?,?,?,?)",
        &[
            json!(id),
            json!(room_id),
            json!(number),
            json!(now_iso()),
            json!(now_iso()),
        ],
    )?;
    exec(conn, "INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        &[json!(uid()), json!(id), json!("floor"), json!("S"), json!(120), json!(now_iso()), json!(now_iso())])?;
    for row in rows {
        exec(conn, "INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
            &[json!(uid()), json!(id), json!("top"), json!(row), json!(40), json!(now_iso()), json!(now_iso())])?;
    }
    audit(
        conn,
        actor,
        "create_column",
        "column",
        &id,
        json!({ "room_id": room_id, "rows": rows }),
    )?;
    Ok(id)
}

pub fn delete_column(conn: &Connection, actor: &str, column_id: &str) -> Result<()> {
    let shelf_ids: Vec<String> = select(
        conn,
        "SELECT id FROM shelves WHERE column_id = ?",
        &[json!(column_id)],
    )?
    .into_iter()
    .map(|s| s["id"].as_str().unwrap_or_default().to_string())
    .collect();
    if !shelf_ids.is_empty() {
        let placeholders: Vec<&str> = shelf_ids.iter().map(|_| "?").collect();
        let params: Vec<Json> = shelf_ids.iter().map(|s| json!(s)).collect();
        let used = scalar_i64(
            conn,
            &format!(
                "SELECT COUNT(*) AS n FROM copies WHERE shelf_id IN ({}) AND status != 'archived'",
                placeholders.join(",")
            ),
            &params,
            "n",
        )?;
        if used > 0 {
            return Err(CommandError {
                message:
                    "این قفسهٔ کتاب‌چین همچنان نسخه دارد. ابتدا نسخه‌ها را جابه‌جا یا بایگانی کنید."
                        .into(),
            });
        }
    }
    exec(
        conn,
        "DELETE FROM columns WHERE id = ?",
        &[json!(column_id)],
    )?;
    audit(conn, actor, "delete_column", "column", column_id, json!({}))?;
    Ok(())
}

pub fn get_shelves(conn: &Connection) -> Result<Vec<Json>> {
    select(conn, "SELECT * FROM shelf_overview ORDER BY room COLLATE NOCASE, column_number, shelf_type DESC, code", &[])
}

pub fn create_shelf(
    conn: &Connection,
    actor: &str,
    column_id: &str,
    code: &str,
    shelf_type: &str,
    capacity: i64,
) -> Result<String> {
    let id = uid();
    exec(conn, "INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        &[json!(id), json!(column_id), json!(shelf_type), json!(code.to_uppercase()), json!(capacity), json!(now_iso()), json!(now_iso())])?;
    audit(
        conn,
        actor,
        "create_shelf",
        "shelf",
        &id,
        json!({ "column_id": column_id, "code": code, "shelf_type": shelf_type, "capacity": capacity }),
    )?;
    Ok(id)
}

pub fn update_shelf(conn: &Connection, actor: &str, shelf_id: &str, updates: &Json) -> Result<()> {
    let mut patch: Vec<(String, Json)> = Vec::new();
    if let Some(v) = updates.get("capacity") {
        if !v.is_null() {
            patch.push(("capacity".into(), v.clone()));
        }
    }
    if let Some(v) = updates.get("notes") {
        patch.push((
            "notes".into(),
            v.as_str()
                .filter(|s| !s.is_empty())
                .map(|s| json!(clean_text(s)))
                .unwrap_or(Json::Null),
        ));
    }
    if patch.is_empty() {
        return Ok(());
    }
    let sets: Vec<String> = patch.iter().map(|(k, _)| format!("{} = ?", k)).collect();
    let mut params: Vec<Json> = patch.iter().map(|(_, v)| v.clone()).collect();
    params.push(json!(now_iso()));
    params.push(json!(shelf_id));
    exec(
        conn,
        &format!(
            "UPDATE shelves SET {}, updated_at = ? WHERE id = ?",
            sets.join(", ")
        ),
        &params,
    )?;
    audit(
        conn,
        actor,
        "update_shelf",
        "shelf",
        shelf_id,
        updates.clone(),
    )?;
    Ok(())
}

// ─────────────────────────────── Backup / Restore ───────────────────────────────

pub const BACKUP_TABLES: [&str; 15] = [
    "rooms",
    "columns",
    "shelves",
    "publishers",
    "categories",
    "authors",
    "tags",
    "members",
    "books",
    "book_authors",
    "book_tags",
    "copies",
    "reservations",
    "loans",
    "fines",
];

fn backup_key(table: &str) -> &'static str {
    match table {
        "book_authors" => "book_id,author_id",
        "book_tags" => "book_id,tag_id",
        _ => "id",
    }
}

pub fn export_library_backup(conn: &Connection) -> Result<Json> {
    let mut tables = Map::new();
    for table in BACKUP_TABLES {
        tables.insert(
            table.to_string(),
            Json::Array(select(conn, &format!("SELECT * FROM {}", table), &[])?),
        );
    }
    Ok(json!({ "_version": 1, "_exported_at": now_iso(), "tables": tables }))
}

/// Atomic restore: a malformed or FK-violating row rolls back the ENTIRE
/// import — the database is left exactly as it was (v1.2.5 atomicity audit).
pub fn import_library_backup(conn: &Connection, actor: &str, backup: &Json) -> Result<Json> {
    super::in_transaction(conn, |conn| import_library_backup_tx(conn, actor, backup))
}

fn import_library_backup_tx(conn: &Connection, actor: &str, backup: &Json) -> Result<Json> {
    let mut counts = Map::new();
    let tables = backup.get("tables").cloned().unwrap_or(Json::Null);
    for table in BACKUP_TABLES {
        let rows = tables
            .get(table)
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();
        if rows.is_empty() {
            counts.insert(table.to_string(), json!(0));
            continue;
        }
        let cols: Vec<String> = rows[0]
            .as_object()
            .map(|o| o.keys().cloned().collect())
            .unwrap_or_default();
        if cols.is_empty() {
            counts.insert(table.to_string(), json!(0));
            continue;
        }
        let key = backup_key(table);
        let key_cols: Vec<&str> = key.split(',').collect();
        // Use excluded.* so the upsert needs no parameters beyond the INSERT values
        // (the previous value-keyed form under-parameterised the DO UPDATE clause).
        let update_set: Vec<String> = cols
            .iter()
            .filter(|c| !key_cols.contains(&c.as_str()))
            .map(|c| format!("{} = excluded.{}", c, c))
            .collect();
        for row in &rows {
            let values: Vec<Json> = cols
                .iter()
                .map(|c| match row.get(c) {
                    None | Some(Json::Null) => Json::Null,
                    Some(Json::Bool(b)) => json!(if *b { 1 } else { 0 }),
                    Some(Json::Number(_) | Json::String(_)) => row.get(c).unwrap().clone(),
                    Some(other) => json!(other.to_string()),
                })
                .collect();
            let placeholders: Vec<&str> = cols.iter().map(|_| "?").collect();
            if !update_set.is_empty() {
                let params = values.clone();
                exec(
                    conn,
                    &format!(
                        "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
                        table,
                        cols.join(","),
                        placeholders.join(","),
                        key,
                        update_set.join(", ")
                    ),
                    &params,
                )?;
            } else {
                exec(
                    conn,
                    &format!(
                        "INSERT OR IGNORE INTO {} ({}) VALUES ({})",
                        table,
                        cols.join(","),
                        placeholders.join(",")
                    ),
                    &values,
                )?;
            }
        }
        counts.insert(table.to_string(), json!(rows.len()));
    }
    let counts_json: Json = counts.into();
    audit(
        conn,
        actor,
        "import_backup",
        "library",
        "backup",
        counts_json.clone(),
    )?;
    Ok(counts_json)
}

/// Factory reset commits as one unit — a failure mid-wipe cannot leave a
/// half-deleted library behind.
pub fn delete_all_library_data(conn: &Connection, actor: &str) -> Result<Json> {
    super::in_transaction(conn, |conn| delete_all_library_data_tx(conn, actor))
}

fn delete_all_library_data_tx(conn: &Connection, actor: &str) -> Result<Json> {
    let mut counts = Map::new();
    for table in BACKUP_TABLES.iter().rev() {
        let count = scalar_i64(
            conn,
            &format!("SELECT COUNT(*) AS n FROM {}", table),
            &[],
            "n",
        )?;
        exec(conn, &format!("DELETE FROM {}", table), &[])?;
        counts.insert(table.to_string(), json!(count));
    }
    exec(conn, "DELETE FROM notifications", &[])?;
    let counts_json: Json = counts.into();
    audit(
        conn,
        actor,
        "delete_all_library_data",
        "library",
        "wipe",
        counts_json.clone(),
    )?;
    Ok(counts_json)
}

// ─────────────────────────────── Dashboard ───────────────────────────────

pub fn dashboard(conn: &Connection) -> Result<crate::models::DashboardMetrics> {
    let settings = get_library_settings(conn)?;
    let grace_days = if settings.grace_period_enabled {
        settings.grace_period_days
    } else {
        0.0
    };
    let grace_ms = ms(grace_days);
    let now_ms = chrono::Utc::now().timestamp_millis();
    let overdue_before = iso_from_ms(now_ms - grace_ms);
    let due_before = iso_from_ms(now_ms + ms(settings.notify_due_soon_days));

    let count = |sql: &str, params: &[Json]| -> Result<i64> { scalar_i64(conn, sql, params, "n") };

    let titles = count(
        "SELECT COUNT(*) AS n FROM books WHERE archived_at IS NULL",
        &[],
    )?;
    let copies_n = count(
        "SELECT COUNT(*) AS n FROM copies WHERE status != 'archived'",
        &[],
    )?;
    let on_loan = count(
        "SELECT COUNT(*) AS n FROM loans WHERE returned_at IS NULL",
        &[],
    )?;
    let members_n = count(
        "SELECT COUNT(*) AS n FROM members WHERE status = 'active' AND archived_at IS NULL",
        &[],
    )?;
    let overdue = count(
        "SELECT COUNT(*) AS n FROM loans WHERE returned_at IS NULL AND due_at < ?",
        &[json!(overdue_before)],
    )?;
    let ready = count(
        "SELECT COUNT(*) AS n FROM reservations WHERE status = 'ready'",
        &[],
    )?;
    let due_soon = count(
        "SELECT COUNT(*) AS n FROM loans WHERE returned_at IS NULL AND due_at >= ? AND due_at <= ?",
        &[json!(overdue_before), json!(due_before)],
    )?;

    let recent_loans = select(
        conn,
        "SELECT * FROM loan_details ORDER BY borrowed_at DESC LIMIT 5",
        &[],
    )?;
    let overdue_loans = select(conn, "SELECT * FROM loan_details WHERE returned_at IS NULL AND due_at < ? ORDER BY due_at ASC LIMIT 5", &[json!(overdue_before)])?;
    let due_soon_loans = select(conn, "SELECT * FROM loan_details WHERE returned_at IS NULL AND due_at >= ? AND due_at <= ? ORDER BY due_at ASC LIMIT 10", &[json!(overdue_before), json!(due_before)])?;
    let departments = select(
        conn,
        "SELECT m.department AS name, COUNT(l.id) AS count FROM loans l JOIN members m ON m.id = l.member_id \
         WHERE m.department IS NOT NULL AND m.department != '' GROUP BY m.department ORDER BY count DESC LIMIT 5",
        &[],
    )?;

    // Last 7 days of checkouts, one bucket per day (UTC day boundaries like the original).
    let activity_rows = select(
        conn,
        "SELECT SUBSTR(borrowed_at, 1, 10) AS day, COUNT(*) AS count FROM loans WHERE borrowed_at >= ? GROUP BY SUBSTR(borrowed_at, 1, 10)",
        &[json!(iso_from_ms(now_ms - ms(6.0)))],
    )?;
    let mut activity_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for r in activity_rows {
        if let (Some(d), Some(c)) = (
            r.get("day").and_then(|x| x.as_str()),
            r.get("count").and_then(|x| x.as_i64()),
        ) {
            activity_map.insert(d.to_string(), c);
        }
    }
    let activity: Vec<crate::models::ActivityPoint> = (0..7)
        .map(|i| {
            let day = iso_from_ms(now_ms - ms((6 - i) as f64))[..10].to_string();
            crate::models::ActivityPoint {
                date: day.clone(),
                count: activity_map.get(&day).copied().unwrap_or(0),
            }
        })
        .collect();

    // Today's circulation rhythm in 2-hour slots from 8:00 to 18:00.
    let today = iso_from_ms(now_ms)[..10].to_string();
    let mut b_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    let mut r_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    for row in select(conn, "SELECT CAST(SUBSTR(borrowed_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n FROM loans WHERE SUBSTR(borrowed_at, 1, 10) = ? GROUP BY hour", &[json!(today)])? {
        if let (Some(h), Some(n)) = (row.get("hour").and_then(|x| x.as_i64()), row.get("n").and_then(|x| x.as_i64())) {
            b_map.insert(h, n);
        }
    }
    for row in select(conn, "SELECT CAST(SUBSTR(returned_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n FROM loans WHERE returned_at IS NOT NULL AND SUBSTR(returned_at, 1, 10) = ? GROUP BY hour", &[json!(today)])? {
        if let (Some(h), Some(n)) = (row.get("hour").and_then(|x| x.as_i64()), row.get("n").and_then(|x| x.as_i64())) {
            r_map.insert(h, n);
        }
    }
    let circulation_rhythm: Vec<crate::models::CirculationSlot> = [8i64, 10, 12, 14, 16, 18]
        .iter()
        .map(|h| crate::models::CirculationSlot {
            time: format!("{}:00", h),
            checkouts: b_map.get(h).copied().unwrap_or(0),
            returns: r_map.get(h).copied().unwrap_or(0),
        })
        .collect();

    Ok(crate::models::DashboardMetrics {
        titles,
        copies: copies_n,
        on_loan,
        members: members_n,
        overdue,
        ready_reservations: ready,
        due_soon,
        recent_loans: Json::Array(recent_loans),
        overdue_loans: Json::Array(overdue_loans),
        due_soon_loans: Json::Array(due_soon_loans),
        activity,
        active_departments: Json::Array(departments),
        circulation_rhythm,
    })
}
