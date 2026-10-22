//! Tauri command surface for the **Rust edition** — one thin command per
//! repository function, all delegating to ketabyar-core. The React UI is
//! identical between editions; only this layer differs.

use ketabyar_core::models::{DashboardMetrics, LibrarySettings};
use ketabyar_core::repo::{auth as a, books as b, circulation as c, members as m, support as s, DEFAULT_ACTOR};
use ketabyar_core::{open, schema, CommandError, Result};
use ketabyar_core::rusqlite::Connection;
use serde_json::Value as Json;
use std::sync::Mutex;
use tauri::{Manager, State};

pub struct DbState(pub Mutex<Connection>);

/// Opens (and schema-checks) the same SQLite file the TS edition uses.
pub fn init_db(app: &tauri::AppHandle) -> Result<Connection> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| CommandError { message: "app config directory unavailable".into() })?;
    std::fs::create_dir_all(&dir).map_err(|e| CommandError { message: e.to_string() })?;
    let conn = open(&dir.join("ketabyar.db"))?;
    schema::ensure_schema(&conn)?;
    Ok(conn)
}

fn with_db<T>(state: &State<'_, DbState>, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    let guard = state.0.lock().map_err(|_| CommandError { message: "database lock poisoned".into() })?;
    f(&guard)
}

fn resolve_actor(actor: Option<String>) -> String {
    actor.filter(|a| !a.trim().is_empty()).unwrap_or_else(|| DEFAULT_ACTOR.to_string())
}

type Cmd<T> = Result<T>;

// ─────────────────────────────── Dashboard ───────────────────────────────

#[tauri::command]
pub fn dashboard(state: State<'_, DbState>) -> Cmd<DashboardMetrics> {
    with_db(&state, |conn| s::dashboard(conn))
}

// ─────────────────────────────── Books & copies ───────────────────────────────

#[tauri::command]
pub fn books_list(state: State<'_, DbState>, query: String, item_type: String) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| b::books(conn, &query, &item_type))
}

#[tauri::command]
pub fn book_save(state: State<'_, DbState>, input: Json, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| b::save_book(conn, &resolve_actor(actor), &input))
}

#[tauri::command]
pub fn book_update(state: State<'_, DbState>, book_id: String, input: Json, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| b::update_book(conn, &resolve_actor(actor), &book_id, &input))
}

#[tauri::command]
pub fn book_delete(state: State<'_, DbState>, book_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| b::delete_book(conn, &resolve_actor(actor), &book_id))
}

#[tauri::command]
pub fn copies_for_book(state: State<'_, DbState>, book_id: String) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| b::get_copies_for_book(conn, &book_id))
}

#[tauri::command]
pub fn copy_add(state: State<'_, DbState>, book_id: String, barcode: String, accession_number: String, condition: String, shelf_id: Option<String>, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| b::add_copy(conn, &resolve_actor(actor), &book_id, &barcode, &accession_number, &condition, shelf_id.as_deref()))
}

#[tauri::command]
pub fn copy_update(state: State<'_, DbState>, copy_id: String, updates: Json, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| b::update_copy(conn, &resolve_actor(actor), &copy_id, &updates))
}

#[tauri::command]
pub fn copy_delete(state: State<'_, DbState>, copy_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| b::delete_copy(conn, &resolve_actor(actor), &copy_id))
}

#[tauri::command]
pub fn copies_list(state: State<'_, DbState>, query: String) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| b::copies(conn, &query))
}

// ─────────────────────────────── Members ───────────────────────────────

#[tauri::command]
pub fn members_list(state: State<'_, DbState>, query: String) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| m::members(conn, &query))
}

#[tauri::command]
pub fn member_save(state: State<'_, DbState>, input: Json, actor: Option<String>) -> Cmd<Json> {
    with_db(&state, |conn| m::save_member(conn, &resolve_actor(actor), &input))
}

#[tauri::command]
pub fn member_update(state: State<'_, DbState>, member_id: String, updates: Json, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| m::update_member(conn, &resolve_actor(actor), &member_id, &updates))
}

#[tauri::command]
pub fn member_delete(state: State<'_, DbState>, member_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| m::delete_member(conn, &resolve_actor(actor), &member_id))
}

#[tauri::command]
pub fn member_hard_delete(state: State<'_, DbState>, member_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| m::hard_delete_member(conn, &resolve_actor(actor), &member_id))
}

#[tauri::command]
pub fn member_ban(state: State<'_, DbState>, member_id: String, reason: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| m::ban_member(conn, &resolve_actor(actor), &member_id, &reason))
}

