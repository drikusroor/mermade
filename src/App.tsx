import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns2, FileUp, Keyboard, Palette, PanelLeft, PanelLeftClose, Plus, Square, Code2, Eye, Check, Loader2 } from "lucide-react";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { Sidebar } from "./components/Sidebar";
import { TemplatePicker, type CompileFn } from "./components/TemplatePicker";
import { DesignPanel } from "./components/DesignPanel";
import { GraphToolbar, Inspector } from "./components/GraphTools";
import { useGraph } from "./hooks/useGraph";
import { compileDesign, type Design } from "./lib/design";
import { tryParseFlow, type FlowModel } from "./lib/flow/parse";
import { checkAll, type HealthResult } from "./lib/health";
import type { MermaidConfig } from "mermaid";
import { ImportDialog } from "./components/ImportDialog";
import { ExportMenu, type ExportAction } from "./components/ExportMenu";
import { Button, IconButton, Modal, cx, useToast } from "./components/ui";
import { createDiagram, detectDiagramType, type Diagram, type DiagramView } from "./lib/diagram";
import { DEFAULT_TEMPLATE, type Template } from "./lib/templates";
import {
  deleteDiagram,
  loadDiagrams,
  loadSettings,
  saveDiagrams,
  saveSettings,
  subscribeToSync,
  type Settings,
} from "./lib/storage";
import { renderDiagram, loadMermaid } from "./lib/render";
import { parseImport, parseText, type ImportedDiagram } from "./lib/importer";
import { decodeState, buildShareUrl } from "./lib/share";
import {
  backgroundColor,
  copyPng,
  copyText,
  downloadBlob,
  downloadText,
  prepareSvg,
  sanitizeFilename,
  svgToPngBlob,
  toMarkdown,
} from "./lib/exporter";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

type SaveState = "saved" | "saving";

