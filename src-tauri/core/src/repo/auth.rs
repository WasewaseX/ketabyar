//! Native PIN authentication — the exact port of `src/data/auth.ts`.
//!
//! The desk PIN is a convenience lock for a single service desk. It is stored
//! hashed (SHA-256 of `salt + pin`, random 16-byte salt as lowercase hex) in
//! the `library_settings` row, exactly like the TypeScript edition, so a
//! database produced by either edition validates in the other. Nothing leaves
//! the machine.

use crate::{exec, maybe_one, now_iso, CommandError, Result};
use rand::RngCore;
use rusqlite::Connection;
use sha2::{Digest, Sha256};

const DEFAULT_PIN: &str = "6767";

/// SHA-256 of `text` as lowercase hex — byte-identical to the WebCrypto
/// `digest("SHA-256")` + `toString(16).padStart(2, "0")` pipeline in auth.ts.
fn sha256_hex(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    let mut out = String::with_capacity(digest.len() * 2);
    for b in digest {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

/// 16 random bytes as lowercase hex — same shape as the TS `randomSalt()`.
fn random_salt() -> String {
    let mut bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

/// Constant-time equality for equal-length hex hashes (both sides are 64 chars).
fn ct_eq(a: &str, b: &str) -> bool {
    let (x, y) = (a.as_bytes(), b.as_bytes());
    if x.len() != y.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..x.len() {
        diff |= x[i] ^ y[i];
    }
    diff == 0
}

/// Mirrors the TS validation `/^\d{4,8}$/` — same Persian error message.
fn validate_pin(pin: &str) -> Result<()> {
    let ok = pin.len() >= 4 && pin.len() <= 8 && pin.bytes().all(|b| b.is_ascii_digit());
    if !ok {
        return Err(CommandError {
            message: "پین باید بین ۴ تا ۸ رقم باشد.".into(),
        });
    }
    Ok(())
}

/// True when a PIN has been set (non-empty `pin_hash` on the settings row).
pub fn pin_has(conn: &Connection) -> Result<bool> {
    let row = maybe_one(conn, "SELECT pin_hash FROM library_settings WHERE id = 1", &[])?;
    Ok(row
        .and_then(|v| v.get("pin_hash").and_then(|x| x.as_str()).map(|s| !s.is_empty()))
        .unwrap_or(false))
}

/// Hashes and stores a new PIN. Rejects anything outside 4–8 ASCII digits.
pub fn pin_set(conn: &Connection, new_pin: &str) -> Result<()> {
    validate_pin(new_pin)?;
    let salt = random_salt();
    let hash = sha256_hex(&format!("{salt}{new_pin}"));
    exec(
        conn,
        "UPDATE library_settings SET pin_hash = ?, pin_salt = ?, updated_at = ? WHERE id = 1",
        &[hash.into(), salt.into(), now_iso().into()],
    )?;
    Ok(())
}

/// Verifies a PIN against the stored hash. Missing row or hash → `false`.
pub fn pin_check(conn: &Connection, pin: &str) -> Result<bool> {
    let row = maybe_one(
        conn,
        "SELECT pin_hash, pin_salt FROM library_settings WHERE id = 1",
        &[],
    )?;
    let stored = match row {
        Some(r) => (
            r.get("pin_hash").and_then(|x| x.as_str()).map(String::from),
            r.get("pin_salt").and_then(|x| x.as_str()).map(String::from),
        ),
        None => return Ok(false),
    };
    let (hash, salt) = match stored {
        (Some(h), Some(s)) if !h.is_empty() && !s.is_empty() => (h, s),
        _ => return Ok(false),
    };
    Ok(ct_eq(&sha256_hex(&format!("{salt}{pin}")), &hash))
}

/// Creates the default PIN (6767) on first boot if none has been set yet.
/// Returns `true` when a fresh default was created (mirrors the TS bootstrap).
pub fn bootstrap_pin_if_needed(conn: &Connection) -> Result<bool> {
    if pin_has(conn)? {
        return Ok(false);
    }
    pin_set(conn, DEFAULT_PIN)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::open_memory_with_schema;

    #[test]
    fn bootstrap_sets_default_pin_once() {
        let conn = open_memory_with_schema().unwrap();
        assert!(!pin_has(&conn).unwrap());
        assert!(bootstrap_pin_if_needed(&conn).unwrap());
        assert!(pin_has(&conn).unwrap());
        assert!(pin_check(&conn, "6767").unwrap());
        // Second boot must not touch the (possibly user-changed) PIN.
        pin_set(&conn, "1234").unwrap();
        assert!(!bootstrap_pin_if_needed(&conn).unwrap());
        assert!(pin_check(&conn, "1234").unwrap());
        assert!(!pin_check(&conn, "6767").unwrap());
    }

    #[test]
    fn pin_validation_rejects_non_digits_and_wrong_lengths() {
        let conn = open_memory_with_schema().unwrap();
        for bad in ["", "123", "123456789", "abcd", "12a4", "۱۲۳۴"] {
            assert!(pin_set(&conn, bad).is_err(), "should reject {bad:?}");
        }
        assert!(!pin_has(&conn).unwrap());
    }

    #[test]
    fn pin_roundtrip_matches_ts_hash_scheme() {
        let conn = open_memory_with_schema().unwrap();
        pin_set(&conn, "135790").unwrap();
        assert!(pin_check(&conn, "135790").unwrap());
        assert!(!pin_check(&conn, "135791").unwrap());
        // The stored hash must equal sha256(salt + pin) — the exact TS scheme —
        // so a database written here validates in the TS edition too.
        let row = crate::maybe_one(
            &conn,
            "SELECT pin_hash, pin_salt FROM library_settings WHERE id = 1",
            &[],
        )
        .unwrap()
        .unwrap();
        let hash = row.get("pin_hash").and_then(|x| x.as_str()).unwrap().to_string();
        let salt = row.get("pin_salt").and_then(|x| x.as_str()).unwrap().to_string();
        assert_eq!(hash.len(), 64);
        assert_eq!(salt.len(), 32);
        assert_eq!(sha256_hex(&format!("{salt}135790")), hash);
        assert_ne!(salt, random_salt(), "salts must be random per set");
    }

    #[test]
    fn pin_check_without_pin_is_false() {
        let conn = open_memory_with_schema().unwrap();
        assert!(!pin_check(&conn, "6767").unwrap());
        assert!(!pin_has(&conn).unwrap());
    }
}
