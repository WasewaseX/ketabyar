import { create } from "zustand";
import { getLibrarySettings, saveLibrarySettings } from "../data/repositories/library";
import type { LibrarySettings } from "../types";

/**
 * Institution-wide circulation rules and identity, backed by the single
 * `library_settings` row in SQLite. Loaded once at boot, then kept in sync
 * with every save.
 */

const defaults: LibrarySettings = {
  library_name: "کتابخانه مرکزی دانشگاه",
  library_short_name: "کتابیار",
  library_address: "",
  library_city: "",
  library_phone: "",
  library_email: "",
  library_website: "",
  library_hours: "شنبه تا چهارشنبه، ۸ تا ۱۶",
  library_description: "",
  timezone: "Asia/Tehran",
  date_format: "dd/MM/yyyy",
  currency: "IRR",
  loan_days: 14,
  loan_limit: 3,
  renew_limit: 2,
  reservation_hold_days: 3,
  reservation_external_days: 7,
  reservation_internal_days: 1,
  self_renewal_allowed: false,
  grace_period_enabled: false,
  grace_period_days: 0,
  fines_enabled: true,
  fine_per_day: 500,
  max_fine_amount: 50000,
  fine_currency: "IRR",
  fines_payment_method: "cash",
  notify_overdue: true,
  notify_due_soon: true,
  notify_due_soon_days: 2,
  notify_ready: true,
  shelf_row_count: 6,
  updated_at: "",
};

interface LibrarySettingsState {
  settings: LibrarySettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (values: Partial<LibrarySettings>) => Promise<void>;
}

export const useLibrarySettingsStore = create<LibrarySettingsState>((set, get) => ({
  settings: defaults,
  loaded: false,
  load: async () => {
    const data = await getLibrarySettings();
    const merged: Record<string, unknown> = { ...defaults };
    for (const [key, value] of Object.entries(data as unknown as Record<string, unknown>)) {
      if (value !== null && value !== undefined) merged[key] = value;
    }
    set({ settings: merged as unknown as LibrarySettings, loaded: true });
  },
  update: async (values) => {
    await saveLibrarySettings(values);
    const data = await getLibrarySettings();
    set({ settings: { ...get().settings, ...data } });
  },
}));