export function App() {
  const toast = useToast();
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [rendered, setRendered] = useState<{ svg: string; model: FlowModel | null } | null>(null);
  const svg = rendered?.svg ?? null;
  const [designOpen, setDesignOpen] = useState(false);
  const [error, setError] = useState<{ message: string; line: number | null } | null>(null);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [rendererLoading, setRendererLoading] = useState(true);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [modal, setModal] = useState<null | "templates" | "import" | "shortcuts">(null);
  const [dragOver, setDragOver] = useState(false);
  const [mobileTab, setMobileTab] = useState<"code" | "preview">("code");
  const [mobileSidebar, setMobileSidebar] = useState(false);

  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const narrow = useMediaQuery("(max-width: 767px)");
  const appDark = settings.appTheme === "dark" || (settings.appTheme === "system" && systemDark);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", appDark);
  }, [appDark]);

  const active = useMemo(
    () => diagrams.find((d) => d.id === settings.activeId) ?? diagrams[0] ?? null,
    [diagrams, settings.activeId],
  );

  const design: Design = active?.design ?? settings.defaultDesign;

  /* ---------------- persistence ---------------- */

  const pending = useRef(new Map<string, Diagram>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const batch = [...pending.current.values()];
    pending.current.clear();
    try {
      await saveDiagrams(batch);
    } catch (e) {
      toast({ kind: "error", message: `Couldn't save: ${(e as Error).message}` });
    }
    if (!pending.current.size) setSaveState("saved");
  }, [toast]);

  const queueSave = useCallback(
    (ds: Diagram[]) => {
      ds.forEach((d) => pending.current.set(d.id, d));
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, 400);
    },
    [flush],
  );

  // Never lose the last keystrokes when the tab closes.
  useEffect(() => {
    const onHide = () => pending.current.size && void flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  const addDiagrams = useCallback(
    (items: ImportedDiagram[], select = true) => {
      if (!items.length) return [];
      const created = items.map((i) => createDiagram(i.name, i.code, settingsRef.current.defaultDesign));
      setDiagrams((ds) => [...created, ...ds]);
      queueSave(created);
      if (select) update({ activeId: created[0]!.id });
      setMobileTab("code");
      return created;
    },
    [queueSave, update],
  );

  // Initial load + shared-link import.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list = await loadDiagrams();
      if (cancelled) return;
      const shared = location.hash.length > 1 ? await decodeState(location.hash) : null;
      if (shared) {
        history.replaceState(null, "", location.pathname + location.search);
        const d = createDiagram("Shared diagram", shared.code);
        list = [d, ...list];
        void saveDiagrams([d]);
        setSettings((s) => ({ ...s, activeId: d.id }));
        toast({ kind: "success", message: "Opened shared diagram" });
      } else if (!list.length) {
        const d = createDiagram("My first diagram", DEFAULT_TEMPLATE.code);
        list = [d];
        void saveDiagrams([d]);
        setSettings((s) => ({ ...s, activeId: d.id }));
      }
      setDiagrams(list);
      setReady(true);
    })();
    loadMermaid().finally(() => setRendererLoading(false));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Cross-tab sync.
  useEffect(
    () =>
      subscribeToSync((msg) => {
        if (msg.type === "put") {
          setDiagrams((ds) => {
            const i = ds.findIndex((d) => d.id === msg.diagram.id);
            if (i === -1) return [msg.diagram, ...ds];
            if (ds[i]!.updatedAt >= msg.diagram.updatedAt) return ds;
            const next = ds.slice();
            next[i] = msg.diagram;
            return next;
          });
        } else {
          setDiagrams((ds) => ds.filter((d) => d.id !== msg.id));
        }
      }),
    [],
  );

  const diagramsRef = useRef(diagrams);
  diagramsRef.current = diagrams;
  const patchDiagram = useCallback(
    (id: string, patch: Partial<Pick<Diagram, "name" | "code" | "design" | "view">>) => {
      const current = diagramsRef.current.find((d) => d.id === id);
      if (!current) return;
      // Collapsing groups is a view change, not an edit.
      const isEdit = "name" in patch || "code" in patch || "design" in patch;
      const changed = { ...current, ...patch, updatedAt: isEdit ? Date.now() : current.updatedAt };
      diagramsRef.current = diagramsRef.current.map((d) => (d.id === id ? changed : d));
      setDiagrams(diagramsRef.current);
      queueSave([changed]);
    },
    [queueSave],
  );

  /* ---------------- graph tools ---------------- */

  const activeIdRef = useRef("");
  activeIdRef.current = active?.id ?? "";
  const patchCode = useCallback((c: string) => patchDiagram(activeIdRef.current, { code: c }), [patchDiagram]);
  const patchView = useCallback((v: DiagramView) => patchDiagram(activeIdRef.current, { view: v }), [patchDiagram]);
  const g = useGraph({ active, patchCode, patchView, toast });

  /* ---------------- link health ---------------- */

  const [health, setHealth] = useState<Map<string, HealthResult>>(() => new Map());
  const [checking, setChecking] = useState(false);
  const linkUrls = useMemo(() => {
    const all = new Set<string>();
    for (const link of g.model?.links.values() ?? []) for (const u of link.urls) all.add(u.url);
    return [...all].sort();
  }, [g.model]);
  const linkKey = `${activeIdRef.current}\n${linkUrls.join("\n")}`;
  useEffect(() => {
    setHealth(new Map());
  }, [linkKey]);
  const runChecks = useCallback(async (urls: string[]) => {
    if (!urls.length) return;
    setChecking(true);
    setHealth((prev) => {
      const next = new Map(prev);
      for (const u of urls) next.set(u, { status: "checking" });
      return next;
    });
    try {
      await checkAll(urls, {
        onResult: (url, result) =>
          setHealth((prev) => {
            const next = new Map(prev);
            next.set(url, result);
            return next;
          }),
      });
    } finally {
      setChecking(false);
    }
  }, []);

  /* ---------------- rendering ---------------- */

  const code = active?.code ?? "";
  const activeId = active?.id ?? "";
  useEffect(() => {
    setRendered(null);
    setError(null);
  }, [activeId]);

  const viewCodeKey = g.view?.code ?? null;
  const compiled = useMemo(
    () => compileDesign(design, { appDark, customPalettes: settings.customPalettes, model: g.model, viewModel: g.view?.model }),
    // The view model is fully determined by its code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design, appDark, settings.customPalettes, g.model, viewCodeKey],
  );
  const renderCode = useMemo(() => {
    const body = viewCodeKey ?? code;
    return compiled.extraCode ? `${body.replace(/\s*$/, "")}\n${compiled.extraCode}\n` : body;
  }, [viewCodeKey, code, compiled.extraCode]);
  const renderConfigKey = JSON.stringify(compiled.config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const renderConfig = useMemo(() => compiled.config as MermaidConfig, [renderConfigKey]);
  const viewModel = g.view?.model ?? null;

  useEffect(() => {
    if (!ready) return;
    let stale = false;
    const t = setTimeout(async () => {
      const result = await renderDiagram(renderCode, renderConfig);
      if (stale) return;
      if (result.ok) {
        setRendered({ svg: result.svg, model: viewModel });
        setError(null);
        setRenderMs(result.ms);
      } else {
        setError({ message: result.message, line: g.view && g.view.code !== code ? null : result.line });
      }
    }, 150);
    return () => {
      stale = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderCode, renderConfig, ready]);

  const compileForThumb: CompileFn = useCallback(
    (c: string) => {
      const m = tryParseFlow(c);
      const out = compileDesign(design, { appDark, customPalettes: settings.customPalettes, model: m });
      return { code: out.extraCode ? `${c}\n${out.extraCode}` : c, config: out.config as MermaidConfig, canvas: out.canvas };
    },
    [design, appDark, settings.customPalettes],
  );

  const setDesign = (d: Design) => {
    if (active) patchDiagram(active.id, { design: d });
    update({ defaultDesign: d });
  };
  const applyDesignToAll = () => {
    const next = diagramsRef.current.map((d) => ({ ...d, design }));
    diagramsRef.current = next;
    setDiagrams(next);
    queueSave(next);
    update({ defaultDesign: design });
    toast({ kind: "success", message: `Applied to ${next.length} diagram${next.length === 1 ? "" : "s"}` });
  };

  /* ---------------- actions ---------------- */

  const newFromTemplate = (t: Template) => {
    setModal(null);
    addDiagrams([{ name: t.id === "blank" ? "Untitled diagram" : `${t.name} diagram`, code: t.code }]);
  };

  const duplicate = (id: string) => {
    const d = diagrams.find((x) => x.id === id);
    if (!d) return;
    const [copy] = addDiagrams([{ name: `${d.name} (copy)`, code: d.code }]);
    if (copy && d.design) patchDiagram(copy.id, { design: d.design });
  };

  const remove = (id: string) => {
    const d = diagrams.find((x) => x.id === id);
    if (!d) return;
    pending.current.delete(id);
    setDiagrams((ds) => ds.filter((x) => x.id !== id));
    void deleteDiagram(id);
    if (active?.id === id) {
      const rest = diagrams.filter((x) => x.id !== id);
      update({ activeId: rest[0]?.id ?? null });
      if (!rest.length) addDiagrams([{ name: "Untitled diagram", code: DEFAULT_TEMPLATE.code }]);
    }
    toast({
      kind: "info",
      message: `Deleted “${d.name}”`,
      action: {
        label: "Undo",
        run: () => {
          setDiagrams((ds) => [d, ...ds]);
          void saveDiagrams([d]);
          update({ activeId: d.id });
        },
      },
    });
  };

  const importFiles = async (files: File[]) => {
    if (!files.length) return;
    const all: ImportedDiagram[] = [];
    for (const f of files) {
      try {
        all.push(...(await parseImport(f.name, await f.text())));
      } catch (e) {
        toast({ kind: "error", message: `${f.name}: ${(e as Error).message}` });
      }
    }
    if (all.length) {
      addDiagrams(all);
      setModal(null);
      toast({ kind: "success", message: `Imported ${all.length} diagram${all.length === 1 ? "" : "s"}` });
    }
  };

  const importText = async (text: string): Promise<boolean> => {
    try {
      const items = await parseText(text);
      if (!items.length) return false;
      addDiagrams(items);
      setModal(null);
      toast({ kind: "success", message: `Imported ${items.length} diagram${items.length === 1 ? "" : "s"}` });
      return true;
    } catch (e) {
      toast({ kind: "error", message: (e as Error).message });
      return false;
    }
  };

  const doExport = async (action: ExportAction) => {
    if (!active) return;
    const file = sanitizeFilename(active.name);
    const exportBg = backgroundColor(settings.background, compiled.canvas);
    const needsImage = ["svg", "png", "copy-png", "copy-svg"].includes(action);
    if (needsImage && (!svg || error)) {
      toast({ kind: "error", message: "Fix the diagram's errors before exporting an image" });
      return;
    }
    try {
      switch (action) {
        case "svg": {
          const p = prepareSvg(svg!, { code: active.code, background: exportBg });
          downloadText(p.svg, `${file}.svg`, "image/svg+xml");
          break;
        }
        case "png": {
          const p = prepareSvg(svg!, { background: exportBg });
          downloadBlob(await svgToPngBlob(p, settings.pngScale, exportBg), `${file}.png`);
          break;
        }
        case "copy-png": {
          const p = prepareSvg(svg!, { background: exportBg });
          await copyPng(svgToPngBlob(p, settings.pngScale, exportBg));
          toast({ kind: "success", message: "PNG copied to clipboard" });
          break;
        }
        case "copy-svg":
          await copyText(prepareSvg(svg!, { code: active.code, background: exportBg }).svg);
          toast({ kind: "success", message: "SVG markup copied" });
          break;
        case "mmd":
          downloadText(active.code + "\n", `${file}.mmd`);
          break;
        case "md":
          downloadText(`# ${active.name}\n\n${toMarkdown(active.code)}`, `${file}.md`, "text/markdown");
          break;
        case "copy-md":
          await copyText(toMarkdown(active.code));
          toast({ kind: "success", message: "Markdown copied" });
          break;
        case "copy-link": {
          const url = await buildShareUrl({ code: active.code, theme: compiled.dark ? "dark" : "default" });
          await copyText(url);
          toast({ kind: "success", message: "Share link copied — the diagram lives entirely in the URL" });
          break;
        }
        case "backup": {
          const data = {
            app: "mermade",
            version: 1,
            exportedAt: new Date().toISOString(),
            diagrams: diagrams.map(({ name, code, createdAt, updatedAt, design, view }) => ({ name, code, createdAt, updatedAt, design, view })),
          };
          downloadText(JSON.stringify(data, null, 2), `mermade-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
          break;
        }
      }
    } catch (e) {
      toast({ kind: "error", message: (e as Error).message || "Export failed" });
    }
  };

  /* ---------------- keyboard + drag & drop ---------------- */

  const toggleSidebar = () => (narrow ? setMobileSidebar((o) => !o) : update({ sidebarOpen: !settings.sidebarOpen }));
  const handlers = useRef({ flush, doExport, setModal, toggleSidebar });
  handlers.current = { flush, doExport, setModal, toggleSidebar };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = handlers.current;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && !e.shiftKey && k === "s") {
        e.preventDefault();
        void h.flush();
        toast({ kind: "success", message: "All changes saved in this browser" });
      } else if (mod && e.shiftKey && k === "s") {
        e.preventDefault();
        void h.doExport("svg");
      } else if (mod && e.shiftKey && k === "e") {
        e.preventDefault();
        void h.doExport("png");
      } else if (mod && k === "o") {
        e.preventDefault();
        h.setModal("import");
      } else if (e.altKey && k === "n") {
        e.preventDefault();
        h.setModal("templates");
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        h.toggleSidebar();
      } else if (e.key === "?" && !(e.target as HTMLElement).closest("input,textarea,.cm-editor")) {
        h.setModal("shortcuts");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);

  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  /* ---------------- split pane ---------------- */

  const main = useRef<HTMLDivElement>(null);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = main.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width));
      update({ splitRatio: ratio });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing");
    };
    document.body.classList.add("resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const layout = narrow ? (mobileTab === "code" ? "editor" : "preview") : settings.layout;
  const showEditor = layout !== "preview";
  const showPreview = layout !== "editor";
  const sidebarVisible = narrow ? mobileSidebar : settings.sidebarOpen;
  const setSidebar = (open: boolean) => (narrow ? setMobileSidebar(open) : update({ sidebarOpen: open }));

  return (
    <div
      className="flex h-dvh flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current++;
        setDragOver(true);
      }}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        void importFiles([...e.dataTransfer.files]);
      }}
    >
      {/* ---------- header ---------- */}
      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-zinc-200 px-2 sm:px-3 dark:border-zinc-800">
        <IconButton
          label={`${sidebarVisible ? "Hide" : "Show"} diagrams (${MOD}+\\)`}
          onClick={() => setSidebar(!sidebarVisible)}
        >
          {sidebarVisible ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
        </IconButton>
        <div className="flex items-center gap-2 pr-1">
          <Logo className="size-6" />
          <span className="hidden text-[15px] font-bold tracking-tight lg:inline">Mermade</span>
        </div>
        <div className="mx-1 hidden h-5 w-px bg-zinc-200 sm:block dark:bg-zinc-800" />
        {active && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              key={active.id}
              defaultValue={active.name}
              aria-label="Diagram name"
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                if (v && v !== active.name) patchDiagram(active.id, { name: v });
                else e.currentTarget.value = active.name;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = active.name;
                  e.currentTarget.blur();
                }
              }}
              className="min-w-0 max-w-72 flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:border-zinc-200 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:hover:border-zinc-700"
            />
            <span
              className="hidden items-center gap-1 text-xs text-zinc-500 sm:flex"
              aria-live="polite"
              data-testid="save-state"
            >
              {saveState === "saving" ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Saving
                </>
              ) : (
                <>
                  <Check className="size-3" /> Saved
                </>
              )}
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <div className="hidden md:flex">
            <Segmented3 value={settings.layout} onChange={(layout) => update({ layout })} />
          </div>
          <Button variant="ghost" onClick={() => setModal("templates")} title="New diagram (Alt+N)" className="px-2 sm:px-3">
            <Plus className="size-4" />
            <span className="hidden lg:inline">New</span>
          </Button>
          <Button variant="ghost" onClick={() => setModal("import")} title={`Import (${MOD}+O)`} className="px-2 sm:px-3">
            <FileUp className="size-4" />
            <span className="hidden lg:inline">Import</span>
          </Button>
          <Button
            variant={designOpen ? "secondary" : "ghost"}
            onClick={() => setDesignOpen((o) => !o)}
            title="Design: styles, palettes, layout"
            className="px-2 sm:px-3"
          >
            <Palette className="size-4" />
            <span className="hidden lg:inline">Design</span>
          </Button>
          <IconButton label="Keyboard shortcuts (?)" onClick={() => setModal("shortcuts")} className="hidden sm:inline-flex">
            <Keyboard className="size-4" />
          </IconButton>
          <ExportMenu
            onExport={(a) => void doExport(a)}
            pngScale={settings.pngScale}
            setPngScale={(pngScale) => update({ pngScale })}
            background={settings.background}
            setBackground={(background) => update({ background })}
            disabled={!svg || !!error}
          />
        </div>
      </header>

      {/* ---------- body ---------- */}
      <div className="relative flex min-h-0 flex-1">
        {sidebarVisible && (
          <>
            {narrow && (
              <div className="absolute inset-0 z-20 bg-zinc-950/30" onClick={() => setSidebar(false)} />
            )}
            <div className={cx("w-64 shrink-0", narrow && "absolute inset-y-0 left-0 z-30 shadow-xl")}>
              <Sidebar
                diagrams={diagrams}
                activeId={active?.id ?? null}
                onSelect={(id) => {
                  void flush();
                  update({ activeId: id });
                  if (narrow) setMobileSidebar(false);
                }}
                onNew={() => setModal("templates")}
                onRename={(id, name) => patchDiagram(id, { name })}
                onDuplicate={duplicate}
                onDelete={remove}
                onDownload={(id) => {
                  const d = diagrams.find((x) => x.id === id);
                  if (d) downloadText(d.code + "\n", `${sanitizeFilename(d.name)}.mmd`);
                }}
              />
            </div>
          </>
        )}

        <main ref={main} className="flex min-w-0 flex-1 flex-col md:flex-row">
          {showEditor && (
            <section
              className="flex min-h-0 min-w-0 flex-col"
              style={showPreview ? { flexBasis: `${settings.splitRatio * 100}%`, flexGrow: 0, flexShrink: 0 } : { flex: 1 }}
              aria-label="Code editor"
            >
              <div className="min-h-0 flex-1">
                {active ? (
                  <Editor
                    docKey={active.id}
                    value={active.code}
                    onChange={(c) => patchDiagram(active.id, { code: c })}
                    error={error}
                    onCursor={(line, col, offset) => {
                      setCursor({ line, col });
                      g.setCursorOffset(offset);
                    }}
                    highlight={g.editorHighlight}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
                  </div>
                )}
              </div>
              <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-zinc-200 px-3 text-[11px] text-zinc-500 dark:border-zinc-800">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">{detectDiagramType(code)}</span>
                <span>
                  Ln {cursor.line}, Col {cursor.col}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {error ? (
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <span className="size-1.5 rounded-full bg-red-500" />
                      {error.line ? `Error on line ${error.line}` : "Error"}
                    </span>
                  ) : (
                    renderMs !== null && (
                      <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-emerald-500" /> Rendered in {renderMs} ms
                      </span>
                    )
                  )}
                </span>
              </footer>
            </section>
          )}

          {showEditor && showPreview && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor"
              tabIndex={0}
              onPointerDown={startResize}
              onDoubleClick={() => update({ splitRatio: 0.42 })}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") update({ splitRatio: Math.max(0.2, settings.splitRatio - 0.02) });
                if (e.key === "ArrowRight") update({ splitRatio: Math.min(0.8, settings.splitRatio + 0.02) });
              }}
              className="group relative z-10 hidden w-px shrink-0 cursor-col-resize bg-zinc-200 outline-none md:block dark:bg-zinc-800"
            >
              <div className="absolute inset-y-0 -left-1.5 -right-1.5 transition-colors group-hover:bg-cyan-600/30 group-focus-visible:bg-cyan-600/40" />
            </div>
          )}

          {showPreview && (
            <section className="min-h-0 min-w-0 flex-1" aria-label="Preview">
              {active && (
                <Preview
                  docKey={active.id}
                  svg={svg}
                  error={error?.message ?? null}
                  loading={rendererLoading}
                  canvas={compiled.canvas}
                  dark={compiled.dark}
                  viewModel={!error && rendered?.model && g.model ? rendered.model : null}
                  selection={g.selection}
                  onSelect={g.setSelection}
                  highlight={g.highlight}
                  cursorNodes={g.cursorNodes}
                  connectFrom={g.connectFrom}
                  onConnect={g.actions.addEdge}
                  onCancelConnect={() => g.setConnectFrom(null)}
                  onMoveNode={g.actions.moveNode}
                  onMoveGroup={g.actions.moveGroup}
                  onToggleCollapse={g.toggleCollapse}
                  onDeleteSelection={g.deleteSelection}
                  onUndo={g.undo}
                  onRename={g.bumpRename}
                  zoomTo={g.zoomTo}
                  parentOf={g.parentOf}
                  titleOf={g.title}
                  health={health}
                  toolbar={
                    g.unsupported ? (
                      <div className="absolute left-3 top-3 z-10 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm dark:bg-amber-900/60 dark:text-amber-100">
                        Visual tools are off for this diagram — it uses syntax Mermade can't edit safely yet.
                      </div>
                    ) : g.model && (
                      <GraphToolbar
                        model={g.model}
                        collapsed={g.collapsed}
                        setCollapsed={g.setCollapsed}
                        focus={g.focus}
                        setFocus={g.setFocus}
                        focusTarget={g.focusTarget}
                        hiddenNodes={g.view?.hiddenNodes ?? 0}
                        onFind={g.find}
                        onAddNode={() => g.actions.addNode(g.selection?.kind === "group" ? g.selection.id : null)}
                        connecting={g.connectFrom}
                        onCancelConnect={() => g.setConnectFrom(null)}
                        linkUrls={linkUrls}
                        health={health}
                        checking={checking}
                        onCheck={runChecks}
                      />
                    )
                  }
                  inspector={
                    g.model && (
                      <Inspector
                        model={g.model}
                        selection={g.selection}
                        edgeSources={g.edgeSources}
                        collapsed={g.collapsed}
                        actions={g.actions}
                        renameKey={g.renameKey}
                        connecting={!!g.connectFrom}
                        onClose={() => g.setSelection(null)}
                        health={health}
                        checking={checking}
                        onCheck={runChecks}
                      />
                    )
                  }
                />
              )}
            </section>
          )}
        </main>
        <DesignPanel
          open={designOpen}
          onClose={() => setDesignOpen(false)}
          design={design}
          setDesign={setDesign}
          customPalettes={settings.customPalettes}
          setCustomPalettes={(customPalettes) => update({ customPalettes })}
          appTheme={settings.appTheme}
          setAppTheme={(appTheme) => update({ appTheme })}
          appDark={appDark}
          onApplyToAll={applyDesignToAll}
        />
      </div>

      {/* ---------- mobile tab bar ---------- */}
      {narrow && (
        <nav className="flex shrink-0 border-t border-zinc-200 dark:border-zinc-800" aria-label="View">
          {(
            [
              ["code", "Code", Code2],
              ["preview", "Preview", Eye],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobileTab(id)}
              aria-pressed={mobileTab === id}
              className={cx(
                "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium",
                mobileTab === id ? "text-cyan-700 dark:text-cyan-400" : "text-zinc-500",
              )}
            >
              <Icon className="size-4" /> {label}
              {id === "preview" && error && <span className="size-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
        </nav>
      )}

      {/* ---------- overlays ---------- */}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-cyan-700/10 backdrop-blur-[2px]">
          <div className="rounded-2xl border-2 border-dashed border-cyan-600 bg-white/90 px-10 py-8 text-center shadow-xl dark:bg-zinc-900/90">
            <FileUp className="mx-auto mb-2 size-8 text-cyan-700 dark:text-cyan-500" />
            <div className="font-semibold">Drop to import</div>
            <div className="text-sm text-zinc-500">.mmd, .md, .svg or .json backup</div>
          </div>
        </div>
      )}

      <TemplatePicker
        open={modal === "templates"}
        onClose={() => setModal(null)}
        onPick={newFromTemplate}
        compile={compileForThumb}
      />
      <ImportDialog
        open={modal === "import"}
        onClose={() => setModal(null)}
        onFiles={(f) => void importFiles(f)}
        onText={importText}
      />
      <Modal open={modal === "shortcuts"} onClose={() => setModal(null)} title="Keyboard shortcuts">
        <ShortcutList />
      </Modal>
    </div>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0e7490" />
      <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="10" y="12" width="18" height="12" rx="3" />
        <rect x="36" y="40" width="18" height="12" rx="3" />
        <path d="M19 24v10a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v4" />
        <circle cx="46" cy="18" r="6" />
      </g>
    </svg>
  );
}

function Segmented3({ value, onChange }: { value: Settings["layout"]; onChange: (v: Settings["layout"]) => void }) {
  const opts = [
    { v: "editor", label: "Code only", Icon: Code2 },
    { v: "split", label: "Split view", Icon: Columns2 },
    { v: "preview", label: "Preview only", Icon: Square },
  ] as const;
  return (
    <div className="flex rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800" role="radiogroup" aria-label="Layout">
      {opts.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={label}
          aria-label={label}
          onClick={() => onChange(v)}
          className={cx(
            "flex size-7 items-center justify-center rounded transition-colors",
            value === v
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function ShortcutList() {
  const rows: [string, string][] = [
    [`${MOD} S`, "Save now (changes also save automatically)"],
    ["Alt N", "New diagram from template"],
    [`${MOD} O`, "Import files or text"],
    [`${MOD} ⇧ E`, "Download PNG"],
    [`${MOD} ⇧ S`, "Download SVG"],
    [`${MOD} \\`, "Toggle diagram list"],
    [`${MOD} F`, "Find / replace in editor"],
    [`${MOD} Space`, "Autocomplete keywords"],
    ["+ / − / 0 / 1", "Zoom in / out / fit / 100% (preview focused)"],
    [`${MOD} scroll`, "Zoom preview at cursor"],
    ["Double-click preview", "Fit to screen"],
    ["Click node / line / group", "Select it, highlight its connections, edit in the inspector"],
    ["Drag a node onto a group", "Move it into that group (drag out to move to top level)"],
    ["Alt-drag between nodes", "Create a connection"],
    ["Double-click a group", "Collapse / expand it"],
    ["Del", "Delete the selected node or connection"],
    [`${MOD} Z (preview focused)`, "Undo the last visual edit"],
    ["F2 / Enter", "Rename the selection"],
    ["?", "Show this help"],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt>
            <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800">
              {k}
            </kbd>
          </dt>
          <dd className="text-zinc-600 dark:text-zinc-300">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
