import { ErrorBoundary } from "react-error-boundary";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, RotateCcw, ShieldAlert } from "lucide-react";
import { Providers } from "./providers";
import { AppShell } from "../components/layout/AppShell";
import { CommandPalette } from "../components/layout/CommandPalette";
import { LoginPage } from "../sections/Login";
import { OnboardingPage } from "../sections/Onboarding";
import { DashboardPage } from "../sections/Dashboard";
import { CatalogPage } from "../sections/Catalog";
import { MembersPage } from "../sections/Members";
import { ReservationsPage } from "../sections/Reservations";
import { LoansPage } from "../sections/Loans";
import { InventoryPage } from "../sections/Inventory";
import { ReportsPage } from "../sections/Reports";
import { ActivityPage } from "../sections/Activity";
import { NotificationsPage } from "../sections/Notifications";
import { SettingsPage } from "../sections/Settings";
import { LegalPage } from "../sections/Legal";
import { initializeDatabase } from "../data/database";
import { bootstrapAdminIfNeeded, currentSession } from "../data/auth";
import { useAuthStore } from "../store/authStore";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { PREFERENCES_KEY, useUiStore } from "../store/uiStore";

/**
 * Boot pipeline → splash → login gate → routed application.
 * Any unrecoverable boot error lands on the Failure screen with a retry.
 */

const BOOT_STEPS = ["boot.database", "boot.preferences", "boot.optimizing", "boot.loading"] as const;

function Splash({ progress, step }: { progress: number; step: number }) {
  const { t } = useTranslation();
  return (
    <div dir="rtl" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0d1614] text-white">
      <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(600px circle at 70% 20%, rgba(26,77,64,0.35), transparent 60%)" }} />
      <div className="app-texture" />
      <div className="relative z-10 w-[380px] rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
        <img src="/brand/ketabyar-symbol.png" alt="KetabYar" className="mx-auto h-16 w-16 rounded-2xl" />
        <h1 className="mt-4 font-display text-2xl font-bold">کتابیار</h1>
        <p className="text-xs text-white/55">مدیریت کتابخانه</p>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-l from-[#1b9277] to-copper transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-xs text-white/60">{t(BOOT_STEPS[Math.min(step, BOOT_STEPS.length - 1)], "…")}</p>
      </div>
    </div>
  );
}

function Failure({ error, reset }: { error?: unknown; reset?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#111d1a] p-6 text-white">
      <div className="w-full max-w-lg rounded-2xl bg-[#f9f8f4] p-7 text-[#17211f] shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700"><ShieldAlert size={22} /></span>
          <div>
            <h1 className="font-display text-lg font-bold">کتابیار راه‌اندازی نشد</h1>
            <p className="text-sm text-[#17211f]/70">پایگاه‌دادهٔ محلی باز نشد. دسترسی دیسک را بررسی کنید و دوباره تلاش کنید.</p>
          </div>
        </div>
        {error ? <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-[#17211f]/5 p-3 text-xs whitespace-pre-wrap">{String(error)}</pre> : null}
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => (reset ? reset() : window.location.reload())}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1a4d40] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#153d33]"
          >
            <RotateCcw size={15} /> تلاش دوباره
          </button>
          {error ? (
            <button
              onClick={() => {
                void navigator.clipboard.writeText(String(error));
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#17211f]/15 px-4 py-2.5 text-sm font-semibold hover:bg-[#17211f]/5"
            >
              <Copy size={15} /> {copied ? "کپی شد" : "کپی خطا"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TrayListener() {
  const navigate = useNavigate();
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);

  useEffect(() => {
    let cleanups: (() => void)[] = [];
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const un1 = await listen<string>("ketabyar://navigate", (event) => navigate(event.payload));
        const un2 = await listen("ketabyar://quick-search", () => setPaletteOpen(true));
        if (cancelled) {
          un1();
          un2();
        } else {
          cleanups = [un1, un2];
        }
      } catch {
        /* browser */
      }
    })();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [navigate, setPaletteOpen]);

  return null;
}

function Home() {
  const onboardingComplete = useUiStore((state) => state.preferences.onboardingComplete);
  return <Navigate to={onboardingComplete ? "/dashboard" : "/onboarding"} replace />;
}

function Boot() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [progress, setProgress] = useState(12);
  const [step, setStep] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    (async () => {
      try {
        setStep(0); setProgress(18);
        await wait(420);
        await initializeDatabase();
        await bootstrapAdminIfNeeded();
        const session = await currentSession();
        useAuthStore.getState().setUser(session);
        setProgress(45);

        setStep(1); setProgress(62);
        await wait(480);
        if (session) await useLibrarySettingsStore.getState().load();
        setProgress(82);

        setStep(2); setProgress(92);
        await wait(380);
        try {
          const raw = localStorage.getItem(PREFERENCES_KEY);
          const prefs = raw ? (JSON.parse(raw) as { closeToTray?: boolean }) : {};
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("set_close_to_tray", { enabled: prefs.closeToTray ?? true });
        } catch (warning) {
          console.warn("close-to-tray bootstrap skipped", warning);
        }
        setProgress(100);

        setStep(3);
        await wait(330);
        setReady(true);
      } catch (bootError) {
        setError(bootError);
      }
    })();
  }, []);

  if (error) return <Failure error={error} />;
  if (!ready) return <Splash progress={progress} step={step} />;

  const user = useAuthStore.getState().user;
  if (!user) return <LoginPage />;
  return (
    <HashRouter>
      <TrayListener />
      <CommandPalette />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/loans" element={<LoansPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/legal/:doc" element={<LegalPage />} />
        </Route>
        <Route path="*" element={<Home />} />
      </Routes>
    </HashRouter>
  );
}

export function App() {
  return (
    <ErrorBoundary FallbackComponent={({ error, resetErrorBoundary }) => <Failure error={error} reset={resetErrorBoundary} />}>
      <Providers>
        <Boot />
      </Providers>
    </ErrorBoundary>
  );
}
