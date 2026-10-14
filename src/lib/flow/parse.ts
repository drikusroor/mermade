/**
 * A source-preserving parser for Mermaid flowcharts.
 *
 * Mermaid's own parser tells us *what* the graph is, but not *where* in the text each piece lives.
 * Visual editing needs both, so this parser records spans for every node reference, link and
 * statement, and reproduces Mermaid's semantics for subgraph membership and edge ids.
 * `tests/flow-parse.test.ts` checks it against Mermaid's parser on a corpus of diagrams.
 */

export interface Shape {
  /** Opening token, e.g. "[", "((", "@{" */
  open: string;
  close: string;
  /** Raw text from opener to closer (inclusive). */
  raw: string;
  label: string;
  start: number;
  end: number;
}

export interface NodeRef {
  id: string;
  start: number;
  end: number;
  idEnd: number;
  shape: Shape | null;
  classes: string[];
}

export type Stroke = "normal" | "thick" | "dotted" | "invisible";

export interface LinkTok {
  start: number;
  end: number;
  raw: string;
  edgeId: string | null;
  /** Operator without label text, e.g. "-->" for both `-- yes -->` and `-->|yes|`. */
  plain: string;
  stroke: Stroke;
  label: string;
}

interface StatementBase {
  start: number;
  end: number;
  /** Direct enclosing subgraph id (null = root). */
  block: string | null;
  indent: string;
}

export type Statement =
  | (StatementBase & { kind: "header"; keyword: string; direction: string | null })
  | (StatementBase & { kind: "vertex"; groups: NodeRef[][]; links: LinkTok[] })
  | (StatementBase & { kind: "subgraph"; sg: string; explicitId: boolean; title: string })
  | (StatementBase & { kind: "end"; sg: string })
  | (StatementBase & { kind: "direction"; value: string })
  | (StatementBase & { kind: "class"; ids: { id: string; start: number; end: number }[]; className: string })
  | (StatementBase & { kind: "style"; id: string; idStart: number; idEnd: number })
  | (StatementBase & { kind: "click"; id: string; idStart: number; idEnd: number })
  | (StatementBase & { kind: "linkStyle"; indices: { value: number; start: number; end: number }[] | "default" })
  | (StatementBase & { kind: "classDef" | "other" });

export interface Edge {
  index: number;
  id: string;
  from: string;
  to: string;
  label: string;
  stroke: Stroke;
  stmt: number;
  link: number;
}

export interface Subgraph {
  id: string;
  title: string;
  explicitId: boolean;
  parent: string | null;
  /** Statement indexes of the `subgraph` line and its `end`. */
  open: number;
  close: number;
  /** Direct members (node ids and child subgraph ids) using Mermaid's membership rules. */
  members: string[];
  depth: number;
}

export interface FlowNode {
  id: string;
  label: string;
  shape: string | null;
  parent: string | null;
}

export interface FlowModel {
  code: string;
  keyword: string;
  direction: string | null;
  statements: Statement[];
  nodes: Map<string, FlowNode>;
  edges: Edge[];
  subgraphs: Map<string, Subgraph>;
  /** Subgraph ids in source (opening) order. */
  subgraphOrder: string[];
  /** Offset where the diagram body (after front matter) starts. */
  bodyStart: number;
}

export class FlowParseError extends Error {}

/* ------------------------------------------------------------------ */
/* Statement splitting                                                 */
/* ------------------------------------------------------------------ */

interface RawStmt {
  start: number;
  end: number;
}

