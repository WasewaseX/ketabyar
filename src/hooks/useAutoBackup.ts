import { useEffect } from "react";
import { startAutoBackupScheduler } from "../data/autoBackup";

/** Runs the local auto-backup scheduler while the shell is mounted. */
export function useAutoBackupScheduler() {
  useEffect(() => startAutoBackupScheduler(), []);
}
