import type { FlowModel } from "./parse";

/** Maps the rendered SVG's elements back to graph ids so the preview can be interactive. */
export interface SvgIndex {
  root: SVGSVGElement;
  /** Visible node id (or collapsed group id) → node element. */
  nodes: Map<string, SVGGElement>;
  /** Group id → expanded cluster element. */
  clusters: Map<string, SVGGElement>;
  /** View edge index → its path, hit area and label elements. */
  edges: Map<number, Element[]>;
}

export const NODE_ATTR = "data-mm-node";
export const GROUP_ATTR = "data-mm-group";
export const EDGE_ATTR = "data-mm-edge";

export function indexSvg(container: HTMLElement, model: FlowModel): SvgIndex | null {
  const root = container.querySelector("svg");
  if (!root) return null;
  const prefix = root.id;
  const nodes = new Map<string, SVGGElement>();
  const clusters = new Map<string, SVGGElement>();
  const edges = new Map<number, Element[]>();

  const nodeRe = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-flowchart-(.+)-\\d+$`);
  for (const g of root.querySelectorAll<SVGGElement>("g.node")) {
    const m = nodeRe.exec(g.id);
    if (m && model.nodes.has(m[1]!)) {
      nodes.set(m[1]!, g);
      g.setAttribute(NODE_ATTR, m[1]!);
      continue;
    }
    const sg = g.id.startsWith(prefix + "-") ? g.id.slice(prefix.length + 1) : "";
    if (model.subgraphs.has(sg)) {
      nodes.set(sg, g);
      g.setAttribute(GROUP_ATTR, sg);
      g.classList.add("mm-collapsed");
    }
  }
  for (const g of root.querySelectorAll<SVGGElement>("g.cluster")) {
    const sg = g.id.startsWith(prefix + "-") ? g.id.slice(prefix.length + 1) : "";
    if (!model.subgraphs.has(sg)) continue;
    clusters.set(sg, g);
    g.setAttribute(GROUP_ATTR, sg);
  }

  const byId = new Map(model.edges.map((e) => [e.id, e.index]));
  for (const path of root.querySelectorAll<SVGPathElement>("path[data-edge]")) {
    const idx = byId.get(path.getAttribute("data-id") ?? "");
    if (idx === undefined) continue;
    path.setAttribute(EDGE_ATTR, String(idx));
    // A wide transparent twin makes thin edges easy to click.
    const hit = path.cloneNode(false) as SVGPathElement;
    for (const a of ["id", "style", "marker-end", "marker-start", "class", "data-edge", "data-id", "data-points"]) hit.removeAttribute(a);
    hit.setAttribute("class", "mm-hit");
    hit.setAttribute(EDGE_ATTR, String(idx));
    path.parentNode?.insertBefore(hit, path);
    edges.set(idx, [path, hit]);
  }
  for (const label of root.querySelectorAll<SVGGElement>("g.edgeLabel g.label[data-id]")) {
    const idx = byId.get(label.getAttribute("data-id") ?? "");
    if (idx === undefined) continue;
    const wrap = label.closest("g.edgeLabel") ?? label;
    wrap.setAttribute(EDGE_ATTR, String(idx));
    edges.get(idx)?.push(wrap);
  }
  return { root, nodes, clusters, edges };
}

export type Hit =
  | { kind: "node"; id: string; el: Element }
  | { kind: "group"; id: string; el: Element; label: boolean; collapsed: boolean }
  | { kind: "edge"; index: number; el: Element };

/** What did the pointer land on? */
export function hitTest(target: EventTarget | null): Hit | null {
  if (!(target instanceof Element)) return null;
  const node = target.closest(`[${NODE_ATTR}]`);
  if (node) return { kind: "node", id: node.getAttribute(NODE_ATTR)!, el: node };
  const edge = target.closest(`[${EDGE_ATTR}]`);
  if (edge) return { kind: "edge", index: Number(edge.getAttribute(EDGE_ATTR)), el: edge };
  const group = target.closest(`[${GROUP_ATTR}]`);
  if (group) {
    return {
      kind: "group",
      id: group.getAttribute(GROUP_ATTR)!,
      el: group,
      label: !!target.closest(".cluster-label"),
      collapsed: group.classList.contains("mm-collapsed"),
    };
  }
  return null;
}
