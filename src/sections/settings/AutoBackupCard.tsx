import { useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listSnapshots,
  restoreSnapshot,
  runAutoBackup,
} from "../../data/autoBackup";
import { useQuery } from "../../hooks/useLibraryQuery";
import { Card } from "./settingsShared";

/**
 * Automatic local snapshots: status, a manual "back up now", and restore.
 * Shown in Settings › Backup & restore above the manual JSON export card.
 */
export function AutoBackupCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const snapshots = useQuery({
    queryKey: ["autoSnapshots"],
    queryFn: listSnapshots,
  });
  const list = snapshots.data ?? [];

  const backUpNow = async () => {
    try {
      const result = await runAutoBackup();
      toast.success(
        result.saved
          ? t("settings.backup.autoSaved")
          : t("settings.backup.autoUpToDate"),
      );
      await queryClient.invalidateQueries({ queryKey: ["autoSnapshots"] });
    } catch (error) {
      toast.error(
        t("settings.backup.autoFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  const restore = async (key: string) => {
    if (!window.confirm(t("settings.backup.autoRestoreConfirm"))) return;
    try {
      const result = await restoreSnapshot(key);
      toast.success(
        t("settings.backup.autoRestored", {
          count: Object.values(result).reduce((sum, n) => sum + n, 0),
        }),
      );
      void queryClient.invalidateQueries();
    } catch (error) {
      toast.error(
        t("settings.backup.autoFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  return (
    <Card
      title={t("settings.backup.autoTitle")}
      desc={t("settings.backup.autoDesc")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void backUpNow()}
          className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white dark:bg-accent-dark"
        >
          <DatabaseBackup size={14} /> {t("settings.backup.autoNow")}
        </button>
        <span className="text-xs text-ink/50 dark:text-ivory/50">
          {list.length > 0
            ? t("settings.backup.autoLast", {
                time: new Date(list[0].exportedAt).toLocaleString(),
              })
            : t("settings.backup.autoNever")}
        </span>
      </div>
      {list.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {list.slice(0, 5).map((snapshot) => (
            <li
              key={snapshot.key}
              className="flex items-center justify-between rounded-xl bg-ink/4 px-3 py-2 text-xs dark:bg-ivory/6"
            >
              <span className="text-ink/70 dark:text-ivory/70">
                {new Date(snapshot.exportedAt).toLocaleString()} ·{" "}
                {(snapshot.bytes / 1024).toFixed(1)} KB
              </span>
              <button
                type="button"
                onClick={() => void restore(snapshot.key)}
                className="inline-flex items-center gap-1 font-semibold text-accent hover:underline dark:text-accent-dark"
              >
                <RotateCcw size={12} /> {t("settings.backup.autoRestore")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
