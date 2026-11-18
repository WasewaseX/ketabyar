import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import type {} from "../types";
import { PinPad } from "./login/PinPad";
import { usePinPad } from "./login/usePinPad";

/**
 * The shared-PIN gate. A Persian keypad (۰–۹), debounced auto-submit at 4+
 * digits, and a stored session flag — deliberately simple for a single desk.
 * Physical keyboards work regardless of focus (window-level handler) and
 * Persian/Arabic digit layouts (۶ or ٦) are normalised to ASCII.
 *
 * v1.2.4 hardening, all covered by the regression suite:
 * - auto-submit now waits for a short idle window, because submitting at
 *   exactly 4 digits sent PARTIAL PINs for anyone with a 5–8-digit PIN,
 *   flashed a wrong-PIN error and wiped the field mid-typing;
 * - all handlers read a pinRef mirror instead of render state, so stale
 *   closures can no longer resurrect cleared digits into the next attempt;
 * - a submit-lock ref (not busy state, which lags a render) prevents the
 *   same-tick double submit from Enter + auto-submit.
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#111c19] p-6 text-white"
    >
      <div className="pointer-events-none absolute -top-56 end-0 h-[500px] w-[500px] rounded-full bg-gradient-to-bl from-[#1b4332]/60 to-copper/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 end-1/4 h-[380px] w-[380px] rounded-full bg-[#104f55]/30 blur-3xl" />
      <div className="pointer-events-none absolute -top-24 start-0 h-[350px] w-[350px] rounded-full bg-copper/20 blur-3xl" />
      <div className="app-texture" />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
}

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII, so every layout works. */
export function LoginPage() {
  const { t } = useTranslation();
  const setUser = useAuthStore((state) => state.setUser);
  const api = usePinPad(setUser);
  const { error } = api;

  return (
    <Shell>
      <div className="rounded-2xl bg-[#f9f8f4]/95 p-8 text-[#17211f] shadow-2xl dark:bg-[#1b2723]/95 dark:text-[#f9f8f4]">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <img
            src="/brand/ketabyar-symbol.png"
            alt="KetabYar"
            className="h-16 w-16 rounded-2xl"
          />
          <div>
            <h1 className="font-display text-[22px] font-bold">
              {t("auth.signInTitle", "ورود کتابدار")}
            </h1>
            <p className="mt-1 text-[13px] text-ink/60 dark:text-ivory/60">
              {t(
                "auth.signInSubtitle",
                "برای ادامه، پین کتابخانه را وارد کنید",
              )}
            </p>
          </div>
        </div>

        <PinPad api={api} />

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
