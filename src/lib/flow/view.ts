/**
 * Views are lenses over the source: collapse groups, isolate a neighbourhood. They produce
 * derived code for rendering and never change the diagram itself.
 */
import { parseFlow, type FlowModel } from "./parse";
import { deleteNodes, removeEdges, setEdgeLabel } from "./edit";

export type Direction = "both" | "down" | "up";

export interface ViewOptions {
  collapsed: ReadonlySet<string>;
  /** Visible ids (nodes or collapsed groups) to keep; null shows everything. */
  isolate: ReadonlySet<string> | null;
}

export interface ViewResult {
  code: string;
  model: FlowModel;
  /** View edge index → source edge index (null when it stands for several merged edges). */
  sourceEdge: (number | null)[];
  /** View edge index → every source edge it represents. */
  sources: number[][];
  hiddenNodes: number;
}

/** Map an id to what is visible for it: itself, or its outermost collapsed ancestor group. */
export function representative(model: FlowModel, collapsed: ReadonlySet<string>): (id: string) => string {
  const cache = new Map<string, string>();
  return (id: string) => {
    const hit = cache.get(id);
    if (hit) return hit;
    let rep = id;
    let p: string | null = model.subgraphs.has(id) ? id : (model.nodes.get(id)?.parent ?? null);
    let guard = 0;
    while (p && guard++ < 100) {
      if (collapsed.has(p)) rep = p;
      p = model.subgraphs.get(p)?.parent ?? null;
    }
    cache.set(id, rep);
    return rep;
  };
}

export interface EffectiveEdge {
  from: string;
  to: string;
  sources: number[];
}

/** The graph as seen with some groups collapsed: visible ids and merged connections. */
export function effectiveGraph(model: FlowModel, collapsed: ReadonlySet<string>) {
  const rep = representative(model, collapsed);
  const nodes = new Set<string>();
  for (const id of model.nodes.keys()) nodes.add(rep(id));
  for (const id of collapsed) if (model.subgraphs.has(id)) nodes.add(rep(id));
  const edges = new Map<string, EffectiveEdge>();
  for (const e of model.edges) {
    const a = rep(e.from);
    const b = rep(e.to);
    if (a === b && (a !== e.from || b !== e.to)) continue; // internal to a collapsed group
    const merge = collapsed.has(a) || collapsed.has(b);
    const key = merge ? `${a}\u0000${b}` : `#${e.index}`;
    const existing = edges.get(key);
    if (existing) existing.sources.push(e.index);
    else edges.set(key, { from: a, to: b, sources: [e.index] });
  }
  return { nodes, edges: [...edges.values()], rep };
}

export interface Neighborhood {
  nodes: Set<string>;
  /** "from\0to" pairs of visible ids on the highlighted paths. */
  edges: Set<string>;
  distance: Map<string, number>;
}

export function neighborhood(
  edges: { from: string; to: string }[],
  start: string | string[],
  depth: number,
  direction: Direction,
): Neighborhood {
  const starts = Array.isArray(start) ? start : [start];
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
    (inc.get(e.to) ?? inc.set(e.to, []).get(e.to)!).push(e.from);
  }
  const distance = new Map<string, number>(starts.map((s) => [s, 0]));
  let frontier = [...starts];
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next: string[] = [];
    for (const n of frontier) {
      const steps = [
        ...(direction !== "up" ? (out.get(n) ?? []) : []),
        ...(direction !== "down" ? (inc.get(n) ?? []) : []),
      ];
      for (const m of steps) {
        if (distance.has(m)) continue;
        distance.set(m, d);
        next.push(m);
      }
    }
    frontier = next;
  }
  const nodes = new Set(distance.keys());
  const hl = new Set<string>();
  for (const e of edges) {
    const da = distance.get(e.from);
    const db = distance.get(e.to);
    if (da === undefined || db === undefined) continue;
    const ok =
      direction === "down" ? db === da + 1 : direction === "up" ? da === db + 1 : Math.abs(da - db) === 1;
    if (ok) hl.add(`${e.from}\u0000${e.to}`);
  }
  return { nodes, edges: hl, distance };
}

