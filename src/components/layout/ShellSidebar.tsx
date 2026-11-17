import {
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  ClipboardList,
  Cog,
  History,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Users,
  Warehouse,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useNavigate } from "react-router-dom";
import { logout } from "../../data/auth";
import { useAuthStore } from "../../store/authStore";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import { useUiStore } from "../../store/uiStore";
import { cn } from "../../utils/cn";

const SIDEBAR_WIDTH_KEY = "ketabyar-sidebar-width";

const NAV_ITEMS: { route: string; icon: LucideIcon; key: string }[] = [
  { route: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard" },
  { route: "/catalog", icon: BookOpen, key: "nav.catalog" },
  { route: "/members", icon: Users, key: "nav.members" },
  { route: "/reservations", icon: CalendarClock, key: "nav.reservations" },
  { route: "/loans", icon: BookMarked, key: "nav.loans" },
  { route: "/inventory", icon: Warehouse, key: "nav.inventory" },
  { route: "/reports", icon: ClipboardList, key: "nav.reports" },
  { route: "/activity", icon: History, key: "nav.activity" },
  { route: "/notifications", icon: Bell, key: "nav.notifications" },
  { route: "/settings", icon: Cog, key: "nav.settings" },
];

/** Original KetabYar sidebar ornament: a row of book spines drawn in code. */
function SpineOrnament() {
  const spines = [64, 40, 52, 34, 58, 44, 50, 38, 62, 46, 36, 54];
  const tones = [
    "#c06b3e",
    "#1b9277",
    "#8a6d3b",
    "#4d7fb3",
    "#b23244",
    "#1a4d40",
  ];
  return (
    <svg
      viewBox="0 0 220 72"
      className="h-16 w-full opacity-25"
      aria-hidden
      preserveAspectRatio="xMidYMax meet"
    >
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

export function initialsOf(name: string | undefined): string {
  return (name ?? "").trim().slice(0, 2).toUpperCase() || "ک";
}

function ProfileAction({
  icon: Icon,
  label,
  onClick,
  shortcut,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border border-ink/8 px-2 py-2.5 text-[11px] font-semibold text-ink/70 transition hover:border-accent/40 hover:text-accent dark:border-white/10 dark:text-ivory/70 dark:hover:text-accent-dark"
    >
      <Icon size={15} />
      {label}
      {shortcut ? (
        <span className="font-mono text-[9px] opacity-50">{shortcut}</span>
      ) : null}
    </button>
  );
}

/**
 * Sidebar profile footer: hover-opens the quick-actions popover. Owns its
 * own open state and hover-zone listener; the popover div stays free of
 * mouse handlers (Biome a11y).
 */
function ProfileFooter({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updatePreferences = useUiStore((state) => state.updatePreferences);
  const settings = useLibrarySettingsStore((state) => state.settings);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileTimer = useRef<number | null>(null);

  const signOut = async () => {
    await logout();
    setUser(null);
  };

  const profileZoneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!profileOpen) return;
    const onOver = (event: PointerEvent) => {
      const zone = profileZoneRef.current;
      if (!zone) return;
      if (zone.contains(event.target as Node)) {
        if (profileTimer.current) window.clearTimeout(profileTimer.current);
        return;
      }
      profileTimer.current = window.setTimeout(
        () => setProfileOpen(false),
        220,
      );
    };
    window.addEventListener("pointerover", onOver);
    return () => window.removeEventListener("pointerover", onOver);
  }, [profileOpen]);

  return (
    <div ref={profileZoneRef} className="relative border-t border-white/10 p-3">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-3 rounded-xl p-2 text-start transition hover:bg-white/8",
          !expanded && "justify-center",
        )}
        onMouseEnter={() => {
          if (profileTimer.current) window.clearTimeout(profileTimer.current);
          setProfileOpen(true);
        }}
        onMouseLeave={() => {
          profileTimer.current = window.setTimeout(
            () => setProfileOpen(false),
            220,
          );
        }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-copper text-xs font-bold">
          {initialsOf(user?.full_name)}
        </span>
        {expanded ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {user?.full_name ?? t("nav.role", "Librarian")}
            </span>
            <span className="block text-[11px] text-white/50">
              {t("nav.role", "Librarian")}
            </span>
          </span>
        ) : null}
      </button>

      {profileOpen ? (
        <div
          className="absolute bottom-full z-40 mb-2 w-64 rounded-2xl border border-ink/10 bg-white p-3 text-ink shadow-2xl dark:border-white/10 dark:bg-[#1b2723] dark:text-ivory"
          style={{ insetInlineEnd: expanded ? "0.75rem" : "0.5rem" }}
        >
          <p className="text-sm font-bold">{user?.full_name}</p>
          <p className="text-xs text-ink/50 dark:text-ivory/50">
            {t("nav.role", "Librarian")} ·{" "}
            {settings.library_short_name || "KetabYar"}
          </p>
          <p className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-wider text-copper">
            {t("profileCard.quickActions", "Quick actions")}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <ProfileAction
              icon={LogOut}
              label={t("profileCard.signOut", "Sign out")}
              onClick={() => void signOut()}
            />
            <ProfileAction
              icon={Settings}
              label={t("profileCard.settings", "Settings")}
              onClick={() => {
                setProfileOpen(false);
                navigate("/settings");
              }}
            />
            <ProfileAction
              icon={
                document.documentElement.classList.contains("dark") ? Sun : Moon
              }
              label={t("profileCard.themeLight", "Theme")}
              onClick={() =>
                updatePreferences({
                  theme: document.documentElement.classList.contains("dark")
                    ? "light"
                    : "dark",
                })
              }
            />
            <ProfileAction
              icon={Sparkles}
              label={t("profileCard.commandPalette", "Palette")}
              onClick={() => {
                setProfileOpen(false);
                setPaletteOpen(true);
              }}
              shortcut="⌘K"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The sidebar: brand block, primary navigation, book-spine ornament, profile
 * footer with its hover popover, and the native range-input resize handle.
 */
export function ShellSidebar({
  expanded,
  toggleSidebar,
}: {
  expanded: boolean;
  toggleSidebar: () => void;
}) {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored >= 200 && stored <= 480
      ? stored
      : 260;
  });
  return (
    <aside
      className="relative z-20 flex shrink-0 flex-col bg-[#132622] text-white transition-[width] duration-200"
      style={{ width: expanded ? sidebarWidth : 80 }}
    >
      <div className="flex items-center gap-3 px-4 py-5">
        <img
          src="/brand/ketabyar-symbol.png"
          alt="KetabYar"
          className="h-10 w-10 shrink-0 rounded-xl"
        />
        {expanded ? (
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-tight">
              کتابیار
            </p>
            <p className="truncate text-[11px] text-white/55">
              {settings.library_short_name ||
                settings.library_name ||
                "KetabYar"}
            </p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={toggleSidebar}
          className="ms-auto rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Toggle sidebar"
        >
          <Menu size={16} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.route}
            to={item.route}
            title={
              expanded ? undefined : t(item.key, item.key.split(".")[1] ?? "")
            }
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
            {expanded ? (
              <span className="truncate">{t(item.key, "")}</span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="pointer-events-none absolute bottom-0 start-0 end-0 px-3 pb-1">
        <SpineOrnament />
      </div>

      <ProfileFooter expanded={expanded} />

      {/* Resize handle (only while expanded): a native range input — the
          browser owns dragging and arrow keys (RTL mirroring included) and
          the element carries real slider semantics. */}
      {expanded ? (
        <input
          type="range"
          min={200}
          max={480}
          step={16}
          value={sidebarWidth}
          aria-label={t("nav.sidebarResize", "Sidebar width")}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            setSidebarWidth(next);
            localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
          }}
          className="absolute inset-y-0 start-0 z-30 w-1.5 cursor-col-resize appearance-none bg-copper/0 transition hover:bg-copper/60 focus-visible:bg-copper focus-visible:outline-none"
        />
      ) : null}
    </aside>
  );
}
