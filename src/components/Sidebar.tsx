import { useMemo, useState } from "react";
import { Copy, Download, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Diagram } from "../lib/diagram";
import { detectDiagramType } from "../lib/diagram";
import { Button, Menu, MenuItem, MenuSeparator, cx } from "./ui";

interface SidebarProps {
  diagrams: Diagram[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
}

function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function Sidebar(props: SidebarProps) {
  const { diagrams, activeId, onSelect, onNew } = props;
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return diagrams;
    return diagrams.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q));
  }, [diagrams, query]);

  return (
    <aside className="flex h-full w-full flex-col border-r border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex flex-col gap-2 p-3">
        <Button variant="primary" onClick={onNew} className="w-full" title="New diagram (Alt+N)">
          <Plus className="size-4" /> New diagram
        </Button>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search diagrams"
            aria-label="Search diagrams"
            className="h-8 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-2 text-sm outline-none placeholder:text-zinc-400 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Diagrams">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">{query ? "No matches" : "No diagrams yet"}</p>
        )}
        <ul className="flex flex-col gap-0.5">
          {filtered.map((d) => (
            <li key={d.id}>
              <DiagramRow
                {...props}
                diagram={d}
                active={d.id === activeId}
                renaming={renaming === d.id}
                setRenaming={(on) => setRenaming(on ? d.id : null)}
                onSelect={() => onSelect(d.id)}
              />
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-zinc-200 px-4 py-2.5 text-[11px] leading-snug text-zinc-500 dark:border-zinc-800">
        {diagrams.length} diagram{diagrams.length === 1 ? "" : "s"} · stored privately in this browser
      </div>
    </aside>
  );
}

function DiagramRow({
  diagram,
  active,
  renaming,
  setRenaming,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onDownload,
}: Omit<SidebarProps, "onSelect" | "diagrams" | "activeId" | "onNew"> & {
  diagram: Diagram;
  active: boolean;
  renaming: boolean;
  setRenaming: (on: boolean) => void;
  onSelect: () => void;
}) {
  const type = detectDiagramType(diagram.code);
  return (
    <div
      className={cx(
        "group relative flex items-center rounded-lg transition-colors",
        active
          ? "bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60",
      )}
    >
      {renaming ? (
        <form
          className="flex-1 p-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("name");
            if (typeof value === "string" && value.trim()) onRename(diagram.id, value.trim());
            setRenaming(false);
          }}
        >
          <input
            name="name"
            autoFocus
            defaultValue={diagram.name}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
            aria-label="Diagram name"
            className="w-full rounded border border-cyan-600 bg-white px-1.5 py-1 text-sm outline-none dark:bg-zinc-900"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => setRenaming(true)}
          aria-current={active ? "true" : undefined}
          className="min-w-0 flex-1 px-3 py-2 text-left"
        >
          <div className={cx("truncate text-sm", active ? "font-semibold" : "font-medium")}>{diagram.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="rounded bg-zinc-200/70 px-1 py-px font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              {type}
            </span>
            <span>{relativeTime(diagram.updatedAt)}</span>
          </div>
        </button>
      )}
      {!renaming && (
        <div className={cx("pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100", active && "opacity-100")}>
          <Menu
            width="w-48"
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label={`Actions for ${diagram.name}`}
                className="flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              >
                <MoreHorizontal className="size-4" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<Pencil className="size-3.5" />} onClick={() => (close(), setRenaming(true))}>
                  Rename
                </MenuItem>
                <MenuItem icon={<Copy className="size-3.5" />} onClick={() => (close(), onDuplicate(diagram.id))}>
                  Duplicate
                </MenuItem>
                <MenuItem icon={<Download className="size-3.5" />} onClick={() => (close(), onDownload(diagram.id))}>
                  Download .mmd
                </MenuItem>
                <MenuSeparator />
                <MenuItem danger icon={<Trash2 className="size-3.5" />} onClick={() => (close(), onDelete(diagram.id))}>
                  Delete
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      )}
    </div>
  );
}
