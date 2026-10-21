import { Crop, Trash2, Upload, ZoomIn } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../../utils/cn";
import { Button } from "./primitives";

/**
 * Image picker with a pan-and-zoom crop stage. Produces a JPEG data URL
 * (never touches the filesystem — persistence belongs to the owning form).
 * Inside Tauri the file dialog + fs plugin are used; in a plain browser,
 * drag-and-drop or an <input type=file>.
 */

type Shape = "circle" | "cover" | "rect";

const SHAPE_PREVIEW: Record<Shape, string> = {
  circle: "h-20 w-20 rounded-full",
  rect: "h-20 w-32 aspect-[1.6] rounded-[var(--radius-control)]",
  cover: "aspect-[2/3] w-[132px] rounded-[var(--radius-control)]",
};

const SHAPE_CROP: Record<Shape, { w: number; h: number; radius: number; canvas: [number, number] }> = {
  circle: { w: 200, h: 200, radius: 100, canvas: [300, 300] },
  rect: { w: 280, h: 175, radius: 10, canvas: [480, 300] },
  cover: { w: 200, h: 300, radius: 10, canvas: [360, 540] },
};

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function mimeFor(path: string): string {
  if (path.toLowerCase().endsWith(".png")) return "image/png";
  if (path.toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

export function ImageUpload({
  value,
  onChange,
  shape = "cover",
  fallbackInitials,
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
  shape?: Shape;
  label?: string;
  fallbackInitials?: string;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  async function readNativeFile(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const picked = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!picked || typeof picked !== "string") return null;
    const bytes = await readFile(picked);
    return bytesToDataUrl(new Uint8Array(bytes), mimeFor(picked));
  }

  async function acceptFile(file?: File | null) {
    try {
      let dataUrl: string | null = null;
      if (file) {
        if (!file.type.startsWith("image/")) {
          toast.warning(t("common.uploadImageFileType", "Only image files are accepted."));
          return;
        }
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      } else if (isTauri()) {
        dataUrl = await readNativeFile();
      }
      if (!dataUrl) return;
      setOriginal(dataUrl);
      setOffset({ x: 0, y: 0 });
      setZoom(1);
      setCropping(true);
    } catch (error) {
      console.error(error);
      toast.error(t("common.readImageFailed", "The image could not be read."));
    }
  }

  function applyCrop() {
    if (!original) return;
    const crop = SHAPE_CROP[shape];
    const stage = 320;
    const image = new Image();
    image.onload = () => {
      try {
        // 1) Paint the transformed image onto a stage-sized canvas.
        const stageCanvas = document.createElement("canvas");
        stageCanvas.width = stage;
        stageCanvas.height = stage;
        const stageCtx = stageCanvas.getContext("2d");
        if (!stageCtx) throw new Error("canvas unavailable");
        stageCtx.fillStyle = "#ffffff";
        stageCtx.fillRect(0, 0, stage, stage);
        const fit = Math.min(stage / image.width, stage / image.height);
        const drawWidth = image.width * fit * zoom;
        const drawHeight = image.height * fit * zoom;
        stageCtx.drawImage(
          image,
          (stage - drawWidth) / 2 + offset.x,
          (stage - drawHeight) / 2 + offset.y,
          drawWidth,
          drawHeight,
        );

        // 2) Cut the centred crop window out of the stage at output size.
        const output = document.createElement("canvas");
        output.width = crop.canvas[0];
        output.height = crop.canvas[1];
        const outCtx = output.getContext("2d");
        if (!outCtx) throw new Error("canvas unavailable");
        outCtx.drawImage(
          stageCanvas,
          (stage - crop.w) / 2,
          (stage - crop.h) / 2,
          crop.w,
          crop.h,
          0,
          0,
          output.width,
          output.height,
        );
        onChange(output.toDataURL("image/jpeg", 0.75));
        setCropping(false);
      } catch {
        onChange(original);
        setCropping(false);
      }
    };
    image.src = original;
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn("relative overflow-hidden border border-ink/12 bg-ivory dark:border-white/12 dark:bg-ink", SHAPE_PREVIEW[shape])}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void acceptFile(event.dataTransfer.files?.[0]);
        }}
      >
        {value ? (
          <>
            <img src={value} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition hover:opacity-100">
              <button
                type="button"
                aria-label={t("common.recropImage", "Recrop")}
                className="rounded-full bg-white/90 p-2 text-ink hover:bg-white"
                onClick={() => {
                  const source = original ?? value;
                  if (source) {
                    setOriginal(source);
                    setOffset({ x: 0, y: 0 });
                    setZoom(1);
                    setCropping(true);
                  }
                }}
              >
                <Crop size={15} />
              </button>
              <button
                type="button"
                aria-label={t("common.uploadNewImage", "Replace image")}
                className="rounded-full bg-white/90 p-2 text-ink hover:bg-white"
                onClick={() => void acceptFile()}
              >
                <Upload size={15} />
              </button>
            </div>
            <button
              type="button"
              aria-label={t("common.removeImage", "Remove image")}
              className="absolute end-1 top-1 rounded-full bg-red-600 p-1 text-white hover:bg-red-700"
              onClick={() => onChange(null)}
            >
              <Trash2 size={13} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void acceptFile()}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink/45 transition hover:text-accent dark:text-ivory/45 dark:hover:text-accent-dark"
          >
            {fallbackInitials ? (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent dark:text-accent-dark">
                {fallbackInitials}
              </span>
            ) : (
              <Upload size={18} />
            )}
            <span className="text-[11px]">PNG, JPG, WEBP</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void acceptFile(event.target.files?.[0])}
      />

      {cropping && original ? (
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={() => setCropping(false)}>
          <div className="w-[360px] rounded-2xl border border-ink/10 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#1b2723]" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="mb-3 font-display text-sm font-bold">Crop &amp; Position</h3>
            <div
              className="relative mx-auto overflow-hidden rounded-xl bg-ink/10 dark:bg-white/5"
              style={{ width: SHAPE_CROP[shape].w, height: SHAPE_CROP[shape].h, cursor: "grab" }}
              onMouseDown={(event) => {
                dragRef.current = { startX: event.clientX, startY: event.clientY, baseX: offset.x, baseY: offset.y };
              }}
              onMouseMove={(event) => {
                const drag = dragRef.current;
                if (drag) setOffset({ x: drag.baseX + (event.clientX - drag.startX), y: drag.baseY + (event.clientY - drag.startY) });
              }}
              onMouseUp={() => (dragRef.current = null)}
              onMouseLeave={() => (dragRef.current = null)}
              onWheel={(event) => {
                event.preventDefault();
                setZoom((z) => Math.min(3, Math.max(0.2, z + (event.deltaY > 0 ? -0.05 : 0.05))));
              }}
            >
              <img
                src={original}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none"
                style={{
                  width: 320 * zoom,
                  height: "auto",
                  left: (SHAPE_CROP[shape].w - 320 * zoom) / 2 + offset.x,
                  top: (SHAPE_CROP[shape].h - 320 * zoom) / 2 + offset.y,
                }}
              />
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-white/90" />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <ZoomIn size={14} className="text-ink/50 dark:text-ivory/50" />
              <input type="range" min={0.2} max={3} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="flex-1 accent-[var(--color-accent)]" />
              <span className="w-10 text-end text-xs tabular-nums text-ink/55 dark:text-ivory/55">{Math.round(zoom * 100)}%</span>
            </div>
            <p className="mt-1 text-[11px] text-ink/45 dark:text-ivory/45">Drag to position. Scroll to zoom.</p>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCropping(false)}>Cancel</Button>
              <Button onClick={applyCrop}>Apply Crop</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
