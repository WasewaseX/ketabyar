import { useTranslation } from "react-i18next";
import { humanize } from "../Activity";

/** Search, date, entity, user and action filters for the audit log. */
export function ActivityFilters({
  term,
  setTerm,
  dateFilter,
  setDateFilter,
  entityFilter,
  setEntityFilter,
  actorFilter,
  setActorFilter,
  actionFilter,
  setActionFilter,
  actors,
  actions,
  entities,
  setPage,
}: {
  term: string;
  setTerm: (value: string) => void;
  dateFilter: string;
  setDateFilter: (value: string) => void;
  entityFilter: string;
  setEntityFilter: (value: string) => void;
  actorFilter: string;
  setActorFilter: (value: string) => void;
  actionFilter: string;
  setActionFilter: (value: string) => void;
  actors: string[];
  actions: string[];
  entities: string[];
  setPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-ink/8 bg-white p-3 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
        <input
          aria-label={t(
            "activity.searchPlaceholder",
            "Search actions, operators, ids…",
          )}
          className="field-input max-w-xs"
          placeholder={t(
            "activity.searchPlaceholder",
            "Search actions, operators, ids…",
          )}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setPage(1);
          }}
        />
        <input
          type="date"
          aria-label={t("activity.dateFilter", "Date filter")}
          className="field-input max-w-40"
          value={dateFilter}
          onChange={(event) => {
            setDateFilter(event.target.value);
            setPage(1);
          }}
        />
        {dateFilter ? (
          <button
            type="button"
            onClick={() => setDateFilter("")}
            className="rounded-lg bg-red-600/10 px-2.5 py-1.5 text-xs font-bold text-red-600"
          >
            {t("activity.clear", "Clear")}
          </button>
        ) : null}
        <select
          aria-label={t("activity.entityFilter", "Entity filter")}
          className="field-select max-w-40"
          value={entityFilter}
          onChange={(event) => {
            setEntityFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("activity.allEntities", "All entities")}</option>
          {entities.map((entity) => (
            <option key={entity} value={entity}>
              {t(`activity.entities.${entity}`, entity) as string}
            </option>
          ))}
        </select>
        <select
          aria-label={t("activity.actorFilter", "User filter")}
          className="field-select max-w-40"
          value={actorFilter}
          onChange={(event) => {
            setActorFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("activity.allUsers", "All users")}</option>
          {actors.map((actor) => (
            <option key={actor} value={actor}>
              {actor}
            </option>
          ))}
        </select>
        <select
          aria-label={t("activity.actionFilter", "Action filter")}
          className="field-select max-w-44"
          value={actionFilter}
          onChange={(event) => {
            setActionFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("activity.allActions", "All actions")}</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {t(`activity.actions.${action}`, humanize(action))}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
