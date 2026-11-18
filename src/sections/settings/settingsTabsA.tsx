import { Laptop, Lock, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ACCENT_PRESETS, applyAccent } from "../../config/accent";
import { changeOwnPassword } from "../../data/auth";
import { useAuthStore } from "../../store/authStore";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import { useUiStore } from "../../store/uiStore";
import { cn } from "../../utils/cn";
import {
  Card,
  CURRENCIES,
  Field,
  Stepper,
  TIMEZONES,
  Toggle,
} from "./settingsShared";

export function GeneralTab() {
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
      setPinMessage(
        t("settings.account.passwordTooShort", "پین باید ۴ تا ۸ رقم باشد."),
      );
      return;
    }
    if (newPin !== confirmPin) {
      setPinMessage(
        t("settings.account.passwordMismatch", "پین‌ها یکسان نیستند."),
      );
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
            <input
              className="field-input"
              defaultValue={settings.library_name}
              onBlur={(event) =>
                void updateSettings({ library_name: event.target.value })
              }
            />
          </Field>
          <Field
            label={t("settings.general.shortName", "Short name")}
            hint={t(
              "settings.general.shortNamePlaceholder",
              "Shows in the sidebar and reports.",
            )}
          >
            <input
              className="field-input"
              defaultValue={settings.library_short_name}
              onBlur={(event) =>
                void updateSettings({ library_short_name: event.target.value })
              }
            />
          </Field>
        </div>
      </Card>

      <Card title={t("settings.account.title", "Desk account")}>
        <p className="text-[13px]">
          {user?.full_name}{" "}
          <span className="text-ink/45 dark:text-ivory/45">
            @{user?.username} ·{" "}
            {t("settings.account.roleAdmin", "Administrator")}
          </span>
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            className="field-input"
            type="password"
            inputMode="numeric"
            placeholder={t("settings.account.currentPassword", "پین فعلی")}
            value={currentPin}
            onChange={(event) => setCurrentPin(event.target.value)}
          />
          <input
            className="field-input"
            type="password"
            inputMode="numeric"
            placeholder={t("settings.account.newPassword", "پین جدید")}
            value={newPin}
            onChange={(event) => setNewPin(event.target.value)}
          />
          <input
            className="field-input"
            type="password"
            inputMode="numeric"
            placeholder={t(
              "settings.account.confirmPassword",
              "تکرار پین جدید",
            )}
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value)}
          />
        </div>
        {pinMessage ? (
          <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">
            {pinMessage}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void changePin()}
          className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white dark:bg-accent-dark"
        >
          <Lock size={14} /> {t("settings.account.changePassword", "تغییر پین")}
        </button>
      </Card>

      <Card title={t("settings.general.autosaveTitle", "Autosave")}>
        <Toggle
          checked={preferences.autosaveEnabled}
          onChange={(value) => updatePreferences({ autosaveEnabled: value })}
          label={t("settings.general.autosaveLabel", "Autosave preferences")}
          desc={t(
            "settings.general.autosaveDesc",
            "Periodically persists interface preferences.",
          )}
        />
        {preferences.autosaveEnabled ? (
          <div className="mt-3">
            <Stepper
              value={preferences.autosaveInterval}
              min={10}
              max={600}
              onChange={(value) =>
                updatePreferences({ autosaveInterval: value })
              }
              label={t(
                "settings.general.autosaveInterval",
                "Interval (seconds)",
              )}
            />
          </div>
        ) : null}
      </Card>
    </>
  );
}

/* ── Library profile ─────────────────────────────────────────────────── */

export function ProfileTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const update = useLibrarySettingsStore((state) => state.update);
  const save =
    (key: keyof typeof settings) =>
    (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      void update({ [key]: event.target.value });

  return (
    <>
      <Card title={t("settings.profile.contactTitle", "Contact")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("settings.profile.address", "Address")}>
            <input
              className="field-input"
              defaultValue={settings.library_address}
              onBlur={save("library_address")}
            />
          </Field>
          <Field label={t("settings.profile.city", "City")}>
            <input
              className="field-input"
              defaultValue={settings.library_city}
              onBlur={save("library_city")}
            />
          </Field>
          <Field label={t("settings.profile.phone", "Phone")}>
            <input
              className="field-input"
              dir="ltr"
              defaultValue={settings.library_phone}
              onBlur={save("library_phone")}
            />
          </Field>
          <Field label={t("settings.profile.email", "Email")}>
            <input
              className="field-input"
              type="email"
              dir="ltr"
              defaultValue={settings.library_email}
              onBlur={save("library_email")}
            />
          </Field>
          <Field label={t("settings.profile.website", "Website")}>
            <input
              className="field-input"
              dir="ltr"
              defaultValue={settings.library_website}
              onBlur={save("library_website")}
            />
          </Field>
          <Field label={t("settings.profile.hours", "Opening hours")}>
            <input
              className="field-input"
              defaultValue={settings.library_hours}
              onBlur={save("library_hours")}
            />
          </Field>
        </div>
      </Card>
      <Card title={t("settings.profile.aboutTitle", "About the library")}>
        <Field label={t("settings.profile.description", "Short description")}>
          <textarea
            className="field-input"
            rows={4}
            defaultValue={settings.library_description}
            onBlur={save("library_description")}
          />
        </Field>
      </Card>
    </>
  );
}

