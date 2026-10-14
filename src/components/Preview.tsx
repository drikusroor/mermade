import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus, Scan, AlertTriangle, Loader2 } from "lucide-react";
import { IconButton } from "./ui";

interface PreviewProps {
  docKey: string;
  svg: string | null;
  error: string | null;
  loading: boolean;
  darkCanvas: boolean;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const MIN = 0.1;
const MAX = 8;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

export function Preview({ docKey, svg, error, loading, darkCanvas }: PreviewProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const needsFit = useRef(true);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const fit = useCallback(() => {
    const vp = viewport.current;
    const { w, h } = size.current;
    if (!vp || !w || !h) return;
    const pad = 32;
    const avW = vp.clientWidth - pad * 2;
    const avH = vp.clientHeight - pad * 2;
    const scale = clamp(Math.min(avW / w, avH / h, 1.25));
    setView({ scale, x: (vp.clientWidth - w * scale) / 2, y: (vp.clientHeight - h * scale) / 2 });
  }, []);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const vp = viewport.current;
    if (!vp) return;
    const px = cx ?? vp.clientWidth / 2;
    const py = cy ?? vp.clientHeight / 2;
    setView((v) => {
      const scale = clamp(v.scale * factor);
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  const actualSize = useCallback(() => {
    const vp = viewport.current;
    if (!vp) return;
    const { w, h } = size.current;
    setView({ scale: 1, x: (vp.clientWidth - w) / 2, y: (vp.clientHeight - h) / 2 });
  }, []);

  useEffect(() => {
    needsFit.current = true;
  }, [docKey]);

  // Give the SVG its natural pixel size so the transform controls zoom.
  useLayoutEffect(() => {
    const el = content.current?.querySelector("svg");
    if (!el) return;
    const vb = el.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
    const w = vb?.[2] || el.getBoundingClientRect().width;
    const h = vb?.[3] || el.getBoundingClientRect().height;
    el.style.maxWidth = "none";
    el.setAttribute("width", String(w));
    el.setAttribute("height", String(h));
    size.current = { w, h };
    if (needsFit.current) {
      needsFit.current = false;
      fit();
    }
  }, [svg, fit]);

  // Until the user pans or zooms, keep the diagram fitted when the container resizes.
  const touched = useRef(false);
  useEffect(() => {
    touched.current = false;
  }, [docKey]);
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit();
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [fit]);

  // Native wheel listener so we can preventDefault (React's is passive).
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touched.current = true;
      const rect = vp.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    touched.current = true;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 40;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (e.key === "+" || e.key === "=") zoomAt(1.2);
    else if (e.key === "-") zoomAt(1 / 1.2);
    else if (e.key === "0") fit();
    else if (e.key === "1") actualSize();
    else if (moves[e.key]) {
      const [dx, dy] = moves[e.key]!;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else return;
    touched.current = true;
    e.preventDefault();
  };

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div
        ref={viewport}
        tabIndex={0}
        aria-label="Diagram preview. Drag or use arrow keys to pan, plus and minus to zoom, 0 to fit."
        className={`preview-canvas h-full w-full cursor-grab touch-none select-none outline-none active:cursor-grabbing ${
          darkCanvas ? "preview-canvas-dark" : ""
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => {
          touched.current = false;
          fit();
        }}
        onKeyDown={onKeyDown}
        data-testid="preview"
      >
        <div
          ref={content}
          className={`absolute left-0 top-0 origin-top-left transition-opacity ${error ? "opacity-30" : ""}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          dangerouslySetInnerHTML={{ __html: svg ?? "" }}
        />
      </div>

      {loading && !svg && !error && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Loading renderer…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="absolute inset-x-3 bottom-14 max-h-[40%] overflow-auto rounded-lg border border-red-300 bg-red-50/95 p-3 text-xs text-red-800 shadow-lg backdrop-blur dark:border-red-900 dark:bg-red-950/90 dark:text-red-200"
        >
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5" /> Syntax error
          </div>
          <pre className="whitespace-pre-wrap font-mono leading-relaxed">{error}</pre>
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90">
        <IconButton label="Zoom out (-)" onClick={() => ((touched.current = true), zoomAt(1 / 1.2))}>
          <Minus className="size-4" />
        </IconButton>
        <button
          type="button"
          onClick={() => ((touched.current = true), actualSize())}
          title="Actual size (1)"
          className="min-w-12 rounded px-1 py-1 text-xs tabular-nums text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {Math.round(view.scale * 100)}%
        </button>
        <IconButton label="Zoom in (+)" onClick={() => ((touched.current = true), zoomAt(1.2))}>
          <Plus className="size-4" />
        </IconButton>
        <div className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
        <IconButton
          label="Fit to screen (0)"
          onClick={() => {
            touched.current = false;
            fit();
          }}
        >
          <Scan className="size-4" />
        </IconButton>
        <IconButton label="Fullscreen" onClick={() => viewport.current?.parentElement?.requestFullscreen?.()}>
          <Maximize className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}
