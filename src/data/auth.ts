import { select, exec, maybeOne, nowIso } from "./localDb";
import type { PublicUser, UserRole, UserStatus } from "../types";

/**
 * KetabYar local authentication — a simple shared-PIN gate (chosen for
 * beginner-friendliness at a single service desk). The PIN is stored hashed
 * (SHA-256 + random salt) inside the local SQLite settings row; nothing
 * leaves the machine.
 */

export interface LoginAccount {
  username: string;
  full_name: string;
  role: UserRole;
  avatar_path: string | null;
}

const LOCAL_ACTOR: PublicUser = {
  id: "local-ketabdar",
  username: "ketabdar",
  full_name: "کتابدار",
  email: null,
  role: "admin",
  status: "active",
  avatar_path: null,
  must_change_password: false,
  created_at: nowIso(),
  last_login_at: null,
};

const SESSION_KEY = "ketabyar-session";

export async function getLoginAccounts(): Promise<LoginAccount[]> {
  return [{ username: LOCAL_ACTOR.username, full_name: LOCAL_ACTOR.full_name, role: "admin", avatar_path: null }];
}

/** Creates the default PIN (6767) on first boot if none has been set yet. */
export async function bootstrapAdminIfNeeded(): Promise<boolean> {
  if (await hasPin()) return false;
  await setPin("6767");
  return true;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function randomSalt(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hasPin(): Promise<boolean> {
  const row = await maybeOne<{ pin_hash: string | null }>(`SELECT pin_hash FROM library_settings WHERE id = 1`);
  return !!row?.pin_hash;
}

export async function setPin(newPin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(newPin)) throw new Error("پین باید بین ۴ تا ۸ رقم باشد.");
  const salt = await randomSalt();
  const hash = await sha256Hex(salt + newPin);
  await exec(`UPDATE library_settings SET pin_hash = ?, pin_salt = ?, updated_at = ? WHERE id = 1`, [hash, salt, nowIso()]);
}

export async function checkPin(pin: string): Promise<boolean> {
  const row = await maybeOne<{ pin_hash: string | null; pin_salt: string | null }>(`SELECT pin_hash, pin_salt FROM library_settings WHERE id = 1`);
  if (!row?.pin_hash || !row?.pin_salt) return false;
  const hash = await sha256Hex(row.pin_salt + pin);
  return hash === row.pin_hash;
}

/** Logs the operator in with the shared PIN. Mirrors the old supabase login() signature. */
export async function login(pin: string, _password?: string): Promise<PublicUser> {
  void _password;
  const ok = await checkPin(pin.trim());
  if (!ok) throw new Error("پین اشتباه است. دوباره تلاش کنید.");
  localStorage.setItem(SESSION_KEY, "1");
  return { ...LOCAL_ACTOR, last_login_at: nowIso() };
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
  try {
    const rows = await select<{ n: number }>(`SELECT COUNT(*) AS n FROM books`);
    void rows;
    return { database: "sqlite-offline", mode: "local" };
  } catch {
    return { database: "sqlite-offline", mode: "starting" };
  }
}

