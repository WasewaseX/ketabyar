import { useTranslation } from "react-i18next";
import type { Copy, Shelf } from "../../types";
import { cn } from "../../utils/cn";

export function occupancyTone(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-accent dark:bg-accent-dark";
}

/** Deterministic mini-drawing of a shelf's spines — original artwork. */
function ShelfSpines({
  copyCount,
  capacity,
  tone,
}: {
  copyCount: number;
  capacity: number;
  tone: "good" | "warn" | "alert";
}) {
  const slots = 27;
  const colors = { good: "#478574", warn: "#d2ae96", alert: "#a87c5f" };
  const filled = Math.round(
    Math.min(1, capacity > 0 ? copyCount / capacity : 0) * slots,
  );
  return (
    <svg viewBox="0 0 84 42" className="h-14 w-full" aria-hidden>
      {Array.from({ length: slots }).map((_, index) => {
        const column = index % 9;
        const row = Math.floor(index / 9);
        const height = 10 + ((index * 7) % 5);
        const isFilled = index < filled;
        return (
          <rect
            key={index}
            x={column * 9 + 2}
            y={row * 14 + 2 + (12 - height)}
            width={7}
            height={height}
            rx={1}
            fill={isFilled ? colors[tone] : "#dde5e2"}
            opacity={isFilled ? 1 : 0.55}
          />
        );
      })}
    </svg>
  );
}

/** One shelf cell of the stack map: spine drawing, code and occupancy. */
export function ShelfCell({
  shelf,
  selected,
  onSelect,
  floor,
}: {
  shelf: Shelf & { copies: Copy[] };
  selected: boolean;
  onSelect: () => void;
  floor?: boolean;
}) {
  const { t } = useTranslation();
  const count = shelf.copies.length || shelf.copy_count || 0;
  const pctValue = shelf.capacity > 0 ? (count / shelf.capacity) * 100 : 0;
  const hasMissing = shelf.copies.some(
    (copy) => copy.status === "lost" || copy.status === "repair",
  );
  const hasWorn = shelf.copies.some(
    (copy) =>
      copy.condition === "worn" ||
      copy.condition === "fair" ||
      copy.condition === "damaged",
  );
  const tone = hasMissing ? "alert" : hasWorn ? "warn" : "good";
  return (
    <button
      type="button"
      onClick={onSelect}
      title={
        floor
          ? t(
              "inventory.floorShelfHint",
              "Oversized floor-level shelf for large items",
            )
          : undefined
      }
      className={cn(
        "relative rounded-lg border p-1 text-start transition",
        selected
          ? "border-copper ring-2 ring-copper"
          : "border-ink/10 hover:border-copper/50 dark:border-white/10",
      )}
    >
      <ShelfSpines copyCount={count} capacity={shelf.capacity} tone={tone} />
      <div className="flex items-center justify-between px-1 pb-0.5 text-[9px] font-bold text-ink/55 dark:text-ivory/55">
        <span>
          {shelf.code}
          {floor ? ` · ${t("inventory.floorShelf", "Floor")}` : ""}
        </span>
        <span
          className={cn("h-1.5 w-1.5 rounded-full", occupancyTone(pctValue))}
        />
        <span className="tabular-nums">
          {count}/{shelf.capacity}
        </span>
      </div>
    </button>
  );
}
