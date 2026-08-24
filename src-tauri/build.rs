const EMBEDDED_ENV_KEYS: [&str; 6] = [
    "PROJECT_ID",
    "PUBLISHABLE_KEY",
    "SECRET_KEY",
    "WARRAQ_ADMIN_USERNAME",
    "WARRAQ_ADMIN_PASSWORD",
    "WARRAQ_ADMIN_EMAIL",
];

/// Bakes the Supabase/bootstrap values from the build machine's .env into the binary as
/// compile-time env vars, so an installed build works without a .env next to the exe.
/// admin.rs still checks the real runtime environment first, so this is only a fallback.
fn embed_dotenv_values() {
    println!("cargo:rerun-if-changed=../.env");
    if let Ok(iter) = dotenvy::from_filename_iter("../.env") {
        for (key, value) in iter.flatten() {
            if EMBEDDED_ENV_KEYS.contains(&key.as_str()) {
                println!("cargo:rustc-env={key}={value}");
            }
        }
    }
}

fn main() {
    embed_dotenv_values();
    tauri_build::build()
}
