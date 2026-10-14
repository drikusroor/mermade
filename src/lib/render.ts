import type { Mermaid, MermaidConfig } from "mermaid";

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

export interface RenderOptions {
  theme: string;
  look: "classic" | "handDrawn";
}

let mermaidPromise: Promise<Mermaid> | null = null;
/** Mermaid is large; load it lazily so the editor shell paints immediately. */
export function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

let queue: Promise<unknown> = Promise.resolve();
let counter = 0;
let lastConfigKey = "";

export function errorLine(message: string): number | null {
  const m = message.match(/(?:on line|at line|line:?)\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Mermaid's render is not re-entrant, so calls are serialized. */
export function renderDiagram(code: string, opts: RenderOptions): Promise<RenderResult> {
  const job = queue.then(async (): Promise<RenderResult> => {
    const mermaid = await loadMermaid();
    const configKey = `${opts.theme}|${opts.look}`;
    if (configKey !== lastConfigKey) {
      const config: MermaidConfig = {
        startOnLoad: false,
        theme: opts.theme as MermaidConfig["theme"],
        look: opts.look,
        securityLevel: "strict",
        // SVG text labels (instead of HTML in <foreignObject>) export cleanly to PNG everywhere.
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      };
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
