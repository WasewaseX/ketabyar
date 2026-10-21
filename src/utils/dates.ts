import { addDays, differenceInCalendarDays, format } from "date-fns";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";

/**
 * Date helpers used across KetabYar.
 *
 * Timestamps are stored in the local SQLite database as ISO strings (UTC).
 * Display, however, follows the institution's configured date format and
 * timezone, and Persian users get native Solar Hijri (Jalali) rendering
 * through Intl's fa-IR calendar.
 */

const ACCEPTED_FORMATS = ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"] as const;

/** Today as a local `yyyy-MM-dd` string. */
export function today(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** A due date `days` calendar days from now, as `yyyy-MM-dd`. */
export function dueDate(days: number): string {
  return format(addDays(new Date(), days), "yyyy-MM-dd");
}

/** Whole calendar days past the due date — never negative. */
export function daysLate(due: string): number {
  const dueStart = new Date(`${due.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dueStart.getTime())) return 0;
  return Math.max(0, differenceInCalendarDays(new Date(), dueStart));
}

function readLocale(): string {
  try {
    const stored = localStorage.getItem("ketabyar-preferences");
    if (stored) {
      const prefs = JSON.parse(stored) as { locale?: string };
      if (prefs.locale) return prefs.locale;
    }
  } catch {
    /* preferences unreadable — fall through to the default */
  }
  return "fa";
}

/**
 * Renders any stored timestamp for the operator:
 *  • `fa` → native Jalali date + Persian digits via Intl fa-IR.
 *  • others → institution format + configured timezone via date-fns tokens.
 * Returns "" for empty or unparseable input.
 */
export function formatDisplayDate(dateInput: string | null | undefined): string {
  if (!dateInput) return "";
  let date = new Date(dateInput);
  if (Number.isNaN(date.getTime()) && !dateInput.includes("T")) {
    date = new Date(`${dateInput}T00:00:00`);
  }
  if (Number.isNaN(date.getTime())) return "";

  const locale = readLocale();
  const settings = useLibrarySettingsStore.getState().settings;
  const timezone = settings.timezone || "Asia/Tehran";
  const token = (ACCEPTED_FORMATS as readonly string[]).includes(settings.date_format)
    ? settings.date_format
    : "dd/MM/yyyy";

  try {
    if (locale === "fa") {
      return new Intl.DateTimeFormat("fa-IR", {
        timeZone: timezone,
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    }
    // Materialise the wall-clock time in the institution's timezone, then
    // format that wall clock with the configured token.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(date);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    const wallClock = new Date(
      Number(pick("year")),
      Number(pick("month")) - 1,
      Number(pick("day")),
      Number(pick("hour")) % 24,
      Number(pick("minute")),
      Number(pick("second")),
    );
    return format(wallClock, token);
  } catch {
    try {
      return format(date, token);
    } catch {
      return "";
    }
  }
}
