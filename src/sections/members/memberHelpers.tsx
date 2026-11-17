import { Archive, Clock, UserCheck, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";

export function MemberStatusBadge({
  status,
  iconOnly,
}: {
  status: string;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const map: Record<string, { icon: typeof UserCheck; tone: string }> = {
    active: {
      icon: UserCheck,
      tone: "bg-accent/12 text-accent dark:text-accent-dark",
    },
    suspended: { icon: UserX, tone: "bg-red-600/10 text-red-600" },
    expired: { icon: Clock, tone: "bg-amber-500/12 text-amber-600" },
    archived: {
      icon: Archive,
      tone: "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55",
    },
  };
  const entry = map[status] ?? map.archived;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        entry.tone,
      )}
      title={t(`members.${status}`, status)}
    >
      <entry.icon size={11} />
      {!iconOnly ? t(`members.${status}`, status) : null}
    </span>
  );
}

export function splitFullName(fullName: string): {
  first: string;
  last: string;
} {
  const parts = fullName.trim().split(/\s+/);
  return {
    first: parts[0] ?? "",
    last: (parts.slice(1).join(" ") || "").toUpperCase(),
  };
}

export function formatMemberShortName(fullName: string): string {
  const { first, last } = splitFullName(fullName);
  if (!first) return last || "—";
  return last ? `${first[0]}. ${last}` : first;
}

export function getMemberInitials(fullName: string): string {
  const { first, last } = splitFullName(fullName);
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "ک";
}
