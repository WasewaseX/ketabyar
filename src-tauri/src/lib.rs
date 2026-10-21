use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, State, WindowEvent};

/// Shared flag: when true, closing the window hides it to the tray instead
/// of exiting. The frontend flips it through `set_close_to_tray`.
pub struct TrayConfig(pub AtomicBool);

#[tauri::command]
fn set_close_to_tray(config: State<'_, TrayConfig>, enabled: bool) {
    config.0.store(enabled, Ordering::Relaxed);
}

/// Honest diagnostics for the fully-offline edition.
#[tauri::command]
fn application_diagnostics() -> serde_json::Value {
    serde_json::json!({
        "database": "sqlite",
        "mode": "local",
        "secrets": "os-app-data"
    })
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// System-tray icon with quick navigation; left-click focuses the window.
fn install_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "نمایش / پنهان کردن کتابیار").build(app)?;
    let search = MenuItemBuilder::with_id("search", "جست‌وجوی سریع").build(app)?;
    let loans = MenuItemBuilder::with_id("loans", "میز امانت").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "تنظیمات").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "خروج").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &search, &loans, &settings, &quit]).build()?;

    let builder = TrayIconBuilder::with_id("ketabyar-tray")
        .menu(&menu)
        .tooltip("کتابیار");

    let builder = if let Some(icon) = app.default_window_icon() {
        builder.icon(icon.clone())
    } else {
        builder
    };

    builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "show" => focus_main_window(app),
            "search" => {
                focus_main_window(app);
                let _ = app.emit("ketabyar://quick-search", ());
            }
            "loans" => {
                focus_main_window(app);
                let _ = app.emit("ketabyar://navigate", "/loans");
            }
            "settings" => {
                focus_main_window(app);
                let _ = app.emit("ketabyar://navigate", "/settings");
            }
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
            install_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = window
                    .try_state::<TrayConfig>()
                    .map(|config| config.0.load(Ordering::Relaxed))
                    .unwrap_or(true);
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![set_close_to_tray, application_diagnostics])
        .run(tauri::generate_context!())
        .expect("error while running KetabYar");
}
