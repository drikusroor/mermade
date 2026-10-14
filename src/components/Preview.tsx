import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Minus, Plus, Scan, AlertTriangle, Loader2 } from "lucide-react";
import { IconButton } from "./ui";
import type { FlowModel } from "../lib/flow/parse";
import { hitTest, indexSvg, type Hit, type SvgIndex } from "../lib/flow/svgIndex";

export type Selection = { kind: "node"; id: string } | { kind: "group"; id: string } | { kind: "edge"; index: number } | null;

export interface Highlight {
  nodes: Set<string>;
  groups: Set<string>;
  edges: Set<number>;
}

interface PreviewProps {
  docKey: string;
  svg: string | null;
  error: string | null;
  loading: boolean;
  canvas: string;
  dark: boolean;
  /** Parsed render code; enables selection and visual editing when present. */
  viewModel: FlowModel | null;
  selection: Selection;
  onSelect: (s: Selection) => void;
  highlight: Highlight | null;
  cursorNodes: Set<string>;
  connectFrom: string | null;
  onConnect: (from: string, to: string) => void;
  onCancelConnect: () => void;
  onMoveNode: (id: string, target: string | null) => void;
  onMoveGroup: (id: string, target: string | null) => void;
  onToggleCollapse: (id: string) => void;
  onDeleteSelection: () => void;
  onUndo: () => void;
  onRename: () => void;
  zoomTo: { id: string; nonce: number } | null;
  /** Parent group of each node/group in the source (for drop targets). */
  parentOf: (id: string) => string | null;
  titleOf: (id: string) => string;
  toolbar?: ReactNode;
  inspector?: ReactNode;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

type Gesture =
  | { type: "pan"; x: number; y: number; vx: number; vy: number }
  | { type: "press"; hit: Hit; x: number; y: number; connect: boolean; pointerId: number }
  | { type: "move"; id: string; isGroup: boolean; el: Element; orig: string; target: string | null | undefined }
  | { type: "connect"; from: string; to: string | null };

const MIN = 0.1;
const MAX = 8;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));
const DRAG_THRESHOLD = 5;

