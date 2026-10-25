//! Shared repository internals — audits, upserts, uniqueness checks and the
//! circulation primitives every higher function reuses. All SQL is byte-identical
//! to `src/data/repositories/library.ts`.

use crate::models::LibrarySettings;
use crate::{
    coerce_bool, exec, maybe_one, now_iso, one, scalar_i64, select, uid, uid_prefix_upper,
    CommandError, Result,
};
use rusqlite::Connection;
use serde_json::{json, Value as Json};

pub mod auth;
pub mod books;
pub mod circulation;
pub mod members;
pub mod support;

pub const DEFAULT_ACTOR: &str = "ketabdar";

/// Runs `work` inside a single deferred transaction: committed on `Ok`,
/// rolled back on `Err`. Multi-statement mutations (batch checkout, batch
/// returns, reservation fulfilment, backup import, factory reset) become
/// all-or-nothing — a mid-batch failure can no longer leave half-applied
/// state behind (v1.2.5 atomicity audit; pinned by integration tests).
pub fn in_transaction<T>(conn: &Connection, work: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    let tx = conn.unchecked_transaction()?;
    let result = work(&tx);
    match result {
        Ok(value) => {
            tx.commit()?;
            Ok(value)
        }
        Err(err) => Err(err),
    }
}

// ─────────────────────────── JSON input accessors ───────────────────────────

pub fn jstr(v: &Json, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}
pub fn jnum(v: &Json, key: &str) -> Option<f64> {
    v.get(key).and_then(|x| x.as_f64())
}
pub fn jbool(v: &Json, key: &str) -> Option<bool> {
    match v.get(key) {
        Some(Json::Bool(b)) => Some(*b),
        Some(Json::Number(n)) => Some(n.as_i64().unwrap_or(0) != 0),
        _ => None,
    }
}

// ─────────────────────────── Cleaning utils (isbn.ts port) ───────────────────────────

pub fn normalize_isbn(v: &str) -> String {
    v.chars()
        .filter(|c| c.is_ascii_digit() || *c == 'X' || *c == 'x')
        .collect::<String>()
        .to_uppercase()
}
pub fn clean_barcode(v: &str) -> String {
    v.trim().to_uppercase()
}
pub fn clean_accession(v: &str) -> String {
    v.trim().to_uppercase()
}
pub fn clean_phone(v: &str) -> String {
    let is_plus = v.trim().starts_with('+');
    let digits: String = v.chars().filter(|c| c.is_ascii_digit()).collect();
    if is_plus {
        format!("+{}", digits)
    } else {
        digits
    }
}
/// Persian (۰-۹, U+06F0–U+06F9) and Arabic-Indic (٠-٩, U+0660–U+0669)
/// digits → ASCII 0-9. Port of `normalizeDigits()` in `src/utils/isbn.ts`.
pub fn normalize_digits(v: &str) -> String {
    v.chars()
        .map(|c| {
            let code = c as u32;
            if (0x06f0..=0x06f9).contains(&code) {
                char::from_u32(code - 0x06f0 + b'0' as u32).unwrap_or(c)
            } else if (0x0660..=0x0669).contains(&code) {
                char::from_u32(code - 0x0660 + b'0' as u32).unwrap_or(c)
            } else {
                c
            }
        })
        .collect()
}
/// Student IDs (کد دانشجویی) are stored as typed: digits normalised to ASCII,
/// then only letters/digits/dashes survive (VIS- visitor codes round-trip).
pub fn clean_member_number(v: &str) -> String {
    normalize_digits(v)
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect::<String>()
        .trim()
        .to_string()
}
pub fn generate_random_member_number(digits: usize) -> String {
    use rand::Rng;
    let min = 10f64.powi(digits as i32 - 1);
    let max = 10f64.powi(digits as i32) - 1.0;
    let n: i64 = rand::thread_rng().gen_range(min as i64..=max as i64);
    n.to_string()
}
pub fn clean_text(v: &str) -> String {
    v.trim().to_string()
}

