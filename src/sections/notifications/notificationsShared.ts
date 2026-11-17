import type { Kind } from "./useNotificationFeed";

export const KIND_TONES: Record<Kind, string> = {
  overdue: "bg-red-600/10 text-red-600",
  duesoon: "bg-amber-500/12 text-amber-600",
  ready: "bg-accent/10 text-accent dark:text-accent-dark",
  system: "bg-ink/8 text-ink/60 dark:bg-white/10 dark:text-ivory/60",
};

export function kindLabel(
  kind: Kind,
  t: (key: string, fallback: string) => string,
): string {
  if (kind === "overdue") return t("notificationsPage.kindOverdue", "Overdue");
  if (kind === "duesoon") return t("notificationsPage.kindDueSoon", "Due soon");
  if (kind === "ready")
    return t("notificationsPage.kindReady", "Ready for pickup");
  return t("notificationsPage.kindSystem", "System");
}
