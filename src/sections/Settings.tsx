import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "../hooks/useLibraryQuery";
import {
  Bell, BookMarked, CheckCircle2, CircleAlert, Database, Download, Eye, EyeOff, Globe, Info,
  Laptop, ListChecks, Lock, Moon, Palette, RotateCcw, Search, Settings as SettingsIcon,
  Sun, Trash2, Upload, Users, Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { listUsers, resetPassword } from "../data/auth";
import { changeOwnPassword } from "../data/auth";
import { deleteAllLibraryData, exportLibraryBackup, importLibraryBackup, activeBackend, clearCirculation } from "../data/repositories/library";
import { books as fetchBooks } from "../data/repositories/library";
import { useAuthStore } from "../store/authStore";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useUiStore } from "../store/uiStore";
import { ACCENT_PRESETS, applyAccent } from "../config/accent";
import { findEnrichableBooks, enrichAllBooks } from "../utils/enrichment";
import { cn } from "../utils/cn";
import { Modal } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";

/**
 * Settings: everything the institution shares (identity, rules, notifications)
 * and everything the operator personalises (theme, accent, desktop behavior).
 * Field edits persist immediately; nothing is ever silently lost.
 */

type TabId =
  | "general" | "libraryprofile" | "localization" | "appearance"
  | "rules" | "notifications"
  | "backuprestore" | "database" | "integrationsai" | "users"
  | "desktopdata" | "about";

const TAB_GROUPS: { labelKey: string; tabs: { id: TabId; labelKey: string; icon: typeof Sun }[] }[] = [
  {
    labelKey: "settings.groups.general",
    tabs: [
      { id: "general", labelKey: "settings.tabs.general", icon: SettingsIcon },
      { id: "libraryprofile", labelKey: "settings.tabs.libraryprofile", icon: BookMarked },
      { id: "localization", labelKey: "settings.tabs.localization", icon: Globe },
      { id: "appearance", labelKey: "settings.tabs.appearance", icon: Palette },
    ],
  },
  {
    labelKey: "settings.groups.circulation",
    tabs: [
      { id: "rules", labelKey: "settings.tabs.rules", icon: ListChecks },
      { id: "notifications", labelKey: "settings.tabs.notifications", icon: Bell },
    ],
  },
  {
    labelKey: "settings.groups.datasecurity",
    tabs: [
      { id: "backuprestore", labelKey: "settings.tabs.backuprestore", icon: Database },
      { id: "database", labelKey: "settings.tabs.database", icon: Database },
      { id: "integrationsai", labelKey: "settings.tabs.integrationsai", icon: Zap },
      { id: "users", labelKey: "settings.tabs.users", icon: Users },
    ],
  },
  {
    labelKey: "settings.groups.system",
    tabs: [
      { id: "desktopdata", labelKey: "settings.tabs.desktopdata", icon: Laptop },
      { id: "about", labelKey: "settings.tabs.about", icon: Info },
    ],
  },
];

const TIMEZONES = ["Asia/Tehran", "Asia/Dubai", "Asia/Riyadh", "Europe/London", "Europe/Paris", "Africa/Cairo", "Africa/Tunis", "America/New_York", "America/Los_Angeles"];
const CURRENCIES = ["IRR", "EUR", "USD", "GBP", "AED", "SAR", "TRY"];

function Card({ title, children, desc }: { title?: string; desc?: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-5 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
      {title ? <p className="mb-1 text-sm font-bold">{title}</p> : null}
      {desc ? <p className="mb-3 text-xs text-ink/50 dark:text-ivory/50">{desc}</p> : null}
      {children}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-ink/45 dark:text-ivory/45">{hint}</span> : null}
    </label>
  );
}

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (value: boolean) => void; label: string; desc?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink/8 px-4 py-3 text-start transition hover:border-ink/20 dark:border-white/8 dark:hover:border-white/20">
      <span>
        <span className="block text-[13px] font-semibold">{label}</span>
        {desc ? <span className="block text-[11px] text-ink/50 dark:text-ivory/50">{desc}</span> : null}
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-accent dark:bg-accent-dark" : "bg-ink/15 dark:bg-white/20")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "start-[1.4rem]" : "start-0.5")} />
      </span>
    </button>
  );
}

