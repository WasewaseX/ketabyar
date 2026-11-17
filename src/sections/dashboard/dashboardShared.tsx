import type { ScanLine } from "lucide-react";
import { cn } from "../../utils/cn";

export const DAILY_QUOTES = [
  { quote: "کتابخانه، حافظهٔ یک ملت است.", translation: "" },
  {
    quote: "A room without books is like a body without a soul.",
    translation: "Cicero",
  },
  { quote: "خواندن، دریاست برای اندیشیدن.", translation: "" },
  { quote: "There is no friend as loyal as a book.", translation: "Hemingway" },
  { quote: "کتاب بهترین یارِ خاموش است.", translation: "" },
];

/** Shared panel shell: title, optional view-all link, scrollable children. */
export function Panel({
  title,
  subtitle,
  viewAll,
  onNavigate,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  viewAll?: string;
  onNavigate?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{title}</p>
          {subtitle ? (
            <p className="text-[10px] text-ink/50 dark:text-ivory/50">
              {subtitle}
            </p>
          ) : null}
        </div>
        {viewAll && onNavigate ? (
          <button
            type="button"
            onClick={onNavigate}
            className="text-[11px] font-bold text-accent hover:underline dark:text-accent-dark"
          >
            {viewAll}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Small cover thumbnail for loan lists. */
export function LoanThumb({
  cover,
  title,
  dark,
}: {
  cover?: string | null;
  title: string;
  dark?: boolean;
}) {
  return cover ? (
    <img
      src={cover}
      alt=""
      className="h-10 w-8 shrink-0 rounded-md object-cover shadow-sm"
    />
  ) : (
    <span
      className={cn(
        "flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-[8px] font-bold",
        dark
          ? "bg-[#17211f] text-white/70"
          : "bg-accent/15 text-accent dark:text-accent-dark",
      )}
    >
      {title.slice(0, 10)}
    </span>
  );
}

export function ActionCard({
  icon: Icon,
  label,
  sub,
  onClick,
}: {
  icon: typeof ScanLine;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1.5 rounded-xl border border-ink/8 p-3 text-start transition hover:border-accent/40 hover:bg-accent/5 dark:border-white/8 dark:hover:border-accent-dark/40 dark:hover:bg-accent-dark/5"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent dark:bg-accent-dark/15 dark:text-accent-dark">
        <Icon size={15} />
      </span>
      <span className="text-[12.5px] font-bold leading-tight">{label}</span>
      <span className="text-[10px] text-ink/50 dark:text-ivory/50">{sub}</span>
    </button>
  );
}
