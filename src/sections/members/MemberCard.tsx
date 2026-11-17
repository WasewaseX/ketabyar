import { Archive, Phone } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import type { Member, MemberStatus } from "../../types";
import { formatMemberNumber } from "../../utils/isbn";
import { getMemberInitials, MemberStatusBadge } from "./memberHelpers";
import { STATUSES } from "./membersShared";

/** One member card: overlay-button pattern, status badge and context menu. */
export function MemberCard({
  member,
  selected,
  onToggle,
  onOpen,
  showContextMenu,
  setStatus,
  archive,
}: {
  member: Member;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  showContextMenu: (
    event: ReactMouseEvent,
    items: ContextMenuItem[],
    options?: { title?: string },
  ) => void;
  setStatus: {
    mutate: (input: { member: Member; status: MemberStatus }) => void;
  };
  archive: { mutate: (id: string) => void };
}) {
  const { t } = useTranslation();
  return (
    <div className="relative cursor-pointer rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 pt-8 shadow-card transition hover:border-accent/30 dark:border-white/8 dark:bg-[#1b2723] dark:hover:border-accent-dark/30">
      {/* Overlay button: opens the profile for the whole card while the
          checkbox stays a sibling — a native button cannot contain an input,
          and role="button" on the card trips prefer-tag-over-role. Positioned
          children paint above the transparent button; plain content sits
          underneath it, so every click lands on the card action. */}
      <button
        type="button"
        aria-label={member.full_name}
        onClick={onOpen}
        onContextMenu={(event) =>
          showContextMenu(
            event,
            [
              {
                id: "view",
                label: t("members.viewDetails", "View details"),
                onClick: onOpen,
              },
              {
                id: "copyNum",
                label: t("members.copyNumber", "Copy member number"),
                onClick: () => {
                  void navigator.clipboard.writeText(member.member_number);
                  toast.success(
                    t("members.copiedNumber", "Member number copied"),
                  );
                },
              },
              ...(member.email
                ? [
                    {
                      id: "copyEmail",
                      label: t("members.copyEmail", "Copy email"),
                      onClick: () => {
                        void navigator.clipboard.writeText(member.email ?? "");
                        toast.success(t("members.copiedEmail", "Email copied"));
                      },
                    },
                  ]
                : []),
              ...(member.phone
                ? [
                    {
                      id: "copyPhone",
                      label: t("members.copyPhone", "Copy phone"),
                      onClick: () => {
                        void navigator.clipboard.writeText(member.phone ?? "");
                        toast.success(t("members.copiedPhone", "Phone copied"));
                      },
                    },
                  ]
                : []),
              { id: "d", divider: true },
              ...STATUSES.filter((status) => status !== member.status).map(
                (status) => ({
                  id: `set-${status}`,
                  label: t(
                    `members.set${status[0].toUpperCase()}${status.slice(1)}`,
                    status,
                  ),
                  onClick: () => setStatus.mutate({ member, status }),
                }),
              ),
              { id: "d2", divider: true },
              {
                id: "archive",
                label: t("members.deleteMember", "Archive member"),
                icon: Archive,
                variant: "danger",
                onClick: () => {
                  if (
                    window.confirm(
                      t(
                        "members.confirmDelete",
                        'Archive "{{name}}"? Their history is retained.',
                        { name: member.full_name },
                      ),
                    )
                  )
                    archive.mutate(member.id);
                },
              },
            ],
            { title: member.full_name },
          )
        }
        className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-accent-dark"
      />
      <div className="absolute end-3 top-3">
        <MemberStatusBadge status={member.status} />
      </div>
      <input
        type="checkbox"
        className="absolute start-3 top-3"
        aria-label={t("members.selectRow", "Select member {{name}}", {
          name: member.full_name,
        })}
        checked={selected}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <div className="flex items-center gap-3">
        {member.avatar_path ? (
          <img
            src={member.avatar_path}
            alt=""
            className="h-12 w-12 rounded-full object-cover ring-2 ring-accent/20"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-copper text-sm font-bold text-white">
            {getMemberInitials(member.full_name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{member.full_name}</p>
          <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">
            {formatMemberNumber(member.member_number)}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-0.5 text-[11px] text-ink/60 dark:text-ivory/60">
        <p>
          {t(`members.roles.${member.role ?? "other"}`, member.role ?? "")}
          {member.department ? ` · ${member.department}` : ""}
        </p>
        {member.phone ? (
          <p className="flex items-center gap-1">
            <Phone size={10} /> {member.phone}
          </p>
        ) : null}
      </div>
    </div>
  );
}
