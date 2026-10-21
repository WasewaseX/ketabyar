/**
 * Turns live Recharts `<svg>` elements into PNG data URLs so reports can
 * embed them. Computed styles must be copied onto the clone because
 * `currentColor` and CSS custom properties do not survive serialization.
 */

const COPY_PROPERTIES = [
  "fill", "stroke", "stop-color", "color", "opacity",
  "stroke-width", "font-size", "font-family", "font-weight",
] as const;

function inlineStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source);
  for (const property of COPY_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (value && "style" in target) (target as SVGElement).style.setProperty(property, value);
  }
  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  for (let i = 0; i < sourceChildren.length; i++) {
    const child = targetChildren[i];
    if (child) inlineStyles(sourceChildren[i], child);
  }
}

/** Rasterises the first `<svg>` inside `container` at 2× on a white card. */
export async function captureChart(
  container: HTMLDivElement | null | undefined,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!container) return null;
  const svg = container.querySelector("svg");
  if (!svg) return null;

  try {
    const rect = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    inlineStyles(svg, clone);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(rect.width));
    clone.setAttribute("height", String(rect.height));

    const markup = new XMLSerializer().serializeToString(clone);
    const blobUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("chart rasterisation failed"));
      image.src = blobUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(blobUrl);

    return { dataUrl: canvas.toDataURL("image/png"), width: rect.width, height: rect.height };
  } catch (error) {
    console.error("captureChart failed", error);
    return null;
  }
}

/** Lets Recharts finish its entrance animation before a capture. */
export async function waitForChartsToSettle(delayMs = 350): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
