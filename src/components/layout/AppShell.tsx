import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "../../hooks/useLibraryQuery";
import {
  Bell, BookMarked, BookOpen, CalendarClock, ChevronLeft, ChevronRight, ClipboardList,
  Cog, LayoutDashboard, LogOut, Menu, Minus, Moon, Search, Settings, Square,
  Sparkles, Sun, Users, Warehouse, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { dashboard, notifications as fetchNotifications, reservations, markNotificationRead } from "../../data/repositories/library";
import { useAuthStore } from "../../store/authStore";
import { logout } from "../../data/auth";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import { useNotificationsStore } from "../../store/notificationsStore";
import { PREFERENCES_KEY, useUiStore } from "../../store/uiStore";
import { applyAccent } from "../../config/accent";
import { formatDisplayDate } from "../../utils/dates";
import { cn } from "../../utils/cn";
import { useContextMenu } from "../ui/ContextMenu";
import i18n from "../../i18n";

/**
 * The application shell: custom OS titlebar, resizable sidebar, global
 * search, notification bell, and the theme / accent / density engine.
 */

const SIDEBAR_WIDTH_KEY = "ketabyar-sidebar-width";

const NAV_ITEMS: { route: string; icon: LucideIcon; key: string }[] = [
  { route: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard" },
  { route: "/catalog", icon: BookOpen, key: "nav.catalog" },
  { route: "/members", icon: Users, key: "nav.members" },
  { route: "/reservations", icon: CalendarClock, key: "nav.reservations" },
  { route: "/loans", icon: BookMarked, key: "nav.loans" },
  { route: "/inventory", icon: Warehouse, key: "nav.inventory" },
  { route: "/reports", icon: ClipboardList, key: "nav.reports" },
  { route: "/activity", icon: ClipboardList, key: "nav.activity" },
  { route: "/notifications", icon: Bell, key: "nav.notifications" },
  { route: "/settings", icon: Cog, key: "nav.settings" },
];

/** Original KetabYar sidebar ornament: a row of book spines drawn in code. */
function SpineOrnament() {
  const spines = [64, 40, 52, 34, 58, 44, 50, 38, 62, 46, 36, 54];
  const tones = ["#c06b3e", "#1b9277", "#8a6d3b", "#4d7fb3", "#b23244", "#1a4d40"];
  return (
    <svg viewBox="0 0 220 72" className="h-16 w-full opacity-25" aria-hidden preserveAspectRatio="xMidYMax meet">
      {spines.map((height, index) => (
        <rect
          key={index}
          x={index * 18 + 4}
          y={72 - height}
          width={11}
          height={height}
          rx={2.5}
          fill={tones[index % tones.length]}
        />
      ))}
    </svg>
  );
}

function initialsOf(name: string | undefined): string {
  return (name ?? "").trim().slice(0, 2).toUpperCase() || "ک";
}

export function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();

  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const preferences = useUiStore((state) => state.preferences);
  const updatePreferences = useUiStore((state) => state.updatePreferences);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const settings = useLibrarySettingsStore((state) => state.settings);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored >= 200 && stored <= 480 ? stored : 260;
  });
  const resizing = useRef(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileTimer = useRef<number | null>(null);

  /* ── Theme / accent / density engine ─────────────────────────────── */

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = preferences.theme === "dark" || (preferences.theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences.theme]);

  useEffect(() => { applyAccent(preferences.accentColor); }, [preferences.accentColor]);

  useEffect(() => {
    const px = preferences.fontSize === "small" ? "13px" : preferences.fontSize === "large" ? "17px" : "15px";
    document.documentElement.style.setProperty("--font-size-base", px);
  }, [preferences.fontSize]);

  useEffect(() => {
    document.documentElement.lang = preferences.locale;
    document.documentElement.dir = "rtl";
    if (i18n.language !== preferences.locale) void i18n.changeLanguage(preferences.locale);
  }, [preferences.locale]);

  /* ── Close-to-tray wiring ────────────────────────────────────────── */

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const current = getCurrentWindow();
        const handler = async (event: { preventDefault: () => void }) => {
          if (useUiStore.getState().preferences.closeToTray) {
            event.preventDefault();
            await current.hide();
          }
        };
        const promise = current.onCloseRequested(handler as Parameters<typeof current.onCloseRequested>[0]);
        unlisten = await promise;
        if (cancelled) unlisten();
      } catch {
        /* running in a plain browser */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  /* ── Preference autosave heartbeat ───────────────────────────────── */

  useEffect(() => {
    if (!preferences.autosaveEnabled) return;
    const interval = window.setInterval(() => {
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(useUiStore.getState().preferences));
      } catch {
        /* storage unavailable */
      }
    }, Math.max(10, preferences.autosaveInterval) * 1000);
    return () => window.clearInterval(interval);
  }, [preferences.autosaveEnabled, preferences.autosaveInterval]);

  /* ── Keyboard shortcuts ──────────────────────────────────────────── */

  const toggleFullscreen = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const current = getCurrentWindow();
      await current.setFullscreen(!(await current.isFullscreen()));
    } catch {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        toggleSidebar();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        navigate("/settings");
      } else if (event.key === "F11") {
        event.preventDefault();
        void toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, setPaletteOpen, toggleFullscreen, toggleSidebar]);

  /* ── Sidebar resize (RTL: drag distance measured from the right) ─── */

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!resizing.current) return;
      const width = window.innerWidth - event.clientX;
      setSidebarWidth(Math.max(200, Math.min(480, width)));
    };
    const onUp = () => {
      if (resizing.current) localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
      resizing.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarWidth]);

  /* ── Notification bell data ──────────────────────────────────────── */

  const dashQuery = useQuery({ queryKey: ["dashboard-shell"], queryFn: dashboard });
  const resQuery = useQuery({
    queryKey: ["reservations-shell"],
    queryFn: reservations,
    enabled: !!settings.notify_ready,
  });
  const historyQuery = useQuery({ queryKey: ["notifications"], queryFn: () => fetchNotifications(50) });

  const { seen, markSeen, sync } = useNotificationsStore();

  const syntheticAlerts = useMemo(() => {
    const alerts: { id: string; title: string; date: string; route: string; kind: "overdue" | "duesoon" | "ready" }[] = [];
    if (settings.notify_overdue) {
      for (const loan of dashQuery.data?.overdueLoans ?? []) {
        alerts.push({ id: `overdue-${loan.id}`, title: loan.title ?? "", date: loan.due_at, route: "/members", kind: "overdue" });
      }
    }
    if (settings.notify_due_soon) {
      for (const loan of dashQuery.data?.dueSoonLoans ?? []) {
        alerts.push({ id: `duesoon-${loan.id}`, title: loan.title ?? "", date: loan.due_at, route: "/members", kind: "duesoon" });
      }
    }
    if (settings.notify_ready) {
      for (const reservation of (resQuery.data ?? []).filter((item) => item.status === "ready")) {
        alerts.push({ id: `ready-${reservation.id}`, title: reservation.title ?? "", date: reservation.reserved_at || reservation.requested_at, route: "/reservations", kind: "ready" });
      }
    }
    return alerts;
  }, [dashQuery.data, resQuery.data, settings.notify_due_soon, settings.notify_overdue, settings.notify_ready]);

  const syntheticIds = syntheticAlerts.map((alert) => alert.id).join("|");
  useEffect(() => {
    sync(syntheticAlerts.map((alert) => alert.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syntheticIds]);

  const unreadDb = (historyQuery.data ?? []).filter((item) => !item.is_read).length;
  const unseenSynthetic = syntheticAlerts.filter((alert) => !seen.includes(alert.id)).length;
  const badgeCount = unreadDb + unseenSynthetic;

  const previewRows = useMemo(() => {
    const rows = [
      ...syntheticAlerts.map((alert) => ({ ...alert, isDb: false as const })),
      ...(historyQuery.data ?? []).map((item) => ({
        id: item.id, kind: "db" as const, title: item.title, date: item.created_at, route: item.link || "/notifications", isDb: true as const,
      })),
    ];
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3);
  }, [syntheticAlerts, historyQuery.data]);

  /* ── Window controls ─────────────────────────────────────────────── */

  const windowAction = async (action: "minimize" | "toggleMaximize" | "close") => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const current = getCurrentWindow();
      if (action === "minimize") await current.minimize();
      else if (action === "toggleMaximize") await current.toggleMaximize();
      else await current.close();
    } catch {
      /* browser fallback: nothing sensible to do */
    }
  };

  /* ── Global context menu ─────────────────────────────────────────── */

  const onContextMenu = (event: React.MouseEvent) => {
    showContextMenu(event, [
      { id: "refresh", label: t("contextMenu.refresh", "Refresh"), shortcut: "Ctrl+R", icon: Search, variant: "accent", onClick: () => { void queryClient.invalidateQueries(); toast.success(t("contextMenu.refreshed", "Refreshed")); } },
      { id: "d1", divider: true },
      { id: "back", label: t("contextMenu.goBack", "Go back"), shortcut: "Alt+←", onClick: () => navigate(-1) },
      { id: "forward", label: t("contextMenu.goForward", "Go forward"), shortcut: "Alt+→", onClick: () => navigate(1) },
      { id: "dash", label: t("contextMenu.dashboard", "Dashboard"), icon: LayoutDashboard, onClick: () => navigate("/dashboard") },
      { id: "d2", divider: true },
      {
        id: "theme",
        label: document.documentElement.classList.contains("dark") ? t("contextMenu.lightTheme", "Light theme") : t("contextMenu.darkTheme", "Dark theme"),
        icon: document.documentElement.classList.contains("dark") ? Sun : Moon,
        onClick: () => updatePreferences({ theme: document.documentElement.classList.contains("dark") ? "light" : "dark" }),
      },
      { id: "palette", label: t("contextMenu.commandPalette", "Command palette"), shortcut: "Ctrl+K", icon: Sparkles, onClick: () => setPaletteOpen(true) },
      { id: "fullscreen", label: t("contextMenu.fullscreen", "Fullscreen"), shortcut: "F11", onClick: () => void toggleFullscreen() },
    ], { title: t("contextMenu.appTitle", "KetabYar") });
  };

  const signOut = async () => {
    await logout();
    setUser(null);
  };

  const expanded = sidebarOpen;

  return (
    <div className="app-workspace flex h-screen flex-col bg-ivory text-ink dark:bg-[#101a17] dark:text-ivory">
      {/* Custom OS titlebar */}
      <div className="relative z-50 flex h-8 shrink-0 items-center bg-[#17211f] text-white/85">
        <span data-tauri-drag-region className="absolute inset-0" />
        <div className="ms-auto flex h-full items-center ltr:me-0 rtl:ml-0" dir="ltr">
          <button onClick={() => void windowAction("minimize")} aria-label="Minimize" className="flex h-full w-11 items-center justify-center hover:bg-white/10"><Minus size={14} /></button>
          <button onClick={() => void windowAction("toggleMaximize")} aria-label="Maximize" className="flex h-full w-11 items-center justify-center hover:bg-white/10"><Square size={11} /></button>
          <button onClick={() => void windowAction("close")} aria-label="Close" className="flex h-full w-11 items-center justify-center hover:bg-red-600"><X size={15} /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1" onContextMenu={onContextMenu}>
        {/* Sidebar */}
        <aside
          className="relative z-20 flex shrink-0 flex-col bg-[#132622] text-white transition-[width] duration-200"
          style={{ width: expanded ? sidebarWidth : 80 }}
        >
          <div className="flex items-center gap-3 px-4 py-5">
            <img src="/brand/ketabyar-symbol.png" alt="KetabYar" className="h-10 w-10 shrink-0 rounded-xl" />
            {expanded ? (
              <div className="min-w-0">
                <p className="font-display text-lg font-bold leading-tight">کتابیار</p>
                <p className="truncate text-[11px] text-white/55">{settings.library_short_name || settings.library_name || "KetabYar"}</p>
              </div>
            ) : null}
            <button onClick={toggleSidebar} className="ms-auto rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Toggle sidebar">
              <Menu size={16} />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.route}
                to={item.route}
                title={expanded ? undefined : t(item.key, item.key.split(".")[1] ?? "")}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-gradient-to-l from-copper to-[#a05b2e] text-white shadow-md"
                      : "text-white/60 hover:bg-white/5 hover:text-white",
                    !expanded && "justify-center px-0",
                  )
                }
              >
                <item.icon size={18} className="shrink-0" />
                {expanded ? <span className="truncate">{t(item.key, "")}</span> : null}
              </NavLink>
            ))}
          </nav>

          <div className="pointer-events-none absolute bottom-0 start-0 end-0 px-3 pb-1">
            <SpineOrnament />
          </div>

          {/* Profile footer */}
          <div className="relative border-t border-white/10 p-3">
            <button
              className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-start transition hover:bg-white/8", !expanded && "justify-center")}
              onMouseEnter={() => {
                if (profileTimer.current) window.clearTimeout(profileTimer.current);
                setProfileOpen(true);
              }}
              onMouseLeave={() => {
                profileTimer.current = window.setTimeout(() => setProfileOpen(false), 220);
              }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-copper text-xs font-bold">
                {initialsOf(user?.full_name)}
              </span>
              {expanded ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{user?.full_name ?? t("nav.role", "Librarian")}</span>
                  <span className="block text-[11px] text-white/50">{t("nav.role", "Librarian")}</span>
                </span>
              ) : null}
            </button>

            {profileOpen ? (
              <div
                className="absolute bottom-full z-40 mb-2 w-64 rounded-2xl border border-ink/10 bg-white p-3 text-ink shadow-2xl dark:border-white/10 dark:bg-[#1b2723] dark:text-ivory"
                style={{ insetInlineEnd: expanded ? "0.75rem" : "0.5rem" }}
                onMouseEnter={() => profileTimer.current && window.clearTimeout(profileTimer.current)}
                onMouseLeave={() => setProfileOpen(false)}
              >
                <p className="text-sm font-bold">{user?.full_name}</p>
                <p className="text-xs text-ink/50 dark:text-ivory/50">{t("nav.role", "Librarian")} · {settings.library_short_name || "KetabYar"}</p>
                <p className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-wider text-copper">{t("profileCard.quickActions", "Quick actions")}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <ProfileAction icon={LogOut} label={t("profileCard.signOut", "Sign out")} onClick={() => void signOut()} />
                  <ProfileAction icon={Settings} label={t("profileCard.settings", "Settings")} onClick={() => { setProfileOpen(false); navigate("/settings"); }} />
                  <ProfileAction
                    icon={document.documentElement.classList.contains("dark") ? Sun : Moon}
                    label={t("profileCard.themeLight", "Theme")}
                    onClick={() => updatePreferences({ theme: document.documentElement.classList.contains("dark") ? "light" : "dark" })}
                  />
                  <ProfileAction icon={Sparkles} label={t("profileCard.commandPalette", "Palette")} onClick={() => { setProfileOpen(false); setPaletteOpen(true); }} shortcut="⌘K" />
                </div>
              </div>
            ) : null}
          </div>

          {/* Resize handle (only while expanded) */}
          {expanded ? (
            <div
              role="separator"
              aria-orientation="vertical"
              className="absolute inset-y-0 start-0 z-30 w-1.5 cursor-col-resize bg-copper/0 transition hover:bg-copper/60"
              onMouseDown={() => (resizing.current = true)}
            />
          ) : null}
        </aside>

        {/* Main column */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="app-texture" />
          <header className="z-10 flex h-[68px] shrink-0 items-center gap-3 border-b border-ink/8 bg-white/90 px-6 backdrop-blur dark:border-white/8 dark:bg-[#15211d]/90">
            <div className="relative max-w-md flex-1">
              <Search size={15} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink/40 dark:text-ivory/40" />
              <input
                id="global-search"
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && search.trim()) {
                    navigate(`/catalog?q=${encodeURIComponent(search.trim())}`);
                    setSearch("");
                  }
                }}
                placeholder={t("nav.quickSearch", "Quick search…")}
                className="field-input ps-9 pe-14"
              />
              <button
                onClick={() => setPaletteOpen(true)}
                className="absolute inset-y-0 end-2 my-auto h-6 rounded-md border border-ink/10 px-1.5 font-mono text-[10px] text-ink/50 dark:border-white/15 dark:text-ivory/50"
              >
                ⌘K
              </button>
            </div>

            {/* Bell */}
            <div className="relative">
              <button
                onClick={() => setBellOpen((v) => !v)}
                aria-label={t("nav.notifications", "Notifications")}
                className="relative rounded-full p-2.5 text-ink/60 transition hover:bg-ink/5 hover:text-ink dark:text-ivory/60 dark:hover:bg-white/10 dark:hover:text-ivory"
              >
                <Bell size={17} />
                {badgeCount > 0 ? (
                  <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-copper px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#15211d]">
                    {badgeCount}
                  </span>
                ) : null}
              </button>

              {bellOpen ? (
                <>
                  <div className="fixed inset-0 z-30" onMouseDown={() => setBellOpen(false)} />
                  <div className="absolute end-0 top-full z-40 mt-2 w-80 rounded-2xl border border-ink/10 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-[#1b2723]">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <p className="text-sm font-bold">{t("nav.notifications", "Notifications")}</p>
                      {badgeCount > 0 ? <span className="rounded-full bg-red-600/10 px-2 py-0.5 text-[10px] font-bold text-red-600">{t("nav.overdueCount", "{{count}} new", { count: badgeCount })}</span> : null}
                    </div>
                    {previewRows.length === 0 ? (
                      <p className="px-1 py-4 text-center text-sm text-ink/50 dark:text-ivory/50">{t("nav.allClear", "You're all caught up")}</p>
                    ) : (
                      <ul className="space-y-1">
                        {previewRows.map((row) => (
                          <li key={row.id}>
                            <button
                              className="w-full rounded-xl px-2.5 py-2 text-start transition hover:bg-ink/5 dark:hover:bg-white/5"
                              onClick={() => {
                                setBellOpen(false);
                                if (row.isDb) {
                                  markNotificationRead(row.id).catch(console.error);
                                  void queryClient.invalidateQueries({ queryKey: ["notifications"] });
                                } else {
                                  markSeen([row.id]);
                                }
                                navigate(row.route);
                              }}
                            >
                              <p className="truncate text-[13px] font-semibold">{row.title || t("circulation.selectedMember", "Member")}</p>
                              <p className="text-[11px] text-ink/50 dark:text-ivory/50">
                                {row.isDb
                                  ? row.title
                                  : `${t("circulation.due", "Due")}: ${formatDisplayDate(row.date)}`}
                                {" · "}
                                {formatDisplayDate(row.date)}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      className="mt-2 w-full rounded-xl border border-ink/10 py-2 text-xs font-semibold text-ink/70 transition hover:bg-ink/5 dark:border-white/10 dark:text-ivory/70 dark:hover:bg-white/5"
                      onClick={() => { setBellOpen(false); navigate("/notifications"); }}
                    >
                      {t("notificationsPage.viewAll", "View all notifications")}
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <div className="h-6 w-px bg-ink/10 dark:bg-white/10" />

            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent dark:text-accent-dark">
                {initialsOf(user?.full_name)}
              </span>
              <span className="hidden max-w-40 truncate text-sm font-semibold sm:block">{user?.full_name ?? "کتابدار"}</span>
            </div>
          </header>

          <main className="relative z-[1] flex-1 overflow-y-auto p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function ProfileAction({ icon: Icon, label, onClick, shortcut }: { icon: LucideIcon; label: string; onClick: () => void; shortcut?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border border-ink/8 px-2 py-2.5 text-[11px] font-semibold text-ink/70 transition hover:border-accent/40 hover:text-accent dark:border-white/10 dark:text-ivory/70 dark:hover:text-accent-dark"
    >
      <Icon size={15} />
      {label}
      {shortcut ? <span className="font-mono text-[9px] opacity-50">{shortcut}</span> : null}
    </button>
  );
}

/** Chevron helper for RTL-aware pagination arrows. */
export function ChevronFlip({ back }: { back?: boolean }) {
  return document.documentElement.dir === "rtl"
    ? (back ? <ChevronRight size={15} /> : <ChevronLeft size={15} />)
    : (back ? <ChevronLeft size={15} /> : <ChevronRight size={15} />);
}
