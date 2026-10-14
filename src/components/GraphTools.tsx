import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  FolderInput,
  Group,
  Link2,
  Minimize2,
  Maximize2,
  Plus,
  Search,
  Trash2,
  Ungroup,
  X,
  Layers,
  Focus,
} from "lucide-react";
import type { FlowModel } from "../lib/flow/parse";
import type { Direction } from "../lib/flow/view";
import type { Selection } from "./Preview";
import { Menu, MenuItem, MenuLabel, MenuSeparator, cx } from "./ui";

/* ---------------- shared bits ---------------- */

function groupOptions(model: FlowModel, exclude?: Set<string>): { id: string; label: string; depth: number }[] {
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const id of model.subgraphOrder) {
      const sg = model.subgraphs.get(id)!;
      if (sg.parent !== parent || exclude?.has(id)) continue;
      out.push({ id, label: sg.title || id, depth });
      walk(id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function nodeTitle(model: FlowModel, id: string): string {
  return model.nodes.get(id)?.label || model.subgraphs.get(id)?.title || id;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-zinc-700 dark:bg-zinc-950";

/** Text input that commits on Enter / blur and resets on Escape. */
function CommitInput({
  value,
  onCommit,
  placeholder,
  autoFocusKey,
  ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  autoFocusKey?: number;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = value;
  }, [value]);
  useEffect(() => {
    if (autoFocusKey) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [autoFocusKey]);
  return (
    <input
      ref={ref}
      defaultValue={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={inputCls}
      onBlur={(e) => {
        const v = e.currentTarget.value;
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function GroupSelect({
  model,
  value,
  onChange,
  exclude,
  ariaLabel,
}: {
  model: FlowModel;
  value: string | null;
  onChange: (v: string | null) => void;
  exclude?: Set<string>;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={inputCls}
    >
      <option value="">— Top level —</option>
      {groupOptions(model, exclude).map((g) => (
        <option key={g.id} value={g.id}>
          {" ".repeat(g.depth * 2)}
          {g.label}
        </option>
      ))}
    </select>
  );
}

function ActionButton({
  icon,
  children,
  onClick,
  danger,
  active,
  title,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
          : active
            ? "border-cyan-600 bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300"
            : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------------- inspector ---------------- */

export interface InspectorActions {
  renameNode: (id: string, label: string) => void;
  renameGroup: (id: string, title: string) => void;
  moveNode: (id: string, target: string | null) => void;
  moveGroup: (id: string, target: string | null) => void;
  deleteNode: (id: string) => void;
  deleteEdges: (indices: number[]) => void;
  setEdgeLabel: (index: number, label: string) => void;
  reverseEdge: (index: number) => void;
  addEdge: (from: string, to: string) => void;
  startConnect: (from: string) => void;
  toggleCollapse: (id: string) => void;
  ungroup: (id: string) => void;
  addNode: (group: string | null) => void;
  groupNode: (id: string) => void;
  select: (s: Selection) => void;
  zoomTo: (id: string) => void;
}

export function Inspector({
  model,
  selection,
  edgeSources,
  collapsed,
  actions,
  renameKey,
  connecting,
  onClose,
}: {
  model: FlowModel;
  selection: Selection;
  edgeSources: number[];
  collapsed: Set<string>;
  actions: InspectorActions;
  renameKey: number;
  connecting: boolean;
  onClose: () => void;
}) {
  if (!selection) return null;
  let body: ReactNode = null;
  let title = "";
  let kind = "";

  if (selection.kind === "node" && model.nodes.has(selection.id)) {
    const n = model.nodes.get(selection.id)!;
    title = n.label;
    kind = "Node";
    const out = model.edges.filter((e) => e.from === n.id);
    const inc = model.edges.filter((e) => e.to === n.id);
    body = (
      <>
        <Field label="Label">
          <CommitInput ariaLabel="Node label" value={n.label} onCommit={(v) => actions.renameNode(n.id, v)} autoFocusKey={renameKey} />
        </Field>
        <Field label="Group">
          <GroupSelect ariaLabel="Node group" model={model} value={n.parent} onChange={(g) => actions.moveNode(n.id, g)} />
        </Field>
        <ConnectionList title="Outgoing" icon={<ArrowRight className="size-3" />} edges={out} other={(e) => e.to} model={model} actions={actions} />
        <ConnectionList title="Incoming" icon={<ArrowLeftRight className="size-3 rotate-180" />} edges={inc} other={(e) => e.from} model={model} actions={actions} />
        <ConnectPicker model={model} from={n.id} actions={actions} connecting={connecting} />
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <ActionButton icon={<Group className="size-3.5" />} onClick={() => actions.groupNode(n.id)} title="Wrap this node in a new group">
            New group
          </ActionButton>
          <ActionButton danger icon={<Trash2 className="size-3.5" />} onClick={() => actions.deleteNode(n.id)} title="Delete (Del)">
            Delete
          </ActionButton>
        </div>
      </>
    );
  } else if (selection.kind === "group" && model.subgraphs.has(selection.id)) {
    const sg = model.subgraphs.get(selection.id)!;
    const isCollapsed = collapsed.has(sg.id);
    const memberNodes = sg.members.filter((m) => model.nodes.has(m)).length;
    const childGroups = sg.members.filter((m) => model.subgraphs.has(m)).length;
    const descendants = new Set([sg.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const s of model.subgraphs.values()) if (s.parent && descendants.has(s.parent) && !descendants.has(s.id)) (descendants.add(s.id), (grew = true));
    }
    title = sg.title || sg.id;
    kind = "Group";
    body = (
      <>
        <Field label="Title">
          <CommitInput ariaLabel="Group title" value={sg.title} onCommit={(v) => v.trim() && actions.renameGroup(sg.id, v.trim())} autoFocusKey={renameKey} />
        </Field>
        <Field label="Inside">
          <GroupSelect ariaLabel="Parent group" model={model} value={sg.parent} exclude={descendants} onChange={(g) => actions.moveGroup(sg.id, g)} />
        </Field>
        <p className="text-xs text-zinc-500">
          {memberNodes} node{memberNodes === 1 ? "" : "s"}
          {childGroups ? ` · ${childGroups} nested group${childGroups === 1 ? "" : "s"}` : ""}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <ActionButton
            icon={isCollapsed ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
            onClick={() => actions.toggleCollapse(sg.id)}
            active={isCollapsed}
            title="Double-click a group to toggle"
          >
            {isCollapsed ? "Expand" : "Collapse"}
          </ActionButton>
          <ActionButton icon={<Plus className="size-3.5" />} onClick={() => actions.addNode(sg.id)}>
            Add node
          </ActionButton>
          <ActionButton icon={<Link2 className="size-3.5" />} onClick={() => actions.startConnect(sg.id)} active={connecting}>
            Connect
          </ActionButton>
          <ActionButton icon={<Ungroup className="size-3.5" />} onClick={() => actions.ungroup(sg.id)} title="Remove the group, keep its contents">
            Ungroup
          </ActionButton>
        </div>
      </>
    );
  } else if (selection.kind === "edge" && edgeSources.length) {
    kind = edgeSources.length > 1 ? "Merged connections" : "Connection";
    const edges = edgeSources.map((i) => model.edges[i]!).filter(Boolean);
    const e = edges[0]!;
    title = `${nodeTitle(model, e.from)} → ${nodeTitle(model, e.to)}`;
    body =
      edges.length === 1 ? (
        <>
          <div className="flex items-center gap-1.5 text-sm">
            <NodeLink model={model} id={e.from} actions={actions} />
            <ArrowRight className="size-3.5 shrink-0 text-zinc-400" />
            <NodeLink model={model} id={e.to} actions={actions} />
          </div>
          <Field label="Label">
            <CommitInput ariaLabel="Connection label" value={e.label} placeholder="No label" onCommit={(v) => actions.setEdgeLabel(e.index, v)} autoFocusKey={renameKey} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            <ActionButton icon={<ArrowUpDown className="size-3.5" />} onClick={() => actions.reverseEdge(e.index)}>
              Reverse
            </ActionButton>
            <ActionButton danger icon={<Trash2 className="size-3.5" />} onClick={() => actions.deleteEdges([e.index])} title="Delete (Del)">
              Delete
            </ActionButton>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            {edges.length} connections are merged because a group is collapsed. Expand it to see them individually.
          </p>
          <ul className="flex flex-col gap-1">
            {edges.map((x) => (
              <li key={x.index} className="flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2 py-1 text-xs dark:bg-zinc-800/60">
                <NodeLink model={model} id={x.from} actions={actions} />
                <ArrowRight className="size-3 shrink-0 text-zinc-400" />
                <NodeLink model={model} id={x.to} actions={actions} />
                {x.label && <span className="truncate text-zinc-500">· {x.label}</span>}
                <button
                  type="button"
                  aria-label="Delete connection"
                  onClick={() => actions.deleteEdges([x.index])}
                  className="ml-auto rounded p-0.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      );
  } else {
    return null;
  }

  return (
    <div
      className="animate-pop absolute right-3 top-14 z-10 flex max-h-[calc(100%-8rem)] w-[300px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-xl backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-900/95"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      data-testid="inspector"
    >
      <div className="flex items-start gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">{kind}</div>
          <div className="truncate text-sm font-semibold" title={title}>
            {title}
          </div>
        </div>
        {selection.kind !== "edge" && (
          <button
            type="button"
            title="Center in view"
            aria-label="Center in view"
            onClick={() => actions.zoomTo(selection.id)}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <Crosshair className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Close inspector"
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3">{body}</div>
    </div>
  );
}

function NodeLink({ model, id, actions }: { model: FlowModel; id: string; actions: InspectorActions }) {
  const isGroup = model.subgraphs.has(id);
  return (
    <button
      type="button"
      onClick={() => {
        actions.select(isGroup ? { kind: "group", id } : { kind: "node", id });
        actions.zoomTo(id);
      }}
      className="min-w-0 truncate rounded px-1 font-medium text-cyan-800 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40"
    >
      {nodeTitle(model, id)}
    </button>
  );
}

function ConnectionList({
  title,
  icon,
  edges,
  other,
  model,
  actions,
}: {
  title: string;
  icon: ReactNode;
  edges: FlowModel["edges"];
  other: (e: FlowModel["edges"][number]) => string;
  model: FlowModel;
  actions: InspectorActions;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        {icon} {title} <span className="font-normal">({edges.length})</span>
      </div>
      {edges.length === 0 ? (
        <p className="text-xs text-zinc-400">None</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {edges.map((e) => (
            <li key={e.index} className="group flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
              <NodeLink model={model} id={other(e)} actions={actions} />
              {e.label && <span className="min-w-0 truncate text-zinc-500">· {e.label}</span>}
              <button
                type="button"
                aria-label={`Remove connection to ${nodeTitle(model, other(e))}`}
                title="Remove connection"
                onClick={() => actions.deleteEdges([e.index])}
                className="ml-auto rounded p-0.5 text-zinc-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 dark:text-zinc-500 dark:hover:bg-red-950/40"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConnectPicker({ model, from, actions, connecting }: { model: FlowModel; from: string; actions: InspectorActions; connecting: boolean }) {
  const options = useMemo(
    () =>
      [...model.nodes.values()]
        .filter((n) => n.id !== from)
        .map((n) => ({ id: n.id, label: n.label }))
        .concat([...model.subgraphs.values()].map((s) => ({ id: s.id, label: `▣ ${s.title || s.id}` })))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [model, from],
  );
  return (
    <div className="flex gap-1.5">
      <select
        aria-label="Add connection to"
        value=""
        onChange={(e) => e.target.value && actions.addEdge(from, e.target.value)}
        className={inputCls}
      >
        <option value="">+ Connect to…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        title="Pick the target in the diagram (or Alt-drag from a node)"
        aria-label="Pick target in diagram"
        aria-pressed={connecting}
        onClick={() => actions.startConnect(from)}
        className={cx(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border",
          connecting
            ? "border-cyan-600 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
        )}
      >
        <Link2 className="size-4" />
      </button>
    </div>
  );
}

/* ---------------- toolbar ---------------- */

export interface FocusSettings {
  depth: number;
  direction: Direction;
  isolate: boolean;
}

export function GraphToolbar({
  model,
  collapsed,
  setCollapsed,
  focus,
  setFocus,
  focusTarget,
  hiddenNodes,
  onFind,
  onAddNode,
  connecting,
  onCancelConnect,
}: {
  model: FlowModel;
  collapsed: Set<string>;
  setCollapsed: (c: Set<string>) => void;
  focus: FocusSettings;
  setFocus: (f: FocusSettings) => void;
  focusTarget: string | null;
  hiddenNodes: number;
  onFind: (id: string) => void;
  onAddNode: () => void;
  connecting: string | null;
  onCancelConnect: () => void;
}) {
  const groups = groupOptions(model);
  const topLevel = groups.filter((g) => g.depth === 0).map((g) => g.id);
  return (
    <div
      className="absolute inset-x-3 top-3 z-10 flex flex-wrap items-center gap-1.5"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <FindBox model={model} onFind={onFind} />
      {groups.length > 0 && (
        <Menu
          align="start"
          width="w-72"
          trigger={({ toggle, open }) => (
            <ToolButton onClick={toggle} active={open || collapsed.size > 0} title="Collapse or expand groups">
              <Layers className="size-4" />
              <span className="hidden sm:inline">Groups</span>
              {collapsed.size > 0 && (
                <span className="rounded-full bg-cyan-600 px-1.5 text-[10px] font-semibold text-white">{collapsed.size}</span>
              )}
              <ChevronDown className="size-3" />
            </ToolButton>
          )}
        >
          {(close) => (
            <>
              <MenuItem icon={<Minimize2 className="size-3.5" />} onClick={() => (setCollapsed(new Set(topLevel)), close())} hint="overview">
                Collapse top-level groups
              </MenuItem>
              <MenuItem icon={<Maximize2 className="size-3.5" />} onClick={() => (setCollapsed(new Set()), close())}>
                Expand everything
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Groups</MenuLabel>
              {groups.map((g) => {
                const on = collapsed.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => {
                      const next = new Set(collapsed);
                      if (on) next.delete(g.id);
                      else next.add(g.id);
                      setCollapsed(next);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    style={{ paddingLeft: 10 + g.depth * 14 }}
                  >
                    {on ? <ChevronRight className="size-3.5 text-cyan-600" /> : <ChevronDown className="size-3.5 text-zinc-400" />}
                    <span className={cx("flex-1 truncate", on && "font-medium")}>{g.label}</span>
                    <span className="text-[11px] text-zinc-400">{on ? "collapsed" : ""}</span>
                  </button>
                );
              })}
            </>
          )}
        </Menu>
      )}

      <div
        className={cx(
          "flex items-center gap-1 rounded-xl border border-zinc-200/80 bg-white/90 p-1 shadow-sm backdrop-blur transition-opacity dark:border-zinc-700/80 dark:bg-zinc-900/90",
          !focusTarget && "opacity-60",
        )}
        title={focusTarget ? "Focus on the selection's neighbourhood" : "Select a node or group to focus on its connections"}
      >
        <Focus className="ml-1 size-4 text-zinc-500" />
        <SegmentedMini
          label="Depth"
          value={focus.depth}
          options={[
            { value: 1, label: "1" },
            { value: 2, label: "2" },
            { value: 3, label: "3" },
            { value: Infinity, label: "∞" },
          ]}
          onChange={(depth) => setFocus({ ...focus, depth })}
        />
        <SegmentedMini
          label="Direction"
          value={focus.direction}
          options={[
            { value: "both", label: <ArrowLeftRight className="size-3.5" />, title: "Both directions" },
            { value: "down", label: <ArrowDown className="size-3.5" />, title: "Downstream (what it calls)" },
            { value: "up", label: <ArrowUp className="size-3.5" />, title: "Upstream (what calls it)" },
          ]}
          onChange={(direction) => setFocus({ ...focus, direction })}
        />
        <button
          type="button"
          aria-pressed={focus.isolate}
          onClick={() => setFocus({ ...focus, isolate: !focus.isolate })}
          title="Isolate: hide everything outside the neighbourhood"
          className={cx(
            "flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium",
            focus.isolate ? "bg-cyan-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
          )}
        >
          {focus.isolate ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          Isolate
        </button>
      </div>

      <ToolButton onClick={onAddNode} title="Add a node (into the selected group)">
        <Plus className="size-4" />
        <span className="hidden sm:inline">Node</span>
      </ToolButton>

      {connecting && (
        <div className="flex items-center gap-2 rounded-xl bg-cyan-600 py-1 pl-3 pr-1 text-xs font-medium text-white shadow-sm">
          <Link2 className="size-3.5" /> Click a node to connect from “{nodeTitle(model, connecting)}”
          <button type="button" onClick={onCancelConnect} className="rounded-lg px-2 py-1 hover:bg-white/15">
            Cancel
          </button>
        </div>
      )}
      {hiddenNodes > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-100 py-1 pl-3 pr-1 text-xs font-medium text-amber-900 shadow-sm dark:bg-amber-900/60 dark:text-amber-100">
          <FolderInput className="size-3.5" /> {hiddenNodes} node{hiddenNodes === 1 ? "" : "s"} hidden
          <button type="button" onClick={() => setFocus({ ...focus, isolate: false })} className="rounded-lg px-2 py-1 hover:bg-black/10">
            Show all
          </button>
        </div>
      )}
    </div>
  );
}

function ToolButton({ children, onClick, active, title }: { children: ReactNode; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        "flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-sm font-medium shadow-sm backdrop-blur transition-colors",
        active
          ? "border-cyan-600/60 bg-cyan-50/95 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-200"
          : "border-zinc-200/80 bg-white/90 text-zinc-700 hover:bg-white dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-900",
      )}
    >
      {children}
    </button>
  );
}

function SegmentedMini<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title ?? `${label} ${String(o.label)}`}
          aria-label={o.title ?? `${label} ${o.label === "∞" ? "unlimited" : String(o.label)}`}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold",
            value === o.value ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FindBox({ model, onFind }: { model: FlowModel; onFind: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const items = [
      ...[...model.nodes.values()].map((n) => ({ id: n.id, label: n.label, group: false })),
      ...[...model.subgraphs.values()].map((g) => ({ id: g.id, label: g.title || g.id, group: true })),
    ];
    return items
      .filter((i) => i.label.toLowerCase().includes(s) || i.id.toLowerCase().includes(s))
      .sort((a, b) => Number(!a.label.toLowerCase().startsWith(s)) - Number(!b.label.toLowerCase().startsWith(s)))
      .slice(0, 8);
  }, [q, model]);
  const pick = (id: string) => {
    onFind(id);
    setOpen(false);
  };
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
          else if (e.key === "Enter" && results[active]) pick(results[active].id);
          else if (e.key === "Escape") (setQ(""), e.currentTarget.blur());
        }}
        placeholder="Find node…"
        aria-label="Find node"
        className="h-9 w-40 rounded-xl border border-zinc-200/80 bg-white/90 pl-8 pr-2 text-sm shadow-sm outline-none backdrop-blur placeholder:text-zinc-400 focus:w-56 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 transition-[width] dark:border-zinc-700/80 dark:bg-zinc-900/90"
      />
      {open && results.length > 0 && (
        <ul className="animate-pop absolute left-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r.id)}
                className={cx(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm",
                  i === active ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                )}
              >
                {r.group ? <Layers className="size-3.5 text-zinc-400" /> : <span className="size-2 rounded-full bg-cyan-600" />}
                <span className="flex-1 truncate">{r.label}</span>
                <span className="font-mono text-[10px] text-zinc-400">{r.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
