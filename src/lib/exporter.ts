import { SOURCE_METADATA_ID } from "./importer";

export type ExportBackground = "transparent" | "white" | "dark" | "theme";

/** Resolve an export background choice to a colour (null = transparent). */
export function backgroundColor(bg: ExportBackground, themeColor: string): string | null {
  if (bg === "transparent") return null;
  if (bg === "white") return "#ffffff";
  if (bg === "dark") return "#18181b";
  return themeColor;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s.-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return cleaned.slice(0, 80) || "diagram";
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Insert the Mermaid source as <metadata> right after the root <svg ...> tag so the file can be re-imported. */
export function embedSource(svg: string, code: string): string {
  const meta = `<metadata id="${SOURCE_METADATA_ID}">${escapeXml(code)}</metadata>`;
  return svg.replace(/<svg\b[^>]*>/, (open) => open + meta);
}

export interface PreparedSvg {
  svg: string;
  width: number;
  height: number;
}

/**
 * Make a Mermaid-rendered SVG standalone: explicit pixel size, xmlns, optional background,
 * serialized as valid XML (Mermaid emits HTML-serialized markup).
 */
export function prepareSvg(rawSvg: string, opts: { code?: string; background?: string | null } = {}): PreparedSvg {
  const host = document.createElement("div");
  host.innerHTML = rawSvg;
  const el = host.querySelector("svg");
  if (!el) throw new Error("Nothing to export — the diagram hasn't rendered yet");

  const vb = el.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  let width = vb?.[2] ?? 0;
  let height = vb?.[3] ?? 0;
  if (!width || !height) {
    width = parseFloat(el.style.maxWidth) || 800;
    height = 600;
  }
  width = Math.ceil(width);
  height = Math.ceil(height);

  el.setAttribute("width", String(width));
  el.setAttribute("height", String(height));
  el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  el.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  el.style.removeProperty("max-width");

  if (opts.background) el.style.backgroundColor = opts.background;
  // Strip interaction state that the live preview adds.
  el.classList.remove("mm-interactive", "mm-dimming");

  let svg = new XMLSerializer().serializeToString(el);
  if (opts.code !== undefined) svg = embedSource(svg, opts.code);
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, width, height };
}

const MAX_CANVAS_SIDE = 16384;

export async function svgToPngBlob(prepared: PreparedSvg, scale: number, background: string | null): Promise<Blob> {
  const factor = Math.min(scale, MAX_CANVAS_SIDE / prepared.width, MAX_CANVAS_SIDE / prepared.height);
  const w = Math.max(1, Math.round(prepared.width * factor));
  const h = Math.max(1, Math.round(prepared.height * factor));

  const url = URL.createObjectURL(new Blob([prepared.svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to rasterize the SVG"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser");
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, type = "text/plain"): void {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function copyPng(blob: Promise<Blob>): Promise<void> {
  if (typeof ClipboardItem === "undefined") throw new Error("Copying images isn't supported in this browser");
  // Passing the promise keeps Safari's user-activation window open while the PNG renders.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function toMarkdown(code: string): string {
  return "```mermaid\n" + code.trimEnd() + "\n```\n";
}
