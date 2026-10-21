import { Moon, ShieldCheck, Sun, Laptop } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { getLibrarySettings, saveLibrarySettings } from "../data/repositories/library";
import { useUiStore } from "../store/uiStore";
import { applyAccent } from "../config/accent";
import { cn } from "../utils/cn";

/**
 * First-run setup: one screen — name the library, confirm the language and
 * theme — then straight to the dashboard. The library starts empty on
 * purpose: real books and members are entered by the librarian.
 */

const DEFAULT_LIBRARY_NAME = "کتابخانه مرکزی دانشگاه";

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updatePreferences = useUiStore((state) => state.updatePreferences);

  const [libraryName, setLibraryName] = useState(DEFAULT_LIBRARY_NAME);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [busy, setBusy] = useState(false);

  const complete = async () => {
    const name = libraryName.trim() || DEFAULT_LIBRARY_NAME;
    setBusy(true);
    try {
      const existing = await getLibrarySettings();
      if (!existing.library_name) await saveLibrarySettings({ library_name: name });
      updatePreferences({ onboardingComplete: true, theme });
      applyAccent(useUiStore.getState().preferences.accentColor);
      document.documentElement.lang = "fa";
      document.documentElement.dir = "rtl";
      void i18n.changeLanguage("fa");
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="relative flex min-h-screen items-center justify-center bg-ivory p-6 text-ink dark:bg-[#101a17] dark:text-ivory">
      <div className="app-texture" />
      <div className="relative z-10 w-full max-w-2xl">
        <div className="mb-5 flex items-center gap-3">
          <img src="/brand/ketabyar-symbol.png" alt="KetabYar" className="h-11 w-11 rounded-xl" />
          <div>
            <p className="font-display text-lg font-bold tracking-wide">KETABYAR</p>
            <p className="text-xs text-ink/55 dark:text-ivory/55">University Library Management</p>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-7 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
          <h1 className="font-display text-xl font-bold">{t("onboarding.welcome", "به کتابیار خوش آمدید")}</h1>
          <p className="mt-1 text-sm text-ink/55 dark:text-ivory/55">{t("onboarding.subtitle", "با چند تنظیم ساده، کتابخانه‌تان را آماده کنید.")}</p>

          <label className="mt-6 block">
            <span className="mb-1.5 block font-semibold">
              {t("onboarding.libraryName", "نام کتابخانه")} <span className="text-copper">*</span>
            </span>
            <input
              className="field-input"
              value={libraryName}
              onChange={(event) => setLibraryName(event.target.value)}
              placeholder={t("onboarding.placeholderLib", "مثلاً کتابخانهٔ مرکزی دانشگاه تهران")}
            />
          </label>

          <div className="mt-5">
            <span className="mb-1.5 block font-semibold">{t("onboarding.language", "زبان برنامه")}</span>
            <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-ink/10 px-4 py-2.5 dark:border-white/10">
              <span className="font-medium">فارسی (FA)</span>
              <span className="text-xs text-ink/45 dark:text-ivory/45">{t("onboarding.faOnlyNote", "نسخهٔ فعلی فارسی است؛ زبان‌های دیگر به‌زودی.")}</span>
            </div>
          </div>

          <div className="mt-5">
            <span className="mb-1.5 block font-semibold">{t("onboarding.theme", "پوسته")}</span>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "light", icon: Sun, label: "Light" },
                { value: "dark", icon: Moon, label: "Dark" },
                { value: "system", icon: Laptop, label: "System" },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-[var(--radius-control)] border px-3 py-3 text-sm font-semibold transition",
                    theme === option.value
                      ? "border-copper bg-copper/8 text-copper"
                      : "border-ink/12 text-ink/60 hover:border-ink/30 dark:border-white/12 dark:text-ivory/60 dark:hover:border-white/30",
                  )}
                >
                  <option.icon size={18} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => void complete()}
            disabled={busy || !libraryName.trim()}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-accent-dark"
          >
            {t("onboarding.start", "شروع کنیم")}
            <span aria-hidden>←</span>
          </button>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink/50 dark:text-ivory/50">
            <ShieldCheck size={13} />
            {t("onboarding.security", "همهٔ داده‌ها فقط روی همین رایانه ذخیره می‌شود.")}
          </p>
        </div>
      </div>
    </div>
  );
}