export function Preview(props: PreviewProps) {
  const { docKey, svg, error, loading, canvas, viewModel, selection, highlight, cursorNodes, connectFrom } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const needsFit = useRef(true);
  const touched = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const index = useRef<SvgIndex | null>(null);
  const [indexVersion, setIndexVersion] = useState(0);
  const [hint, setHint] = useState<{ x: number; y: number; text: string } | null>(null);
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const cb = useRef(props);
  cb.current = props;

  const fit = useCallback(() => {
    const vp = viewport.current;
    const { w, h } = size.current;
    if (!vp || !w || !h) return;
    const pad = 40;
    const scale = clamp(Math.min((vp.clientWidth - pad * 2) / w, (vp.clientHeight - pad * 2 - 40) / h, 1.25));
    setView({ scale, x: (vp.clientWidth - w * scale) / 2, y: (vp.clientHeight - h * scale) / 2 + 16 });
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
    touched.current = false;
  }, [docKey]);

  // Give the SVG its natural pixel size so the transform controls zoom, then index it.
  useLayoutEffect(() => {
    const el = content.current?.querySelector("svg");
    index.current = null;
    if (!el) return;
    const vb = el.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
    const w = vb?.[2] || el.getBoundingClientRect().width;
    const h = vb?.[3] || el.getBoundingClientRect().height;
    el.style.maxWidth = "none";
    el.style.overflow = "visible";
    el.setAttribute("width", String(w));
    el.setAttribute("height", String(h));
    size.current = { w, h };
    if (viewModel) index.current = indexSvg(content.current!, viewModel);
    setIndexVersion((v) => v + 1);
    if (needsFit.current) {
      needsFit.current = false;
      fit();
    }
  }, [svg, viewModel, fit]);

  // Selection / focus / cursor classes on the live SVG.
  useEffect(() => {
    const idx = index.current;
    if (!idx) return;
    const { root } = idx;
    root.querySelectorAll(".mm-hl, .mm-sel, .mm-cursor, .mm-source").forEach((e) => e.classList.remove("mm-hl", "mm-sel", "mm-cursor", "mm-source"));
    root.classList.toggle("mm-dimming", !!highlight);
    root.classList.toggle("mm-interactive", true);
    if (highlight) {
      highlight.nodes.forEach((id) => idx.nodes.get(id)?.classList.add("mm-hl"));
      highlight.groups.forEach((id) => idx.clusters.get(id)?.classList.add("mm-hl"));
      highlight.edges.forEach((i) => idx.edges.get(i)?.forEach((e) => e.classList.add("mm-hl")));
    }
    if (selection?.kind === "node" || selection?.kind === "group") {
      (idx.nodes.get(selection.id) ?? idx.clusters.get(selection.id))?.classList.add("mm-sel");
    } else if (selection?.kind === "edge") {
      idx.edges.get(selection.index)?.forEach((e) => e.classList.add("mm-sel"));
    }
    cursorNodes.forEach((id) => idx.nodes.get(id)?.classList.add("mm-cursor"));
    if (connectFrom) idx.nodes.get(connectFrom)?.classList.add("mm-source");
  }, [indexVersion, selection, highlight, cursorNodes, connectFrom]);

  // Keep the diagram fitted on resize until the user pans or zooms.
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit();
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [fit]);

  // Center on a node or group (search results, inspector links).
  useEffect(() => {
    if (!props.zoomTo) return;
    const el = index.current?.nodes.get(props.zoomTo.id) ?? index.current?.clusters.get(props.zoomTo.id);
    const vp = viewport.current;
    if (!el || !vp) return;
    const r = el.getBoundingClientRect();
    const vr = vp.getBoundingClientRect();
    touched.current = true;
    setView((v) => {
      const cx = (r.left + r.width / 2 - vr.left - v.x) / v.scale;
      const cy = (r.top + r.height / 2 - vr.top - v.y) / v.scale;
      const scale = Math.max(v.scale, 0.9);
      return { scale, x: vr.width / 2 - cx * scale, y: vr.height / 2 - cy * scale };
    });
  }, [props.zoomTo]);

  // Native wheel listener so we can preventDefault (React's is passive).
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touched.current = true;
      const rect = vp.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ---------------- pointer gestures ---------------- */

  const toContent = (clientX: number, clientY: number) => {
    const vr = viewport.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - vr.left - v.x) / v.scale, y: (clientY - vr.top - v.y) / v.scale };
  };

  const centerOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return toContent(r.left + r.width / 2, r.top + r.height / 2);
  };

  /** Innermost group under the pointer (expanded cluster or collapsed group node). */
  const dropTargetAt = (clientX: number, clientY: number, exclude: Set<string>): string | null => {
    const idx = index.current;
    if (!idx) return null;
    let best: string | null = null;
    let bestArea = Infinity;
    const consider = (id: string, el: Element) => {
      if (exclude.has(id)) return;
      const r = (el.querySelector("rect") ?? el).getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return;
      const area = r.width * r.height;
      if (area < bestArea) {
        bestArea = area;
        best = id;
      }
    };
    idx.clusters.forEach((el, id) => consider(id, el));
    idx.nodes.forEach((el, id) => el.classList.contains("mm-collapsed") && consider(id, el));
    return best;
  };

  const descendantsOf = (sg: string): Set<string> => {
    const out = new Set([sg]);
    const m = viewModel;
    if (!m) return out;
    let grew = true;
    while (grew) {
      grew = false;
      for (const s of m.subgraphs.values()) {
        if (s.parent && out.has(s.parent) && !out.has(s.id)) {
          out.add(s.id);
          grew = true;
        }
      }
    }
    return out;
  };

  const nodeUnder = (clientX: number, clientY: number, exclude: string): string | null => {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const hit = hitTest(el);
      if (hit && (hit.kind === "node" || (hit.kind === "group" && hit.collapsed)) && hit.id !== exclude) return hit.id;
    }
    return null;
  };

  const markDrop = (id: string | null) => {
    const idx = index.current;
    if (!idx) return;
    idx.root.querySelectorAll(".mm-drop").forEach((e) => e.classList.remove("mm-drop"));
    if (id) (idx.clusters.get(id) ?? idx.nodes.get(id))?.classList.add("mm-drop");
  };

  /** Pointer capture retargets click/dblclick to the viewport, so remember what was pressed. */
  const lastDown = useRef<Hit | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    viewport.current?.focus({ preventScroll: true });
    const hit = viewModel ? hitTest(e.target) : null;
    lastDown.current = hit;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (hit && (hit.kind === "node" || hit.kind === "edge" || (hit.kind === "group" && (hit.label || hit.collapsed)))) {
      gesture.current = { type: "press", hit, x: e.clientX, y: e.clientY, connect: e.altKey || e.shiftKey, pointerId: e.pointerId };
    } else {
      gesture.current = { type: "pan", x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      pendingClick.current = { hit, x: e.clientX, y: e.clientY };
    }
  };
  const pendingClick = useRef<{ hit: Hit | null; x: number; y: number } | null>(null);

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.type === "pan") {
      touched.current = true;
      setView((v) => ({ ...v, x: g.vx + e.clientX - g.x, y: g.vy + e.clientY - g.y }));
      return;
    }
    if (g.type === "press") {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_THRESHOLD) return;
      const { hit } = g;
      if (hit.kind === "edge") {
        gesture.current = { type: "pan", x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        return;
      }
      const isGroup = hit.kind === "group";
      if (g.connect || cb.current.connectFrom) {
        const from = hit.id;
        gesture.current = { type: "connect", from, to: null };
        const c = centerOf(hit.el);
        setLine({ x1: c.x, y1: c.y, x2: c.x, y2: c.y });
      } else {
        const el = hit.el;
        gesture.current = { type: "move", id: hit.id, isGroup, el, orig: el.getAttribute("transform") ?? "", target: undefined };
        el.classList.add("mm-dragging");
        if (isGroup && !(el as SVGGElement).classList.contains("mm-collapsed")) el.classList.add("mm-dragging-group");
      }
    }
    const cur = gesture.current!;
    if (cur.type === "move") {
      const v = viewRef.current;
      const start = g.type === "press" ? g : dragOrigin.current!;
      if (g.type === "press") dragOrigin.current = { x: g.x, y: g.y };
      const dx = (e.clientX - start.x) / v.scale;
      const dy = (e.clientY - start.y) / v.scale;
      cur.el.setAttribute("transform", `${cur.orig} translate(${dx}, ${dy})`);
      const exclude = cur.isGroup ? descendantsOf(cur.id) : new Set([cur.id]);
      const target = dropTargetAt(e.clientX, e.clientY, exclude);
      cur.target = target;
      markDrop(target);
      const current = props.parentOf(cur.id);
      const vr = viewport.current!.getBoundingClientRect();
      const text =
        target === current
          ? "Drop to keep in place"
          : target
            ? `Move into “${props.titleOf(target)}”`
            : current
              ? "Move to top level"
              : "Drop to keep in place";
      setHint({ x: e.clientX - vr.left, y: e.clientY - vr.top, text });
    } else if (cur.type === "connect") {
      const p = toContent(e.clientX, e.clientY);
      setLine((l) => (l ? { ...l, x2: p.x, y2: p.y } : l));
      const to = nodeUnder(e.clientX, e.clientY, cur.from);
      cur.to = to;
      markDrop(to);
      const vr = viewport.current!.getBoundingClientRect();
      setHint({ x: e.clientX - vr.left, y: e.clientY - vr.top, text: to ? `Connect to “${props.titleOf(to)}”` : "Drop on a node to connect" });
    }
  };
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  const endGesture = (e: React.PointerEvent, cancelled = false) => {
    const g = gesture.current;
    gesture.current = null;
    dragOrigin.current = null;
    setHint(null);
    setLine(null);
    markDrop(null);
    if (!g) return;
    if (g.type === "pan") {
      const pc = pendingClick.current;
      pendingClick.current = null;
      if (!cancelled && pc && Math.hypot(e.clientX - pc.x, e.clientY - pc.y) < DRAG_THRESHOLD) {
        if (cb.current.connectFrom) cb.current.onCancelConnect();
        else if (pc.hit?.kind === "group") cb.current.onSelect({ kind: "group", id: pc.hit.id });
        else cb.current.onSelect(null);
      }
      return;
    }
    if (g.type === "press") {
      if (cancelled) return;
      const { hit } = g;
      const from = cb.current.connectFrom;
      if (from && (hit.kind === "node" || hit.kind === "group") && hit.id !== from) {
        cb.current.onConnect(from, hit.id);
        return;
      }
      if (hit.kind === "edge") cb.current.onSelect({ kind: "edge", index: hit.index });
      else if (hit.kind === "group") cb.current.onSelect({ kind: "group", id: hit.id });
      else cb.current.onSelect({ kind: "node", id: hit.id });
      return;
    }
    if (g.type === "move") {
      g.el.classList.remove("mm-dragging", "mm-dragging-group");
      g.el.setAttribute("transform", g.orig);
      if (cancelled || g.target === undefined) return;
      if (g.target !== props.parentOf(g.id)) {
        if (g.isGroup) cb.current.onMoveGroup(g.id, g.target);
        else cb.current.onMoveNode(g.id, g.target);
      }
      return;
    }
    if (g.type === "connect" && !cancelled && g.to) cb.current.onConnect(g.from, g.to);
  };

  const onDoubleClick = () => {
    const hit = viewModel ? lastDown.current : null;
    if (hit?.kind === "group") cb.current.onToggleCollapse(hit.id);
    else if (hit?.kind === "node") cb.current.onRename();
    else if (!hit) {
      touched.current = false;
      fit();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      cb.current.onUndo();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selection) {
      e.preventDefault();
      cb.current.onDeleteSelection();
      return;
    }
    if (e.key === "Escape") {
      if (connectFrom) cb.current.onCancelConnect();
      else cb.current.onSelect(null);
      return;
    }
    if (e.key === "F2" || (e.key === "Enter" && selection)) {
      e.preventDefault();
      cb.current.onRename();
      return;
    }
    const step = 40;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
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
    <div className="relative h-full min-h-0 overflow-hidden" style={{ backgroundColor: canvas }}>
      <div
        ref={viewport}
        tabIndex={0}
        aria-label="Diagram preview. Click to select, drag nodes into groups, Alt-drag to connect, arrows to pan, plus and minus to zoom."
        className={`preview-canvas h-full w-full touch-none select-none outline-none ${props.dark ? "preview-canvas-dark" : ""} ${
          connectFrom ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endGesture(e)}
        onPointerCancel={(e) => endGesture(e, true)}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        style={{ backgroundColor: canvas }}
        data-testid="preview"
      >
        <div
          ref={content}
          className={`absolute left-0 top-0 origin-top-left transition-opacity ${error ? "opacity-30" : ""}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          dangerouslySetInnerHTML={{ __html: svg ?? "" }}
        />
        {line && (
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}
            width={1}
            height={1}
          >
            <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className="mm-connect-line" />
            <circle cx={line.x2} cy={line.y2} r={4 / view.scale} className="mm-connect-dot" />
          </svg>
        )}
      </div>

      {hint && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-full bg-zinc-900/90 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg dark:bg-white/90 dark:text-zinc-900"
          style={{ left: hint.x, top: hint.y + 22 }}
        >
          {hint.text}
        </div>
      )}

      {props.toolbar}
      {props.inspector}

      {loading && !svg && !error && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Loading renderer…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="absolute inset-x-3 bottom-14 max-h-[40%] overflow-auto rounded-xl border border-red-300 bg-red-50/95 p-3 text-xs text-red-800 shadow-lg backdrop-blur dark:border-red-900 dark:bg-red-950/90 dark:text-red-200"
        >
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5" /> Syntax error
          </div>
          <pre className="whitespace-pre-wrap font-mono leading-relaxed">{error}</pre>
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl border border-zinc-200/80 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-900/90">
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
