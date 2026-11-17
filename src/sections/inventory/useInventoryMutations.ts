import {
  createShelf,
  deleteColumn,
  deleteCopy,
} from "../../data/repositories/library";
import { useNotifyMutation } from "./useNotifyMutation";

/**
 * The three stack mutations (delete bookcase, archive copy, add shelf)
 * with their success toasts; invalidation is handled by the wrapper.
 */
export function useInventoryMutations() {
  const columnDelete = useNotifyMutation({
    mutationFn: (id: string) => deleteColumn(id),
    successKey: "inventory.columnDeleted",
    fallback: "Bookcase deleted",
  });
  const copyDelete = useNotifyMutation({
    mutationFn: (id: string) => deleteCopy(id),
    successKey: "inventory.copyDeleted",
    fallback: "Copy archived",
  });
  const shelfCreate = useNotifyMutation({
    mutationFn: (input: {
      columnId: string;
      code: string;
      shelfType: "top" | "floor";
    }) => createShelf(input.columnId, input.code, input.shelfType),
    successKey: "inventory.shelfAdded",
    fallback: "Shelf added",
  });
  return { columnDelete, copyDelete, shelfCreate };
}