// ─────────────────────────── Audit ───────────────────────────

pub fn audit(
    conn: &Connection,
    actor: &str,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    after: Json,
) -> Result<()> {
    exec(
        conn,
        "INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, after_json, created_at) VALUES (?,?,?,?,?,?,?)",
        &[json!(uid()), json!(actor), json!(action), json!(entity_type), json!(entity_id),
          if after.is_null() { Json::Null } else { json!(after.to_string()) }, json!(now_iso())],
    )?;
    Ok(())
}

// ─────────────────────────── name upsert ───────────────────────────

/// Finds a row by its unique `name` column, inserting one if missing.
/// `table` must be one of publishers/categories/authors/tags.
pub fn upsert_by_name(
    conn: &Connection,
    table: &str,
    name: &str,
    extra: &[(&str, Json)],
) -> Result<String> {
    if !["publishers", "categories", "authors", "tags"].contains(&table) {
        return Err(CommandError {
            message: format!("unknown lookup table: {}", table),
        });
    }
    if let Some(existing) = maybe_one(
        conn,
        &format!("SELECT id FROM {} WHERE name = ?", table),
        &[json!(name)],
    )? {
        return Ok(existing["id"].as_str().unwrap_or_default().to_string());
    }
    let id = uid();
    let mut cols = vec!["id".to_string(), "name".to_string()];
    let mut vals = vec![json!(id), json!(name)];
    if table == "authors" {
        cols.push("normalized_name".to_string());
        vals.push(json!(name.to_lowercase()));
    }
    for (k, v) in extra {
        cols.push(k.to_string());
        vals.push(v.clone());
    }
    let placeholders: Vec<&str> = vals.iter().map(|_| "?").collect();
    exec(
        conn,
        &format!(
            "INSERT INTO {} ({}) VALUES ({})",
            table,
            cols.join(", "),
            placeholders.join(", ")
        ),
        &vals,
    )?;
    Ok(id)
}

pub fn random_tag_color() -> String {
    const COLORS: [&str; 7] = [
        "#FEE2E2", "#FEF3C7", "#D1FAE5", "#DBEAFE", "#E0E7FF", "#F3E8FF", "#FCE7F3",
    ];
    use rand::Rng;
    COLORS[rand::thread_rng().gen_range(0..COLORS.len())].to_string()
}

/// Splits a comma-separated tag list into unique, non-empty, trimmed names.
pub fn split_tags(tags: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    tags.split(',')
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .filter(|t| seen.insert(t.clone()))
        .collect()
}

// ─────────────────────────── Library settings ───────────────────────────

