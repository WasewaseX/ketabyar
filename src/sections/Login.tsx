import { Delete, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { changeOwnPassword, login } from "../data/auth";
import { useAuthStore } from "../store/authStore";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import type { PublicUser } from "../types";

/**
 * The shared-PIN gate. A Persian keypad (۰–۹), auto-submit at 4+ digits,
 * and a stored session flag — deliberately simple for a single service desk.
 * Physical keyboards work regardless of focus (window-level handler) and
 * Persian/Arabic digit layouts (۶ or ٦) are normalised to ASCII.
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#111c19] p-6 text-white">
      <div className="pointer-events-none absolute -top-56 end-0 h-[500px] w-[500px] rounded-full bg-gradient-to-bl from-[#1b4332]/60 to-copper/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 end-1/4 h-[380px] w-[380px] rounded-full bg-[#104f55]/30 blur-3xl" />
      <div className="pointer-events-none absolute -top-24 start-0 h-[350px] w-[350px] rounded-full bg-copper/20 blur-3xl" />
      <div className="app-texture" />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
}

const PERSIAN_DIGITS = ["۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹", "۰"];

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII, so every layout works. */
function toAsciiDigits(value: string): string {
  return value.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export function LoginPage() {
  const { t } = useTranslation();
  const setUser = useAuthStore((state) => state.setUser);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = async (candidate: string) => {
    if (busy || candidate.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const user: PublicUser = await login(candidate);
      // The gate in App.tsx re-renders on setUser — navigation happens here.
      setUser(user);
      // Non-fatal: the dashboard needs library settings, but a failure here
      // must never mask a successful login (the store carries defaults).
      useLibrarySettingsStore
        .getState()
        .load()
        .catch((settingsError) => console.error("library settings load failed", settingsError));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
      setPin("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const pressDigit = (asciiDigit: string) => {
    if (busy) return;
    const next = (pin + asciiDigit).slice(0, 8);
    setPin(next);
    setError(null);
    if (next.length >= 4) void submit(next);
  };

  // Focus the (visually hidden) input on mount so soft keyboards appear.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Physical keyboard: handle digits, backspace and Enter even when the
  // hidden input is not focused — the usual case on first launch.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target === inputRef.current) return; // the input handles its own keys
      if (busy || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = toAsciiDigits(event.key);
      if (/^[0-9]$/.test(key)) {
        pressDigit(key);
        event.preventDefault();
      } else if (event.key === "Backspace") {
        setPin((current) => current.slice(0, -1));
        event.preventDefault();
      } else if (event.key === "Enter") {
        void submit(pin);
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Shell>
      <div className="rounded-2xl bg-[#f9f8f4]/95 p-8 text-[#17211f] shadow-2xl dark:bg-[#1b2723]/95 dark:text-[#f9f8f4]">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <img src="/brand/ketabyar-symbol.png" alt="KetabYar" className="h-16 w-16 rounded-2xl" />
          <div>
            <h1 className="font-display text-[22px] font-bold">{t("auth.signInTitle", "ورود کتابدار")}</h1>
            <p className="mt-1 text-[13px] text-ink/60 dark:text-ivory/60">{t("auth.signInSubtitle", "برای ادامه، پین کتابخانه را وارد کنید")}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="mb-4 flex h-7 items-center justify-center gap-2"
          aria-label="PIN"
        >
          {Array.from({ length: Math.max(4, pin.length) }).map((_, index) => (
            <span
              key={index}
              className={
                index < pin.length
                  ? "h-3.5 w-3.5 scale-110 rounded-full bg-[#1a4d40] dark:bg-[#1b9277]"
                  : "h-3.5 w-3.5 rounded-full border-2 border-ink/25 dark:border-white/25"
              }
            />
          ))}
        </button>

        <input
          ref={inputRef}
          className="sr-only"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => {
            const digits = toAsciiDigits(event.target.value).replace(/\D/g, "").slice(0, 8);
            setPin(digits);
            setError(null);
            if (digits.length >= 4) void submit(digits);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit(pin);
          }}
        />

        <div className="grid grid-cols-3 gap-2" dir="ltr">
          {PERSIAN_DIGITS.map((glyph, index) => {
            const ascii = index === 9 ? "0" : String(index + 1);
            return (
              <button
                key={ascii}
                type="button"
                disabled={busy}
                onClick={() => pressDigit(ascii)}
                className="h-14 rounded-xl border border-ink/8 bg-white text-lg font-semibold text-ink transition hover:bg-[#1a4d40] hover:text-white disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-ivory dark:hover:bg-[#1b9277]"
              >
                {glyph}
              </button>
            );
          })}
          <button
            type="button"
            aria-label="backspace"
            disabled={busy}
            onClick={() => setPin((current) => current.slice(0, -1))}
            className="flex h-14 items-center justify-center rounded-xl text-copper transition hover:bg-copper/10 disabled:opacity-50"
          >
            <Delete size={19} />
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[13px] font-medium text-red-700 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink/50 dark:text-ivory/50">
          <ShieldCheck size={13} />
          پین پیش‌فرض: ۶۷۶۷ — بعداً از تنظیمات عوضش کنید
        </p>
      </div>
    </Shell>
  );
}

/** Shown when the account must rotate its PIN before continuing (rare). */
export function ForcedPasswordChangePage({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const setUser = useAuthStore((state) => state.setUser);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 4) {
      setError(t("settings.account.passwordTooShort", "پین باید حداقل ۴ رقم باشد."));
      return;
    }
    if (next !== confirm) {
      setError(t("settings.account.passwordMismatch", "پین‌ها یکسان نیستند."));
      return;
    }
    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      setUser({ ...user, must_change_password: false });
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : String(changeError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="rounded-2xl bg-[#f9f8f4]/95 p-8 text-[#17211f] shadow-2xl dark:bg-[#1b2723]/95 dark:text-[#f9f8f4]">
        <h1 className="font-display text-lg font-bold">{t("auth.forcedChangeTitle", "تغییر پین")}</h1>
        <p className="mt-1 text-[13px] text-ink/60 dark:text-ivory/60">
          {t("auth.forcedChangeSubtitle", "سلام {{name}}، برای ادامه پین جدیدی انتخاب کنید.", { name: user.full_name })}
        </p>
        <div className="mt-5 grid gap-3">
          <input className="field-input" type="password" inputMode="numeric" placeholder={t("settings.account.currentPassword", "پین فعلی")} value={current} onChange={(event) => setCurrent(event.target.value)} />
          <input className="field-input" type="password" inputMode="numeric" placeholder={t("settings.account.newPassword", "پین جدید")} value={next} onChange={(event) => setNext(event.target.value)} />
          <input className="field-input" type="password" inputMode="numeric" placeholder={t("settings.account.confirmPassword", "تکرار پین جدید")} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </div>
        {error ? <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</div> : null}
        <button
          onClick={() => void submit()}
          disabled={busy}
          className="mt-5 w-full rounded-xl bg-[#1a4d40] py-2.5 text-sm font-semibold text-white hover:bg-[#153d33] disabled:opacity-60"
        >
          {busy ? t("settings.account.saving", "…") : t("settings.account.savePassword", "ذخیره پین")}
        </button>
      </div>
    </Shell>
  );
}
