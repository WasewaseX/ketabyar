//! Typed command contracts, exported to TypeScript via ts-rs (MIT).
//! The generated files land in `src/types/generated/` and are committed, so
//! the frontend build never depends on cargo.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::CommandError;

/// Library-wide circulation rules + institutional profile (library_settings row 1).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "generated/")]
pub struct LibrarySettings {
    pub library_name: String,
    pub library_short_name: String,
    pub library_address: String,
    pub library_city: String,
    pub library_phone: String,
    pub library_email: String,
    pub library_website: String,
    pub library_hours: String,
    pub library_description: String,
    pub timezone: String,
    pub date_format: String,
    pub currency: String,
    pub loan_days: f64,
    pub loan_limit: f64,
    pub renew_limit: f64,
    pub reservation_hold_days: f64,
    pub reservation_external_days: f64,
    pub reservation_internal_days: f64,
    pub self_renewal_allowed: bool,
    pub grace_period_enabled: bool,
    pub grace_period_days: f64,
    pub fines_enabled: bool,
    pub fine_per_day: f64,
    pub max_fine_amount: f64,
    pub fine_currency: String,
    pub fines_payment_method: String,
    pub notify_overdue: bool,
    pub notify_due_soon: bool,
    pub notify_due_soon_days: f64,
    pub notify_ready: bool,
    pub shelf_row_count: f64,
    pub updated_at: String,
}

/// One overdue-fine row with enrichment, as the Fines section renders it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "generated/")]
pub struct FineRow {
    pub id: String,
    pub loan_id: String,
    pub member_id: String,
    pub amount: f64,
    pub reason: String,
    pub status: String,
    #[ts(optional)]
    pub waived_reason: Option<String>,
    #[ts(optional)]
    pub paid_at: Option<String>,
    pub created_at: String,
    #[ts(optional)]
    pub member_name: Option<String>,
    #[ts(optional)]
    pub member_number: Option<String>,
    #[ts(optional)]
    pub title: Option<String>,
    #[ts(optional)]
    pub barcode: Option<String>,
    #[ts(optional)]
    pub due_at: Option<String>,
    #[ts(optional)]
    pub returned_at: Option<String>,
}

/// Dashboard KPI header — the same `DashboardMetrics` shape the TS edition returns.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "generated/")]
#[serde(rename_all = "camelCase")]
pub struct DashboardMetrics {
    pub titles: i64,
    pub copies: i64,
    pub on_loan: i64,
    pub members: i64,
    pub overdue: i64,
    pub ready_reservations: i64,
    pub due_soon: i64,
    /// loan_details rows (loose JSON, structurally `Loan[]` on the TS side).
    #[ts(type = "any")]
    pub recent_loans: serde_json::Value,
    #[ts(type = "any")]
    pub overdue_loans: serde_json::Value,
    #[ts(type = "any")]
    pub due_soon_loans: serde_json::Value,
    pub activity: Vec<ActivityPoint>,
    #[ts(type = "any")]
    pub active_departments: serde_json::Value,
    pub circulation_rhythm: Vec<CirculationSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "generated/")]
#[serde(rename_all = "camelCase")]
pub struct ActivityPoint {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "generated/")]
#[serde(rename_all = "camelCase")]
pub struct CirculationSlot {
    pub time: String,
    pub checkouts: i64,
    pub returns: i64,
}

/// Per-table row counts (factory reset / backup import reports).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "generated/")]
#[serde(rename_all = "camelCase")]
pub struct DeleteCounts {
    pub counts: std::collections::HashMap<String, i64>,
}

/// Backup file envelope (v1).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "generated/")]
#[serde(rename_all = "camelCase")]
pub struct LibraryBackupEnvelope {
    pub version: i64,
    pub exported_at: String,
    #[ts(type = "any")]
    pub tables: serde_json::Value,
}

/// Exported alongside CommandError so `invoke` rejections are typed on the TS side.
#[allow(unused)]
fn _export_error() -> CommandError {
    CommandError {
        message: String::new(),
    }
}
