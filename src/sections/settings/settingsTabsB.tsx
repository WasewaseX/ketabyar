import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  exportLibraryBackup,
  importLibraryBackup,
} from "../../data/repositories/library";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import { Card, Stepper, Toggle } from "./settingsShared";

export function RulesTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const update = useLibrarySettingsStore((state) => state.update);

  return (
    <>
      <Card title={t("settings.rules.paramsTitle", "Core parameters")}>
        <div className="grid gap-2 md:grid-cols-2">
          <Stepper
            value={settings.loan_days}
            min={1}
            max={365}
            onChange={(value) => void update({ loan_days: value })}
            label={t("settings.rules.loanPeriod", "Loan period (days)")}
          />
          <Stepper
            value={settings.loan_limit}
            min={1}
            max={50}
            onChange={(value) => void update({ loan_limit: value })}
            label={t("settings.rules.loanLimit", "Concurrent loans per member")}
          />
          <Stepper
            value={settings.renew_limit}
            min={0}
            max={10}
            onChange={(value) => void update({ renew_limit: value })}
            label={t("settings.rules.renewLimit", "Renewals allowed")}
          />
          <Stepper
            value={settings.reservation_hold_days}
            min={1}
            max={30}
            onChange={(value) => void update({ reservation_hold_days: value })}
            label={t("settings.rules.holdPeriod", "Hold pickup window (days)")}
          />
        </div>
      </Card>

      <Card
        title={t("settings.rules.scopeDurationsTitle", "Scope durations")}
        desc={t(
          "settings.rules.scopeDurationsHelp",
          "Internal = read in the library; visitors and single-copy titles are internal-only.",
        )}
      >
        <div className="grid gap-2 md:grid-cols-2">
          <Stepper
            value={settings.reservation_internal_days}
            min={1}
            max={7}
            onChange={(value) =>
              void update({ reservation_internal_days: value })
            }
            label={t("settings.rules.internalDays", "Internal loan (days)")}
          />
          <Stepper
            value={settings.reservation_external_days}
            min={1}
            max={90}
            onChange={(value) =>
              void update({ reservation_external_days: value })
            }
            label={t("settings.rules.externalDays", "External loan (days)")}
          />
        </div>
      </Card>

      <Card title={t("settings.rules.shelvingTitle", "Shelving")}>
        <Stepper
          value={settings.shelf_row_count}
          min={1}
          max={18}
          onChange={(value) => void update({ shelf_row_count: value })}
          label={t(
            "settings.rules.shelfRowCount",
            "Lettered rows per bookcase",
          )}
          hint={t(
            "settings.rules.shelfRowCountHelp",
            "Row A… up to this count; S stays reserved for the floor shelf.",
          )}
        />
      </Card>

      <Card title={t("settings.rules.gracePeriodTitle", "Grace period")}>
        <Toggle
          checked={settings.grace_period_enabled}
          onChange={(value) => void update({ grace_period_enabled: value })}
          label={t("settings.rules.enableGracePeriod", "Enable a grace period")}
          desc={t(
            "settings.rules.enableGracePeriodDesc",
            "Overdue flags and fines wait this many days past the due date.",
          )}
        />
        {settings.grace_period_enabled ? (
          <div className="mt-3">
            <Stepper
              value={settings.grace_period_days}
              min={1}
              max={14}
              onChange={(value) => void update({ grace_period_days: value })}
              label={t("settings.rules.gracePeriodLength", "Grace days")}
            />
          </div>
        ) : null}
      </Card>

      <Card title={t("settings.rules.finesTitle", "Fines")}>
        <Toggle
          checked={settings.fines_enabled}
          onChange={(value) => void update({ fines_enabled: value })}
          label={t("settings.rules.finesEnabled", "Charge overdue fines")}
        />
        {settings.fines_enabled ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Stepper
              value={settings.fine_per_day}
              min={0}
              max={1_000_000}
              onChange={(value) => void update({ fine_per_day: value })}
              label={t("settings.rules.finePerDay", "Fine per day")}
            />
            <Stepper
              value={settings.max_fine_amount}
              min={0}
              max={100_000_000}
              onChange={(value) => void update({ max_fine_amount: value })}
              label={t("settings.rules.maxFine", "Maximum fine (0 = uncapped)")}
            />
          </div>
        ) : null}
      </Card>
    </>
  );
}

/* ── Notifications ───────────────────────────────────────────────────── */

export function NotificationsTab() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const update = useLibrarySettingsStore((state) => state.update);

  return (
    <Card
      title={t("settings.notifications.remindersTitle", "Reminders")}
      desc={t(
        "settings.notifications.tip",
        "These drive the bell badge and the due-soon states across the app.",
      )}
    >
      <div className="space-y-3">
        <Toggle
          checked={settings.notify_overdue}
          onChange={(value) => void update({ notify_overdue: value })}
          label={t("settings.notifications.overdueAlerts", "Overdue alerts")}
          desc={t(
            "settings.notifications.overdueAlertsDesc",
            "Flag loans the day after the due date (after grace).",
          )}
        />
        <Toggle
          checked={settings.notify_due_soon}
          onChange={(value) => void update({ notify_due_soon: value })}
          label={t(
            "settings.notifications.dueSoonReminders",
            "Due-soon reminders",
          )}
        />
        {settings.notify_due_soon ? (
          <Stepper
            value={settings.notify_due_soon_days}
            min={1}
            max={14}
            onChange={(value) => void update({ notify_due_soon_days: value })}
            label={t(
              "settings.notifications.dueSoonDays",
              "Days before due date",
            )}
          />
        ) : null}
        <Toggle
          checked={settings.notify_ready}
          onChange={(value) => void update({ notify_ready: value })}
          label={t(
            "settings.notifications.readyAlerts",
            "Ready-for-pickup alerts",
          )}
          desc={t(
            "settings.notifications.readyAlertsDesc",
            "Notify when a hold is waiting on the shelf.",
          )}
        />
      </div>
    </Card>
  );
}