/* ── Localization ────────────────────────────────────────────────────── */

export function LocalizationTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const update = useLibrarySettingsStore((state) => state.update);

  return (
    <>
      <Card title={t("settings.localization.langTitle", "Language")}>
        <div className="flex items-center justify-between rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
          <span className="text-[13px] font-bold">فارسی (FA)</span>
          <span className="text-[11px] text-ink/50 dark:text-ivory/50">
            {t(
              "onboarding.faOnlyNote",
              "نسخهٔ فعلی فارسی است؛ زبان‌های دیگر به‌زودی.",
            )}
          </span>
        </div>
      </Card>
      <Card title={t("settings.localization.formatsTitle", "Formats")}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("settings.localization.timezone", "Timezone")}>
            <select
              className="field-select"
              value={settings.timezone}
              onChange={(event) =>
                void update({ timezone: event.target.value })
              }
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("settings.localization.currency", "Currency")}>
            <select
              className="field-select"
              value={settings.currency}
              onChange={(event) =>
                void update({ currency: event.target.value })
              }
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("settings.localization.dateFormat", "Date format")}>
            <select
              className="field-select"
              value={settings.date_format}
              onChange={(event) =>
                void update({
                  date_format: event.target
                    .value as typeof settings.date_format,
                })
              }
            >
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

export function AppearanceTab() {
  const { t } = useTranslation();
  const preferences = useUiStore((state) => state.preferences);
  const updatePreferences = useUiStore((state) => state.updatePreferences);

  return (
    <>
      <Card
        title={t("settings.appearance.themeTitle", "Theme")}
        desc={t(
          "settings.appearance.themeDesc",
          "Light, dark, or follow the operating system.",
        )}
      >
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              {
                value: "light",
                icon: Sun,
                label: t("settings.appearance.themeLight", "Light"),
              },
              {
                value: "dark",
                icon: Moon,
                label: t("settings.appearance.themeDark", "Dark"),
              },
              {
                value: "system",
                icon: Laptop,
                label: t("settings.appearance.themeSystem", "System"),
              },
            ] as const
          ).map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => updatePreferences({ theme: option.value })}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition",
                preferences.theme === option.value
                  ? "border-accent bg-accent/8 text-accent dark:border-accent-dark dark:text-accent-dark"
                  : "border-ink/12 text-ink/60 dark:border-white/12 dark:text-ivory/60",
              )}
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
              type="button"
              key={preset.value}
              title={t(preset.labelKey, preset.value)}
              aria-label={t(preset.labelKey, preset.value)}
              onClick={() => {
                updatePreferences({ accentColor: preset.value });
                applyAccent(preset.value);
              }}
              className={cn(
                "h-10 w-10 rounded-full ring-offset-2 transition dark:ring-offset-[#1b2723]",
                preferences.accentColor === preset.value
                  ? "ring-2 ring-ink dark:ring-white"
                  : "hover:scale-105",
              )}
              style={{ background: preset.value }}
            />
          ))}
          <span className="text-[11px] text-ink/45 dark:text-ivory/45">
            {t("settings.appearance.accentSelected", "Selected")}
          </span>
        </div>
      </Card>

      <Card title={t("settings.appearance.fontSizeTitle", "Font size")}>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              {
                value: "small",
                label: t("settings.appearance.fontSizeSmall", "Small"),
                sample: "Aa",
                cls: "text-sm",
              },
              {
                value: "medium",
                label: t("settings.appearance.fontSizeMedium", "Medium"),
                sample: "Aa",
                cls: "text-base",
              },
              {
                value: "large",
                label: t("settings.appearance.fontSizeLarge", "Large"),
                sample: "Aa",
                cls: "text-lg",
              },
            ] as const
          ).map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => updatePreferences({ fontSize: option.value })}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-3 py-3 transition",
                preferences.fontSize === option.value
                  ? "border-accent bg-accent/8 text-accent dark:border-accent-dark dark:text-accent-dark"
                  : "border-ink/12 text-ink/60 dark:border-white/12 dark:text-ivory/60",
              )}
            >
              <span className={cn("font-display font-bold", option.cls)}>
                {option.sample}
              </span>
              <span className="text-[11px] font-bold">{option.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ── Circulation rules ───────────────────────────────────────────────── */
