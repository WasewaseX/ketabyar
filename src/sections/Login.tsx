import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Delete } from "lucide-react";
import { login as loginRequest, changeOwnPassword } from "../data/auth";
import { useAuthStore } from "../store/authStore";

/**
 * KetabYar sign-in — a simple shared-PIN gate (easy for any librarian).
 * The default first-run PIN is ۶۷۶۷; change it later in Settings → حساب شما.
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111c19] dark:bg-[#0b1311] px-4 py-12 relative overflow-hidden select-none" dir="rtl">
      <div className="bg-paper-texture-overlay opacity-20" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-[#1b4332]/35 via-[#b96f3e]/20 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-[#104f55]/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-[#b96f3e]/25 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const setUser = useAuthStore((s) => s.setUser);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (value: string) => {
    if (busy || value.length < 4) return;
    setBusy(true);
    setError("");
    try {
      const user = await loginRequest(value);
      setUser(user);
      await useAuthStore.getState().user; // settle
      // Settings load happens in the Boot flow after user is set.
      const { useLibrarySettingsStore } = await import("../store/librarySettingsStore");
      await useLibrarySettingsStore.getState().load();
    } catch (e) {
      setError(String((e as Error).message || e));
      setPin("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onDigit = (d: string) => {
    const next = (pin + d).slice(0, 8);
    setPin(next);
    setError("");
    if (next.length >= 4) void submit(next);
  };

  const keys = ["۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹", "۰"];
  const keyValues = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  return (
    <Shell>
      <div className="bg-[#f9f8f4]/95 dark:bg-[#1d2926]/95 backdrop-blur rounded-2xl border border-black/5 dark:border-white/10 shadow-2xl p-8 flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-[#1a4d40] flex items-center justify-center mb-4 shadow-inner">
          <img src="/brand/warraq-symbol-cream.png" className="h-10 w-10 object-contain" alt="KetabYar" />
        </div>
        <h1 className="text-[22px] font-bold text-[#122222] dark:text-white">{t("auth.signInTitle")}</h1>
        <p className="text-[13px] text-[#122222]/60 dark:text-white/60 mt-1 text-center">{t("auth.signInSubtitle")}</p>

        {/* PIN dots */}
        <div className="flex gap-3 my-6" onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                i < pin.length ? "bg-[#1a4d40] border-[#1a4d40] scale-110" : "border-[#122222]/25 dark:border-white/25"
              }`}
            />
          ))}
        </div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 8);
            setPin(v);
            if (v.length >= 4) void submit(v);
          }}
          onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4) void submit(pin); }}
          className="sr-only"
          aria-label="PIN"
        />

        {/* Numeric keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full mt-2" dir="ltr">
          {keys.map((label, i) => (
            <button
              key={keyValues[i]}
              onClick={() => onDigit(keyValues[i])}
              disabled={busy}
              className="h-14 rounded-xl bg-[#122222]/[0.04] dark:bg-white/[0.06] hover:bg-[#1a4d40] hover:text-white text-[#122222] dark:text-white text-xl font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => { setPin(pin.slice(0, -1)); setError(""); }}
            disabled={busy}
            className="h-14 rounded-xl bg-[#b96f3e]/10 hover:bg-[#b96f3e]/20 text-[#b96f3e] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            aria-label="backspace"
          >
            <Delete size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-4 w-full rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-[13px] text-red-600 dark:text-red-400 text-center">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center gap-2 text-[11px] text-[#122222]/45 dark:text-white/45">
          <ShieldCheck size={13} />
          <span>پین پیش‌فرض: ۶۷۶۷ — بعداً از تنظیمات عوضش کنید</span>
        </div>
      </div>
    </Shell>
  );
}

/** Mandatory gate when the operator should rotate the PIN. */
export function ForcedPasswordChangePage() {
  const { t } = useTranslation();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (next.length < 4) { setError(t("settings.account.passwordTooShort")); return; }
    if (next !== confirm) { setError(t("settings.account.passwordMismatch")); return; }
    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      if (user) setUser({ ...user, must_change_password: false });
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="bg-[#f9f8f4]/95 dark:bg-[#1d2926]/95 backdrop-blur rounded-2xl border border-black/5 dark:border-white/10 shadow-2xl p-8">
        <h1 className="text-[22px] font-bold text-[#122222] dark:text-white text-center">{t("auth.forcedChangeTitle")}</h1>
        <p className="text-[13px] text-[#122222]/60 dark:text-white/60 mt-1 mb-6 text-center">
          {t("auth.forcedChangeSubtitle", { name: user?.full_name ?? "" })}
        </p>
        <div className="space-y-3">
          <input type="password" inputMode="numeric" placeholder={t("settings.account.currentPassword")} value={current} onChange={(e) => setCurrent(e.target.value)} className="w-full h-12 rounded-xl bg-[#122222]/[0.04] dark:bg-white/[0.06] px-4 text-[15px] text-[#122222] dark:text-white outline-none focus:ring-2 focus:ring-[#1a4d40]/40" />
          <input type="password" inputMode="numeric" placeholder={t("settings.account.newPassword")} value={next} onChange={(e) => setNext(e.target.value)} className="w-full h-12 rounded-xl bg-[#122222]/[0.04] dark:bg-white/[0.06] px-4 text-[15px] text-[#122222] dark:text-white outline-none focus:ring-2 focus:ring-[#1a4d40]/40" />
          <input type="password" inputMode="numeric" placeholder={t("settings.account.confirmPassword")} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full h-12 rounded-xl bg-[#122222]/[0.04] dark:bg-white/[0.06] px-4 text-[15px] text-[#122222] dark:text-white outline-none focus:ring-2 focus:ring-[#1a4d40]/40" />
          {error && <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-[13px] text-red-600 text-center">{error}</div>}
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="w-full h-12 rounded-xl bg-[#1a4d40] hover:bg-[#1a4d40]/90 text-white font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? t("settings.account.saving") : t("settings.account.savePassword")}
          </button>
        </div>
      </div>
    </Shell>
  );
}