function frontMatterEnd(code: string): number {
  const m = code.match(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
  return m ? m[0].length : 0;
}

/** Split the body into statements on newlines / semicolons, skipping comments and directives. */
function splitStatements(code: string, from: number): RawStmt[] {
  const out: RawStmt[] = [];
  let i = from;
  let start = -1;
  let inQuote = false;
  let curly = 0;
  const flush = (end: number) => {
    if (start !== -1) {
      let e = end;
      while (e > start && /\s/.test(code[e - 1]!)) e--;
      if (e > start) out.push({ start, end: e });
    }
    start = -1;
  };
  while (i < code.length) {
    const c = code[i]!;
    if (inQuote) {
      if (c === '"') inQuote = false;
      i++;
      continue;
    }
    if (c === "%" && code[i + 1] === "%") {
      if (start === -1 || code.slice(start, i).trim() === "") {
        // comment or directive on its own
        if (code[i + 2] === "{") {
          const close = code.indexOf("}%%", i);
          i = close === -1 ? code.length : close + 3;
        } else {
          while (i < code.length && code[i] !== "\n") i++;
        }
        continue;
      }
      // trailing comment: end statement here
      flush(i);
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    if (c === "\n" || (c === ";" && curly === 0)) {
      flush(i);
      i++;
      continue;
    }
    if (start === -1 && !/\s/.test(c)) start = i;
    if (c === '"') inQuote = true;
    else if (c === "{" && code[i - 1] === "@") curly++;
    else if (c === "}" && curly > 0) curly--;
    i++;
  }
  flush(code.length);
  return out;
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

const ID_RE = /[\p{L}\p{N}_](?:[\p{L}\p{N}_.]|-(?=[\p{L}\p{N}_]))*/uy;
const WS_RE = /[ \t]*/y;

const SHAPES: { open: string; close: string[]; name: string }[] = [
  { open: "(((", close: [")))"], name: "doublecircle" },
  { open: "((", close: ["))"], name: "circle" },
  { open: "([", close: ["])"], name: "stadium" },
  { open: "(-", close: ["-)"], name: "ellipse" },
  { open: "[[", close: ["]]"], name: "subroutine" },
  { open: "[(", close: [")]"], name: "cylinder" },
  { open: "[/", close: ["/]", "\\]"], name: "lean" },
  { open: "[\\", close: ["\\]", "/]"], name: "lean" },
  { open: "{{", close: ["}}"], name: "hexagon" },
  { open: "(", close: [")"], name: "round" },
  { open: "[", close: ["]"], name: "square" },
  { open: "{", close: ["}"], name: "diamond" },
  { open: ">", close: ["]"], name: "odd" },
];

export function shapeName(open: string): string {
  return SHAPES.find((s) => s.open === open)?.name ?? (open === "@{" ? "custom" : "square");
}

export function decodeLabel(raw: string): string {
  let s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.length >= 2 && s.startsWith("`") && s.endsWith("`")) s = s.slice(1, -1);
  return s
    .replace(/#quot;/g, '"')
    .replace(/#35;/g, "#")
    .replace(/#59;/g, ";")
    .replace(/#lt;/g, "<")
    .replace(/#gt;/g, ">")
    .replace(/#amp;/g, "&");
}

function metaLabel(raw: string): string | null {
  const m = raw.match(/label\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,}\n]+))/);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim();
}

class Cursor {
  constructor(
    readonly code: string,
    public pos: number,
    readonly end: number,
  ) {}
  ws() {
    WS_RE.lastIndex = this.pos;
    WS_RE.exec(this.code);
    this.pos = Math.min(WS_RE.lastIndex, this.end);
  }
  done() {
    return this.pos >= this.end;
  }
  startsWith(s: string) {
    return this.code.startsWith(s, this.pos) && this.pos + s.length <= this.end;
  }
  match(re: RegExp): RegExpExecArray | null {
    const sticky = new RegExp(re.source, re.flags.includes("y") ? re.flags : re.flags + "y");
    sticky.lastIndex = this.pos;
    const m = sticky.exec(this.code);
    if (!m || sticky.lastIndex > this.end) return null;
    this.pos = sticky.lastIndex;
    return m;
  }
}

function parseShape(c: Cursor): Shape | null {
  const start = c.pos;
  if (c.startsWith("@{")) {
    let depth = 0;
    let q = false;
    for (let i = c.pos + 1; i < c.end; i++) {
      const ch = c.code[i];
      if (q) {
        if (ch === '"') q = false;
        continue;
      }
      if (ch === '"') q = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        c.pos = i + 1;
        const raw = c.code.slice(start, c.pos);
        return { open: "@{", close: "}", raw, label: metaLabel(raw) ?? "", start, end: c.pos };
      }
    }
    throw new FlowParseError("Unclosed @{");
  }
  for (const s of SHAPES) {
    if (!c.startsWith(s.open)) continue;
    let i = c.pos + s.open.length;
    while (i < c.end && (c.code[i] === " " || c.code[i] === "\t")) i++;
    let contentEnd = -1;
    let closeTok = "";
    if (c.code[i] === '"') {
      const q = c.code.indexOf('"', i + 1);
      if (q === -1 || q >= c.end) throw new FlowParseError("Unclosed string");
      let j = q + 1;
      while (j < c.end && (c.code[j] === " " || c.code[j] === "\t")) j++;
      const tok = s.close.find((t) => c.code.startsWith(t, j));
      if (!tok) continue;
      contentEnd = j;
      closeTok = tok;
    } else {
      let best = -1;
      for (const t of s.close) {
        const k = c.code.indexOf(t, i);
        if (k !== -1 && k < c.end && (best === -1 || k < best)) {
          best = k;
          closeTok = t;
        }
      }
      if (best === -1) continue;
      contentEnd = best;
    }
    const contentStart = c.pos + s.open.length;
    const label = decodeLabel(c.code.slice(contentStart, contentEnd));
    c.pos = contentEnd + closeTok.length;
    return { open: s.open, close: closeTok, raw: c.code.slice(start, c.pos), label, start, end: c.pos };
  }
  return null;
}

function parseNodeRef(c: Cursor): NodeRef | null {
  const start = c.pos;
  const m = c.match(ID_RE);
  if (!m) return null;
  const id = m[0];
  const idEnd = c.pos;
  // `id@-->` is an edge id, not a node — leave it for the link parser.
  const shape = c.code[c.pos] === "@" && c.code[c.pos + 1] !== "{" ? null : parseShape(c);
  const classes: string[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = c.match(/:::([\p{L}\p{N}_-]+)/u))) classes.push(cm[1]!);
  return { id, start, end: c.pos, idEnd, shape, classes };
}

const LINK_PLAIN: { re: RegExp; stroke: Stroke }[] = [
  { re: /[xo<]?-\.+-[>xo]?/, stroke: "dotted" },
  { re: /[xo<]?-{2,}[>xo]|[xo<]?-{3,}/, stroke: "normal" },
  { re: /[xo<]?={2,}[>xo]|[xo<]?={3,}/, stroke: "thick" },
  { re: /~{3,}/, stroke: "invisible" },
];

const LINK_TEXT: { start: RegExp; close: RegExp; stroke: Stroke }[] = [
  { start: /([xo<]?)-\.(?=\s)/, close: /\.+-[>xo]?/, stroke: "dotted" },
  { start: /([xo<]?)--(?=\s)/, close: /-{2,}[>xo]|-{3,}/, stroke: "normal" },
  { start: /([xo<]?)==(?=\s)/, close: /={2,}[>xo]|={3,}/, stroke: "thick" },
];

function parseLink(c: Cursor): LinkTok | null {
  const start = c.pos;
  let edgeId: string | null = null;
  const idm = c.match(/([\p{L}\p{N}_-]+)@(?=[-=.~<ox])/u);
  if (idm) edgeId = idm[1]!;

  for (const l of LINK_PLAIN) {
    const m = c.match(l.re);
    if (!m) continue;
    const plain = m[0];
    let label = "";
    const save = c.pos;
    c.ws();
    const pm = c.match(/\|((?:"[^"]*"|[^|"])*)\|/);
    if (pm) label = decodeLabel(pm[1]!);
    else c.pos = save;
    return { start, end: c.pos, raw: c.code.slice(start, c.pos), edgeId, plain, stroke: l.stroke, label };
  }
  for (const l of LINK_TEXT) {
    const m = c.match(l.start);
    if (!m) continue;
    const marker = m[1] ?? "";
    const textStart = c.pos;
    const closeRe = new RegExp(l.close.source, "g");
    closeRe.lastIndex = textStart;
    const cm = closeRe.exec(c.code);
    if (!cm || cm.index + cm[0].length > c.end) throw new FlowParseError("Unterminated link text");
    const label = decodeLabel(c.code.slice(textStart, cm.index));
    c.pos = cm.index + cm[0].length;
    const plain = marker + (l.stroke === "dotted" ? "-" + cm[0] : cm[0]);
    return { start, end: c.pos, raw: c.code.slice(start, c.pos), edgeId, plain, stroke: l.stroke, label };
  }
  c.pos = start;
  return null;
}

