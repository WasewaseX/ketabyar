import { useEffect } from "react";
import { startAutoBackupScheduler } from "../data/autoBackup";

/**
 * Runs the local auto-backup scheduler while the shell is mounted.
 * Desktop-runtime feature only: under vitest the database is a scripted
 * mock whose query responses would be consumed by the backup's own
 * SELECTs, so the scheduler stays off in tests.
 */
export function useAutoBackupScheduler() {
  useEffect(() => {
    if (typeof process !== "undefined" && process.env?.VITEST) return undefined;
    return startAutoBackupScheduler();
  }, []);
}
