/**
 * Source-level edits for flowcharts. Each operation patches the original text — only the
 * statements it has to touch are rewritten, so formatting and comments elsewhere survive.
 */
import { parseFlow, type Edge, type FlowModel, type NodeRef, type Statement } from "./parse";

interface Patch {
  start: number;
  end: number;
  text: string;
}

type VertexStmt = Extract<Statement, { kind: "vertex" }>;

function applyPatches(code: string, patches: Patch[]): string {
  const sorted = [...patches].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = code;
  let lastStart = Infinity;
  for (const p of sorted) {
    if (p.end > lastStart) throw new Error("Overlapping edits");
    out = out.slice(0, p.start) + p.text + out.slice(p.end);
    lastStart = p.start;
  }
  return out;
}

/* ---------------- text helpers ---------------- */

export function quoteLabel(label: string): string {
  return `"${label.replace(/"/g, "#quot;").replace(/\n/g, "<br>")}"`;
}

function edgeLabelText(label: string): string {
  return /[|"]/.test(label) || label !== label.trim() ? quoteLabel(label) : label;
}

function lineStart(code: string, offset: number): number {
  let i = offset;
  while (i > 0 && code[i - 1] !== "\n") i--;
  return i;
}

function lineEnd(code: string, offset: number): number {
  const i = code.indexOf("\n", offset);
  return i === -1 ? code.length : i;
}

function removeStatement(code: string, s: { start: number; end: number }): Patch {
  const ls = lineStart(code, s.start);
  const le = lineEnd(code, s.end);
  const before = code.slice(ls, s.start);
  const after = code.slice(s.end, le);
  if (!before.trim() && !after.replace(/^\s*;?\s*/, "").trim()) {
    return { start: ls, end: Math.min(code.length, le + 1), text: "" };
  }
  const semi = /^\s*;/.exec(after);
  return { start: s.start, end: s.end + (semi ? semi[0].length : 0), text: "" };
}

function rootIndent(model: FlowModel): string {
  return model.statements.find((s) => s.kind !== "header" && s.block === null)?.indent ?? "    ";
}

/** The file's indentation step, inferred from an existing subgraph body (or the root). */
function indentUnit(model: FlowModel): string {
  for (const sg of model.subgraphs.values()) {
    const open = model.statements[sg.open]!;
    const inner = model.statements.slice(sg.open + 1, sg.close).find((s) => s.block === sg.id);
    if (inner && inner.indent.startsWith(open.indent) && inner.indent.length > open.indent.length) {
      return inner.indent.slice(open.indent.length);
    }
  }
  const root = rootIndent(model);
  return root || "    ";
}

function blockIndent(model: FlowModel, sgId: string): string {
  const sg = model.subgraphs.get(sgId)!;
  const inner = model.statements.slice(sg.open + 1, sg.close).find((s) => s.block === sgId);
  if (inner) return inner.indent;
  return model.statements[sg.open]!.indent + indentUnit(model);
}

/** Insert a statement as the last line of a subgraph block (or of the root). */
function insertInBlock(model: FlowModel, block: string | null, text: string): Patch {
  const code = model.code;
  if (block) {
    const sg = model.subgraphs.get(block);
    if (!sg) throw new Error(`Unknown subgraph ${block}`);
    const end = model.statements[sg.close]!;
    const ls = lineStart(code, end.start);
    if (code.slice(ls, end.start).trim()) return { start: end.start, end: end.start, text: `${text}; ` };
    return { start: ls, end: ls, text: `${blockIndent(model, block)}${text}\n` };
  }
  // Root: after the last root-level graph statement (keeps classDef/style lines at the bottom).
  let anchor: Statement | undefined;
  for (const s of model.statements) {
    if (s.block === null && (s.kind === "vertex" || s.kind === "end" || s.kind === "header")) anchor = s;
  }
  const at = lineEnd(code, anchor!.end);
  return { start: at, end: at, text: `\n${rootIndent(model)}${text}` };
}

function slug(label: string): string {
  let s = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (!s) s = "node";
  if (/^\d/.test(s)) s = "n_" + s;
  if (/^(end|subgraph|graph|flowchart|style|class|classDef|click|linkStyle|direction)$/.test(s)) s += "_1";
  return s;
}

export function uniqueId(model: FlowModel, label: string): string {
  const base = slug(label);
  let id = base;
  let i = 2;
  while (model.nodes.has(id) || model.subgraphs.has(id)) id = `${base}_${i++}`;
  return id;
}

/* ---------------- statement rewriting ---------------- */

function refText(code: string, ref: NodeRef): string {
  return code.slice(ref.start, ref.end);
}

/** The most descriptive ref for a node within a statement (one carrying a shape, else classes). */
function definingRef(stmt: VertexStmt, id: string): NodeRef | undefined {
  const refs = stmt.groups.flat().filter((r) => r.id === id);
  return refs.find((r) => r.shape) ?? refs.find((r) => r.classes.length) ?? refs[0];
}

function mentionedElsewhere(model: FlowModel, id: string, block: string | null, exclude: number): boolean {
  return model.statements.some(
    (s, i) => i !== exclude && s.kind === "vertex" && s.block === block && s.groups.some((g) => g.some((r) => r.id === id)),
  );
}

interface RewriteOpts {
  dropEdges?: Set<number>;
  relabel?: Map<number, string>;
  dropNodes?: Set<string>;
}

/**
 * Re-emit a vertex statement as one line per edge, minus dropped edges/nodes. Nodes that would
 * otherwise lose their shape, class or block membership get a standalone line.
 * Returns null when nothing is left.
 */
function rewriteVertex(model: FlowModel, stmtIndex: number, opts: RewriteOpts): string | null {
  const code = model.code;
  const stmt = model.statements[stmtIndex] as VertexStmt;
  const edges = model.edges.filter((e) => e.stmt === stmtIndex);
  const dropNodes = opts.dropNodes ?? new Set<string>();
  const kept = edges.filter((e) => !opts.dropEdges?.has(e.index) && !dropNodes.has(e.from) && !dropNodes.has(e.to));

  const lines: string[] = [];
  const emitted = new Set<string>();
  const nodeText = (id: string) => {
    if (emitted.has(id)) return id;
    emitted.add(id);
    const ref = definingRef(stmt, id);
    return ref ? refText(code, ref) : id;
  };
  for (const e of kept) {
    const link = stmt.links[e.link]!;
    const label = opts.relabel?.get(e.index) ?? e.label;
    const prefix = link.edgeId && link.edgeId === e.id ? `${link.edgeId}@` : "";
    const op = prefix + link.plain + (label ? `|${edgeLabelText(label)}|` : "");
    lines.push(`${nodeText(e.from)} ${op} ${nodeText(e.to)}`);
  }
  const ids = [...new Set(stmt.groups.flat().map((r) => r.id))];
  for (const id of ids) {
    if (emitted.has(id) || dropNodes.has(id) || model.subgraphs.has(id)) continue;
    const ref = definingRef(stmt, id)!;
    const decorated = !!ref.shape || ref.classes.length > 0;
    if (decorated || !mentionedElsewhere(model, id, stmt.block, stmtIndex)) lines.push(nodeText(id));
  }
  return lines.length ? lines.join(`\n${stmt.indent}`) : null;
}

function rewritePatch(model: FlowModel, stmtIndex: number, opts: RewriteOpts): Patch {
  const stmt = model.statements[stmtIndex]!;
  const text = rewriteVertex(model, stmtIndex, opts);
  return text === null ? removeStatement(model.code, stmt) : { start: stmt.start, end: stmt.end, text };
}

/* ---------------- linkStyle bookkeeping ---------------- */

function edgeKeys(edges: Edge[]): string[] {
  const seen = new Map<string, number>();
  return edges.map((e) => {
    const base = `${e.from}\u0000${e.to}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}\u0000${n}`;
  });
}

/**
 * After an edit, `linkStyle` indices still refer to the old edge order. Re-point them at the
 * same edges in the new order (and drop styles for edges that no longer exist).
 */
function remapLinkStyles(before: FlowModel, code: string, renamed?: Map<number, number>): string {
  const after = parseFlow(code);
  const hasLinkStyle = after.statements.some((s) => s.kind === "linkStyle" && s.indices !== "default");
  if (!hasLinkStyle) return code;
  const oldKeys = edgeKeys(before.edges);
  const newIndex = new Map(edgeKeys(after.edges).map((k, i) => [k, i]));
  const map = (old: number): number | undefined => {
    if (renamed?.has(old)) return renamed.get(old);
    const key = oldKeys[old];
    return key === undefined ? undefined : newIndex.get(key);
  };
  const patches: Patch[] = [];
  for (const s of after.statements) {
    if (s.kind !== "linkStyle" || s.indices === "default") continue;
    const mapped = s.indices.map((i) => map(i.value)).filter((v): v is number => v !== undefined);
    const first = s.indices[0]!;
    const last = s.indices[s.indices.length - 1]!;
    if (!mapped.length) patches.push(removeStatement(code, s));
    else patches.push({ start: first.start, end: last.end, text: [...new Set(mapped)].join(",") });
  }
  return applyPatches(code, patches);
}

function finish(model: FlowModel, patches: Patch[]): string {
  const code = applyPatches(model.code, patches);
  return remapLinkStyles(model, code);
}

/* ---------------- operations ---------------- */

export function renameNode(code: string, id: string, label: string): string {
  const model = parseFlow(code);
  const patches: Patch[] = [];
  let firstRef: NodeRef | null = null;
  for (const s of model.statements) {
    if (s.kind !== "vertex") continue;
    for (const ref of s.groups.flat()) {
      if (ref.id !== id) continue;
      firstRef ??= ref;
      if (!ref.shape) continue;
      const { shape } = ref;
      let text: string;
      if (shape.open === "@{") {
        text = /label\s*:/.test(shape.raw)
          ? shape.raw.replace(/label\s*:\s*(?:"[^"]*"|'[^']*'|[^,}\n]+)/, `label: ${quoteLabel(label)}`)
          : shape.raw.replace(/\s*}$/, `, label: ${quoteLabel(label)} }`);
      } else {
        text = `${shape.open}${quoteLabel(label)}${shape.close}`;
      }
      patches.push({ start: shape.start, end: shape.end, text });
    }
  }
  if (!patches.length) {
    if (firstRef) patches.push({ start: firstRef.idEnd, end: firstRef.idEnd, text: `[${quoteLabel(label)}]` });
    else patches.push(insertInBlock(model, model.nodes.get(id)?.parent ?? null, `${id}[${quoteLabel(label)}]`));
  }
  return finish(model, patches);
}

export function renameSubgraph(code: string, sgId: string, title: string): string {
  const model = parseFlow(code);
  const sg = model.subgraphs.get(sgId);
  if (!sg) throw new Error(`Unknown group ${sgId}`);
  const stmt = model.statements[sg.open]!;
  const id = sg.explicitId ? sg.id : uniqueId(model, title);
  return finish(model, [{ start: stmt.start, end: stmt.end, text: `subgraph ${id}[${quoteLabel(title)}]` }]);
}

export function addEdge(code: string, from: string, to: string, label = ""): string {
  const model = parseFlow(code);
  const op = "-->" + (label ? `|${edgeLabelText(label)}|` : "");
  return finish(model, [insertInBlock(model, null, `${from} ${op} ${to}`)]);
}

export function removeEdges(code: string, indices: number[]): string {
  const model = parseFlow(code);
  const drop = new Set(indices);
  const stmts = new Set(model.edges.filter((e) => drop.has(e.index)).map((e) => e.stmt));
  return finish(
    model,
    [...stmts].map((si) => rewritePatch(model, si, { dropEdges: drop })),
  );
}

export function setEdgeLabel(code: string, index: number, label: string): string {
  const model = parseFlow(code);
  const edge = model.edges[index];
  if (!edge) throw new Error("Unknown connection");
  const stmt = model.statements[edge.stmt] as VertexStmt;
  const link = stmt.links[edge.link]!;
  const simple = stmt.groups[edge.link]!.length === 1 && stmt.groups[edge.link + 1]!.length === 1;
  if (simple) {
    const prefix = link.edgeId ? `${link.edgeId}@` : "";
    const text = prefix + link.plain + (label ? `|${edgeLabelText(label)}|` : "");
    return finish(model, [{ start: link.start, end: link.end, text }]);
  }
  return finish(model, [rewritePatch(model, edge.stmt, { relabel: new Map([[index, label]]) })]);
}

export function reverseEdge(code: string, index: number): string {
  const model = parseFlow(code);
  const e = model.edges[index];
  if (!e) throw new Error("Unknown connection");
  const removed = removeEdges(code, [index]);
  return addEdge(removed, e.to, e.from, e.label);
}

export function addNode(code: string, label: string, parent: string | null): { code: string; id: string } {
  const model = parseFlow(code);
  const id = uniqueId(model, label);
  return { code: finish(model, [insertInBlock(model, parent, `${id}[${quoteLabel(label)}]`)]), id };
}

/** Delete nodes along with their connections, class/style/click references. */
export function deleteNodes(code: string, ids: Iterable<string>): string {
  const model = parseFlow(code);
  const drop = new Set(ids);
  const patches: Patch[] = [];
  model.statements.forEach((s, i) => {
    if (s.kind === "vertex") {
      if (s.groups.some((g) => g.some((r) => drop.has(r.id)))) patches.push(rewritePatch(model, i, { dropNodes: drop }));
    } else if (s.kind === "class") {
      const keep = s.ids.filter((x) => !drop.has(x.id));
      if (keep.length === s.ids.length) return;
      if (!keep.length) patches.push(removeStatement(model.code, s));
      else patches.push({ start: s.ids[0]!.start, end: s.ids[s.ids.length - 1]!.end, text: keep.map((x) => x.id).join(",") });
    } else if ((s.kind === "style" || s.kind === "click") && drop.has(s.id)) {
      patches.push(removeStatement(model.code, s));
    }
  });
  return finish(model, patches);
}

export function deleteNode(code: string, id: string): string {
  return deleteNodes(code, [id]);
}

/** Move a node into a subgraph (or to the top level when `target` is null). */
export function moveNode(code: string, id: string, target: string | null): string {
  const model = parseFlow(code);
  const node = model.nodes.get(id);
  if (!node) throw new Error(`Unknown node ${id}`);
  if (node.parent === target) return code;
  if (target && !model.subgraphs.has(target)) throw new Error(`Unknown group ${target}`);

  const patches: Patch[] = [];
  const moved: string[] = [];
  let definition: string | null = null;
  const dropNodes = new Set([id]);

  model.statements.forEach((s, i) => {
    if (s.kind !== "vertex" || s.block === null || s.block === target) return;
    if (!s.groups.some((g) => g.some((r) => r.id === id))) return;
    const ref = definingRef(s, id)!;
    if (ref.shape || ref.classes.length) definition ??= refText(model.code, ref);
    for (const e of model.edges) {
      if (e.stmt !== i || (e.from !== id && e.to !== id)) continue;
      const link = s.links[e.link]!;
      const op = link.plain + (e.label ? `|${edgeLabelText(e.label)}|` : "");
      moved.push(`${e.from} ${op} ${e.to}`);
    }
    patches.push(rewritePatch(model, i, { dropNodes }));
  });

  // Mention the node in its new home; connections that lived inside old groups move to the top level.
  if (target) patches.push(insertInBlock(model, target, definition ?? id));
  else if (definition || !moved.length) {
    const stillMentioned = model.statements.some(
      (s) => s.kind === "vertex" && s.block === null && s.groups.some((g) => g.some((r) => r.id === id)),
    );
    if (definition || !stillMentioned) moved.unshift(definition ?? id);
  }
  if (moved.length) {
    const p = insertInBlock(model, null, moved[0]!);
    const indent = rootIndent(model);
    p.text += moved.slice(1).map((m) => `\n${indent}${m}`).join("");
    // Merge with a patch that inserts at the same spot (e.g. the target is root-level and empty).
    patches.push(p);
  }
  return finish(model, mergeSameInsertions(patches));
}

function mergeSameInsertions(patches: Patch[]): Patch[] {
  const out: Patch[] = [];
  for (const p of patches) {
    const same = out.find((q) => q.start === p.start && q.end === p.start && p.end === p.start);
    if (same) same.text += p.text;
    else out.push(p);
  }
  return out;
}

/** Remove a subgraph wrapper, keeping its contents in the parent (and dropping links to the group itself). */
export function ungroup(code: string, sgId: string): string {
  let model = parseFlow(code);
  if (!model.subgraphs.has(sgId)) throw new Error(`Unknown group ${sgId}`);
  // Connections to the group itself would otherwise turn into a new node with the group's id.
  const touching = model.edges.filter((e) => e.from === sgId || e.to === sgId).map((e) => e.index);
  if (touching.length) {
    code = removeEdges(code, touching);
    model = parseFlow(code);
  }
  const sg = model.subgraphs.get(sgId)!;
  const open = model.statements[sg.open]!;
  const end = model.statements[sg.close]!;
  const patches: Patch[] = [];
  model.statements.forEach((s) => {
    if ((s.kind === "style" || s.kind === "click") && s.id === sgId) patches.push(removeStatement(model.code, s));
  });

  // Dedent the body by the difference between the inner indent and the subgraph's indent.
  const bodyStart = lineEnd(model.code, open.end) + 1;
  const bodyEnd = lineStart(model.code, end.start);
  const inner = blockIndent(model, sgId);
  const strip = inner.startsWith(open.indent) ? inner.slice(open.indent.length) : "";
  const inline = model.code.slice(lineStart(model.code, open.start), open.start).trim() || model.code.slice(lineStart(model.code, end.start), end.start).trim();
  if (!inline && bodyStart <= bodyEnd && strip) {
    const body = model.code.slice(bodyStart, bodyEnd);
    const dedented = body
      .split("\n")
      .map((l) => (l.startsWith(strip) ? l.slice(strip.length) : l))
      .join("\n");
    patches.push(removeStatement(model.code, open));
    patches.push({ start: bodyStart, end: bodyEnd, text: dedented });
    patches.push(removeStatement(model.code, end));
  } else {
    patches.push(removeStatement(model.code, open), removeStatement(model.code, end));
  }
  return finish(model, patches);
}

/** Wrap nodes in a new subgraph. Returns the new code and the group id. */
export function groupNodes(code: string, ids: string[], title: string): { code: string; id: string } {
  const model = parseFlow(code);
  const sgId = uniqueId(model, title);
  // Create the group next to the first node's current parent so nesting stays natural.
  const parent = model.nodes.get(ids[0]!)?.parent ?? null;
  const indent = parent ? blockIndent(model, parent) : rootIndent(model);
  const p = insertInBlock(model, parent, `subgraph ${sgId}[${quoteLabel(title)}]`);
  p.text = parent ? `${p.text.replace(/\n$/, "")}\n${indent}end\n` : `${p.text}\n${indent}end`;
  let next = applyPatches(model.code, [p]);
  for (const id of ids) next = moveNode(next, id, sgId);
  return { code: next, id: sgId };
}

/** Move a subgraph (with its contents) into another subgraph or to the top level. */
export function moveSubgraph(code: string, sgId: string, target: string | null): string {
  const model = parseFlow(code);
  const sg = model.subgraphs.get(sgId);
  if (!sg) throw new Error(`Unknown group ${sgId}`);
  if (sg.parent === target || sgId === target) return code;
  // Refuse to move a group into its own descendant.
  let p = target;
  while (p) {
    if (p === sgId) throw new Error("Can't move a group into itself");
    p = model.subgraphs.get(p)?.parent ?? null;
  }
  const open = model.statements[sg.open]!;
  const end = model.statements[sg.close]!;
  const from = lineStart(model.code, open.start);
  const to = Math.min(model.code.length, lineEnd(model.code, end.end) + 1);
  let block = model.code.slice(from, to).replace(/\n$/, "");
  const targetIndent = target ? blockIndent(model, target) : rootIndent(model);
  // Re-indent the block to its new depth.
  block = block
    .split("\n")
    .map((l) => (l.startsWith(open.indent) ? targetIndent + l.slice(open.indent.length) : l))
    .join("\n");
  let insert: Patch;
  if (target) {
    const at = lineStart(model.code, model.statements[model.subgraphs.get(target)!.close]!.start);
    insert = { start: at, end: at, text: `${block}\n` };
  } else {
    insert = insertInBlock(model, null, "");
    if (insert.start >= from && insert.start <= to) insert = { start: model.code.length, end: model.code.length, text: "" };
    insert.text = `\n${block}`;
  }
  const removal: Patch = { start: from, end: to, text: "" };
  return finish(model, [removal, insert]);
}

export type { FlowModel };
