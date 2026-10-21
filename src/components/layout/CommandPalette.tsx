import { BookMarked, BookOpen, CalendarClock, Cog, Database, Globe, LayoutDashboard, Plus, Search, Settings, Sparkles, Users, Warehouse, Zap, Bell, ClipboardList } from "lucide-react";
import { Command } from "cmdk";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../store/uiStore";
import { cn } from "../../utils/cn";

/**
 * Ctrl/Cmd+K command palette: jump to any screen, run quick actions, flip
 * the theme, or dive into a settings tab.
 */

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const paletteOpen = useUiStore((state) => state.paletteOpen);
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const preferences = useUiStore((state) => state.preferences);
  const updatePreferences = useUiStore((state) => state.updatePreferences);

  if (!paletteOpen) return null;

  const close = () => setPaletteOpen(false);
  const go = (route: string) => {
    navigate(route);
    close();
  };

  const isDark = preferences.theme === "dark" || (preferences.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const navItems = [
    { route: "/dashboard", icon: LayoutDashboard, label: t("nav.dashboard", "Dashboard") },
    { route: "/catalog", icon: BookOpen, label: t("nav.catalog", "Catalog") },
    { route: "/members", icon: Users, label: t("nav.members", "Members") },
    { route: "/reservations", icon: CalendarClock, label: t("nav.reservations", "Reservations") },
    { route: "/loans", icon: BookMarked, label: t("nav.loans", "Loans") },
    { route: "/inventory", icon: Warehouse, label: t("nav.inventory", "Inventory") },
    { route: "/reports", icon: ClipboardList, label: t("nav.reports", "Reports") },
    { route: "/activity", icon: ClipboardList, label: t("nav.activity", "Activity") },
    { route: "/notifications", icon: Bell, label: t("nav.notifications", "Notifications") },
    { route: "/settings", icon: Cog, label: t("nav.settings", "Settings") },
  ];

  const settingsTabs = [
    { route: "/settings?tab=profile", label: t("commandPalette.actions.profile", "Library Profile") },
    { route: "/settings?tab=appearance", label: t("commandPalette.actions.appearance", "Appearance") },
    { route: "/settings?tab=localization", label: t("commandPalette.actions.localization", "Localization") },
    { route: "/settings?tab=rules", label: t("commandPalette.actions.rules", "Circulation Rules") },
    { route: "/settings?tab=backuprestore", label: t("commandPalette.actions.backupTab", "Backup & Restore") },
    { route: "/settings?tab=integrationsai", label: t("commandPalette.actions.integrations", "Integrations") },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[950] bg-ink/60 pt-[18vh] backdrop-blur-sm dark:bg-black/75" onMouseDown={close}>
      <div
        className={cn(
          "mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1b2723]",
          "rtl",
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Command label={t("commandPalette.placeholder", "Type a command or search…")} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink/40 dark:[&_[cmdk-group-heading]]:text-ivory/40">
          <div className="border-b border-ink/8 px-3 py-2.5 dark:border-white/8">
            <Command.Input
              autoFocus
              placeholder={t("commandPalette.placeholder", "Type a command or search…")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink/40 dark:placeholder:text-ivory/40"
            />
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-sm text-ink/50 dark:text-ivory/50">
              {t("commandPalette.empty", "No matching commands")}
            </Command.Empty>

            <Command.Group heading={t("commandPalette.action", "Action")}>
              {navItems.map((item) => (
                <Item key={item.route} onSelect={() => go(item.route)} icon={item.icon} label={item.label} />
              ))}
            </Command.Group>

            <Command.Group heading={t("commandPalette.action", "Action")}>
              <Item onSelect={() => go("/catalog?focus=search")} icon={Search} label={t("commandPalette.actions.searchBook", "Search catalog")} />
              <Item onSelect={() => go("/members?focus=search")} icon={Search} label={t("commandPalette.actions.searchMember", "Search members")} />
              <Item onSelect={() => go("/catalog?action=add-book")} icon={Plus} label={t("commandPalette.actions.addBook", "Add book")} />
              <Item onSelect={() => go("/members?action=add-member")} icon={Plus} label={t("commandPalette.actions.addMember", "Add member")} />
              <Item onSelect={() => go("/reservations?action=new-reservation")} icon={Plus} label={t("dashboard.newReservation", "New reservation")} />
              <Item
                onSelect={() => {
                  updatePreferences({ theme: isDark ? "light" : "dark" });
                  close();
                }}
                icon={isDark ? Sparkles : Globe}
                label={t("commandPalette.actions.toggleTheme", "Toggle theme")}
              />
            </Command.Group>

            <Command.Group heading={t("commandPalette.action", "Action")}>
              {settingsTabs.map((item) => (
                <Item key={item.route} onSelect={() => go(item.route)} icon={item.route.includes("integrations") ? Zap : item.route.includes("backup") ? Database : Settings} label={item.label} />
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>,
    document.body,
  );
}

function Item({ onSelect, icon: Icon, label }: { onSelect: () => void; icon: typeof Search; label: string }) {
  return (
    <Command.Item
      onSelect={onSelect}
      value={label}
      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition data-[selected=true]:bg-accent data-[selected=true]:text-white"
    >
      <Icon size={15} />
      <span className="flex-1">{label}</span>
      <span className="font-mono text-[10px] opacity-0 data-[selected=true]:opacity-60">↵</span>
    </Command.Item>
  );
}
