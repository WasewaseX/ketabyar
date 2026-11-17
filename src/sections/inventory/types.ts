import type { Copy, Shelf } from "../../types";

export type ShelfWithCopies = Shelf & { copies: Copy[] };

/** One row of the shelf-audit scan session. */
export type ScanResult = {
  barcode: string;
  status: "found" | "misplaced" | "unknown";
  copy?: Copy;
  expected?: string | null;
};