#[tauri::command]
pub fn member_unban(state: State<'_, DbState>, member_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| m::unban_member(conn, &resolve_actor(actor), &member_id))
}

// ─────────────────────────────── Circulation ───────────────────────────────

#[tauri::command]
pub fn loans_list(state: State<'_, DbState>, open_only: bool) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| c::loans(conn, open_only))
}

#[tauri::command]
pub fn loans_for_member(state: State<'_, DbState>, member_id: String) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| c::get_loans_for_member(conn, &member_id))
}

#[tauri::command]
pub fn reservations_for_member(state: State<'_, DbState>, member_id: String) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| c::get_reservations_for_member(conn, &member_id))
}

#[tauri::command]
pub fn checkout(state: State<'_, DbState>, member_id: String, copy_ids: Vec<String>, limit: f64, scope: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| c::checkout(conn, &resolve_actor(actor), &member_id, &copy_ids, limit, &scope))
}

#[tauri::command]
pub fn return_copies(state: State<'_, DbState>, copy_ids: Vec<String>, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| c::return_copies(conn, &resolve_actor(actor), &copy_ids))
}

#[tauri::command]
pub fn renew_loan(state: State<'_, DbState>, loan_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| c::renew_loan(conn, &resolve_actor(actor), &loan_id))
}

#[tauri::command]
pub fn loan_update_due(state: State<'_, DbState>, loan_id: String, due_at: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| c::update_loan_due_date(conn, &resolve_actor(actor), &loan_id, &due_at))
}

// ─────────────────────────────── Reservations ───────────────────────────────

#[tauri::command]
pub fn sweep_reservations(state: State<'_, DbState>, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| c::sweep_reservations(conn, &resolve_actor(actor)))
}

#[tauri::command]
pub fn reservations_list(state: State<'_, DbState>, actor: Option<String>) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| c::reservations(conn, &resolve_actor(actor)))
}

#[tauri::command]
pub fn reservation_add(state: State<'_, DbState>, book_id: String, member_id: String, scope: String, expires_at: Option<String>, actor: Option<String>) -> Cmd<String> {
    with_db(&state, |conn| c::add_reservation(conn, &resolve_actor(actor), &book_id, &member_id, &scope, expires_at.as_deref()))
}

#[tauri::command]
pub fn reservation_accept(state: State<'_, DbState>, reservation_id: String, reason: Option<String>, actor: Option<String>) -> Cmd<Json> {
    with_db(&state, |conn| c::accept_reservation(conn, &resolve_actor(actor), &reservation_id, reason.as_deref()))
}

#[tauri::command]
pub fn reservation_decline(state: State<'_, DbState>, reservation_id: String, reason: Option<String>, actor: Option<String>) -> Cmd<Json> {
    with_db(&state, |conn| c::decline_reservation(conn, &resolve_actor(actor), &reservation_id, reason.as_deref()))
}

#[tauri::command]
pub fn reservation_fulfil(state: State<'_, DbState>, reservation_id: String, actor: Option<String>) -> Cmd<Json> {
    with_db(&state, |conn| c::fulfil_reservation(conn, &resolve_actor(actor), &reservation_id))
}

#[tauri::command]
pub fn reservation_extend(state: State<'_, DbState>, reservation_id: String, days: f64, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| c::extend_reservation(conn, &resolve_actor(actor), &reservation_id, days))
}

#[tauri::command]
pub fn reservation_update(state: State<'_, DbState>, reservation_id: String, patch: Json, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| c::update_reservation(conn, &resolve_actor(actor), &reservation_id, &patch))
}

#[tauri::command]
pub fn reservation_cancel(state: State<'_, DbState>, reservation_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| c::cancel_reservation(conn, &resolve_actor(actor), &reservation_id))
}

#[tauri::command]
pub fn reservation_delete(state: State<'_, DbState>, reservation_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| c::delete_reservation(conn, &resolve_actor(actor), &reservation_id))
}

// ─────────────────────────────── Fines ───────────────────────────────

#[tauri::command]
pub fn fines_list(state: State<'_, DbState>) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| s::fines(conn))
}

#[tauri::command]
pub fn fine_pay(state: State<'_, DbState>, fine_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| s::pay_fine(conn, &resolve_actor(actor), &fine_id))
}

#[tauri::command]
pub fn fine_waive(state: State<'_, DbState>, fine_id: String, reason: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| s::waive_fine(conn, &resolve_actor(actor), &fine_id, &reason))
}

