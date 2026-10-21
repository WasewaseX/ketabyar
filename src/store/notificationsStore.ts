import { create } from "zustand";

/**
 * Acknowledgement ledger for the notification bell.
 *
 * Live alert states (overdue loans, due-soon loans, ready holds) have no
 * "read" flag in the database, so the bell never cleared. This store records
 * which synthetic alerts the operator has acknowledged — by stable id such as
 * `overdue-<loanId>` — and prunes ids that are no longer live, which also
 * means a resolved-then-recurring alert correctly lights the badge again.
 */

const SEEN_KEY = "ketabyar-seen-alerts";

function load(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

interface NotificationsState {
  seen: string[];
  markSeen: (ids: string[]) => void;
  sync: (validIds: string[]) => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  seen: load(),
  markSeen: (ids) =>
    set((state) => {
      const next = Array.from(new Set([...state.seen, ...ids]));
      if (next.length === state.seen.length) return state;
      save(next);
      return { seen: next };
    }),
  sync: (validIds) =>
    set((state) => {
      const valid = new Set(validIds);
      const next = state.seen.filter((id) => valid.has(id));
      if (next.length === state.seen.length) return state;
      save(next);
      return { seen: next };
    }),
}));
