import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { updateCopy } from "../../data/repositories/library";
import type { Copy, Shelf } from "../../types";
import { cleanBarcode } from "../../utils/isbn";
import type { ScanResult } from "./types";

/**
 * The shelf-audit scan session: target shelf, barcode intake with
 * found/misplaced/unknown classification, and the finish pass that re-shelves
 * misplaced items.
 */
export function useScanSession(deps: {
  allCopies: Copy[];
  allShelves: Shelf[];
  invalidate: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [paused, setPaused] = useState(false);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<ScanResult[]>([]);
  const scannerRef = useRef<HTMLInputElement | null>(null);

  // Scan-mode screen: the scanner input owns the keyboard on entry (the
  // autoFocus attribute is intentionally avoided — see Biome a11y).
  useEffect(() => {
    if (!paused) scannerRef.current?.focus();
  }, [paused]);

  const begin = (code: string) => {
    if (!code.trim()) {
      toast.warning(
        t("inventory.alerts.specifyShelf", "Type or pick the shelf code first"),
      );
      return;
    }
    setTarget(code.trim().toUpperCase());
    setResults([]);
    setPaused(false);
    setOpen(true);
  };

  const submit = () => {
    if (paused) return;
    const value = cleanBarcode(input);
    if (!value) return;
    if (results.some((result) => result.barcode === value)) {
      toast.warning(
        t(
          "inventory.alerts.alreadyScanned",
          "This barcode was already scanned",
        ),
      );
      setInput("");
      return;
    }
    const match = deps.allCopies.find(
      (copy) =>
        copy.barcode.toUpperCase() === value ||
        copy.accession_number.toUpperCase() === value,
    );
    if (!match) {
      setResults((prev) => [{ barcode: value, status: "unknown" }, ...prev]);
      toast.error(t("inventory.alerts.notRecognized", "Unknown item"));
    } else if ((match.shelf ?? "").toUpperCase() === target) {
      setResults((prev) => [
        { barcode: value, status: "found", copy: match },
        ...prev,
      ]);
      toast.success(t("inventory.alerts.scannedSuccess", "On the right shelf"));
    } else {
      setResults((prev) => [
        {
          barcode: value,
          status: "misplaced",
          copy: match,
          expected: match.shelf,
        },
        ...prev,
      ]);
      toast.info(t("inventory.wrongShelfLabel", "Wrong shelf"));
    }
    setInput("");
    scannerRef.current?.focus();
  };

  const finish = async () => {
    const targetShelf = deps.allShelves.find(
      (shelf) => shelf.code.toUpperCase() === target,
    );
    let moved = 0;
    for (const result of results) {
      if (result.status === "misplaced" && result.copy) {
        await updateCopy(result.copy.id, { shelfId: targetShelf?.id ?? null });
        moved += 1;
      }
    }
    toast.success(
      t(
        "inventory.alerts.auditComplete",
        "Audit complete — {{moved}} item(s) re-shelved",
        { moved },
      ),
    );
    setOpen(false);
    setTarget("");
    setResults([]);
    deps.invalidate();
  };

  const discard = () => {
    setOpen(false);
    setResults([]);
  };

  const targetCopies = deps.allCopies.filter(
    (copy) => (copy.shelf ?? "").toUpperCase() === target,
  ).length;
  const progress =
    targetCopies > 0
      ? Math.min(
          100,
          Math.round(
            (results.filter((result) => result.status !== "unknown").length /
              targetCopies) *
              100,
          ),
        )
      : 0;

  return {
    open,
    paused,
    togglePaused: () => setPaused((value) => !value),
    target,
    progress,
    input,
    setInput,
    submit,
    results,
    finish: () => void finish(),
    discard,
    onScannerMount: (element: HTMLInputElement | null) => {
      scannerRef.current = element;
    },
    begin,
  };
}

export type ScanSession = ReturnType<typeof useScanSession>;