// ─────────────────────────────── Inventory ───────────────────────────────

#[tauri::command]
pub fn rooms_list(state: State<'_, DbState>) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| s::get_rooms(conn))
}

#[tauri::command]
pub fn room_create(state: State<'_, DbState>, name: String, notes: Option<String>, actor: Option<String>) -> Cmd<Json> {
    with_db(&state, |conn| s::create_room(conn, &resolve_actor(actor), &name, notes.as_deref()))
}

#[tauri::command]
pub fn room_rename(state: State<'_, DbState>, room_id: String, new_name: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| s::rename_room(conn, &resolve_actor(actor), &room_id, &new_name))
}

#[tauri::command]
pub fn room_delete(state: State<'_, DbState>, room_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| s::delete_room(conn, &resolve_actor(actor), &room_id))
}

#[tauri::command]
pub fn columns_list(state: State<'_, DbState>) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| s::get_columns(conn))
}

#[tauri::command]
pub fn column_create(state: State<'_, DbState>, room_id: String, rows: Vec<String>, actor: Option<String>) -> Cmd<String> {
    with_db(&state, |conn| s::create_column(conn, &resolve_actor(actor), &room_id, &rows))
}

#[tauri::command]
pub fn column_delete(state: State<'_, DbState>, column_id: String, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| s::delete_column(conn, &resolve_actor(actor), &column_id))
}

#[tauri::command]
pub fn shelves_list(state: State<'_, DbState>) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| s::get_shelves(conn))
}

#[tauri::command]
pub fn shelf_create(state: State<'_, DbState>, column_id: String, code: String, shelf_type: String, capacity: i64, actor: Option<String>) -> Cmd<String> {
    with_db(&state, |conn| s::create_shelf(conn, &resolve_actor(actor), &column_id, &code, &shelf_type, capacity))
}

#[tauri::command]
pub fn shelf_update(state: State<'_, DbState>, shelf_id: String, updates: Json, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| s::update_shelf(conn, &resolve_actor(actor), &shelf_id, &updates))
}

// ─────────────────────────────── Notifications / Audit ───────────────────────────────

#[tauri::command]
pub fn notifications_list(state: State<'_, DbState>, limit: i64) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| s::notifications(conn, limit))
}

#[tauri::command]
pub fn notification_mark_read(state: State<'_, DbState>, notification_id: String) -> Cmd<()> {
    with_db(&state, |conn| s::mark_notification_read(conn, &notification_id))
}

#[tauri::command]
pub fn notifications_mark_all(state: State<'_, DbState>) -> Cmd<()> {
    with_db(&state, |conn| s::mark_all_notifications_read(conn))
}

#[tauri::command]
pub fn audit_log(state: State<'_, DbState>, limit: i64) -> Cmd<Vec<Json>> {
    with_db(&state, |conn| s::audit_log(conn, limit))
}

// ─────────────────────────────── Backup / Restore ───────────────────────────────

#[tauri::command]
pub fn backup_export(state: State<'_, DbState>) -> Cmd<Json> {
    with_db(&state, |conn| s::export_library_backup(conn))
}

#[tauri::command]
pub fn backup_import(state: State<'_, DbState>, backup: Json, actor: Option<String>) -> Cmd<Json> {
    with_db(&state, |conn| s::import_library_backup(conn, &resolve_actor(actor), &backup))
}

#[tauri::command]
pub fn library_wipe(state: State<'_, DbState>, actor: Option<String>) -> Cmd<Json> {
    with_db(&state, |conn| s::delete_all_library_data(conn, &resolve_actor(actor)))
}

// ─────────────────────────────── Settings ───────────────────────────────

#[tauri::command]
pub fn settings_get(state: State<'_, DbState>) -> Cmd<LibrarySettings> {
    with_db(&state, |conn| ketabyar_core::repo::get_library_settings(conn))
}

#[tauri::command]
pub fn settings_save(state: State<'_, DbState>, values: Json, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| ketabyar_core::repo::save_library_settings(conn, &resolve_actor(actor), &values))
}

// ─────────────────────────────── Reports & maintenance ───────────────────────────────

