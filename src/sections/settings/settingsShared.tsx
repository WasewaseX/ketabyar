import {
  Bell,
  BookMarked,
  Database,
  Globe,
  Info,
  Laptop,
  ListChecks,
  Palette,
  Settings as SettingsIcon,
  type Sun,
  Users,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

/**
 * Every tab renders the same primitives — one registry and one set of field
 * components keep the twelve tabs visually identical and the edits uniform.
 */

export type TabId =
  | "general"
  | "libraryprofile"
  | "localization"
  | "appearance"
  | "rules"
  | "notifications"
  | "backuprestore"
  | "database"
  | "integrationsai"
  | "users"
  | "desktopdata"
  | "about";

export const TAB_GROUPS: {
  labelKey: string;
  tabs: { id: TabId; labelKey: string; icon: typeof Sun }[];
}[] = [
  {
    labelKey: "settings.groups.general",
    tabs: [
      { id: "general", labelKey: "settings.tabs.general", icon: SettingsIcon },
      {
        id: "libraryprofile",
        labelKey: "settings.tabs.libraryprofile",
        icon: BookMarked,
      },
      {
        id: "localization",
        labelKey: "settings.tabs.localization",
        icon: Globe,
      },
      { id: "appearance", labelKey: "settings.tabs.appearance", icon: Palette },
    ],
  },
  {
    labelKey: "settings.groups.circulation",
    tabs: [
      { id: "rules", labelKey: "settings.tabs.rules", icon: ListChecks },
      {
        id: "notifications",
        labelKey: "settings.tabs.notifications",
        icon: Bell,
      },
    ],
  },
  {
    labelKey: "settings.groups.datasecurity",
    tabs: [
      {
        id: "backuprestore",
        labelKey: "settings.tabs.backuprestore",
        icon: Database,
      },
      { id: "database", labelKey: "settings.tabs.database", icon: Database },
      {
        id: "integrationsai",
        labelKey: "settings.tabs.integrationsai",
        icon: Zap,
      },
      { id: "users", labelKey: "settings.tabs.users", icon: Users },
    ],
  },
  {
    labelKey: "settings.groups.system",
    tabs: [
      {
        id: "desktopdata",
        labelKey: "settings.tabs.desktopdata",
        icon: Laptop,
      },
      { id: "about", labelKey: "settings.tabs.about", icon: Info },
    ],
  },
];

export const TIMEZONES = [
  "Asia/Tehran",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Europe/London",
  "Europe/Paris",
  "Africa/Cairo",
  "Africa/Tunis",
  "America/New_York",
  "America/Los_Angeles",
];
export const CURRENCIES = ["IRR", "EUR", "USD", "GBP", "AED", "SAR", "TRY"];

export function Card({
  title,
  children,
  desc,
}: {
  title?: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-5 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
      {title ? <p className="mb-1 text-sm font-bold">{title}</p> : null}
      {desc ? (
        <p className="mb-3 text-xs text-ink/50 dark:text-ivory/50">{desc}</p>
      ) : null}
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: implicit label — the control is rendered as a direct child
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px] text-ink/45 dark:text-ivory/45">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink/8 px-4 py-3 text-start transition hover:border-ink/20 dark:border-white/8 dark:hover:border-white/20"
    >
      <span>
        <span className="block text-[13px] font-semibold">{label}</span>
        {desc ? (
          <span className="block text-[11px] text-ink/50 dark:text-ivory/50">
            {desc}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition",
          checked
            ? "bg-accent dark:bg-accent-dark"
            : "bg-ink/15 dark:bg-white/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "start-[1.4rem]" : "start-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  hint,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-ink/8 px-4 py-3 dark:border-white/8">
      <div>
        <p className="text-[13px] font-semibold">{label}</p>
        {hint ? (
          <p className="text-[11px] text-ink/45 dark:text-ivory/45">{hint}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-8 w-8 rounded-lg bg-ink/6 font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
        >
          −
        </button>
        <span className="w-10 text-center font-display text-sm font-bold tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-8 w-8 rounded-lg bg-ink/6 font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
        >
          +
        </button>
      </div>
    </div>
  );
}
