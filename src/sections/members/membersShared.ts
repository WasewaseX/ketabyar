import { z } from "zod";
import type { MemberStatus } from "../../types";

export const ROLES = ["visitor", "student", "staff", "medic", "other"] as const;
export const STATUSES: MemberStatus[] = [
  "active",
  "suspended",
  "expired",
  "archived",
];

export const memberSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  // Student ID (کد دانشجویی) — the unique key every member is saved by.
  member_number: z.string().regex(/^[0-9A-Za-z-]{3,24}$/),
  email: z.union([z.literal(""), z.string().email()]),
  phone: z.string().optional(),
  role: z.string(),
  department: z.string().optional(),
  status: z.string(),
  avatar_path: z.string().nullable().optional(),
});
export type MemberForm = z.infer<typeof memberSchema>;
