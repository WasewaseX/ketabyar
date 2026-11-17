/**
 * Members: registration, profile updates, archive and bans.
 */
import type { Member } from "../../types";
import {
  cleanMemberNumber,
  cleanPhone,
  cleanText,
  generateRandomMemberNumber,
  normalizeDigits,
} from "../../utils/isbn";
import { maybeOne, one, select, sqlExec, uid } from "../localDb";
import { audit, timestamp } from "./librarySqlShared";

export async function members(query = ""): Promise<Member[]> {
  // Search terms typed on a Persian keyboard (۴۰۲…) must match the ASCII
  // student IDs stored in the database.
  const term = normalizeDigits(query.trim());
  if (term) {
    const needle = `%${term}%`;
    return select<Member>(
      `SELECT * FROM members WHERE archived_at IS NULL AND (full_name LIKE ? OR member_number LIKE ? OR email LIKE ? OR phone LIKE ?)
       ORDER BY full_name COLLATE NOCASE`,
      [needle, needle, needle, needle],
    );
  }
  return select<Member>(
    `SELECT * FROM members WHERE archived_at IS NULL ORDER BY full_name COLLATE NOCASE`,
  );
}

export async function saveMember(
  input: Omit<Member, "id" | "member_number" | "joined_at"> & {
    member_number?: string;
  },
): Promise<Member> {
  const id = uid();
  const number = cleanMemberNumber(
    input.member_number ?? String(generateRandomMemberNumber(6)),
  );
  const clash = await maybeOne(
    `SELECT id FROM members WHERE member_number = ?`,
    [number],
  );
  if (clash) throw new Error("این کد دانشجویی قبلاً ثبت شده است.");
  await sqlExec(
    `INSERT INTO members (id, member_number, full_name, email, phone, department, role, status, avatar_path, joined_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      number,
      cleanText(input.full_name ?? ""),
      input.email ?? null,
      input.phone ? cleanPhone(input.phone) : null,
      input.department ?? null,
      input.role ?? "visitor",
      input.status ?? "active",
      input.avatar_path ?? null,
      timestamp(),
      timestamp(),
      timestamp(),
    ],
  );
  await audit("create_member", "member", id, { full_name: input.full_name });
  const created = await one<Member>(`SELECT * FROM members WHERE id = ?`, [id]);
  return created;
}

export async function updateMember(
  memberId: string,
  updates: Partial<Member>,
): Promise<void> {
  const columns: string[] = [];
  const params: unknown[] = [];
  const assign = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    params.push(value);
  };
  const assignable: (keyof Member)[] = [
    "full_name",
    "email",
    "phone",
    "department",
    "role",
    "status",
    "avatar_path",
    "expiry_date",
    "reservation_banned",
    "ban_reason",
    "banned_at",
  ];
  for (const key of assignable) {
    if (updates[key] !== undefined) assign(key, updates[key]);
  }
  if (updates.member_number !== undefined) {
    const number = cleanMemberNumber(updates.member_number);
    const clash = await maybeOne(
      `SELECT id FROM members WHERE member_number = ? AND id != ?`,
      [number, memberId],
    );
    if (clash) throw new Error("این کد دانشجویی قبلاً ثبت شده است.");
    assign("member_number", number);
  }
  if (columns.length > 0) {
    columns.push(`updated_at = ?`);
    params.push(timestamp(), memberId);
    await sqlExec(
      `UPDATE members SET ${columns.join(", ")} WHERE id = ?`,
      params,
    );
    await audit("update_member", "member", memberId, updates);
  }
}

export async function deleteMember(memberId: string): Promise<void> {
  const openLoans = await maybeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL`,
    [memberId],
  );
  if ((openLoans?.n ?? 0) > 0)
    throw new Error("این عضو امانت باز دارد؛ ابتدا بازگشت‌ها را ثبت کنید.");
  await sqlExec(
    `UPDATE reservations SET status = 'cancelled', decided_at = ?, decision_reason = 'member archived' WHERE member_id = ? AND status IN ('pending','queued','ready')`,
    [timestamp(), memberId],
  );
  await sqlExec(
    `UPDATE members SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`,
    [timestamp(), timestamp(), memberId],
  );
  await audit("archive_member", "member", memberId, null);
}

export async function hardDeleteMember(memberId: string): Promise<void> {
  const anyLoan = await maybeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM loans WHERE member_id = ?`,
    [memberId],
  );
  if ((anyLoan?.n ?? 0) > 0)
    throw new Error("تاریخچهٔ امانت این عضو موجود است؛ حذف کامل ممکن نیست.");
  await sqlExec(`DELETE FROM reservations WHERE member_id = ?`, [memberId]);
  await sqlExec(`DELETE FROM fines WHERE member_id = ?`, [memberId]);
  await sqlExec(`DELETE FROM members WHERE id = ?`, [memberId]);
  await audit("delete_member_permanent", "member", memberId, null);
}

export async function banMember(
  memberId: string,
  reason: string,
): Promise<void> {
  await sqlExec(
    `UPDATE members SET reservation_banned = 1, ban_reason = ?, banned_at = ?, updated_at = ? WHERE id = ?`,
    [reason, timestamp(), timestamp(), memberId],
  );
  await audit("ban_member", "member", memberId, { reason });
}

export async function unbanMember(memberId: string): Promise<void> {
  await sqlExec(
    `UPDATE members SET reservation_banned = 0, ban_reason = NULL, banned_at = NULL, updated_at = ? WHERE id = ?`,
    [timestamp(), memberId],
  );
  await audit("unban_member", "member", memberId, null);
}

/* ═════════════════════════════ Loans ═════════════════════════════════ */
