import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";
import { cn } from "../../utils/cn";

/**
 * Global right-click menu. Any screen can call `showContextMenu(event, items)`
 * and get a viewport-aware, animated menu; Escape / outside click / scroll
 * all dismiss it.
 */

export type ContextMenuVariant = "default" | "danger" | "warning" | "success" | "accent";

export interface ContextMenuItem {
  id?: string;
  label?: string;
  icon?: ComponentType<{ className?: string; size?: number }>;
  onClick?: () => void;
  shortcut?: string;
  variant?: ContextMenuVariant;
  disabled?: boolean;
  divider?: boolean;
  hidden?: boolean;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
}

interface ContextMenuApi {
  showContextMenu: (event: MouseEvent, items: ContextMenuItem[], options?: { title?: string }) => void;
  hideContextMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuApi | null>(null);

export function useContextMenu(): ContextMenuApi {
  const api = useContext(ContextMenuContext);
  if (!api) throw new Error("useContextMenu must be used inside <ContextMenuProvider>");
  return api;
}

const ITEM_TONES: Record<ContextMenuVariant, string> = {
  default: "text-ink hover:bg-ink/5 dark:text-ivory dark:hover:bg-white/10",
  accent: "text-copper hover:bg-copper/10",
  success: "text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400",
  warning: "text-amber-600 hover:bg-amber-500/10",
  danger: "text-red-600 hover:bg-red-500/10",
};

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0, items: [] });
  const menuRef = useRef<HTMLDivElement | null>(null);

  const hideContextMenu = useCallback(() => setState((prev) => ({ ...prev, isOpen: false })), []);

  const showContextMenu = useCallback((event: MouseEvent, items: ContextMenuItem[], options?: { title?: string }) => {
    event.preventDefault();
    event.stopPropagation();
    const visible = items.filter((item) => !item.hidden);
    const estimatedHeight = Math.min(visible.length * 36 + (options?.title ? 34 : 10), 420);
    const estimatedWidth = 240;
    const x = Math.min(event.clientX, window.innerWidth - estimatedWidth - 12);
    const y = Math.min(event.clientY, window.innerHeight - estimatedHeight - 12);
    setState({ isOpen: true, x, y, title: options?.title, items: visible });
  }, []);

  // Re-clamp from the real DOM size before paint so long menus never overflow.
  useLayoutEffect(() => {
    if (!state.isOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.max(12, Math.min(state.x, window.innerWidth - rect.width - 12));
    const y = Math.max(12, Math.min(state.y, window.innerHeight - rect.height - 12));
    if (x !== state.x || y !== state.y) setState((prev) => ({ ...prev, x, y }));
  }, [state.isOpen, state.x, state.y, state.items]);

  useLayoutEffect(() => {
    if (!state.isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hideContextMenu();
    };
    const onScroll = () => hideContextMenu();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", hideContextMenu);
    window.addEventListener("scroll", onScroll, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", hideContextMenu);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [state.isOpen, hideContextMenu]);

  const api = useMemo(() => ({ showContextMenu, hideContextMenu }), [showContextMenu, hideContextMenu]);

  return (
    <ContextMenuContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {state.isOpen ? (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            style={{ left: state.x, top: state.y }}
            onMouseDown={(event) => event.stopPropagation()}
            className="fixed z-[9999] min-w-52 max-w-72 overflow-hidden rounded-2xl border border-ink/10 bg-white/95 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-[#17211f]/95"
          >
            {state.title ? (
              <div className="border-b border-ink/8 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-copper dark:border-white/8">
                {state.title}
              </div>
            ) : null}
            <div className="p-1.5">
              {state.items.map((item, index) =>
                item.divider ? (
                  <div key={index} className="mx-2 my-1.5 h-px bg-ink/8 dark:bg-white/8" />
                ) : (
                  <button
                    key={item.id ?? index}
                    disabled={item.disabled}
                    onClick={() => {
                      hideContextMenu();
                      item.onClick?.();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[13px] font-medium transition disabled:opacity-40",
                      ITEM_TONES[item.variant ?? "default"],
                    )}
                  >
                    {item.icon ? <item.icon size={15} /> : null}
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut ? <span className="font-mono text-[10px] opacity-50">{item.shortcut}</span> : null}
                  </button>
                ),
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ContextMenuContext.Provider>
  );
}