/* ── Backup & restore ────────────────────────────────────────────────── */

/** One-table JSON import: validate generic rows, merge, toast the count. */
function SingleTableImport({
  label,
  table,
  successKey,
  successFallback,
}: {
  label: string;
  table: "books" | "members";
  successKey: string;
  successFallback: string;
}) {
  const { t } = useTranslation();
  return (
    <ImportJsonButton
      label={label}
      validate={(parsed) =>
        Array.isArray(parsed) && parsed.every((row) => typeof row === "object")
      }
      onImport={async (rows) => {
        const result = await importLibraryBackup({
          _version: 1,
          _exported_at: new Date().toISOString(),
          tables: { [table]: rows },
        });
        toast.success(
          t(successKey, successFallback, { count: result[table] ?? 0 }),
        );
      }}
    />
  );
}

export function BackupTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const exportBackup = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: `ketabyar-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      const backup = await exportLibraryBackup();
      await writeTextFile(path, JSON.stringify(backup, null, 2));
      toast.success(t("settings.backup.fullExportSuccess", "Backup saved"), {
        duration: 8000,
        action: {
          label: t("common.openFolder", "Open folder"),
          onClick: async () => {
            try {
              const { revealItemInDir } = await import(
                "@tauri-apps/plugin-opener"
              );
              await revealItemInDir(path);
            } catch {
              /* browser */
            }
          },
        },
      });
    } catch (error) {
      toast.error(
        t("settings.backup.fullExportError", "Backup failed: {{message}}", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  const restoreBackup = async () => {
    if (
      !window.confirm(
        t(
          "settings.backup.fullRestoreWarn",
          "Restoring overwrites every matching row by ID. Continue?",
        ),
      )
    )
      return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || typeof path !== "string") return;
      const parsed = JSON.parse(await readTextFile(path));
      if (!parsed?.tables) {
        toast.error(
          t(
            "settings.backup.fullRestoreInvalidFile",
            "That file is not a KetabYar backup.",
          ),
        );
        return;
      }
      const result = await importLibraryBackup(parsed);
      toast.success(
        t("settings.backup.fullRestoreSuccess", "Restored {{count}} rows", {
          count: Object.values(result).reduce((sum, n) => sum + n, 0),
        }),
      );
      void queryClient.invalidateQueries();
    } catch (error) {
      toast.error(
        t("settings.backup.fullRestoreError", "Restore failed: {{message}}", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  return (
    <>
      <Card
        title={t("settings.backup.fullBackupTitle", "Full backup")}
        desc={t(
          "settings.backup.fullBackupDesc",
          "Every table in one JSON file. Keep a copy on a USB drive.",
        )}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportBackup()}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white dark:bg-accent-dark"
          >
            <Download size={15} />{" "}
            {t("settings.backup.fullExportBtn", "Export backup")}
          </button>
          <button
            type="button"
            onClick={() => void restoreBackup()}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/6 px-4 py-2 text-sm font-semibold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
          >
            <Upload size={15} />{" "}
            {t("settings.backup.fullRestoreBtn", "Restore from backup")}
          </button>
        </div>
      </Card>
      <Card
        desc={t(
          "settings.backup.importHint",
          "Migrating from a spreadsheet? Books and members accept plain JSON arrays.",
        )}
        title={t(
          "settings.backup.importBooksTitle",
          "Import books / members (JSON)",
        )}
      >
        <SingleTableImport
          label={t("settings.backup.importBooks", "Import books JSON")}
          table="books"
          successKey="settings.backup.importBooksSuccess"
          successFallback="Imported {{count}} books"
        />
        <SingleTableImport
          label={t("settings.backup.importMembers", "Import members JSON")}
          table="members"
          successKey="settings.backup.importMembersSuccess"
          successFallback="Imported {{count}} members"
        />
      </Card>
    </>
  );
}

export function ImportJsonButton({
  label,
  validate,
  onImport,
}: {
  label: string;
  validate: (parsed: unknown) => boolean;
  onImport: (rows: Record<string, unknown>[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const handle = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || typeof path !== "string") return;
      const parsed = JSON.parse(await readTextFile(path));
      if (!validate(parsed)) {
        toast.error(t("settings.backup.invalidJson", "Unexpected JSON shape."));
        return;
      }
      await onImport(parsed as Record<string, unknown>[]);
      void queryClient.invalidateQueries();
    } catch (error) {
      toast.error(
        t("settings.backup.importFailed", "Import failed: {{message}}", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };
  return (
    <button
      type="button"
      onClick={() => void handle()}
      className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/6 px-4 py-2 text-sm font-semibold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
    >
      <Upload size={15} /> {label}
    </button>
  );
}

/* ── Database ────────────────────────────────────────────────────────── */
