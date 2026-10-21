import type { ElementType, ReactNode } from "react";
import { cn } from "../../utils/cn";

/** Compact summary pill used at the top of Notifications / Activity pages. */
export function StatPill({
  icon: Icon,
  label,
  value,
  tone = "accent",
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
  tone?: "accent" | "copper" | "danger" | "amber";
}) {
  const tones: Record<string, string> = {
    accent: "bg-accent/10 text-accent dark:text-accent-dark",
    copper: "bg-copper/12 text-copper",
    danger: "bg-red-600/10 text-red-600",
    amber: "bg-amber-500/12 text-amber-600",
  };
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-ink/8 bg-white px-4 py-3 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", tones[tone])}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink/50 dark:text-ivory/50">{label}</p>
        <p className="font-display text-lg font-bold leading-tight">{value}</p>
      </div>
    </div>
  );
}

/** Filter pill row used by Loans / Reservations / Catalog saved views. */
export function FilterPill({ active, count, children, onClick }: { active: boolean; count?: number; children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition",
        active
          ? "bg-accent text-white dark:bg-accent-dark"
          : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10",
      )}
    >
      {children}
      {count !== undefined ? (
        <span className={cn("rounded-full px-1.5 text-[10px] font-bold", active ? "bg-white/25" : "bg-ink/10 dark:bg-white/10")}>{count}</span>
      ) : null}
    </button>
  );
}
