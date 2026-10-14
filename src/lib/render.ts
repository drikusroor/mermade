import type { Mermaid, MermaidConfig } from "mermaid";
import type { FlowModel } from "./flow/parse";

export interface RenderOk {
  ok: true;
  svg: string;
  ms: number;
}
export interface RenderErr {
  ok: false;
  message: string;
  line: number | null;
}
export type RenderResult = RenderOk | RenderErr;

let mermaidPromise: Promise<Mermaid> | null = null;
/** Mermaid is large; load it lazily so the editor shell paints immediately. */
export function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

let elkPromise: Promise<void> | null = null;
/** The ELK layout engine is only fetched when a diagram asks for it. */
function ensureElk(mermaid: Mermaid): Promise<void> {
  elkPromise ??= import("@mermaid-js/layout-elk").then((m) => mermaid.registerLayoutLoaders(m.default));
  return elkPromise;
}

let queue: Promise<unknown> = Promise.resolve();
let counter = 0;
let lastConfigKey = "";

export function errorLine(message: string): number | null {
  const m = message.match(/(?:on line|at line|line:?)\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Mermaid's render is not re-entrant, so calls are serialized. */
export function renderDiagram(code: string, config: MermaidConfig): Promise<RenderResult> {
  const job = queue.then(async (): Promise<RenderResult> => {
    const mermaid = await loadMermaid();
    if (config.layout === "elk") await ensureElk(mermaid);
    const configKey = JSON.stringify(config);
    if (configKey !== lastConfigKey) {
      mermaid.initialize(config);
      lastConfigKey = configKey;
    }
    const id = `mermade-${++counter}`;
    const started = performance.now();
    try {
      if (!code.trim()) return { ok: false, message: "Empty diagram — start typing or pick a template.", line: null };
      const { svg } = await mermaid.render(id, code);
      return { ok: true, svg, ms: Math.round(performance.now() - started) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message, line: errorLine(message) };
    } finally {
      // Mermaid leaves temporary containers behind when rendering fails.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = job.catch(() => undefined);
  return job;
}

interface FlowDb {
  getEdges(): { id: string; start: string; end: string }[];
  getSubGraphs(): { id: string; nodes: string[] }[];
}

/**
 * Cross-check our source parser against Mermaid's on the real diagram. Visual editing is only
 * offered when both agree on every edge and every group's members. Returns null if Mermaid
 * can't parse the code at all (that's a syntax error, reported by the renderer).
 */
export function verifyFlowModel(code: string, model: FlowModel): Promise<boolean | null> {
  const job = queue.then(async () => {
    const mermaid = await loadMermaid();
    try {
      const d = await mermaid.mermaidAPI.getDiagramFromText(code);
      const db = d.db as unknown as FlowDb;
      const edges = db.getEdges();
      if (edges.length !== model.edges.length) return false;
      if (edges.some((e, i) => e.id !== model.edges[i]!.id || e.start !== model.edges[i]!.from || e.end !== model.edges[i]!.to)) return false;
      for (const sg of db.getSubGraphs()) {
        const ours = model.subgraphs.get(sg.id);
        if (!ours) return false;
        const a = [...new Set(sg.nodes)].sort().join("\u0000");
        const b = [...new Set(ours.members)].sort().join("\u0000");
        if (a !== b) return false;
      }
      return true;
    } catch {
      return null;
    }
  });
  queue = job.catch(() => undefined);
  return job;
}

export const MERMAID_THEMES = [
  { id: "auto", label: "Auto (match app)" },
  { id: "default", label: "Default" },
  { id: "neutral", label: "Neutral" },
  { id: "forest", label: "Forest" },
  { id: "dark", label: "Dark" },
  { id: "base", label: "Base" },
  { id: "neo", label: "Neo" },
  { id: "neo-dark", label: "Neo Dark" },
] as const;
