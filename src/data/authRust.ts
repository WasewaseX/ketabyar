import { invoke } from "@tauri-apps/api/core";
import type { PublicUser, UserRole, UserStatus } from "../types";
import type { LoginAccount } from "./authSql";

/**
 * KetabYar local authentication — **Rust edition** implementation.
 * PIN hashing, verification and first-boot bootstrap run natively in
 * ketabyar-core (`repo::auth`, salted SHA-256) behind Tauri commands, so the
 * webview contains zero SQL and zero WebCrypto hashing. The webview keeps
 * only the localStorage session flag — exactly like the TS edition. The hash
 * scheme is byte-identical to `authSql.ts`, so a database produced by either
 * edition validates in the other.
 */

const LOCAL_ACTOR: PublicUser = {
  id: "local-ketabdar",
  username: "ketabdar",
  full_name: "کتابدار",
  email: null,
  role: "admin",
  status: "active",
  avatar_path: null,
  must_change_password: false,
  created_at: new Date().toISOString(),
  last_login_at: null,
};

const SESSION_KEY = "ketabyar-session";

export async function getLoginAccounts(): Promise<LoginAccount[]> {
  return [{ username: LOCAL_ACTOR.username, full_name: LOCAL_ACTOR.full_name, role: "admin", avatar_path: null }];
}

/** Creates the default PIN (6767) on first boot if none has been set yet. */
export async function bootstrapAdminIfNeeded(): Promise<boolean> {
  return invoke<boolean>("pin_bootstrap");
}

export async function hasPin(): Promise<boolean> {
  return invoke<boolean>("pin_has");
}

export async function setPin(newPin: string): Promise<void> {
  await invoke("pin_set", { pin: newPin });
}

export async function checkPin(pin: string): Promise<boolean> {
  return invoke<boolean>("pin_check", { pin });
}

/** Logs the operator in with the shared PIN. Mirrors the SQL edition exactly. */
export async function login(pin: string, _password?: string): Promise<PublicUser> {
  void _password;
  const ok = await checkPin(pin.trim());
  if (!ok) throw new Error("پین اشتباه است. دوباره تلاش کنید.");
  localStorage.setItem(SESSION_KEY, "1");
  return { ...LOCAL_ACTOR, last_login_at: new Date().toISOString() };
}

export async function logout(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
}

export async function currentSession(): Promise<PublicUser | null> {
  return localStorage.getItem(SESSION_KEY) === "1" ? LOCAL_ACTOR : null;
}

/** PIN change for the desk operator: verifies the current PIN first. Mirrors changeOwnPassword(). */
export async function changeOwnPassword(currentPin: string, newPin: string): Promise<void> {
  if (currentPin === newPin) throw new Error("پین جدید باید با پین فعلی متفاوت باشد.");
  const ok = await checkPin(currentPin);
  if (!ok) throw new Error("پین فعلی اشتباه است.");
  await setPin(newPin);
}

// ── Multi-staff management is not part of the Simple-PIN edition. ──

export async function listUsers(): Promise<PublicUser[]> {
  return [LOCAL_ACTOR];
}

export async function createUser(input?: { username?: string; fullName?: string; email?: string | null; role?: UserRole; password?: string }): Promise<{ id: string; username: string }> {
  void input;
  throw new Error("در نسخهٔ پین ساده، ایجاد کاربر جدید در دسترس نیست.");
}

export async function updateUser(_id?: string, _updates?: { fullName?: string; email?: string | null; role?: UserRole; status?: UserStatus }): Promise<void> {
  throw new Error("در نسخهٔ پین ساده، ویرایش کاربر در دسترس نیست.");
}

export async function resetPassword(_id: string, newPassword: string): Promise<void> {
  void _id;
  await setPin(newPassword);
}

export async function deleteUser(_id?: string): Promise<void> {
  throw new Error("در نسخهٔ پین ساده، حذف کاربر در دسترس نیست.");
}

/** Kept so the Tauri diagnostics surface stays honest about the offline mode. */
export async function applicationDiagnostics(): Promise<{ database: string; mode: string }> {
  return invoke<{ database: string; mode: string }>("application_diagnostics");
}
