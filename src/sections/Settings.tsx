import { Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { PageTitle } from "../components/ui/shared";
import { cn } from "../utils/cn";
import { TAB_GROUPS, type TabId } from "./settings/settingsShared";
import {
  AppearanceTab,
  GeneralTab,
  LocalizationTab,
  ProfileTab,
} from "./settings/settingsTabsA";
import {
  BackupTab,
  NotificationsTab,
  RulesTab,
} from "./settings/settingsTabsB";
import { DatabaseTab, IntegrationsTab } from "./settings/settingsTabsC";
import { AboutTab, DesktopTab, UsersTab } from "./settings/settingsTabsD";

/**
 * Settings: everything the institution shares (identity, rules, notifications)
 * and everything the operator personalises (theme, accent, desktop behavior).
 * Field edits persist immediately; nothing is ever silently lost. Tab bodies
 * live in the settings/ modules.
 */

export function SettingsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  // Deep-link support: a valid ?tab= URL parameter is authoritative while
  // present; otherwise the locally-selected tab wins. Deriving the active
  // tab during render (instead of an effect writing state back) keeps the
  // URL and the UI in sync without cascading renders.
  const [tabState, setTabState] = useState<TabId>(() => {
    const param = new URLSearchParams(location.search).get("tab");
    return (
      TAB_GROUPS.flatMap((group) => group.tabs).some(
        (entry) => entry.id === param,
      )
        ? param
        : "general"
    ) as TabId;
  });
  const [navTerm, setNavTerm] = useState("");

  const urlParam = new URLSearchParams(location.search).get("tab");
  const urlTabValid = TAB_GROUPS.flatMap((group) => group.tabs).some(
    (entry) => entry.id === urlParam,
  );
  const tab: TabId = urlTabValid ? (urlParam as TabId) : tabState;
  const selectTab = (id: TabId) => {
    setTabState(id);
    if (urlTabValid) navigate(`/settings?tab=${id}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title={t("settings.title", "Settings")}
        detail={t(
          "settings.subtitle",
          "Institution rules and personal preferences, saved as you type.",
        )}
      />

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        {/* Nav */}
        <aside className="space-y-3 self-start rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink/40 dark:text-ivory/40"
            />
            <input
              aria-label={t("settings.searchPlaceholder", "Find a setting…")}
              className="field-input ps-9 text-sm"
              placeholder={t("settings.searchPlaceholder", "Find a setting…")}
              value={navTerm}
              onChange={(event) => setNavTerm(event.target.value)}
            />
          </div>
          {TAB_GROUPS.map((group) => {
            const tabs = group.tabs.filter((entry) =>
              t(entry.labelKey, entry.id)
                .toLowerCase()
                .includes(navTerm.trim().toLowerCase()),
            );
            if (tabs.length === 0) return null;
            return (
              <div key={group.labelKey}>
                <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-copper">
                  {t(group.labelKey, group.labelKey)}
                </p>
                <ul className="space-y-0.5">
                  {tabs.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => selectTab(entry.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[13px] font-medium transition",
                          tab === entry.id
                            ? "bg-accent text-white dark:bg-accent-dark"
                            : "hover:bg-ink/5 dark:hover:bg-white/5",
                        )}
                      >
                        <entry.icon size={15} />
                        {t(entry.labelKey, entry.id)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </aside>

        {/* Panel */}
        <div className="space-y-4">
          {tab === "general" ? <GeneralTab /> : null}
          {tab === "libraryprofile" ? <ProfileTab /> : null}
          {tab === "localization" ? <LocalizationTab /> : null}
          {tab === "appearance" ? <AppearanceTab /> : null}
          {tab === "rules" ? <RulesTab /> : null}
          {tab === "notifications" ? <NotificationsTab /> : null}
          {tab === "backuprestore" ? <BackupTab /> : null}
          {tab === "database" ? <DatabaseTab /> : null}
          {tab === "integrationsai" ? <IntegrationsTab /> : null}
          {tab === "users" ? <UsersTab /> : null}
          {tab === "desktopdata" ? <DesktopTab /> : null}
          {tab === "about" ? (
            <AboutTab onNavigateLegal={(doc) => navigate(`/legal/${doc}`)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── General ─────────────────────────────────────────────────────────── */
