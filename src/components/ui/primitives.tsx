import { BookOpen, FileQuestion, GraduationCap, Loader2, Newspaper, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ElementType, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";

/** Shared loading spinner. */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn("animate-spin text-accent", className)} aria-hidden />;
}

/** Centred, full-height loading state for pages. */
export function PageLoader({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex h-[60vh] flex-col items-center justify-center gap-3", className)}>
      <Spinner size={30} />
      <p className="text-sm text-ink/60 dark:text-ivory/60">{label ?? t("common.loading", "Loading…")}</p>
    </div>
  );
}

export const ITEM_TYPE_ICONS: Record<string, ElementType> = {
  book: BookOpen,
  fyp: GraduationCap,
  journal: Newspaper,
  other: FileQuestion,
};

export const ITEM_TYPE_VALUES = ["book", "fyp", "journal", "other"] as const;

const BUTTON_VARIANTS: Record<string, string> = {
  primary: "bg-accent text-white hover:opacity-90 dark:bg-accent-dark",
  secondary: "bg-ivory text-ink border border-ink/15 hover:border-ink/30 dark:bg-ink dark:text-ivory dark:border-white/15",
  danger: "bg-red-700 text-white hover:bg-red-800",
  ghost: "bg-transparent text-ink/70 hover:bg-ink/5 dark:text-ivory/70 dark:hover:bg-white/5",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS };

export function Button({ variant = "primary", className, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("field-input", className)} {...props} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-ink/5 bg-white p-5 shadow-card dark:border-white/5 dark:bg-[#1b2723]", className)}>
      {children}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  available: "bg-accent/12 text-accent dark:text-accent-dark",
  active: "bg-accent/12 text-accent dark:text-accent-dark",
  ready: "bg-accent/12 text-accent dark:text-accent-dark",
  "on-loan": "bg-copper/15 text-copper",
  queued: "bg-copper/15 text-copper",
};

/** Coloured status pill; unknown statuses fall back to a neutral tone. */
export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const { t } = useTranslation();
  const tone = STATUS_TONES[value] ?? "bg-red-700/10 text-red-700";
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", tone, className)}>
      {t(value, value)}
    </span>
  );
}

const ITEM_TYPE_TONES: Record<string, string> = {
  book: "bg-accent/10 text-accent dark:text-accent-dark",
  fyp: "bg-purple-500/10 text-purple-600",
  journal: "bg-sky-500/10 text-sky-600",
  other: "bg-slate-500/10 text-slate-500",
};

export function ItemTypeBadge({ type, className }: { type?: string; className?: string }) {
  const { t } = useTranslation();
  const normalized = (type ?? "book") as string;
  const Icon = ITEM_TYPE_ICONS[normalized] ?? BookOpen;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", ITEM_TYPE_TONES[normalized] ?? ITEM_TYPE_TONES.book, className)}>
      <Icon size={12} />
      {t(`itemTypes.${normalized}`, normalized)}
    </span>
  );
}

/** Cover placeholder with a type-tinted icon. */
export function DefaultCover({ type, className, iconSize = 18 }: { type?: string | null; className?: string; iconSize?: number }) {
  const normalized = (type ?? "book") as string;
  const Icon = ITEM_TYPE_ICONS[normalized] ?? BookOpen;
  return (
    <div className={cn("flex items-center justify-center border border-ink/10 bg-ivory text-ink/40 dark:border-white/10 dark:bg-ink dark:text-ivory/40", className)}>
      <Icon size={iconSize} />
    </div>
  );
}

/** Grid of item-type buttons used in the book form. */
export function ItemTypeSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {ITEM_TYPE_VALUES.map((type) => {
        const Icon = ITEM_TYPE_ICONS[type];
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[var(--radius-control)] border px-2 py-2.5 text-xs font-semibold transition",
              active
                ? "border-accent bg-accent/10 text-accent dark:border-accent-dark dark:text-accent-dark"
                : "border-ink/12 text-ink/60 hover:border-ink/30 dark:border-white/12 dark:text-ivory/60 dark:hover:border-white/30",
            )}
          >
            <Icon size={17} />
            {t(`itemTypes.${type}`, type)}
          </button>
        );
      })}
    </div>
  );
}

/** Empty-state card: inline artwork or an icon in a soft disc. */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
  artwork,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ElementType;
  artwork?: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-ink/12 p-8 text-center dark:border-white/12">
      {artwork ?? (Icon ? <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent dark:text-accent-dark"><Icon size={26} /></span> : null)}
      <h3 className="font-display text-base font-bold">{title}</h3>
      <p className="max-w-md text-sm text-ink/55 dark:text-ivory/55">{description}</p>
      {action}
    </div>
  );
}

const MODAL_SIZES: Record<string, string> = {
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-5xl",
};

/** Portal dialog: backdrop click closes, Escape closes, body scrolls. */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "lg",
  className,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: keyof typeof MODAL_SIZES;
  className?: string;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          "w-full overflow-hidden rounded-[var(--radius-card)] border border-ink/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1b2723]",
          MODAL_SIZES[size],
          className,
        )}
      >
        <header className="flex items-center justify-between border-b border-ink/8 px-5 py-3.5 dark:border-white/8">
          <h2 className="font-display text-base font-bold">{title}</h2>
          <button onClick={onClose} aria-label={t("common.closeDialog", "Close dialog")} className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink dark:text-ivory/50 dark:hover:bg-white/10 dark:hover:text-ivory">
            <X size={17} />
          </button>
        </header>
        <div className="max-h-[72vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
