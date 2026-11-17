import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";

/** Search, department/sort selects, direction toggle and status pills. */
export function MemberFilters({
  searchRef,
  term,
  setTerm,
  departmentFilter,
  setDepartmentFilter,
  departments,
  sortKey,
  setSortKey,
  sortDir,
  setSortDir,
  statusView,
  setStatusView,
  setPage,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  term: string;
  setTerm: (value: string) => void;
  departmentFilter: string;
  setDepartmentFilter: (value: string) => void;
  departments: string[];
  sortKey: "name" | "number" | "joined";
  setSortKey: (key: "name" | "number" | "joined") => void;
  sortDir: 1 | -1;
  setSortDir: (updater: (dir: 1 | -1) => 1 | -1) => void;
  statusView: "all" | "active" | "suspended";
  setStatusView: (view: "all" | "active" | "suspended") => void;
  setPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          ref={searchRef}
          aria-label={t(
            "members.searchPlaceholder",
            "Search name, number, phone…",
          )}
          className="field-input max-w-xs"
          placeholder={t(
            "members.searchPlaceholder",
            "Search name, number, phone…",
          )}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label={t("members.filterDepartment", "Department filter")}
          className="field-select max-w-44"
          value={departmentFilter}
          onChange={(event) => {
            setDepartmentFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">
            {t("members.allDepartments", "All departments")}
          </option>
          {departments.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
        <select
          aria-label={t("members.sortBy", "Sort by")}
          className="field-select max-w-40"
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
        >
          <option value="name">{t("members.sortByName", "By name")}</option>
          <option value="number">{t("members.sortById", "By number")}</option>
          <option value="joined">
            {t("members.sortByJoined", "By join date")}
          </option>
        </select>
        <button
          type="button"
          onClick={() => setSortDir((dir) => (dir === 1 ? -1 : 1))}
          className="rounded-[var(--radius-control)] bg-ink/5 px-3 py-2 text-xs font-bold text-ink/60 dark:bg-white/5 dark:text-ivory/60"
        >
          {sortDir === 1 ? t("asc", "A→Z") : t("desc", "Z→A")}
        </button>
      </div>

      <div className="mb-4 flex gap-1.5">
        {(["all", "active", "suspended"] as const).map((key) => (
          <button
            type="button"
            key={key}
            onClick={() => {
              setStatusView(key);
              setPage(1);
            }}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition",
              statusView === key
                ? "bg-accent text-white dark:bg-accent-dark"
                : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10",
            )}
          >
            {t(`members.${key === "all" ? "allMembers" : key}`, key)}
          </button>
        ))}
      </div>
    </>
  );
}

/** Showing-N-of-M pager row under the member grid. */
export function MembersPagination({
  currentPage,
  totalPages,
  setPage,
  total,
  pageSize,
}: {
  currentPage: number;
  totalPages: number;
  setPage: (page: number) => void;
  total: number;
  pageSize: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-ink/60 dark:text-ivory/60">
      <span>
        {t("catalog.showing", "Showing {{start}}–{{end}} of {{total}}", {
          start: (currentPage - 1) * pageSize + 1,
          end: Math.min(currentPage * pageSize, total),
          total,
        })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
          className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10"
        >
          ‹
        </button>
        <span className="tabular-nums">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => setPage(currentPage + 1)}
          className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10"
        >
          ›
        </button>
      </div>
    </div>
  );
}