function parseVertexStatement(code: string, s: RawStmt): { groups: NodeRef[][]; links: LinkTok[] } {
  const c = new Cursor(code, s.start, s.end);
  const groups: NodeRef[][] = [];
  const links: LinkTok[] = [];
  for (;;) {
    const group: NodeRef[] = [];
    for (;;) {
      c.ws();
      const n = parseNodeRef(c);
      if (!n) throw new FlowParseError(`Expected a node at "${code.slice(c.pos, c.pos + 20)}"`);
      group.push(n);
      c.ws();
      if (c.startsWith("&")) {
        c.pos++;
        continue;
      }
      break;
    }
    groups.push(group);
    c.ws();
    if (c.done()) break;
    const link = parseLink(c);
    if (!link) throw new FlowParseError(`Unexpected "${code.slice(c.pos, Math.min(c.end, c.pos + 20))}"`);
    links.push(link);
  }
  if (groups.length !== links.length + 1) throw new FlowParseError("Dangling link");
  return { groups, links };
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

function indentAt(code: string, offset: number): string {
  let ls = offset;
  while (ls > 0 && code[ls - 1] !== "\n") ls--;
  const m = code.slice(ls, offset).match(/^[ \t]*/);
  return m ? m[0] : "";
}

export function isFlowchart(code: string): boolean {
  const body = code.slice(frontMatterEnd(code));
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("%%")) continue;
    return /^(flowchart|graph)\b/.test(t);
  }
  return false;
}