function Stepper({ value, min, max, onChange, label, hint }: { value: number; min: number; max: number; onChange: (value: number) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-ink/8 px-4 py-3 dark:border-white/8">
      <div>
        <p className="text-[13px] font-semibold">{label}</p>
        {hint ? <p className="text-[11px] text-ink/45 dark:text-ivory/45">{hint}</p> : null}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="h-8 w-8 rounded-lg bg-ink/6 font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20">−</button>
        <span className="w-10 text-center font-display text-sm font-bold tabular-nums">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} className="h-8 w-8 rounded-lg bg-ink/6 font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20">+</button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>(() => {
    const param = new URLSearchParams(location.search).get("tab");
    return (TAB_GROUPS.flatMap((group) => group.tabs).some((entry) => entry.id === param) ? param : "general") as TabId;
  });
  const [navTerm, setNavTerm] = useState("");

  useEffect(() => {
    const param = new URLSearchParams(location.search).get("tab");
    if (param && TAB_GROUPS.flatMap((group) => group.tabs).some((entry) => entry.id === param)) setTab(param as TabId);
  }, [location.search]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title={t("settings.title", "Settings")} detail={t("settings.subtitle", "Institution rules and personal preferences, saved as you type.")} />

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        {/* Nav */}
        <aside className="space-y-3 self-start rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink/40 dark:text-ivory/40" />
            <input className="field-input ps-9 text-sm" placeholder={t("settings.searchPlaceholder", "Find a setting…")} value={navTerm} onChange={(event) => setNavTerm(event.target.value)} />
          </div>
          {TAB_GROUPS.map((group) => {
            const tabs = group.tabs.filter((entry) => t(entry.labelKey, entry.id).toLowerCase().includes(navTerm.trim().toLowerCase()));
            if (tabs.length === 0) return null;
            return (
              <div key={group.labelKey}>
                <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-copper">{t(group.labelKey, group.labelKey)}</p>
                <ul className="space-y-0.5">
                  {tabs.map((entry) => (
                    <li key={entry.id}>
                      <button
                        onClick={() => setTab(entry.id)}
                        className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[13px] font-medium transition", tab === entry.id ? "bg-accent text-white dark:bg-accent-dark" : "hover:bg-ink/5 dark:hover:bg-white/5")}
                      >
                        <entry.icon size={15} />
                        {t(entry.labelKey, entry.id)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </aside>

        {/* Panel */}
        <div className="space-y-4">
          {tab === "general" ? <GeneralTab /> : null}
          {tab === "libraryprofile" ? <ProfileTab /> : null}
          {tab === "localization" ? <LocalizationTab /> : null}
          {tab === "appearance" ? <AppearanceTab /> : null}
          {tab === "rules" ? <RulesTab /> : null}
          {tab === "notifications" ? <NotificationsTab /> : null}
          {tab === "backuprestore" ? <BackupTab /> : null}
          {tab === "database" ? <DatabaseTab /> : null}
          {tab === "integrationsai" ? <IntegrationsTab /> : null}
          {tab === "users" ? <UsersTab /> : null}
          {tab === "desktopdata" ? <DesktopTab /> : null}
          {tab === "about" ? <AboutTab onNavigateLegal={(doc) => navigate(`/legal/${doc}`)} /> : null}
        </div>
      </div>
    </div>
  );
}

/* ── General ─────────────────────────────────────────────────────────── */

function GeneralTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const updateSettings = useLibrarySettingsStore((state) => state.update);
  const user = useAuthStore((state) => state.user);
  const preferences = useUiStore((state) => state.preferences);
  const updatePreferences = useUiStore((state) => state.updatePreferences);

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  const changePin = async () => {
    setPinMessage(null);
    if (!/^\d{4,8}$/.test(newPin)) {
      setPinMessage(t("settings.account.passwordTooShort", "پین باید ۴ تا ۸ رقم باشد."));
      return;
    }
    if (newPin !== confirmPin) {
      setPinMessage(t("settings.account.passwordMismatch", "پین‌ها یکسان نیستند."));
      return;
    }
    try {
      await changeOwnPassword(currentPin, newPin);
      toast.success(t("settings.account.passwordChanged", "پین عوض شد"));
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (error) {
      setPinMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <Card title={t("settings.general.identityTitle", "Library identity")}>
        <div className="grid gap-4">
          <Field label={t("settings.general.libName", "Library name")}>
            <input className="field-input" defaultValue={settings.library_name} onBlur={(event) => void updateSettings({ library_name: event.target.value })} />
          </Field>
          <Field label={t("settings.general.shortName", "Short name")} hint={t("settings.general.shortNamePlaceholder", "Shows in the sidebar and reports.")}>
            <input className="field-input" defaultValue={settings.library_short_name} onBlur={(event) => void updateSettings({ library_short_name: event.target.value })} />
          </Field>
        </div>
      </Card>

      <Card title={t("settings.account.title", "Desk account")}>
        <p className="text-[13px]">
          {user?.full_name} <span className="text-ink/45 dark:text-ivory/45">@{user?.username} · {t("settings.account.roleAdmin", "Administrator")}</span>
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input className="field-input" type="password" inputMode="numeric" placeholder={t("settings.account.currentPassword", "پین فعلی")} value={currentPin} onChange={(event) => setCurrentPin(event.target.value)} />
          <input className="field-input" type="password" inputMode="numeric" placeholder={t("settings.account.newPassword", "پین جدید")} value={newPin} onChange={(event) => setNewPin(event.target.value)} />
          <input className="field-input" type="password" inputMode="numeric" placeholder={t("settings.account.confirmPassword", "تکرار پین جدید")} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value)} />
        </div>
        {pinMessage ? <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{pinMessage}</p> : null}
        <button onClick={() => void changePin()} className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white dark:bg-accent-dark">
          <Lock size={14} /> {t("settings.account.changePassword", "تغییر پین")}
        </button>
      </Card>

      <Card title={t("settings.general.autosaveTitle", "Autosave")}>
        <Toggle
          checked={preferences.autosaveEnabled}
          onChange={(value) => updatePreferences({ autosaveEnabled: value })}
          label={t("settings.general.autosaveLabel", "Autosave preferences")}
          desc={t("settings.general.autosaveDesc", "Periodically persists interface preferences.")}
        />
        {preferences.autosaveEnabled ? (
          <div className="mt-3">
            <Stepper value={preferences.autosaveInterval} min={10} max={600} onChange={(value) => updatePreferences({ autosaveInterval: value })} label={t("settings.general.autosaveInterval", "Interval (seconds)")} />
          </div>
        ) : null}
      </Card>
    </>
  );
}

/* ── Library profile ─────────────────────────────────────────────────── */

function ProfileTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const update = useLibrarySettingsStore((state) => state.update);
  const save = (key: keyof typeof settings) => (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    void update({ [key]: event.target.value });

  return (
    <>
      <Card title={t("settings.profile.contactTitle", "Contact")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("settings.profile.address", "Address")}><input className="field-input" defaultValue={settings.library_address} onBlur={save("library_address")} /></Field>
          <Field label={t("settings.profile.city", "City")}><input className="field-input" defaultValue={settings.library_city} onBlur={save("library_city")} /></Field>
          <Field label={t("settings.profile.phone", "Phone")}><input className="field-input" dir="ltr" defaultValue={settings.library_phone} onBlur={save("library_phone")} /></Field>
          <Field label={t("settings.profile.email", "Email")}><input className="field-input" type="email" dir="ltr" defaultValue={settings.library_email} onBlur={save("library_email")} /></Field>
          <Field label={t("settings.profile.website", "Website")}><input className="field-input" dir="ltr" defaultValue={settings.library_website} onBlur={save("library_website")} /></Field>
          <Field label={t("settings.profile.hours", "Opening hours")}><input className="field-input" defaultValue={settings.library_hours} onBlur={save("library_hours")} /></Field>
        </div>
      </Card>
      <Card title={t("settings.profile.aboutTitle", "About the library")}>
        <Field label={t("settings.profile.description", "Short description")}>
          <textarea className="field-input" rows={4} defaultValue={settings.library_description} onBlur={save("library_description")} />
        </Field>
      </Card>
    </>
  );
}

/* ── Localization ────────────────────────────────────────────────────── */

function LocalizationTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const update = useLibrarySettingsStore((state) => state.update);

  return (
    <>
      <Card title={t("settings.localization.langTitle", "Language")}>
        <div className="flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
          <span className="text-[13px] font-bold">فارسی (FA)</span>
          <span className="text-[11px] text-ink/50 dark:text-ivory/50">{t("onboarding.faOnlyNote", "نسخهٔ فعلی فارسی است؛ زبان‌های دیگر به‌زودی.")}</span>
        </div>
      </Card>
      <Card title={t("settings.localization.formatsTitle", "Formats")}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("settings.localization.timezone", "Timezone")}>
            <select className="field-select" value={settings.timezone} onChange={(event) => void update({ timezone: event.target.value })}>
              {TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </Field>
          <Field label={t("settings.localization.currency", "Currency")}>
            <select className="field-select" value={settings.currency} onChange={(event) => void update({ currency: event.target.value })}>
              {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </Field>
          <Field label={t("settings.localization.dateFormat", "Date format")}>
            <select className="field-select" value={settings.date_format} onChange={(event) => void update({ date_format: event.target.value as typeof settings.date_format })}>
              <option value="dd/MM/yyyy">dd/MM/yyyy</option>
              <option value="MM/dd/yyyy">MM/dd/yyyy</option>
              <option value="yyyy-MM-dd">yyyy-MM-dd</option>
            </select>
          </Field>
        </div>
      </Card>
    </>
  );
}

/* ── Appearance ──────────────────────────────────────────────────────── */

function AppearanceTab() {
  const { t } = useTranslation();
  const preferences = useUiStore((state) => state.preferences);
  const updatePreferences = useUiStore((state) => state.updatePreferences);

  return (
    <>
      <Card title={t("settings.appearance.themeTitle", "Theme")} desc={t("settings.appearance.themeDesc", "Light, dark, or follow the operating system.")}>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: "light", icon: Sun, label: t("settings.appearance.themeLight", "Light") },
            { value: "dark", icon: Moon, label: t("settings.appearance.themeDark", "Dark") },
            { value: "system", icon: Laptop, label: t("settings.appearance.themeSystem", "System") },
          ] as const).map((option) => (
            <button
              key={option.value}
              onClick={() => updatePreferences({ theme: option.value })}
              className={cn("flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition", preferences.theme === option.value ? "border-accent bg-accent/8 text-accent dark:border-accent-dark dark:text-accent-dark" : "border-ink/12 text-ink/60 dark:border-white/12 dark:text-ivory/60")}
            >
              <option.icon size={17} />
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title={t("settings.appearance.accentTitle", "Accent colour")}>
        <div className="flex flex-wrap items-center gap-3">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              title={t(preset.labelKey, preset.value)}
              onClick={() => { updatePreferences({ accentColor: preset.value }); applyAccent(preset.value); }}
              className={cn("h-10 w-10 rounded-full ring-offset-2 transition dark:ring-offset-[#1b2723]", preferences.accentColor === preset.value ? "ring-2 ring-ink dark:ring-white" : "hover:scale-105")}
              style={{ background: preset.value }}
            />
          ))}
          <span className="text-[11px] text-ink/45 dark:text-ivory/45">{t("settings.appearance.accentSelected", "Selected")}</span>
        </div>
      </Card>

      <Card title={t("settings.appearance.fontSizeTitle", "Font size")}>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: "small", label: t("settings.appearance.fontSizeSmall", "Small"), sample: "Aa", cls: "text-sm" },
            { value: "medium", label: t("settings.appearance.fontSizeMedium", "Medium"), sample: "Aa", cls: "text-base" },
            { value: "large", label: t("settings.appearance.fontSizeLarge", "Large"), sample: "Aa", cls: "text-lg" },
          ] as const).map((option) => (
            <button
              key={option.value}
              onClick={() => updatePreferences({ fontSize: option.value })}
              className={cn("flex flex-col items-center gap-1 rounded-xl border px-3 py-3 transition", preferences.fontSize === option.value ? "border-accent bg-accent/8 text-accent dark:border-accent-dark dark:text-accent-dark" : "border-ink/12 text-ink/60 dark:border-white/12 dark:text-ivory/60")}
            >
              <span className={cn("font-display font-bold", option.cls)}>{option.sample}</span>
              <span className="text-[11px] font-bold">{option.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ── Circulation rules ───────────────────────────────────────────────── */

function RulesTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const update = useLibrarySettingsStore((state) => state.update);

  return (
    <>
      <Card title={t("settings.rules.paramsTitle", "Core parameters")}>
        <div className="grid gap-2 md:grid-cols-2">
          <Stepper value={settings.loan_days} min={1} max={365} onChange={(value) => void update({ loan_days: value })} label={t("settings.rules.loanPeriod", "Loan period (days)")} />
          <Stepper value={settings.loan_limit} min={1} max={50} onChange={(value) => void update({ loan_limit: value })} label={t("settings.rules.loanLimit", "Concurrent loans per member")} />
          <Stepper value={settings.renew_limit} min={0} max={10} onChange={(value) => void update({ renew_limit: value })} label={t("settings.rules.renewLimit", "Renewals allowed")} />
          <Stepper value={settings.reservation_hold_days} min={1} max={30} onChange={(value) => void update({ reservation_hold_days: value })} label={t("settings.rules.holdPeriod", "Hold pickup window (days)")} />
        </div>
      </Card>

      <Card title={t("settings.rules.scopeDurationsTitle", "Scope durations")} desc={t("settings.rules.scopeDurationsHelp", "Internal = read in the library; visitors and single-copy titles are internal-only.")}>
        <div className="grid gap-2 md:grid-cols-2">
          <Stepper value={settings.reservation_internal_days} min={1} max={7} onChange={(value) => void update({ reservation_internal_days: value })} label={t("settings.rules.internalDays", "Internal loan (days)")} />
          <Stepper value={settings.reservation_external_days} min={1} max={90} onChange={(value) => void update({ reservation_external_days: value })} label={t("settings.rules.externalDays", "External loan (days)")} />
        </div>
      </Card>

      <Card title={t("settings.rules.shelvingTitle", "Shelving")}>
        <Stepper value={settings.shelf_row_count} min={1} max={18} onChange={(value) => void update({ shelf_row_count: value })} label={t("settings.rules.shelfRowCount", "Lettered rows per bookcase")} hint={t("settings.rules.shelfRowCountHelp", "Row A… up to this count; S stays reserved for the floor shelf.")} />
      </Card>

      <Card title={t("settings.rules.gracePeriodTitle", "Grace period")}>
        <Toggle checked={settings.grace_period_enabled} onChange={(value) => void update({ grace_period_enabled: value })} label={t("settings.rules.enableGracePeriod", "Enable a grace period")} desc={t("settings.rules.enableGracePeriodDesc", "Overdue flags and fines wait this many days past the due date.")} />
        {settings.grace_period_enabled ? (
          <div className="mt-3">
            <Stepper value={settings.grace_period_days} min={1} max={14} onChange={(value) => void update({ grace_period_days: value })} label={t("settings.rules.gracePeriodLength", "Grace days")} />
          </div>
        ) : null}
      </Card>

      <Card title={t("settings.rules.finesTitle", "Fines")}>
        <Toggle checked={settings.fines_enabled} onChange={(value) => void update({ fines_enabled: value })} label={t("settings.rules.finesEnabled", "Charge overdue fines")} />
        {settings.fines_enabled ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Stepper value={settings.fine_per_day} min={0} max={1_000_000} onChange={(value) => void update({ fine_per_day: value })} label={t("settings.rules.finePerDay", "Fine per day")} />
            <Stepper value={settings.max_fine_amount} min={0} max={100_000_000} onChange={(value) => void update({ max_fine_amount: value })} label={t("settings.rules.maxFine", "Maximum fine (0 = uncapped)")} />
          </div>
        ) : null}
      </Card>
    </>
  );
}

/* ── Notifications ───────────────────────────────────────────────────── */

function NotificationsTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const update = useLibrarySettingsStore((state) => state.update);

  return (
    <Card title={t("settings.notifications.remindersTitle", "Reminders")} desc={t("settings.notifications.tip", "These drive the bell badge and the due-soon states across the app.")}>
      <div className="space-y-3">
        <Toggle checked={settings.notify_overdue} onChange={(value) => void update({ notify_overdue: value })} label={t("settings.notifications.overdueAlerts", "Overdue alerts")} desc={t("settings.notifications.overdueAlertsDesc", "Flag loans the day after the due date (after grace).")} />
        <Toggle checked={settings.notify_due_soon} onChange={(value) => void update({ notify_due_soon: value })} label={t("settings.notifications.dueSoonReminders", "Due-soon reminders")} />
        {settings.notify_due_soon ? (
          <Stepper value={settings.notify_due_soon_days} min={1} max={14} onChange={(value) => void update({ notify_due_soon_days: value })} label={t("settings.notifications.dueSoonDays", "Days before due date")} />
        ) : null}
        <Toggle checked={settings.notify_ready} onChange={(value) => void update({ notify_ready: value })} label={t("settings.notifications.readyAlerts", "Ready-for-pickup alerts")} desc={t("settings.notifications.readyAlertsDesc", "Notify when a hold is waiting on the shelf.")} />
      </div>
    </Card>
  );
}

/* ── Backup & restore ────────────────────────────────────────────────── */

function BackupTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const exportBackup = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: `ketabyar-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      const backup = await exportLibraryBackup();
      await writeTextFile(path, JSON.stringify(backup, null, 2));
      toast.success(t("settings.backup.fullExportSuccess", "Backup saved"), {
        duration: 8000,
        action: {
          label: t("common.openFolder", "Open folder"),
          onClick: async () => {
            try {
              const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
              await revealItemInDir(path);
            } catch { /* browser */ }
          },
        },
      });
    } catch (error) {
      toast.error(t("settings.backup.fullExportError", "Backup failed: {{message}}", { message: error instanceof Error ? error.message : String(error) }));
    }
  };

  const restoreBackup = async () => {
    if (!window.confirm(t("settings.backup.fullRestoreWarn", "Restoring overwrites every matching row by ID. Continue?"))) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path || typeof path !== "string") return;
      const parsed = JSON.parse(await readTextFile(path));
      if (!parsed?.tables) {
        toast.error(t("settings.backup.fullRestoreInvalidFile", "That file is not a KetabYar backup."));
        return;
      }
      const result = await importLibraryBackup(parsed);
      toast.success(t("settings.backup.fullRestoreSuccess", "Restored {{count}} rows", { count: Object.values(result).reduce((sum, n) => sum + n, 0) }));
      void queryClient.invalidateQueries();
    } catch (error) {
      toast.error(t("settings.backup.fullRestoreError", "Restore failed: {{message}}", { message: error instanceof Error ? error.message : String(error) }));
    }
  };

  return (
    <>
      <Card title={t("settings.backup.fullBackupTitle", "Full backup")} desc={t("settings.backup.fullBackupDesc", "Every table in one JSON file. Keep a copy on a USB drive.")}>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void exportBackup()} className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white dark:bg-accent-dark">
            <Download size={15} /> {t("settings.backup.fullExportBtn", "Export backup")}
          </button>
          <button onClick={() => void restoreBackup()} className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/6 px-4 py-2 text-sm font-semibold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20">
            <Upload size={15} /> {t("settings.backup.fullRestoreBtn", "Restore from backup")}
          </button>
        </div>
      </Card>
      <Card desc={t("settings.backup.importHint", "Migrating from a spreadsheet? Books and members accept plain JSON arrays.")} title={t("settings.backup.importBooksTitle", "Import books / members (JSON)")}>
        <ImportJsonButton
          label={t("settings.backup.importBooks", "Import books JSON")}
          validate={(parsed) => Array.isArray(parsed) && parsed.every((row) => typeof row === "object")}
          onImport={async (rows) => {
            const result = await importLibraryBackup({ _version: 1, _exported_at: new Date().toISOString(), tables: { books: rows } });
            toast.success(t("settings.backup.importBooksSuccess", "Imported {{count}} books", { count: result.books ?? 0 }));
          }}
        />
        <ImportJsonButton
          label={t("settings.backup.importMembers", "Import members JSON")}
          validate={(parsed) => Array.isArray(parsed) && parsed.every((row) => typeof row === "object")}
          onImport={async (rows) => {
            const result = await importLibraryBackup({ _version: 1, _exported_at: new Date().toISOString(), tables: { members: rows } });
            toast.success(t("settings.backup.importMembersSuccess", "Imported {{count}} members", { count: result.members ?? 0 }));
          }}
        />
      </Card>
    </>
  );
}

function ImportJsonButton({ label, validate, onImport }: { label: string; validate: (parsed: unknown) => boolean; onImport: (rows: Record<string, unknown>[]) => Promise<void> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const handle = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path || typeof path !== "string") return;
      const parsed = JSON.parse(await readTextFile(path));
      if (!validate(parsed)) {
        toast.error(t("settings.backup.invalidJson", "Unexpected JSON shape."));
        return;
      }
      await onImport(parsed as Record<string, unknown>[]);
      void queryClient.invalidateQueries();
    } catch (error) {
      toast.error(t("settings.backup.importFailed", "Import failed: {{message}}", { message: error instanceof Error ? error.message : String(error) }));
    }
  };
  return (
    <button onClick={() => void handle()} className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/6 px-4 py-2 text-sm font-semibold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20">
      <Upload size={15} /> {label}
    </button>
  );
}

/* ── Database ────────────────────────────────────────────────────────── */

function DatabaseTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const [dangerVisible, setDangerVisible] = useState(false);

  const clearLoans = async () => {
    if (!window.confirm(t("settings.database.clearLoansConfirm", "Delete ALL loans (open and returned)? Copies return to the shelves."))) return;
    try {
      await clearCirculation();
      window.alert(t("settings.database.clearLoansSuccess", "Loan history cleared."));
    } catch (error) {
      window.alert(t("settings.database.clearLoansFailed", "Could not clear loans: {{message}}", { message: String(error) }));
    }
  };

  const factoryReset = async () => {
    if (!window.confirm(t("settings.database.factoryResetConfirm1", "FIRST CONFIRMION — this deletes every book, member, loan, hold, fine, shelf and notification in this database."))) return;
    if (!window.confirm(t("settings.database.factoryResetConfirm2", "SECOND CONFIRMATION — absolutely sure? There is no undo."))) return;
    try {
      await deleteAllLibraryData();
      localStorage.removeItem("ketabyar-preferences");
      window.alert(t("settings.database.factoryResetSuccess", "The library is empty again. Reloading…"));
      window.location.reload();
    } catch (error) {
      window.alert(String(error));
    }
  };

  return (
    <>
      <Card title={t("settings.database.infoTitle", "Database")}>
        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("settings.database.infoName", "Library")}</dt><dd className="font-medium">{settings.library_name}</dd></div>
          <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("settings.database.infoEngine", "Engine")}</dt><dd className="font-medium">SQLite (fully offline)</dd></div>
          <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("settings.database.infoLocation", "File location")}</dt><dd className="font-mono text-xs" dir="ltr">%APPDATA%\ir.ketabyar.library\ketabyar.db</dd></div>
        </dl>
      </Card>

      <Card title={t("settings.database.dangerTitle", "Danger zone")} desc={t("settings.database.dangerDesc", "These actions wipe real data. Take a backup first.")}>
        {!dangerVisible ? (
          <button onClick={() => setDangerVisible(true)} className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-red-600/10 px-4 py-2 text-sm font-bold text-red-600">
            <CircleAlert size={15} /> {t("settings.database.dangerShowBtn", "Show destructive actions")}
          </button>
        ) : (
          <div className="space-y-2">
            <button onClick={() => void clearLoans()} className="inline-flex w-full items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-start hover:bg-amber-500/10">
              <span className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">{t("settings.database.clearLoansTitle", "Clear all loans")}</span>
              <Trash2 size={15} className="text-amber-600" />
            </button>
            <button onClick={() => void factoryReset()} className="inline-flex w-full items-center justify-between rounded-xl border border-red-600/40 bg-red-600/5 px-4 py-3 text-start hover:bg-red-600/10">
              <span className="text-[13px] font-semibold text-red-600">{t("settings.database.factoryResetTitle", "Factory reset — delete ALL library data")}</span>
              <RotateCcw size={15} className="text-red-600" />
            </button>
          </div>
        )}
      </Card>
    </>
  );
}

/* ── Integrations & AI ───────────────────────────────────────────────── */

function IntegrationsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const preferences = useUiStore((state) => state.preferences);
  const updatePreferences = useUiStore((state) => state.updatePreferences);
  const [keyVisible, setKeyVisible] = useState(false);
  const [testState, setTestState] = useState<"idle" | "ok" | "bad" | "fail">("idle");
  const [enriching, setEnriching] = useState(false);
  const [enrichLog, setEnrichLog] = useState<{ title: string; status: string; message: string }[]>([]);
  const cancelRef = useMemo(() => ({ current: false }), []);

  const testGroq = async () => {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${preferences.groqApiKey}` } });
      setTestState(response.ok ? "ok" : response.status === 401 || response.status === 403 ? "bad" : "fail");
    } catch {
      setTestState("fail");
    }
    window.setTimeout(() => setTestState("idle"), 6000);
  };

  const bulkEnrich = async () => {
    if (!window.confirm(t("settings.integrations.enrichConfirm", "Look up missing metadata online for every incomplete record? This uses Google Books / Open Library."))) return;
    setEnriching(true);
    cancelRef.current = false;
    setEnrichLog([]);
    try {
      const allBooks = await fetchBooks("", "");
      const targets = findEnrichableBooks(allBooks);
      if (targets.length === 0) {
        toast.info(t("settings.integrations.enrichNone", "Nothing to enrich — the catalog is complete."));
        setEnriching(false);
        return;
      }
      let done = 0;
      await enrichAllBooks(
        targets,
        { groqApiKey: preferences.groqEnabled && preferences.groqApiKey ? preferences.groqApiKey : undefined },
        (progress) => {
          done += 1;
          setEnrichLog((log) => [{ title: progress.book.title, status: progress.status, message: progress.message }, ...log].slice(0, 40));
          toast.info(t("settings.integrations.enrichProgress", "{{done}} of {{total}} processed", { done, total: targets.length }), { id: "enrich-progress" });
        },
        () => cancelRef.current,
      );
      toast.success(t("settings.integrations.enrichDone", "Bulk enrichment finished"));
      void queryClient.invalidateQueries();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setEnriching(false);
    }
  };

  return (
    <>
      <Card title={t("settings.integrations.groqTitle", "Groq AI enrichment")} desc={t("settings.integrations.aiDesc", "Optional: an AI pass that fills Persian titles, blurbs and Dewey estimates during autofill.")}>
        <Toggle checked={preferences.groqEnabled} onChange={(value) => updatePreferences({ groqEnabled: value })} label={t("settings.integrations.groqToggleLabel", "Enable Groq enrichment")} desc={t("settings.integrations.groqToggleDesc", "Fast Llama 3 metadata generation.")} />
        {preferences.groqEnabled ? (
          <div className="mt-3 grid gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className="field-input pe-10"
                  type={keyVisible ? "text" : "password"}
                  placeholder={t("settings.integrations.groqPlaceholder", "gsk_…")}
                  defaultValue={preferences.groqApiKey}
                  onBlur={(event) => updatePreferences({ groqApiKey: event.target.value.trim() })}
                />
                <button onClick={() => setKeyVisible((value) => !value)} className="absolute inset-y-0 end-3 my-auto text-ink/45" aria-label={t("settings.secrets.toggleVisibility", "Toggle visibility")}>
                  {keyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button onClick={() => void testGroq()} className="rounded-[var(--radius-control)] bg-ink/6 px-4 text-sm font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20">
                {t("settings.integrations.groqTest", "Test")}
              </button>
            </div>
            {testState === "ok" ? <p className="flex items-center gap-1.5 text-xs font-bold text-accent dark:text-accent-dark"><CheckCircle2 size={13} /> {t("settings.integrations.groqOk", "Key works")}</p> : null}
            {testState === "bad" ? <p className="text-xs font-bold text-red-600">{t("settings.integrations.groqInvalidKey", "Invalid key — get one at console.groq.com")}</p> : null}
            {testState === "fail" ? <p className="text-xs font-bold text-red-600">{t("settings.integrations.groqTestFailed", "Could not reach Groq.")}</p> : null}
            <p className="text-[11px] text-ink/45 dark:text-ivory/45">{t("settings.integrations.groqHelp", "Your key stays on this device.")}</p>
          </div>
        ) : null}
      </Card>

      <Card title={t("settings.integrations.lookupTitle", "External catalog lookup")}>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle checked={preferences.googleBooksEnabled} onChange={(value) => updatePreferences({ googleBooksEnabled: value })} label={t("settings.integrations.googleTitle", "Google Books")} desc={t("settings.integrations.googleDesc", "Primary metadata + covers.")} />
          <Toggle checked={preferences.openLibraryEnabled} onChange={(value) => updatePreferences({ openLibraryEnabled: value })} label={t("settings.integrations.openLibraryTitle", "Open Library")} desc={t("settings.integrations.openLibraryDesc", "Dewey numbers + fallback covers.")} />
        </div>
      </Card>

      <Card title={t("settings.integrations.enrichTitle", "Bulk enrichment")} desc={t("settings.integrations.enrichDesc", "Fills ONLY blank fields — never overwrites your data.")}>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void bulkEnrich()} disabled={enriching} className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent-dark">
            <Zap size={15} /> {enriching ? t("settings.integrations.enrichRunning", "Working…") : t("settings.integrations.enrichStart", "Start bulk enrichment")}
          </button>
          {enriching ? (
            <button onClick={() => (cancelRef.current = true)} className="rounded-[var(--radius-control)] bg-red-600/10 px-4 py-2 text-sm font-bold text-red-600">
              {t("settings.integrations.enrichCancel", "Cancel")}
            </button>
          ) : null}
        </div>
        {enrichLog.length > 0 ? (
          <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto rounded-xl bg-ink/4 p-3 text-[11px] dark:bg-white/5">
            {enrichLog.map((entry, index) => (
              <li key={index} className="flex justify-between gap-2">
                <span className="truncate font-semibold">{entry.title}</span>
                <span className={entry.status === "success" ? "text-accent dark:text-accent-dark" : entry.status === "skipped" ? "text-ink/45" : "text-red-500"}>{entry.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}

/* ── Users (simple-PIN edition) ──────────────────────────────────────── */

function UsersTab() {
  const { t } = useTranslation();
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const [resetOpen, setResetOpen] = useState(false);
  const [newPin, setNewPin] = useState("");

  return (
    <>
      <Card title={t("settings.users.title", "Desk accounts")} desc={t("settings.users.pinEditionNote", "KetabYar uses a single shared desk PIN — simple and safe for one service desk.")}>
        <ul className="space-y-2">
          {(usersQuery.data ?? []).map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink/8 px-4 py-3 dark:border-white/8">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-copper text-xs font-bold text-white">{user.full_name.slice(0, 2)}</span>
                <div>
                  <p className="text-[13px] font-bold">{user.full_name} <span className="font-normal text-ink/45 dark:text-ivory/45">@{user.username}</span></p>
                  <p className="text-[11px] text-ink/50 dark:text-ivory/50">{t("settings.account.roleAdmin", "Administrator")}</p>
                </div>
              </div>
              <button onClick={() => setResetOpen(true)} className="rounded-lg bg-ink/6 px-3 py-1.5 text-xs font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20">
                {t("settings.users.resetPassword", "Reset PIN")}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Modal isOpen={resetOpen} onClose={() => setResetOpen(false)} title={t("settings.users.resetPasswordTitle", "Reset the desk PIN")} size="md">
        <input className="field-input" inputMode="numeric" placeholder={t("settings.users.newPinPlaceholder", "New PIN (4–8 digits)")} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 8))} />
        <p className="mt-2 text-[11px] text-ink/45 dark:text-ivory/45">{t("settings.users.resetPasswordHelp", "Everyone signing in with the old PIN will need the new one.")}</p>
        <button
          onClick={async () => {
            try {
              if (!/^\d{4,8}$/.test(newPin)) throw new Error(t("settings.account.passwordTooShort", "پین باید ۴ تا ۸ رقم باشد."));
              await resetPassword("local", newPin);
              toast.success(t("settings.users.pinReset", "PIN updated"));
              setResetOpen(false);
              setNewPin("");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : String(error));
            }
          }}
          className="mt-4 w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white dark:bg-accent-dark"
        >
          {t("settings.users.resetPassword", "Reset PIN")}
        </button>
      </Modal>
    </>
  );
}

/* ── Desktop & data ──────────────────────────────────────────────────── */

function DesktopTab() {
  const { t } = useTranslation();
  const preferences = useUiStore((state) => state.preferences);
  const updatePreferences = useUiStore((state) => state.updatePreferences);
  const [bootEnabled, setBootEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        setBootEnabled(await isEnabled());
      } catch { /* browser */ }
    })();
  }, []);

  const toggleBoot = async (value: boolean) => {
    try {
      const autostart = await import("@tauri-apps/plugin-autostart");
      if (value) await autostart.enable();
      else await autostart.disable();
      setBootEnabled(value);
      updatePreferences({ launchOnBoot: value });
    } catch (error) {
      toast.error(String(error));
    }
  };

  const openDataFolder = async () => {
    try {
      const { appDataDir } = await import("@tauri-apps/api/path");
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(await appDataDir());
    } catch { /* browser */ }
  };

  return (
    <>
      <Card title={t("settings.desktop.trayTitle", "Window behaviour")}>
        <div className="space-y-3">
          <Toggle
            checked={preferences.closeToTray}
            onChange={(value) => updatePreferences({ closeToTray: value })}
            label={t("settings.desktop.closeToTray", "Close button hides to tray")}
            desc={t("settings.desktop.trayDesc", "The app keeps running in the system tray; right-click it to quit.")}
          />
          <Toggle checked={bootEnabled} onChange={(value) => void toggleBoot(value)} label={t("settings.desktop.launchOnBoot", "Start with Windows")} desc={t("settings.desktop.startupDesc", "Launch KetabYar when this computer boots.")} />
        </div>
      </Card>

      <Card title={t("settings.desktop.paginationTitle", "Table density")}>
        <Field label={t("settings.desktop.pageSizeLabel", "Rows per page")} hint={t("settings.desktop.pageSizeDesc", "Applies to catalog, members and activity tables.")}>
          <select className="field-select max-w-40" value={preferences.pageSize} onChange={(event) => updatePreferences({ pageSize: Number(event.target.value) })}>
            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </Field>
      </Card>

      <Card title={t("settings.desktop.storageTitle", "Storage")}>
        <button onClick={() => void openDataFolder()} className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/6 px-4 py-2 text-sm font-semibold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20">
          <Database size={15} /> {t("settings.desktop.openFolder", "Open the data folder")}
        </button>
      </Card>
    </>
  );
}

