import type { TFunction } from "i18next";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { updateCopy } from "../../data/repositories/library";
import type { Copy } from "../../types";

/**
 * The copy status context menu: every status the row can switch to (skipping
 * its current one), then the archive action, exactly as the table rows and
 * the list view both show them.
 */
export function copyMenuItems(
  copy: Copy,
  t: TFunction<"translation", undefined>,
  invalidate: () => void,
  copyDelete: (id: string) => void,
): ContextMenuItem[] {
  const statusOption = (
    id: string,
    labelKey: string,
    fallback: string,
    status: Copy["status"],
  ): ContextMenuItem | null =>
    copy.status === status
      ? null
      : {
          id,
          label: t(labelKey, fallback),
          onClick: () => updateCopy(copy.id, { status }).then(invalidate),
        };

  const items: ContextMenuItem[] = [];
  for (const option of [
    statusOption(
      "avail",
      "inventory.setAvailable",
      "Set available",
      "available",
    ),
    statusOption("loan", "inventory.setLoaned", "Set on loan", "on-loan"),
    statusOption("repair", "inventory.setRepair", "Set in repair", "repair"),
    statusOption("lost", "inventory.setLost", "Set lost", "lost"),
  ]) {
    if (option) items.push(option);
  }
  items.push({ id: "d", divider: true });
  items.push({
    id: "delete",
    label: t("inventory.deleteCopy", "Archive copy"),
    variant: "danger",
    onClick: () => {
      if (
        window.confirm(
          t("inventory.archiveConfirm", "Archive copy {{barcode}}?", {
            barcode: copy.barcode,
          }),
        )
      )
        copyDelete(copy.id);
    },
  });
  return items;
}
