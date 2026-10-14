import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Diagram, DiagramView } from "../lib/diagram";
import { ancestors, descendantNodes, parseFlow, tryParseFlow, type FlowModel } from "../lib/flow/parse";
import { buildView, effectiveGraph, neighborhood, type ViewResult } from "../lib/flow/view";
import * as edit from "../lib/flow/edit";
import { verifyFlowModel } from "../lib/render";
import type { Highlight, Selection } from "../components/Preview";
import { nodeTitle, type FocusSettings, type InspectorActions } from "../components/GraphTools";

type Toast = (t: { kind: "success" | "error" | "info"; message: string; action?: { label: string; run: () => void } }) => void;

interface UndoEntry {
  docId: string;
  before: string;
  after: string;
}

/**
 * Everything the interactive preview needs: the parsed graph, view lenses (collapse / focus /
 * isolate), selection, and visual edits that patch the source with an undo stack.
 */
export function useGraph({
  active,
  patchCode,
  patchView,
  toast,
}: {
  active: Diagram | null;
  patchCode: (code: string) => void;
  patchView: (view: DiagramView) => void;
  toast: Toast;
}) {
  const code = active?.code ?? "";
  const docId = active?.id ?? "";
  const parsed = useMemo(() => tryParseFlow(code), [code]);
  // Optimistic until Mermaid's own parser disagrees with ours; then visual tools switch off.
  const [mismatch, setMismatch] = useState<string | null>(null);
  useEffect(() => {
    if (!parsed) return;
    let alive = true;
    const t = setTimeout(() => {
      verifyFlowModel(code, parsed).then((ok) => {
        if (alive && ok === false) setMismatch(code);
        else if (alive && ok === true) setMismatch(null);
      });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [code, parsed]);
  const model = parsed && mismatch !== code ? parsed : null;
  const unsupported = !!parsed && mismatch === code;

  const collapsedList = active?.view?.collapsed;
  const collapsed = useMemo(() => new Set(collapsedList ?? []), [collapsedList]);
  const setCollapsed = useCallback((s: Set<string>) => patchView({ collapsed: [...s] }), [patchView]);

  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState<FocusSettings>({ depth: 1, direction: "both", isolate: false });
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [zoomTo, setZoomTo] = useState<{ id: string; nonce: number } | null>(null);
  const [renameKey, setRenameKey] = useState(0);
  const [cursorOffset, setCursorOffset] = useState<number | null>(null);

  useEffect(() => {
    setSelection(null);
    setConnectFrom(null);
    setFocus((f) => ({ ...f, isolate: false }));
    setCursorOffset(null);
  }, [docId]);

  // Drop a selection whose target no longer exists.
  useEffect(() => {
    if (!model || !selection || selection.kind === "edge") return;
    const exists = selection.kind === "node" ? model.nodes.has(selection.id) : model.subgraphs.has(selection.id);
    if (!exists) setSelection(null);
  }, [model, selection]);

  const graph = useMemo(() => (model ? effectiveGraph(model, collapsed) : null), [model, collapsed]);

  /** Visible ids the focus starts from. */
  const focusStarts = useMemo((): string[] | null => {
    if (!model || !graph || !selection || selection.kind === "edge") return null;
    if (selection.kind === "node") return model.nodes.has(selection.id) ? [graph.rep(selection.id)] : null;
    if (!model.subgraphs.has(selection.id)) return null;
    const rep = graph.rep(selection.id);
    if (collapsed.has(rep)) return [rep];
    return [...new Set(descendantNodes(model, selection.id).map(graph.rep))];
  }, [model, graph, selection, collapsed]);

  const nb = useMemo(
    () => (graph && focusStarts?.length ? neighborhood(graph.edges, focusStarts, focus.depth, focus.direction) : null),
    [graph, focusStarts, focus.depth, focus.direction],
  );

  // Only an *isolating* focus changes what is rendered; plain selection just restyles the SVG.
  const isolateKey = focus.isolate && nb ? [...nb.nodes].sort().join("\u0000") : "";
  const view: ViewResult | null = useMemo(() => {
    if (!model) return null;
    const isolate = isolateKey ? new Set(isolateKey.split("\u0000")) : null;
    try {
      return buildView(code, model, { collapsed, isolate });
    } catch {
      return buildView(code, model, { collapsed: new Set(), isolate: null });
    }
  }, [code, model, collapsed, isolateKey]);

  // Selection of an edge refers to the *view* edge index; it is invalid once the view changes.
  const viewCode = view?.code;
  useEffect(() => {
    setSelection((s) => (s?.kind === "edge" ? null : s));
  }, [viewCode]);

  const highlight = useMemo((): Highlight | null => {
    if (!model || !graph || !view) return null;
    const groupsOf = (ids: Iterable<string>) => {
      const out = new Set<string>();
      for (const id of ids) ancestors(model, id).forEach((a) => out.add(a));
      return out;
    };
    const keyOf = (i: number) => {
      const e = view.model.edges[i]!;
      return `${graph.rep(e.from)}\u0000${graph.rep(e.to)}`;
    };
    if (selection?.kind === "edge") {
      const e = view.model.edges[selection.index];
      if (!e) return null;
      const nodes = new Set([graph.rep(e.from), graph.rep(e.to)]);
      return { nodes, groups: groupsOf(nodes), edges: new Set([selection.index]) };
    }
    if (!nb) return null;
    const edges = new Set<number>();
    view.model.edges.forEach((_, i) => nb.edges.has(keyOf(i)) && edges.add(i));
    const groups = groupsOf(nb.nodes);
    if (selection?.kind === "group") groups.add(selection.id);
    return { nodes: nb.nodes, groups, edges };
  }, [model, graph, view, selection, nb]);

  const edgeSources = useMemo(
    () => (selection?.kind === "edge" && view ? (view.sources[selection.index] ?? []) : []),
    [selection, view],
  );

  /* ---------------- code ↔ preview linking ---------------- */

  const editorHighlight = useMemo(() => {
    if (!model || !selection) return null;
    const ranges: { from: number; to: number }[] = [];
    if (selection.kind === "node") {
      for (const s of model.statements) {
        if (s.kind !== "vertex") continue;
        const refs = s.groups.flat().filter((r) => r.id === selection.id);
        if (refs.some((r) => r.shape)) ranges.unshift({ from: s.start, to: s.end });
        else if (refs.length && ranges.length < 1) ranges.push({ from: s.start, to: s.end });
      }
      return ranges.slice(0, 1);
    }
    if (selection.kind === "group") {
      const sg = model.subgraphs.get(selection.id);
      if (!sg) return null;
      const open = model.statements[sg.open]!;
      return [{ from: open.start, to: open.end }];
    }
    for (const i of edgeSources) {
      const e = model.edges[i];
      if (!e) continue;
      const s = model.statements[e.stmt]!;
      ranges.push({ from: s.start, to: s.end });
    }
    return ranges;
  }, [model, selection, edgeSources]);

  const cursorNodes = useMemo(() => {
    const out = new Set<string>();
    if (!model || !graph || cursorOffset === null) return out;
    const s = model.statements.find((st) => st.start <= cursorOffset && cursorOffset <= st.end);
    if (s?.kind === "vertex") s.groups.flat().forEach((r) => model.nodes.has(r.id) && out.add(graph.rep(r.id)));
    return out;
  }, [model, graph, cursorOffset]);

  /* ---------------- edits ---------------- */

  const codeRef = useRef(code);
  codeRef.current = code;
  const docRef = useRef(docId);
  docRef.current = docId;
  const undoStack = useRef<UndoEntry[]>([]);

  const undo = useCallback(() => {
    const top = undoStack.current[undoStack.current.length - 1];
    if (!top || top.docId !== docRef.current || top.after !== codeRef.current) {
      toast({ kind: "info", message: "Nothing to undo here — use the editor's undo for text changes" });
      return;
    }
    undoStack.current.pop();
    patchCode(top.before);
  }, [patchCode, toast]);

  const apply = useCallback(
    (fn: (code: string) => string, message: string) => {
      const before = codeRef.current;
      let after: string;
      try {
        after = fn(before);
      } catch (e) {
        toast({ kind: "error", message: (e as Error).message || "That edit isn't possible" });
        return false;
      }
      if (after === before) return false;
      undoStack.current.push({ docId: docRef.current, before, after });
      if (undoStack.current.length > 100) undoStack.current.shift();
      patchCode(after);
      toast({ kind: "success", message, action: { label: "Undo", run: undo } });
      return true;
    },
    [patchCode, toast, undo],
  );

  const title = useCallback((id: string) => (model ? nodeTitle(model, id) : id), [model]);

  const toggleCollapse = useCallback(
    (id: string) => {
      const next = new Set(collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setCollapsed(next);
      setSelection((s) => {
        // Selecting a node that just disappeared into a group: select the group instead.
        if (s?.kind === "node" && model && next.has(id) && ancestors(model, s.id).includes(id)) return { kind: "group", id };
        return s?.kind === "edge" ? null : s;
      });
    },
    [collapsed, setCollapsed, model],
  );

  const actions: InspectorActions = useMemo(
    () => ({
      renameNode: (id, label) => label.trim() && apply((c) => edit.renameNode(c, id, label.trim()), `Renamed to “${label.trim()}”`),
      renameGroup: (id, t) => {
        let newId = id;
        const ok = apply((c) => {
          const m = parseFlow(c);
          // Groups declared with an implicit id get a readable explicit one on rename.
          if (!m.subgraphs.get(id)?.explicitId) newId = edit.uniqueId(m, t);
          return edit.renameSubgraph(c, id, t);
        }, `Renamed group to “${t}”`);
        if (ok && newId !== id) {
          setSelection({ kind: "group", id: newId });
          if (collapsed.has(id)) setCollapsed(new Set([...collapsed].map((x) => (x === id ? newId : x))));
        }
      },
      moveNode: (id, target) =>
        apply((c) => edit.moveNode(c, id, target), target ? `Moved “${title(id)}” into “${title(target)}”` : `Moved “${title(id)}” to the top level`),
      moveGroup: (id, target) =>
        apply((c) => edit.moveSubgraph(c, id, target), target ? `Moved group into “${title(target)}”` : "Moved group to the top level"),
      deleteNode: (id) => {
        if (apply((c) => edit.deleteNode(c, id), `Deleted “${title(id)}”`)) setSelection(null);
      },
      deleteEdges: (indices) => {
        if (apply((c) => edit.removeEdges(c, indices), indices.length > 1 ? `Removed ${indices.length} connections` : "Removed connection")) {
          setSelection((s) => (s?.kind === "edge" ? null : s));
        }
      },
      setEdgeLabel: (index, label) => apply((c) => edit.setEdgeLabel(c, index, label.trim()), label.trim() ? `Labelled “${label.trim()}”` : "Removed label"),
      reverseEdge: (index) => {
        if (apply((c) => edit.reverseEdge(c, index), "Reversed connection")) setSelection(null);
      },
      addEdge: (from, to) => {
        setConnectFrom(null);
        apply((c) => edit.addEdge(c, from, to), `Connected “${title(from)}” → “${title(to)}”`);
      },
      startConnect: (from) => setConnectFrom((c) => (c === from ? null : from)),
      toggleCollapse,
      ungroup: (id) => {
        if (apply((c) => edit.ungroup(c, id), `Ungrouped “${title(id)}”`)) {
          if (collapsed.has(id)) setCollapsed(new Set([...collapsed].filter((x) => x !== id)));
          setSelection(null);
        }
      },
      addNode: (group) => {
        let created = "";
        const ok = apply((c) => {
          const r = edit.addNode(c, "New node", group);
          created = r.id;
          return r.code;
        }, group ? `Added a node to “${title(group)}”` : "Added a node");
        if (ok) {
          setSelection({ kind: "node", id: created });
          setRenameKey((k) => k + 1);
          if (group && collapsed.has(group)) setCollapsed(new Set([...collapsed].filter((x) => x !== group)));
        }
      },
      groupNode: (id) => {
        let created = "";
        const ok = apply((c) => {
          const r = edit.groupNodes(c, [id], "New group");
          created = r.id;
          return r.code;
        }, `Wrapped “${title(id)}” in a new group`);
        if (ok) {
          setSelection({ kind: "group", id: created });
          setRenameKey((k) => k + 1);
        }
      },
      select: (s) => setSelection(s),
      zoomTo: (id) => setZoomTo({ id, nonce: Date.now() }),
    }),
    [apply, title, toggleCollapse, collapsed, setCollapsed],
  );

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === "node") actions.deleteNode(selection.id);
    else if (selection.kind === "group") actions.ungroup(selection.id);
    else if (edgeSources.length) actions.deleteEdges(edgeSources);
  }, [selection, actions, edgeSources]);

  const find = useCallback(
    (id: string) => {
      if (!model) return;
      // Reveal the target if it's hidden inside a collapsed group.
      const hiddenBy = ancestors(model, id).filter((a) => collapsed.has(a));
      if (hiddenBy.length) setCollapsed(new Set([...collapsed].filter((c) => !hiddenBy.includes(c))));
      setSelection(model.subgraphs.has(id) ? { kind: "group", id } : { kind: "node", id });
      setTimeout(() => setZoomTo({ id, nonce: Date.now() }), hiddenBy.length ? 450 : 0);
    },
    [model, collapsed, setCollapsed],
  );

  const parentOf = useCallback(
    (id: string) => model?.nodes.get(id)?.parent ?? model?.subgraphs.get(id)?.parent ?? null,
    [model],
  );

  return {
    model: model as FlowModel | null,
    view,
    collapsed,
    setCollapsed,
    selection,
    setSelection,
    focus,
    setFocus,
    connectFrom,
    setConnectFrom,
    zoomTo,
    renameKey,
    bumpRename: () => setRenameKey((k) => k + 1),
    highlight,
    edgeSources,
    editorHighlight,
    cursorNodes,
    setCursorOffset,
    actions,
    undo,
    deleteSelection,
    find,
    parentOf,
    title,
    toggleCollapse,
    focusTarget: focusStarts?.[0] ?? null,
    unsupported,
  };
}
