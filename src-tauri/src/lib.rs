mod admin;
mod commands;

use tauri::{Emitter, Manager, WindowEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use url::Url;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::State;

pub struct TrayConfig(pub AtomicBool);

#[tauri::command]
fn validate_provider_url(value: String) -> Result<(), String> {
    let url = Url::parse(&value).map_err(|_| "Enter a valid provider URL.")?;
    let local = url.host_str().is_some_and(|host| host == "localhost" || host == "127.0.0.1");
    if url.scheme() != "https" && !local {
        return Err("Provider URLs must use HTTPS (except local development).".into());
    }
    if url.username() != "" || url.password().is_some() {
        return Err("Provider URLs must not contain credentials.".into());
    }
    Ok(())
}

#[tauri::command]
fn application_diagnostics() -> serde_json::Value {
    serde_json::json!({ "database": "supabase", "mode": "online", "secrets": "stronghold" })
}

#[tauri::command]
fn set_close_to_tray(config: State<'_, TrayConfig>, enabled: bool) {
    config.0.store(enabled, Ordering::Relaxed);
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn install_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "نمایش / پنهان کردن کتابیار").build(app)?;
    let search = MenuItemBuilder::with_id("search", "جست‌وجوی سریع").build(app)?;
    let checkout = MenuItemBuilder::with_id("checkout", "امانت جدید").build(app)?;
    let return_book = MenuItemBuilder::with_id("return", "بازگشت کتاب").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "تنظیمات").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "خروج").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &search, &checkout, &return_book, &settings, &quit]).build()?;
    let tray_builder = TrayIconBuilder::with_id("ketabyar-tray")
        .menu(&menu)
        .tooltip("کتابیار");

    let tray_builder = if let Some(icon) = app.default_window_icon() {
        tray_builder.icon(icon.clone())
    } else {
        tray_builder
    };

    tray_builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "show" => focus_main_window(app),
            "search" => { focus_main_window(app); let _ = app.emit("ketabyar://quick-search", ()); }
            "checkout" => { focus_main_window(app); let _ = app.emit("ketabyar://navigate", "/loans"); }
            "return" => { focus_main_window(app); let _ = app.emit("ketabyar://navigate", "/loans"); }
            "settings" => { focus_main_window(app); let _ = app.emit("ketabyar://navigate", "/settings"); }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                focus_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Best-effort: loads WARRAQ_ADMIN_USERNAME/WARRAQ_ADMIN_PASSWORD/WARRAQ_ADMIN_EMAIL and
    // the Supabase PROJECT_ID/PUBLISHABLE_KEY/SECRET_KEY from a .env file if one is found
    // searching up from the working directory. Silently does nothing if no .env exists —
    // real OS environment variables work either way.
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| focus_main_window(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(TrayConfig(AtomicBool::new(true)));
            // Rust edition engine: native SQLite connection shared by all core commands.
            app.manage(commands::DbState(Mutex::new(commands::init_db(app.handle())?)));
            let salt = app.path().app_local_data_dir()?.join("stronghold.salt");
            app.handle().plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt).build())?;
            install_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let config = window.try_state::<TrayConfig>();
                let close_to_tray = config.map(|c| c.0.load(Ordering::Relaxed)).unwrap_or(true);
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            validate_provider_url,
            application_diagnostics,
            set_close_to_tray,
            admin::get_login_accounts,
            admin::admin_bootstrap_if_needed,
            admin::admin_create_staff,
            admin::admin_reset_password,
            admin::admin_delete_staff,
            // ketabyar-core engine (Rust edition backend)
            commands::dashboard,
            commands::books_list, commands::book_save, commands::book_update, commands::book_delete,
            commands::copies_for_book, commands::copy_add, commands::copy_update, commands::copy_delete, commands::copies_list,
            commands::members_list, commands::member_save, commands::member_update, commands::member_delete,
            commands::member_hard_delete, commands::member_ban, commands::member_unban,
            commands::loans_list, commands::loans_for_member, commands::reservations_for_member,
            commands::checkout, commands::return_copies, commands::renew_loan, commands::loan_update_due,
            commands::sweep_reservations, commands::reservations_list, commands::reservation_add,
            commands::reservation_accept, commands::reservation_decline, commands::reservation_fulfil,
            commands::reservation_extend, commands::reservation_update, commands::reservation_cancel, commands::reservation_delete,
            commands::fines_list, commands::fine_pay, commands::fine_waive,
            commands::rooms_list, commands::room_create, commands::room_rename, commands::room_delete,
            commands::columns_list, commands::column_create, commands::column_delete,
            commands::shelves_list, commands::shelf_create, commands::shelf_update,
            commands::notifications_list, commands::notification_mark_read, commands::notifications_mark_all,
            commands::audit_log,
            commands::backup_export, commands::backup_import, commands::library_wipe,
            commands::settings_get, commands::settings_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running KetabYar");
}
