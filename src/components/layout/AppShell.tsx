import { Copy, Minus, Search, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate } from "react-router-dom";
import { useAutoBackupScheduler } from "../../hooks/useAutoBackup";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";
import {
  useAppContextMenu,
  useCloseToTray,
  usePreferenceAutosave,
  useRegionContextMenu,
  useShellShortcuts,
  useThemeEngine,
  useToggleFullscreen,
} from "./AppShellHooks";
import { NotificationBell } from "./NotificationBell";
import { initialsOf, ShellSidebar } from "./ShellSidebar";

/**
 * The application shell: custom OS titlebar, resizable sidebar, global
 * search, notification bell, and the theme / accent / density engine.
 * The wiring lives in AppShellHooks; the sidebar and bell are their own
 * components (ShellSidebar, NotificationBell).
 */
export function AppShell() {
  const preferences = useUiStore((state) => state.preferences);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const user = useAuthStore((state) => state.user);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useThemeEngine(preferences);
  useCloseToTray();
  useAutoBackupScheduler();
  usePreferenceAutosave(
    preferences.autosaveEnabled,
    preferences.autosaveInterval,
  );
  const toggleFullscreen = useToggleFullscreen();
  useShellShortcuts({ searchRef });
  const onContextMenu = useAppContextMenu({ toggleFullscreen });
  const contentRegionRef = useRegionContextMenu(onContextMenu);

  return (
    <div className="app-workspace flex h-screen flex-col bg-ivory text-ink dark:bg-[#101a17] dark:text-ivory">
      <TitlebarControls />
      <div ref={contentRegionRef} className="flex min-h-0 flex-1">
        <ShellSidebar expanded={sidebarOpen} toggleSidebar={toggleSidebar} />

        {/* Main column */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="app-texture" />
          <header className="z-10 flex h-[68px] shrink-0 items-center gap-3 border-b border-ink/8 bg-white/90 px-6 backdrop-blur dark:border-white/8 dark:bg-[#15211d]/90">
            <HeaderSearch searchRef={searchRef} />

            <NotificationBell />

            <div className="h-6 w-px bg-ink/10 dark:bg-white/10" />

            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent dark:text-accent-dark">
                {initialsOf(user?.full_name)}
              </span>
              <span className="hidden max-w-40 truncate text-sm font-semibold sm:block">
                {user?.full_name ?? "کتابدار"}
              </span>
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

/** Native-window titlebar buttons (minimize / maximize / close). */
function TitlebarControls() {
  /* Track maximized state so the titlebar can swap the maximize glyph for
    the restore glyph (matching native window controls). */
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const current = getCurrentWindow();
        setMaximized(await current.isMaximized());
        const promise = current.onResized(() => {
          void current.isMaximized().then(setMaximized);
        });
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

  const windowAction = async (
    action: "minimize" | "toggleMaximize" | "close",
  ) => {
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

  return (
    <div className="relative z-50 flex h-8 shrink-0 items-center bg-[#17211f] text-white/85">
      <span data-tauri-drag-region className="absolute inset-0" />
      {/* `relative` keeps the buttons above the drag-region span — an
          inset-0 absolutely-positioned sibling otherwise paints on top of
          this static block and swallows every click (dead window buttons). */}
      <div
        className="relative ms-auto flex h-full items-center ltr:me-0 rtl:ml-0"
        dir="ltr"
      >
        <button
          type="button"
          onClick={() => void windowAction("minimize")}
          aria-label="Minimize"
          className="flex h-full w-11 items-center justify-center hover:bg-white/10"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={() => void windowAction("toggleMaximize")}
          aria-label={maximized ? "Restore" : "Maximize"}
          className="flex h-full w-11 items-center justify-center hover:bg-white/10"
        >
          {maximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          type="button"
          onClick={() => void windowAction("close")}
          aria-label="Close"
          className="flex h-full w-11 items-center justify-center hover:bg-red-600"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

/** Global quick-search box (Enter jumps to the catalog query). */
function HeaderSearch({
  searchRef,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const [search, setSearch] = useState("");

  return (
    <div className="relative max-w-md flex-1">
      <Search
        size={15}
        className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink/40 dark:text-ivory/40"
      />
      <input
        id="global-search"
        aria-label={t("nav.quickSearch", "Quick search…")}
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
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="absolute inset-y-0 end-2 my-auto h-6 rounded-md border border-ink/10 px-1.5 font-mono text-[10px] text-ink/50 dark:border-white/15 dark:text-ivory/50"
      >
        ⌘K
      </button>
    </div>
  );
}

/** Chevron helper for RTL-aware pagination arrows. */