pub fn num_col(row: &Json, key: &str, default: f64) -> f64 {
    row.get(key).and_then(|x| x.as_f64()).unwrap_or(default)
}
pub fn str_col(row: &Json, key: &str, default: &str) -> String {
    row.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| default.to_string())
}
pub fn bool_col(row: &Json, key: &str) -> bool {
    match row.get(key) {
        Some(Json::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        Some(Json::Bool(b)) => *b,
        _ => false,
    }
}

/// Port of `mapSettings` — coercions identical to the TS edition.
pub fn map_settings(row: &Json) -> LibrarySettings {
    LibrarySettings {
        library_name: str_col(row, "library_name", ""),
        library_short_name: str_col(row, "library_short_name", ""),
        library_address: str_col(row, "library_address", ""),
        library_city: str_col(row, "library_city", ""),
        library_phone: str_col(row, "library_phone", ""),
        library_email: str_col(row, "library_email", ""),
        library_website: str_col(row, "library_website", ""),
        library_hours: str_col(row, "library_hours", ""),
        library_description: str_col(row, "library_description", ""),
        timezone: str_col(row, "timezone", "Asia/Tehran"),
        date_format: str_col(row, "date_format", "dd/MM/yyyy"),
        currency: str_col(row, "currency", "IRR"),
        loan_days: num_col(row, "loan_days", 14.0),
        loan_limit: num_col(row, "loan_limit", 3.0),
        renew_limit: num_col(row, "renew_limit", 2.0),
        reservation_hold_days: num_col(row, "reservation_hold_days", 3.0),
        reservation_external_days: num_col(row, "reservation_external_days", 7.0),
        reservation_internal_days: num_col(row, "reservation_internal_days", 1.0),
        self_renewal_allowed: bool_col(row, "self_renewal_allowed"),
        grace_period_enabled: bool_col(row, "grace_period_enabled"),
        grace_period_days: num_col(row, "grace_period_days", 0.0),
        fines_enabled: bool_col(row, "fines_enabled"),
        fine_per_day: num_col(row, "fine_per_day", 0.0),
        max_fine_amount: num_col(row, "max_fine_amount", 0.0),
        fine_currency: str_col(row, "fine_currency", "IRR"),
        fines_payment_method: str_col(row, "fines_payment_method", "cash"),
        notify_overdue: bool_col(row, "notify_overdue"),
        notify_due_soon: bool_col(row, "notify_due_soon"),
        notify_due_soon_days: num_col(row, "notify_due_soon_days", 2.0),
        notify_ready: bool_col(row, "notify_ready"),
        shelf_row_count: num_col(row, "shelf_row_count", 6.0),
        updated_at: str_col(row, "updated_at", ""),
    }
}

pub fn get_library_settings(conn: &Connection) -> Result<LibrarySettings> {
    let row = maybe_one(conn, "SELECT * FROM library_settings WHERE id = 1", &[])?.ok_or(
        CommandError {
            message: "تنظیمات کتابخانه یافت نشد.".into(),
        },
    )?;
    Ok(map_settings(&row))
}

const SETTINGS_ALLOWED: [&str; 26] = [
    "library_name",
    "library_short_name",
    "library_address",
    "library_city",
    "library_phone",
    "library_email",
    "library_website",
    "library_hours",
    "library_description",
    "timezone",
    "date_format",
    "currency",
    "loan_days",
    "loan_limit",
    "renew_limit",
    "reservation_hold_days",
    "reservation_external_days",
    "reservation_internal_days",
    "self_renewal_allowed",
    "grace_period_enabled",
    "grace_period_days",
    "notify_overdue",
    "notify_due_soon",
    "notify_due_soon_days",
    "notify_ready",
    "shelf_row_count",
];
const SETTINGS_FINE_COLS: [&str; 5] = [
    "fines_enabled",
    "fine_per_day",
    "max_fine_amount",
    "fine_currency",
    "fines_payment_method",
];
const SETTINGS_BOOL_COLS: [&str; 6] = [
    "self_renewal_allowed",
    "grace_period_enabled",
    "notify_overdue",
    "notify_due_soon",
    "notify_ready",
    "fines_enabled",
];

pub fn save_library_settings(conn: &Connection, actor: &str, values: &Json) -> Result<()> {
    let mut patch: Vec<(String, Json)> = Vec::new();
    for key in SETTINGS_ALLOWED.iter().chain(SETTINGS_FINE_COLS.iter()) {
        if let Some(v) = values.get(*key) {
            if v.is_null() {
                continue;
            }
            let coerced = if SETTINGS_BOOL_COLS.contains(key) {
                Json::Bool(match v {
                    Json::Bool(b) => *b,
                    Json::Number(n) => n.as_i64().unwrap_or(0) != 0,
                    _ => false,
                })
            } else {
                v.clone()
            };
            patch.push((key.to_string(), coerced));
        }
    }
    if patch.is_empty() {
        return Ok(());
    }
    let sets: Vec<String> = patch.iter().map(|(k, _)| format!("{} = ?", k)).collect();
    let mut params: Vec<Json> = patch.iter().map(|(_, v)| v.clone()).collect();
    params.push(json!(now_iso()));
    exec(
        conn,
        &format!(
            "UPDATE library_settings SET {}, updated_at = ? WHERE id = 1",
            sets.join(", ")
        ),
        &params,
    )?;
    let patch_json: Json = patch
        .into_iter()
        .collect::<serde_json::Map<String, Json>>()
        .into();
    audit(
        conn,
        actor,
        "update_settings",
        "library_settings",
        "1",
        patch_json,
    )?;
    Ok(())
}

// ─────────────────────────── Barcode / accession uniqueness ───────────────────────────

pub fn ensure_unique_barcode(
    conn: &Connection,
    input_barcode: Option<&str>,
    accession_number: Option<&str>,
    exclude_copy_id: Option<&str>,
) -> Result<String> {
    if let Some(raw) = input_barcode {
        let clean = clean_barcode(raw);
        if !clean.is_empty() {
            let found = match exclude_copy_id {
                Some(ex) => maybe_one(
                    conn,
                    "SELECT id FROM copies WHERE barcode = ? AND id != ?",
                    &[json!(clean), json!(ex)],
                )?,
                None => maybe_one(
                    conn,
                    "SELECT id FROM copies WHERE barcode = ?",
                    &[json!(clean)],
                )?,
            };
            if found.is_some() {
                return Err(CommandError {
                    message: format!(
                        "نسخه‌ای با بارکد «{}» از قبل در سیستم ثبت شده است. بارکد تکراری مجاز نیست.",
                        clean
                    ),
                });
            }
            return Ok(clean);
        }
    }
    let base_accession = accession_number.map(clean_accession).unwrap_or_default();
    let mut base_barcode = if !base_accession.is_empty() {
        format!("BAR-{}", base_accession)
    } else {
        format!("BAR-{}", uid_prefix_upper(8))
    };
    let mut attempt = 0;
    while maybe_one(
        conn,
        "SELECT id FROM copies WHERE barcode = ?",
        &[json!(base_barcode)],
    )?
    .is_some()
        && attempt < 10
    {
        base_barcode = format!(
            "BAR-{}-{}",
            if base_accession.is_empty() {
                "CPY"
            } else {
                base_accession.as_str()
            },
            uid_prefix_upper(6)
        );
        attempt += 1;
    }
    Ok(base_barcode)
}

pub fn ensure_unique_accession(
    conn: &Connection,
    input_accession: Option<&str>,
    exclude_copy_id: Option<&str>,
) -> Result<String> {
    if let Some(raw) = input_accession {
        let clean = clean_accession(raw);
        if !clean.is_empty() {
            let found = match exclude_copy_id {
                Some(ex) => maybe_one(
                    conn,
                    "SELECT id FROM copies WHERE accession_number = ? AND id != ?",
                    &[json!(clean), json!(ex)],
                )?,
                None => maybe_one(
                    conn,
                    "SELECT id FROM copies WHERE accession_number = ?",
                    &[json!(clean)],
                )?,
            };
            if found.is_some() {
                return Err(CommandError {
                    message: format!(
                        "نسخه‌ای با شماره دی‌سک «{}» از قبل ثبت شده است. شماره تکراری مجاز نیست.",
                        clean
                    ),
                });
            }
            return Ok(clean);
        }
    }
    let mut base = format!("ACC-{}", uid_prefix_upper(8));
    let mut attempt = 0;
    while maybe_one(
        conn,
        "SELECT id FROM copies WHERE accession_number = ?",
        &[json!(base)],
    )?
    .is_some()
        && attempt < 10
    {
        base = format!("ACC-{}", uid_prefix_upper(8));
        attempt += 1;
    }
    Ok(base)
}

// ─────────────────────────── Circulation primitives ───────────────────────────

pub fn ms(days: f64) -> i64 {
    (days * 86_400_000.0) as i64
}

pub fn iso_from_ms(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms)
        .unwrap_or_else(chrono::Utc::now)
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

pub fn iso_to_ms(iso: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(iso)
        .map(|d| d.timestamp_millis())
        .unwrap_or(0)
}

/// Core checkout rule (port of migration 0003/0019 `checkout()`), minus the
/// hospital-only single-copy restriction.
pub fn checkout_one(
    conn: &Connection,
    actor: &str,
    copy_id: &str,
    member_id: &str,
    scope: &str,
) -> Result<()> {
    let member = maybe_one(
        conn,
        "SELECT * FROM members WHERE id = ?",
        &[json!(member_id)],
    )?
    .ok_or(CommandError {
        message: "عضو یافت نشد.".into(),
    })?;
    if str_col(&member, "status", "") != "active" {
        return Err(CommandError {
            message: "این عضو فعال نیست.".into(),
        });
    }
    if bool_col(&member, "reservation_banned") && scope == "external" {
        return Err(CommandError {
            message: "این عضو از امانت بیرون‌بر محروم است.".into(),
        });
    }

    let copy = maybe_one(conn, "SELECT * FROM copies WHERE id = ?", &[json!(copy_id)])?.ok_or(
        CommandError {
            message: "نسخه یافت نشد.".into(),
        },
    )?;
    if str_col(&copy, "status", "") != "available" {
        return Err(CommandError {
            message: "این نسخه در دسترس نیست.".into(),
        });
    }

    if scope == "external" && str_col(&member, "role", "") == "visitor" {
        return Err(CommandError {
            message: "مهمانان اجازهٔ امانت بیرون‌بر ندارند.".into(),
        });
    }

    let settings = get_library_settings(conn)?;
    if scope == "external" {
        let open_n = scalar_i64(
            conn,
            "SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL AND scope = 'external'",
            &[json!(member_id)], "n",
        )?;
        if open_n as f64 >= settings.loan_limit {
            return Err(CommandError {
                message: format!(
                    "این عضو به سقف امانت ({} مورد) رسیده است.",
                    settings.loan_limit
                ),
            });
        }
    }

    let days = if scope == "internal" {
        settings.reservation_internal_days
    } else {
        settings.loan_days
    };
    let due_at = iso_from_ms(chrono::Utc::now().timestamp_millis() + ms(days));
    let loan_id = uid();
    exec(
        conn,
        "INSERT INTO loans (id, copy_id, member_id, scope, borrowed_at, due_at, issued_by, condition_out) VALUES (?,?,?,?,?,?,?,?)",
        &[json!(loan_id), json!(copy_id), json!(member_id), json!(scope), json!(now_iso()), json!(due_at), json!(actor),
          copy.get("condition").cloned().unwrap_or(Json::Null)],
    )?;
    exec(
        conn,
        "UPDATE copies SET status = 'on-loan', updated_at = ? WHERE id = ?",
        &[json!(now_iso()), json!(copy_id)],
    )?;
    audit(
        conn,
        actor,
        "checkout",
        "loan",
        &loan_id,
        json!({ "copy_id": copy_id, "member_id": member_id, "due_at": due_at }),
    )?;
    Ok(())
}

/// Promotes the oldest queued reservation(s) onto available copies
/// (port of advance_reservation_queue).
pub fn advance_reservation_queue(
    conn: &Connection,
    actor: &str,
    book_id: Option<&str>,
) -> Result<()> {
    let settings = get_library_settings(conn)?;
    let hold_ms = ms(settings.reservation_hold_days);
    let sql = format!(
        "SELECT id, book_id FROM copies WHERE status = 'available' {}",
        if book_id.is_some() {
            "AND book_id = ?"
        } else {
            ""
        }
    );
    let params: Vec<Json> = book_id.map(|b| vec![json!(b)]).unwrap_or_default();
    let copies_rows = select(conn, &sql, &params)?;
    for c in copies_rows {
        let c_book = c["book_id"].as_str().unwrap_or_default().to_string();
        let c_id = c["id"].as_str().unwrap_or_default().to_string();
        let next = maybe_one(
            conn,
            "SELECT id FROM reservations WHERE book_id = ? AND status = 'queued' ORDER BY position ASC, requested_at ASC LIMIT 1",
            &[json!(c_book)],
        )?;
        let next = match next {
            Some(n) => n,
            None => continue,
        };
        let next_id = next["id"].as_str().unwrap_or_default().to_string();
        let expires_at = iso_from_ms(chrono::Utc::now().timestamp_millis() + hold_ms);
        exec(
            conn,
            "UPDATE reservations SET status = 'ready', copy_id = ?, expires_at = ? WHERE id = ?",
            &[json!(c_id), json!(expires_at), json!(next_id)],
        )?;
        exec(
            conn,
            "UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?",
            &[json!(now_iso()), json!(c_id)],
        )?;
        insert_notification(conn, actor, "reservation_ready", &next_id)?;
    }
    Ok(())
}

pub fn insert_notification(
    conn: &Connection,
    _actor: &str,
    n_type: &str,
    entity_id: &str,
) -> Result<()> {
    let n = one(
        conn,
        "SELECT (SELECT title FROM books WHERE id = (SELECT book_id FROM reservations WHERE id = ?)) AS title, \
                (SELECT full_name FROM members WHERE id = (SELECT member_id FROM reservations WHERE id = ?)) AS member_name",
        &[json!(entity_id), json!(entity_id)],
    )?;
    let title = n
        .get("title")
        .and_then(|x| x.as_str())
        .unwrap_or("رزرو آمادهٔ تحویل")
        .to_string();
    let body = n
        .get("member_name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    exec(
        conn,
        "INSERT INTO notifications (id, type, title, body, link, entity_type, entity_id, is_read, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        &[json!(uid()), json!(n_type), json!(title), json!(body), json!("/reservations"), json!("reservation"), json!(entity_id), json!(0), json!(now_iso())],
    )?;
    Ok(())
}

/// Computes and records the overdue fine for a returned loan
/// (Koha-style daily fine + grace period + cap).
pub fn charge_overdue_fine(
    conn: &Connection,
    _actor: &str,
    loan_id: &str,
    member_id: &str,
    due_at: &str,
) -> Result<()> {
    let settings = get_library_settings(conn)?;
    if !settings.fines_enabled {
        return Ok(());
    }
    let grace = if settings.grace_period_enabled {
        settings.grace_period_days
    } else {
        0.0
    };
    let days_late_raw =
        ((chrono::Utc::now().timestamp_millis() - iso_to_ms(due_at)) as f64 / 86_400_000.0).floor();
    let days_late = (days_late_raw - grace).max(0.0);
    if days_late <= 0.0 || settings.fine_per_day <= 0.0 {
        return Ok(());
    }
    let already = scalar_i64(
        conn,
        "SELECT COUNT(*) AS n FROM fines WHERE loan_id = ?",
        &[json!(loan_id)],
        "n",
    )?;
    if already > 0 {
        return Ok(());
    }
    let raw = days_late * settings.fine_per_day;
    let amount = if settings.max_fine_amount > 0.0 {
        raw.min(settings.max_fine_amount)
    } else {
        raw
    };
    exec(
        conn,
        "INSERT INTO fines (id, loan_id, member_id, amount, reason, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
        &[json!(uid()), json!(loan_id), json!(member_id), json!(amount),
          json!(format!("تاخیر {} روزه در بازگشت", days_late)), json!("open"), json!(now_iso()), json!(now_iso())],
    )?;
    Ok(())
}

// ─────────────────────────── Tests ───────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_digits_converts_persian_and_arabic_indic() {
        assert_eq!(normalize_digits("۴۰۲۱۲۳۴۵"), "40212345");
        assert_eq!(normalize_digits("٤٠٢١٢٣٤٥"), "40212345");
        assert_eq!(normalize_digits("402-123-45"), "402-123-45");
        assert_eq!(normalize_digits("abc"), "abc");
    }

    #[test]
    fn clean_member_number_keeps_student_ids_and_visitor_codes() {
        assert_eq!(clean_member_number(" ۴۰۲۱۲۳۴۵ "), "40212345");
        assert_eq!(clean_member_number("402 123 45"), "40212345");
        assert_eq!(clean_member_number("VIS-123456"), "VIS-123456");
        assert_eq!(clean_member_number("ST/۴۰۲#۱"), "ST4021");
        assert_eq!(clean_member_number("++"), "");
    }
}
