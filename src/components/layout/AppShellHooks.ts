import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  type LucideIcon,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { applyAccent } from "../../config/accent";
import i18n from "../../i18n";
import { PREFERENCES_KEY, useUiStore } from "../../store/uiStore";
import type { Preferences } from "../../types";
import { useContextMenu } from "../ui/ContextMenu";

/**
 * AppShell's cross-cutting wiring, extracted from the component body: the
 * theme / accent / density engine, Tauri window plumbing, preference
 * autosave, keyboard shortcuts and the region-level context menu.
 */

export function useThemeEngine(preferences: Preferences) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        preferences.theme === "dark" ||
        (preferences.theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences.theme]);

  useEffect(() => {
    applyAccent(preferences.accentColor);
  }, [preferences.accentColor]);

  useEffect(() => {
    const px =
      preferences.fontSize === "small"
        ? "13px"
        : preferences.fontSize === "large"
          ? "17px"
          : "15px";
    document.documentElement.style.setProperty("--font-size-base", px);
  }, [preferences.fontSize]);

  useEffect(() => {
    document.documentElement.lang = preferences.locale;
    document.documentElement.dir = "rtl";
    if (i18n.language !== preferences.locale)
      void i18n.changeLanguage(preferences.locale);
  }, [preferences.locale]);
}

/** When the window is closed, hide to the tray instead of quitting (if configured). */
export function useCloseToTray() {
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
        const promise = current.onCloseRequested(
          handler as Parameters<typeof current.onCloseRequested>[0],
        );
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
}

/** Periodically persist the preference store so a crash loses nothing. */
export function usePreferenceAutosave(enabled: boolean, intervalSec: number) {
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      try {
        localStorage.setItem(
          PREFERENCES_KEY,
          JSON.stringify(useUiStore.getState().preferences),
        );
      } catch {
        /* storage unavailable */
      }
    }, Math.max(10, intervalSec) * 1000);
    return () => window.clearInterval(interval);
  }, [enabled, intervalSec]);
}

export function useToggleFullscreen() {
  return useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const current = getCurrentWindow();
      await current.setFullscreen(!(await current.isFullscreen()));
    } catch {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    }
  }, []);
}

/** Global keyboard shortcuts: sidebar, palette, search focus, settings, F11. */
export function useShellShortcuts({
  searchRef,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const navigate = useNavigate();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const toggleFullscreen = useToggleFullscreen();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        toggleSidebar();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
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
  }, [navigate, setPaletteOpen, searchRef, toggleFullscreen, toggleSidebar]);
}

/** Right-click menu for the whole workspace region. */
export function useAppContextMenu({
  toggleFullscreen,
}: {
  toggleFullscreen: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const updatePreferences = useUiStore((state) => state.updatePreferences);
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);

  return useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      showContextMenu(
        event,
        [
          {
            id: "refresh",
            label: t("contextMenu.refresh", "Refresh"),
            shortcut: "Ctrl+R",
            icon: RefreshCw as LucideIcon,
            variant: "accent",
            onClick: () => {
              void queryClient.invalidateQueries();
              toast.success(t("contextMenu.refreshed", "Refreshed"));
            },
          },
          { id: "d1", divider: true },
          {
            id: "back",
            label: t("contextMenu.goBack", "Go back"),
            shortcut: "Alt+←",
            onClick: () => navigate(-1),
          },
          {
            id: "forward",
            label: t("contextMenu.goForward", "Go forward"),
            shortcut: "Alt+→",
            onClick: () => navigate(1),
          },
          {
            id: "dash",
            label: t("contextMenu.dashboard", "Dashboard"),
            icon: LayoutDashboard as LucideIcon,
            onClick: () => navigate("/dashboard"),
          },
          { id: "d2", divider: true },
          {
            id: "theme",
            label: document.documentElement.classList.contains("dark")
              ? t("contextMenu.lightTheme", "Light theme")
              : t("contextMenu.darkTheme", "Dark theme"),
            icon: (document.documentElement.classList.contains("dark")
              ? Sun
              : Moon) as LucideIcon,
            onClick: () =>
              updatePreferences({
                theme: document.documentElement.classList.contains("dark")
                  ? "light"
                  : "dark",
              }),
          },
          {
            id: "palette",
            label: t("contextMenu.commandPalette", "Command palette"),
            shortcut: "Ctrl+K",
            icon: Sparkles as LucideIcon,
            onClick: () => setPaletteOpen(true),
          },
          {
            id: "fullscreen",
            label: t("contextMenu.fullscreen", "Fullscreen"),
            shortcut: "F11",
            onClick: () => void toggleFullscreen(),
          },
        ],
        { title: t("contextMenu.appTitle", "KetabYar") },
      );
    },
    [
      navigate,
      queryClient,
      setPaletteOpen,
      showContextMenu,
      t,
      toggleFullscreen,
      updatePreferences,
    ],
  );
}

/** Runs the region context-menu handler from a window listener: the layout
 * container stays free of interaction props (Biome a11y). */
export function useRegionContextMenu(
  onContextMenu: (event: MouseEvent | ReactMouseEvent) => void,
) {
  const contentRegionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onCtx = (event: MouseEvent) => {
      if (!contentRegionRef.current?.contains(event.target as Node)) return;
      onContextMenu(event);
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, [onContextMenu]);
  return contentRegionRef;
}