function mergedLabel(model: FlowModel, sources: number[]): string {
  const labels = [...new Set(sources.map((i) => model.edges[i]!.label).filter(Boolean))];
  const n = sources.length;
  if (labels.length === 1) return `${labels[0]} ×${n}`;
  return `${n} links`;
}

export function buildView(code: string, model: FlowModel, opts: ViewOptions): ViewResult {
  const collapsed = new Set([...opts.collapsed].filter((id) => model.subgraphs.has(id)));
  const identity = (): ViewResult => ({
    code,
    model,
    sourceEdge: model.edges.map((e) => e.index),
    sources: model.edges.map((e) => [e.index]),
    hiddenNodes: 0,
  });
  if (!collapsed.size && !opts.isolate) return identity();

  const { edges, rep } = effectiveGraph(model, collapsed);
  const keep = opts.isolate;
  const removeEdge = new Set<number>();
  const relabel = new Map<number, string>();
  const keptGroups: number[][] = [];

  // Edges internal to a collapsed group: Mermaid hides them, we drop them to keep mapping simple.
  const represented = new Set(edges.flatMap((e) => e.sources));
  for (const e of model.edges) if (!represented.has(e.index)) removeEdge.add(e.index);

  for (const e of edges) {
    if (keep && (!keep.has(e.from) || !keep.has(e.to))) {
      e.sources.forEach((i) => removeEdge.add(i));
      continue;
    }
    const [first, ...rest] = e.sources;
    rest.forEach((i) => removeEdge.add(i));
    if (rest.length) relabel.set(first!, mergedLabel(model, e.sources));
    keptGroups.push(e.sources);
  }

  let next = code;
  for (const [i, label] of relabel) next = setEdgeLabel(next, i, label);
  if (removeEdge.size) next = removeEdges(next, [...removeEdge]);

  let hiddenNodes = 0;
  if (keep) {
    const drop = [...model.nodes.keys()].filter((id) => !keep.has(rep(id)));
    hiddenNodes = drop.length;
    if (drop.length) next = deleteNodes(next, drop);
    next = removeEmptyGroups(next, new Set([...collapsed].filter((id) => keep.has(id))));
  }

  const visibleCollapsed = [...collapsed].filter((id) => rep(id) === id && (!keep || keep.has(id)));
  const viewModel0 = parseFlow(next);
  const lines = visibleCollapsed.filter((id) => viewModel0.subgraphs.has(id)).map((id) => `${id}@{ view: collapsed }`);
  if (lines.length) next = `${next.replace(/\s*$/, "")}\n    ${lines.join("\n    ")}\n`;

  const viewModel = parseFlow(next);
  // keptGroups are in source edge order (effective edges are built in source order).
  keptGroups.sort((a, b) => a[0]! - b[0]!);
  const aligned = viewModel.edges.length === keptGroups.length;
  return {
    code: next,
    model: viewModel,
    sourceEdge: viewModel.edges.map((_, i) => (aligned && keptGroups[i]!.length === 1 ? keptGroups[i]![0]! : null)),
    sources: viewModel.edges.map((_, i) => (aligned ? keptGroups[i]! : [])),
    hiddenNodes,
  };
}

/** Remove subgraph wrappers that no longer contain any nodes (after isolating). */
function removeEmptyGroups(code: string, collapsed: ReadonlySet<string>): string {
  for (let guard = 0; guard < 50; guard++) {
    const m = parseFlow(code);
    const empty = [...m.subgraphs.values()].find(
      (sg) => !collapsed.has(sg.id) && sg.members.length === 0,
    );
    if (!empty) return code;
    const open = m.statements[empty.open]!;
    const end = m.statements[empty.close]!;
    const cut = (s: { start: number; end: number }, src: string) => {
      let ls = s.start;
      while (ls > 0 && src[ls - 1] !== "\n") ls--;
      let le = src.indexOf("\n", s.end);
      if (le === -1) le = src.length;
      return src.slice(0, ls) + src.slice(Math.min(src.length, le + 1));
    };
    code = cut(open, cut(end, code));
  }
  return code;
}
