import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

/** Page heading with an optional right-aligned action slot. */
export function PageTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
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
export function Table({
  headers,
  children,
  minWidth = 650,
}: {
  headers: string[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr className="bg-ivory text-start text-[11px] font-semibold uppercase tracking-wide text-ink/60 dark:bg-white/5 dark:text-ivory/60">
            {headers.map((header, index) => (
              <th key={index} className="px-4 py-3 text-start font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-ink/6 px-4 py-3 align-middle last:border-b-0 dark:border-white/6",
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * Dropdown with a built-in text filter, for option lists too long for a
 * native select (members, shelves, bookcases…).
 */
