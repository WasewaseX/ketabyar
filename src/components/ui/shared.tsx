import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";
import { Input } from "./primitives";

/** Page heading with an optional right-aligned action slot. */
export function PageTitle({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-ink/55 dark:text-ivory/55">{detail}</p>
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Horizontally scrollable data table with a parchment header row. */
export function Table({ headers, children, minWidth = 650 }: { headers: string[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr className="bg-ivory text-start text-[11px] font-semibold uppercase tracking-wide text-ink/60 dark:bg-white/5 dark:text-ivory/60">
            {headers.map((header, index) => (
              <th key={index} className="px-4 py-3 text-start font-semibold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("border-b border-ink/6 px-4 py-3 align-middle last:border-b-0 dark:border-white/6", className)}>{children}</td>;
}

/**
 * Dropdown with a built-in text filter, for option lists too long for a
 * native select (members, shelves, bookcases…).
 */
export function SearchableSelect<T>({
  options,
  labelKey,
  valueKey,
  subLabelKey,
  placeholder,
  value,
  onChange,
}: {
  options: T[];
  labelKey: keyof T;
  valueKey: keyof T;
  subLabelKey?: keyof T;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const selected = useMemo(() => options.find((option) => String(option[valueKey]) === value), [options, valueKey, value]);
  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const label = String(option[labelKey] ?? "").toLowerCase();
      const sub = subLabelKey ? String(option[subLabelKey] ?? "").toLowerCase() : "";
      return label.includes(needle) || sub.includes(needle);
    });
  }, [options, labelKey, subLabelKey, term]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="field-input flex items-center justify-between gap-2 text-start"
      >
        <span className={selected ? "" : "text-ink/45 dark:text-ivory/45"}>
          {selected
            ? `${String(selected[labelKey])}${subLabelKey ? ` (${String(selected[subLabelKey])})` : ""}`
            : placeholder}
        </span>
        <span aria-hidden className="text-ink/40 dark:text-ivory/40">▾</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[800]" onMouseDown={() => setOpen(false)} />
      ) : null}
      {open ? (
        <div className="absolute z-[810] mt-1.5 w-full overflow-hidden rounded-[var(--radius-control)] border border-ink/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#1b2723]">
          <div className="border-b border-ink/8 p-2 dark:border-white/8">
            <Input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("common.typeToFilter", "Type to filter…")} />
          </div>
          <ul className="max-h-40 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink/45 dark:text-ivory/45">{t("common.noResults", "No results")}</li>
            ) : (
              filtered.map((option, index) => {
                const optionValue = String(option[valueKey]);
                const isSelected = optionValue === value;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(optionValue);
                        setTerm("");
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-start text-sm transition",
                        isSelected ? "bg-accent text-white" : "hover:bg-ink/5 dark:hover:bg-white/5",
                      )}
                    >
                      {String(option[labelKey])}
                      {subLabelKey ? <span className={cn("ms-2 text-xs", isSelected ? "text-white/70" : "text-ink/45 dark:text-ivory/45")}>{String(option[subLabelKey])}</span> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