export function parseFlow(code: string): FlowModel {
  const bodyStart = frontMatterEnd(code);
  const raws = splitStatements(code, bodyStart);
  if (!raws.length) throw new FlowParseError("Empty diagram");

  const statements: Statement[] = [];
  const stack: { sgIndex: number; list: string[] }[] = [];
  const subgraphs = new Map<string, Subgraph>();
  const subgraphOrder: string[] = [];
  let subCount = 0;
  const rootList: string[] = [];
  /** Subgraphs that have closed, in close order (Mermaid processes membership at close). */
  const closed: Subgraph[] = [];
  const pendingOpen: { stmt: number; explicitId: string | null; title: string }[] = [];

  let keyword = "";
  let direction: string | null = null;

  raws.forEach((r, idx) => {
    const text = code.slice(r.start, r.end);
    const base = { start: r.start, end: r.end, indent: indentAt(code, r.start), block: null as string | null };
    const currentList = () => (stack.length ? stack[stack.length - 1]!.list : rootList);

    if (idx === 0) {
      const m = text.match(/^(flowchart-elk|flowchart|graph)(?:[ \t]+(TB|TD|BT|RL|LR|<|>|\^|v))?[ \t]*$/);
      if (!m) throw new FlowParseError("Not a flowchart");
      keyword = m[1]!;
      direction = m[2] ?? null;
      statements.push({ ...base, kind: "header", keyword, direction });
      return;
    }

    let m: RegExpMatchArray | null;
    if ((m = text.match(/^subgraph(?:[ \t]+(.*))?$/s))) {
      const rest = (m[1] ?? "").trim();
      let explicitId: string | null = null;
      let title = "";
      const bm = rest.match(/^([^\s[\]"]+)[ \t]*\[(.*)\]$/s);
      if (bm) {
        explicitId = bm[1]!;
        title = decodeLabel(bm[2]!);
      } else if (/\s/.test(rest)) {
        title = decodeLabel(rest);
      } else {
        explicitId = decodeLabel(rest);
        title = explicitId;
      }
      statements.push({ ...base, kind: "subgraph", sg: "", explicitId: explicitId !== null, title });
      pendingOpen.push({ stmt: statements.length - 1, explicitId, title });
      stack.push({ sgIndex: statements.length - 1, list: [] });
      return;
    }

    if (/^end$/.test(text)) {
      const frame = stack.pop();
      if (!frame) throw new FlowParseError("`end` without `subgraph`");
      const open = pendingOpen.pop()!;
      const id = open.explicitId ?? `subGraph${subCount}`;
      subCount++;
      // Mermaid: members are unique ids not already claimed by a previously closed subgraph.
      const seen = new Set<string>();
      const members: string[] = [];
      for (const n of frame.list) {
        if (seen.has(n) || n === id) continue;
        seen.add(n);
        if (closed.some((sg) => sg.members.includes(n))) continue;
        members.push(n);
      }
      const existing = subgraphs.get(id);
      if (existing) {
        existing.members.push(...members);
        existing.close = statements.length;
      } else {
        const sg: Subgraph = {
          id,
          title: open.title,
          explicitId: open.explicitId !== null,
          parent: null,
          open: open.stmt,
          close: statements.length,
          members,
          depth: 0,
        };
        subgraphs.set(id, sg);
        closed.push(sg);
      }
      const openStmt = statements[open.stmt] as Extract<Statement, { kind: "subgraph" }>;
      openStmt.sg = id;
      statements.push({ ...base, kind: "end", sg: id });
      // The subgraph's id is a member of the enclosing block.
      currentList().push(id);
      return;
    }

    if ((m = text.match(/^direction[ \t]+(TB|TD|BT|RL|LR)\b/))) {
      statements.push({ ...base, kind: "direction", value: m[1]! });
      return;
    }
    if (/^classDef[ \t]/.test(text)) {
      statements.push({ ...base, kind: "classDef" });
      return;
    }
    if ((m = text.match(/^(class[ \t]+)([^\s]+)[ \t]+([\p{L}\p{N}_-]+)[ \t]*$/u))) {
      let off = r.start + m[1]!.length;
      const ids = m[2]!.split(",").map((id) => {
        const item = { id: id.trim(), start: off, end: off + id.length };
        off += id.length + 1;
        return item;
      });
      statements.push({ ...base, kind: "class", ids, className: m[3]! });
      return;
    }
    if ((m = text.match(/^(style[ \t]+)([^\s]+)/))) {
      const idStart = r.start + m[1]!.length;
      statements.push({ ...base, kind: "style", id: m[2]!, idStart, idEnd: idStart + m[2]!.length });
      return;
    }
    if ((m = text.match(/^(click[ \t]+)([^\s]+)/))) {
      const idStart = r.start + m[1]!.length;
      statements.push({ ...base, kind: "click", id: m[2]!, idStart, idEnd: idStart + m[2]!.length });
      return;
    }
    if ((m = text.match(/^(linkStyle[ \t]+)([^\s]+)/))) {
      const listStart = r.start + m[1]!.length;
      if (m[2] === "default") {
        statements.push({ ...base, kind: "linkStyle", indices: "default" });
      } else {
        let off = listStart;
        const indices = m[2]!.split(",").map((v) => {
          const item = { value: Number(v), start: off, end: off + v.length };
          off += v.length + 1;
          return item;
        });
        statements.push({ ...base, kind: "linkStyle", indices });
      }
      return;
    }
    if (/^(accTitle|accDescr)\b/.test(text)) {
      statements.push({ ...base, kind: "other" });
      return;
    }

    const { groups, links } = parseVertexStatement(code, r);
    statements.push({ ...base, kind: "vertex", groups, links });
    for (const g of groups) for (const n of g) currentList().push(n.id);
  });

  if (stack.length) throw new FlowParseError("Unclosed subgraph");

  // Fill in each statement's direct block.
  const blockStack: string[] = [];
  for (const s of statements) {
    if (s.kind === "end") blockStack.pop();
    s.block = blockStack[blockStack.length - 1] ?? null;
    if (s.kind === "subgraph") blockStack.push(s.sg);
  }

  // Subgraph parents & order.
  for (const sg of subgraphs.values()) {
    for (const m of sg.members) {
      const child = subgraphs.get(m);
      if (child && child !== sg) child.parent = sg.id;
    }
  }
  const opens = statements
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s.kind === "subgraph")
    .map(([s]) => (s as Extract<Statement, { kind: "subgraph" }>).sg);
  for (const id of opens) if (!subgraphOrder.includes(id)) subgraphOrder.push(id);
  for (const sg of subgraphs.values()) {
    let d = 0;
    let p = sg.parent;
    while (p && d < 50) {
      d++;
      p = subgraphs.get(p)?.parent ?? null;
    }
    sg.depth = d;
  }

  // Nodes, labels and edges.
  const nodes = new Map<string, FlowNode>();
  const edges: Edge[] = [];
  const touch = (id: string) => {
    if (subgraphs.has(id)) return null;
    let n = nodes.get(id);
    if (!n) {
      n = { id, label: id, shape: null, parent: null };
      nodes.set(id, n);
    }
    return n;
  };
  const pairCount = new Map<string, number>();
  const usedIds = new Set<string>();
  statements.forEach((s, si) => {
    if (s.kind === "vertex") {
      for (const g of s.groups) {
        for (const ref of g) {
          const n = touch(ref.id);
          if (n && ref.shape) {
            if (ref.shape.open === "@{") {
              const ml = metaLabel(ref.shape.raw);
              if (ml !== null) n.label = ml;
              const shp = ref.shape.raw.match(/shape\s*:\s*([\w-]+)/);
              if (shp) n.shape = shp[1]!;
            } else {
              n.label = ref.shape.label;
              n.shape = shapeName(ref.shape.open);
            }
          }
        }
      }
      s.links.forEach((link, li) => {
        for (const a of s.groups[li]!) {
          for (const b of s.groups[li + 1]!) {
            const key = `${a.id}\u0000${b.id}`;
            const count = pairCount.get(key) ?? 0;
            let id: string;
            if (link.edgeId && !usedIds.has(link.edgeId)) id = link.edgeId;
            else id = `L_${a.id}_${b.id}_${count === 0 ? 0 : count + 1}`;
            pairCount.set(key, count + 1);
            usedIds.add(id);
            edges.push({ index: edges.length, id, from: a.id, to: b.id, label: link.label, stroke: link.stroke, stmt: si, link: li });
          }
        }
      });
    } else if (s.kind === "class") {
      for (const i of s.ids) touch(i.id);
    } else if (s.kind === "style") {
      touch(s.id);
    }
  });

  for (const sg of subgraphs.values()) {
    for (const m of sg.members) {
      const n = nodes.get(m);
      if (n) n.parent = sg.id;
    }
  }

  return { code, keyword, direction, statements, nodes, edges, subgraphs, subgraphOrder, bodyStart };
}

/** Parse, returning null instead of throwing (for non-flowcharts or syntax Mermade can't handle). */
export function tryParseFlow(code: string): FlowModel | null {
  if (!isFlowchart(code)) return null;
  try {
    return parseFlow(code);
  } catch {
    return null;
  }
}

/** Ancestors of a subgraph or node, innermost first. */
export function ancestors(model: FlowModel, id: string): string[] {
  const out: string[] = [];
  let p = model.nodes.get(id)?.parent ?? model.subgraphs.get(id)?.parent ?? null;
  while (p && out.length < 100) {
    out.push(p);
    p = model.subgraphs.get(p)?.parent ?? null;
  }
  return out;
}

/** All node ids inside a subgraph, recursively. */
export function descendantNodes(model: FlowModel, sgId: string): string[] {
  const sg = model.subgraphs.get(sgId);
  if (!sg) return [];
  const out: string[] = [];
  for (const m of sg.members) {
    if (model.subgraphs.has(m)) out.push(...descendantNodes(model, m));
    else if (model.nodes.has(m)) out.push(m);
  }
  return out;
}
