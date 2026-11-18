import { useTranslation } from "react-i18next";
import { Modal } from "../../components/ui/primitives";
import { formatDisplayDate } from "../../utils/dates";
import type { AuditRow } from "../Activity";
import { ActionBadge, asObject } from "../Activity";

/** Read-only detail modal for one audit row. */
export function ActivityDetailModal({
  selected,
  onClose,
}: {
  selected: AuditRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Modal
        isOpen={!!selected}
        onClose={onClose}
        title={t("activity.modal.title", "Log details")}
        size="md"
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ActionBadge action={selected.action} />
              <span className="text-xs text-ink/55 dark:text-ivory/55">
                {formatDisplayDate(selected.created_at)}
              </span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="font-semibold">
                {t("activity.modal.operator", "Operator")}
              </dt>
              <dd>{selected.actor}</dd>
              <dt className="font-semibold">
                {t("activity.modal.entityType", "Entity type")}
              </dt>
              <dd>
                {
                  t(
                    `activity.entities.${selected.entity_type}`,
                    selected.entity_type,
                  ) as string
                }
              </dd>
              <dt className="font-semibold">
                {t("activity.modal.entityId", "Entity ID")}
              </dt>
              <dd>
                <code className="break-all rounded bg-ink/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">
                  {selected.entity_id}
                </code>
              </dd>
            </dl>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold">
                {t("activity.modal.payload", "Payload")}
              </p>
              {(() => {
                const object =
                  asObject(selected.after_json) ??
                  asObject(selected.before_json);
                if (!object)
                  return (
                    <p className="text-xs text-ink/50 dark:text-ivory/50">
                      {t("activity.modal.noPayload", "No payload recorded.")}
                    </p>
                  );
                return (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-ink/5 p-3 dark:bg-white/5">
                    {Object.entries(object).map(([key, value]) => (
                      <p key={key} className="font-mono text-[11px]">
                        <span className="font-bold">{key}</span>:{" "}
                        {typeof value === "string"
                          ? value
                          : JSON.stringify(value)}
                      </p>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
