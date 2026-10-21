export interface Titleable {
  title: string;
  arabic_title?: string | null;
  subtitle?: string | null;
}

export interface DisplayTitleResult {
  main: string;
  sub?: string;
}

/**
 * Picks which title leads, honouring the operator's display preference:
 *  • "original" → catalog title first, Arabic title / subtitle underneath.
 *  • "arabic"   → Arabic title first when present, catalog title underneath.
 */
export function getDisplayTitle(item: Titleable, preference: "original" | "arabic" = "original"): DisplayTitleResult {
  const arabic = item.arabic_title?.trim() ?? "";

  if (preference === "arabic" && arabic) {
    const main = arabic;
    const sub = item.title !== main ? item.title : item.subtitle || undefined;
    return { main, sub };
  }

  const sub = arabic || item.subtitle || undefined;
  return { main: item.title, sub };
}