/// Aggregate GROUP BY breakdowns for the Reports page — one command replaces
/// the nine ad-hoc SQL round-trips. Label is '' where the source column is
/// NULL, mirroring the TS edition's COALESCE behaviour.
#[tauri::command]
pub fn report_breakdowns(state: State<'_, DbState>) -> Cmd<Json> {
    with_db(&state, |conn| {
        let loan_categories = ketabyar_core::select(
            conn,
            "SELECT COALESCE(cat.name, '') AS label, COUNT(*) AS n \
             FROM loans l JOIN copies c ON c.id = l.copy_id JOIN books b ON b.id = c.book_id \
             LEFT JOIN categories cat ON cat.id = b.category_id GROUP BY cat.name",
            &[],
        )?;
        let copy_conditions = ketabyar_core::select(
            conn,
            "SELECT condition AS label, COUNT(*) AS n FROM copies WHERE status != 'archived' GROUP BY condition",
            &[],
        )?;
        let member_roles = ketabyar_core::select(
            conn,
            "SELECT COALESCE(role, '') AS label, COUNT(*) AS n FROM members WHERE archived_at IS NULL GROUP BY role",
            &[],
        )?;
        let copy_statuses = ketabyar_core::select(
            conn,
            "SELECT status AS label, COUNT(*) AS n FROM copies GROUP BY status",
            &[],
        )?;
        let item_types = ketabyar_core::select(
            conn,
            "SELECT COALESCE(item_type, '') AS label, COUNT(*) AS n FROM books WHERE archived_at IS NULL GROUP BY item_type",
            &[],
        )?;
        let inventory_categories = ketabyar_core::select(
            conn,
            "SELECT COALESCE(cat.name, '') AS label, COUNT(*) AS n \
             FROM copies c JOIN books b ON b.id = c.book_id LEFT JOIN categories cat ON cat.id = b.category_id \
             WHERE c.status != 'archived' GROUP BY cat.name",
            &[],
        )?;
        let member_statuses = ketabyar_core::select(
            conn,
            "SELECT COALESCE(status, '') AS label, COUNT(*) AS n FROM members GROUP BY status",
            &[],
        )?;
        let member_joins = ketabyar_core::select(
            conn,
            "SELECT SUBSTR(joined_at, 1, 7) AS label, COUNT(*) AS n FROM members \
             GROUP BY SUBSTR(joined_at, 1, 7) ORDER BY SUBSTR(joined_at, 1, 7) ASC",
            &[],
        )?;
        Ok(serde_json::json!({
            "loanCategories": loan_categories,
            "copyConditions": copy_conditions,
            "memberRoles": member_roles,
            "copyStatuses": copy_statuses,
            "itemTypes": item_types,
            "inventoryCategories": inventory_categories,
            "memberStatuses": member_statuses,
            "memberJoins": member_joins,
        }))
    })
}

/// Settings → Database "clear loans": frees every on-loan copy, then deletes
/// all fines and loans. Catalog and membership data are untouched.
#[tauri::command]
pub fn clear_circulation(state: State<'_, DbState>, actor: Option<String>) -> Cmd<()> {
    with_db(&state, |conn| {
        let _ = resolve_actor(actor);
        ketabyar_core::exec(conn, "UPDATE copies SET status = 'available' WHERE status = 'on-loan'", &[])?;
        ketabyar_core::exec(conn, "DELETE FROM fines", &[])?;
        ketabyar_core::exec(conn, "DELETE FROM loans", &[])?;
        Ok(())
    })
}

// ─────────────────────────────── Auth (PIN) ───────────────────────────────
// Native PIN gate for the Rust edition — the exact port of src/data/auth.ts.
// The TS edition keeps hashing in the webview (WebCrypto); both write the same
// salted SHA-256 scheme into library_settings, so databases are interchangeable.

/// True when a PIN has been set on this machine.
#[tauri::command]
pub fn pin_has(state: State<'_, DbState>) -> Cmd<bool> {
    with_db(&state, |conn| a::pin_has(conn))
}

/// Hashes (salted SHA-256) and stores a new 4–8 digit PIN.
#[tauri::command]
pub fn pin_set(state: State<'_, DbState>, pin: String) -> Cmd<()> {
    with_db(&state, |conn| a::pin_set(conn, &pin))
}

/// Verifies a PIN in constant time against the stored hash.
#[tauri::command]
pub fn pin_check(state: State<'_, DbState>, pin: String) -> Cmd<bool> {
    with_db(&state, |conn| a::pin_check(conn, &pin))
}

/// First-boot bootstrap: creates the default 6767 PIN when none is set.
#[tauri::command]
pub fn pin_bootstrap(state: State<'_, DbState>) -> Cmd<bool> {
    with_db(&state, |conn| a::bootstrap_pin_if_needed(conn))
}