/* ── About ───────────────────────────────────────────────────────────── */

function AboutTab({ onNavigateLegal }: { onNavigateLegal: (doc: string) => void }) {
  const { t } = useTranslation();
  const [version, setVersion] = useState("1.0.3");
  const edition = activeBackend === "rust"
    ? t("settings.about.editionRust", "Rust (موتور بومی ketabyar-core)")
    : t("settings.about.editionTs", "TypeScript (tauri-plugin-sql در webview)");

  useEffect(() => {
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setVersion(await getVersion());
      } catch { /* keep default */ }
    })();
  }, []);

  return (
    <>
      <Card>
        <div className="flex items-center gap-4">
          <img src="/brand/ketabyar-symbol.png" alt="KetabYar" className="h-14 w-14 rounded-2xl" />
          <div>
            <p className="font-display text-lg font-bold">کتابیار · KetabYar</p>
            <p className="text-xs text-ink/55 dark:text-ivory/55">{t("settings.about.tagline", "مدیریت کتابخانهٔ دانشگاه — آفلاین، فارسی، راست‌به‌چپ")}</p>
          </div>
        </div>
        <dl className="mt-4 space-y-2 text-[13px]">
          <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("settings.about.version", "Version")}</dt><dd className="font-bold">v{version}</dd></div>
          <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("settings.about.edition", "Data engine")}</dt><dd className="font-bold">{edition}</dd></div>
          <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("settings.about.database", "Database")}</dt><dd>SQLite 3</dd></div>
          <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("settings.about.platform", "Platform")}</dt><dd>Windows · Tauri 2</dd></div>
        </dl>
      </Card>

      <Card title={t("settings.about.credits", "Credits & legal")}>
        <ul className="mb-4 space-y-1 text-[13px] text-ink/70 dark:text-ivory/70">
          <li>{t("settings.about.engineering", "Design & engineering")}: KetabYar contributors</li>
          <li>{t("settings.about.bookData", "Book data")}: Google Books · Open Library</li>
          <li>{t("settings.about.icons", "Icons")}: Lucide (ISC)</li>
          <li>{t("settings.about.fonts", "Fonts")}: Vazirmatn · IBM Plex Sans Arabic · Manrope (SIL OFL 1.1)</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          {(["terms", "privacy", "licenses"] as const).map((doc) => (
            <button key={doc} onClick={() => onNavigateLegal(doc)} className="rounded-[var(--radius-control)] bg-ink/6 px-4 py-2 text-sm font-semibold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20">
              {t(`settings.about.${doc === "terms" ? "terms" : doc === "privacy" ? "privacy" : "licenses"}`, doc)}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-ink/45 dark:text-ivory/45">MIT License · Copyright © 2026 KetabYar contributors</p>
      </Card>
    </>
  );
}
