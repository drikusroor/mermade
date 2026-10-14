import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Monitor, Moon, Plus, Sun, Trash2, X } from "lucide-react";
import {
  DEFAULT_DESIGN,
  FONTS,
  PALETTES,
  PRESETS,
  STYLES,
  compileDesign,
  findPalette,
  isValidHex,
  makeCustomPalette,
  type Design,
  type Palette,
} from "../lib/design";
import { parseFlow } from "../lib/flow/parse";
import { renderDiagram } from "../lib/render";
import { MERMAID_THEMES } from "../lib/render";
import { cx } from "./ui";

const SAMPLE = `flowchart LR
  subgraph fe[Frontend]
    web[Web app]
  end
  subgraph be[Services]
    api[API] --> jobs[Jobs]
  end
  db[(Database)]
  web --> api
  api --> db`;
const sampleModel = parseFlow(SAMPLE);
const thumbCache = new Map<string, string>();

function PresetThumb({ design, appDark, customPalettes }: { design: Design; appDark: boolean; customPalettes: Palette[] }) {
  const compiled = useMemo(() => compileDesign(design, { appDark, customPalettes, model: sampleModel }), [design, appDark, customPalettes]);
  const key = JSON.stringify(compiled);
  const [svg, setSvg] = useState(thumbCache.get(key) ?? null);
  useEffect(() => {
    if (thumbCache.has(key)) return setSvg(thumbCache.get(key)!);
    let alive = true;
    const code = compiled.extraCode ? `${SAMPLE}\n${compiled.extraCode}` : SAMPLE;
    renderDiagram(code, compiled.config).then((r) => {
      if (!r.ok) return;
      thumbCache.set(key, r.svg);
      if (alive) setSvg(r.svg);
    });
    return () => {
      alive = false;
    };
  }, [key, compiled]);
  return (
    <div
      className="thumb flex h-20 items-center justify-center overflow-hidden p-2"
      style={{ backgroundColor: compiled.canvas }}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {svg ? undefined : <div className="h-full w-full animate-pulse rounded bg-zinc-400/20" />}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-zinc-100 px-5 py-4 last:border-0 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-sm">{label}</span>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-cyan-600" : "bg-zinc-300 dark:bg-zinc-600")}
      >
        <span className={cx("absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

function Swatches({ p }: { p: Palette }) {
  return (
    <div className="flex h-7 overflow-hidden rounded-md ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: p.bg }}>
      <span className="w-3" style={{ backgroundColor: p.bg }} />
      {p.accents.slice(0, 5).map((a, i) => (
        <span key={i} className="flex-1" style={{ backgroundColor: a }} />
      ))}
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="color"
        value={isValidHex(value) && value.length === 7 ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="size-7 shrink-0 cursor-pointer rounded-md border border-zinc-200 bg-transparent p-0.5 dark:border-zinc-700"
      />
      <span className="w-16 text-zinc-500">{label}</span>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (isValidHex(e.target.value)) onChange(e.target.value);
        }}
        spellCheck={false}
        className="h-7 w-20 rounded-md border border-zinc-200 bg-transparent px-1.5 font-mono text-xs outline-none focus:border-cyan-600 dark:border-zinc-700"
      />
    </label>
  );
}

export function DesignPanel({
  open,
  onClose,
  design,
  setDesign,
  customPalettes,
  setCustomPalettes,
  appTheme,
  setAppTheme,
  appDark,
  onApplyToAll,
}: {
  open: boolean;
  onClose: () => void;
  design: Design;
  setDesign: (d: Design) => void;
  customPalettes: Palette[];
  setCustomPalettes: (p: Palette[]) => void;
  appTheme: "system" | "light" | "dark";
  setAppTheme: (t: "system" | "light" | "dark") => void;
  appDark: boolean;
  onApplyToAll: () => void;
}) {
  if (!open) return null;
  const update = (patch: Partial<Design>) => setDesign({ ...design, ...patch });
  const palette = findPalette(design.palette, customPalettes);
  const editing = palette.custom ? palette : null;
  const updatePalette = (patch: Partial<Palette>) =>
    setCustomPalettes(customPalettes.map((p) => (p.id === palette.id ? { ...p, ...patch } : p)));

  const presetActive = (d: Partial<Design>) => Object.entries(d).every(([k, v]) => design[k as keyof Design] === v);

  return (
    <aside
      className="animate-pop absolute inset-y-0 right-0 z-30 flex w-[360px] max-w-full flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      aria-label="Design"
      data-testid="design-panel"
    >
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold">Design</h2>
          <p className="text-xs text-zinc-500">Applies to this diagram and new ones</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close design panel" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Presets">
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const d = { ...design, ...p.design };
              const active = presetActive(p.design);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDesign(d)}
                  aria-pressed={active}
                  aria-label={`${p.name} preset`}
                  className={cx(
                    "overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:shadow-md",
                    active ? "border-cyan-600 ring-2 ring-cyan-600/30" : "border-zinc-200 dark:border-zinc-700",
                  )}
                >
                  <PresetThumb design={d} appDark={appDark} customPalettes={customPalettes} />
                  <div className="flex items-center justify-between px-2 py-1 text-xs font-medium">
                    {p.name}
                    {active && <Check className="size-3 text-cyan-600" />}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Style">
          <div className="grid grid-cols-2 gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => update({ style: s.id })}
                aria-pressed={design.style === s.id}
                className={cx(
                  "rounded-lg border px-2.5 py-2 text-left",
                  design.style === s.id
                    ? "border-cyan-600 bg-cyan-50 dark:bg-cyan-950/40"
                    : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800",
                )}
              >
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-[11px] leading-tight text-zinc-500">{s.description}</div>
              </button>
            ))}
          </div>
          {design.style === "classic" && (
            <select
              aria-label="Mermaid theme"
              value={design.classicTheme}
              onChange={(e) => update({ classicTheme: e.target.value })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {MERMAID_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </Section>

        {design.style !== "classic" && (
          <Section
            title="Palette"
            aside={
              <button
                type="button"
                onClick={() => {
                  const p = makeCustomPalette(`${palette.name} custom`, palette);
                  setCustomPalettes([...customPalettes, p]);
                  update({ palette: p.id });
                }}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-cyan-700 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-950/40"
                title="Create a custom palette from the current one"
              >
                {palette.custom ? <Copy className="size-3" /> : <Plus className="size-3" />} {palette.custom ? "Duplicate" : "Customize"}
              </button>
            }
          >
            <div className="grid grid-cols-2 gap-2">
              {[...PALETTES, ...customPalettes].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => update({ palette: p.id })}
                  aria-pressed={design.palette === p.id}
                  className={cx(
                    "flex flex-col gap-1 rounded-lg border p-1.5 text-left",
                    design.palette === p.id ? "border-cyan-600 ring-2 ring-cyan-600/25" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800",
                  )}
                >
                  <Swatches p={p} />
                  <span className="flex items-center gap-1 truncate px-0.5 text-xs">
                    {p.name}
                    {p.custom && <span className="rounded bg-zinc-100 px-1 text-[9px] uppercase text-zinc-500 dark:bg-zinc-800">custom</span>}
                  </span>
                </button>
              ))}
            </div>
            {editing && (
              <div className="mt-1 flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700" data-testid="palette-editor">
                <input
                  value={editing.name}
                  onChange={(e) => updatePalette({ name: e.target.value })}
                  aria-label="Palette name"
                  className="h-8 rounded-md border border-zinc-200 bg-transparent px-2 text-sm font-medium outline-none focus:border-cyan-600 dark:border-zinc-700"
                />
                <ColorInput label="Canvas" value={editing.bg} onChange={(bg) => updatePalette({ bg })} />
                <ColorInput label="Nodes" value={editing.surface} onChange={(surface) => updatePalette({ surface })} />
                <ColorInput label="Text" value={editing.text} onChange={(text) => updatePalette({ text })} />
                <ColorInput label="Lines" value={editing.line} onChange={(line) => updatePalette({ line })} />
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Group accents</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {editing.accents.map((a, i) => (
                    <span key={i} className="group relative">
                      <input
                        type="color"
                        value={a}
                        aria-label={`Accent ${i + 1}`}
                        onChange={(e) => updatePalette({ accents: editing.accents.map((x, j) => (j === i ? e.target.value : x)) })}
                        className="size-8 cursor-pointer rounded-md border border-zinc-200 bg-transparent p-0.5 dark:border-zinc-700"
                      />
                      {editing.accents.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove accent ${i + 1}`}
                          onClick={() => updatePalette({ accents: editing.accents.filter((_, j) => j !== i) })}
                          className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-zinc-800 text-white group-hover:flex"
                        >
                          <X className="size-2.5" />
                        </button>
                      )}
                    </span>
                  ))}
                  {editing.accents.length < 12 && (
                    <button
                      type="button"
                      aria-label="Add accent"
                      onClick={() => updatePalette({ accents: [...editing.accents, editing.accents[editing.accents.length - 1] ?? "#0891b2"] })}
                      className="flex size-8 items-center justify-center rounded-md border border-dashed border-zinc-300 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCustomPalettes(customPalettes.filter((p) => p.id !== editing.id));
                    update({ palette: DEFAULT_DESIGN.palette });
                  }}
                  className="mt-1 flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="size-3.5" /> Delete palette
                </button>
              </div>
            )}
          </Section>
        )}

        <Section title="Details">
          {design.style !== "classic" && (
            <Toggle checked={design.colorGroups} onChange={(colorGroups) => update({ colorGroups })} label="Colour by group" hint="Each top-level subgraph gets its own accent" />
          )}
          <Toggle checked={design.look === "handDrawn"} onChange={(v) => update({ look: v ? "handDrawn" : "classic" })} label="Hand-drawn" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Font</span>
            <select
              aria-label="Font"
              value={design.font}
              onChange={(e) => update({ font: e.target.value as Design["font"] })}
              className="h-8 w-40 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="auto">Automatic</option>
              {Object.entries(FONTS).map(([id, f]) => (
                <option key={id} value={id} style={{ fontFamily: f.stack }}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">Lines</span>
            <Pills
              label="Line curve"
              value={design.curve}
              onChange={(curve) => update({ curve })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "rounded", label: "Rounded" },
                { value: "basis", label: "Smooth" },
                { value: "linear", label: "Straight" },
                { value: "step", label: "Step" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">Spacing</span>
            <Pills
              label="Spacing"
              value={design.spacing}
              onChange={(spacing) => update({ spacing })}
              options={[
                { value: "compact", label: "Compact" },
                { value: "normal", label: "Normal" },
                { value: "roomy", label: "Roomy" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">Layout engine</span>
            <Pills
              label="Layout engine"
              value={design.layout}
              onChange={(layout) => update({ layout })}
              options={[
                { value: "dagre", label: "Standard" },
                { value: "elk", label: "ELK (complex graphs)" },
              ]}
            />
            <p className="text-xs text-zinc-500">ELK usually untangles busy diagrams with many crossing lines.</p>
          </div>
        </Section>

        <Section title="App theme">
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
                ["system", "System", Monitor],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setAppTheme(v)}
                aria-pressed={appTheme === v}
                className={cx(
                  "flex flex-col items-center gap-1 rounded-lg border py-2 text-xs",
                  appTheme === v
                    ? "border-cyan-600 bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </Section>
      </div>

      <div className="border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onApplyToAll}
          className="w-full rounded-lg border border-zinc-200 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Apply this design to all diagrams
        </button>
      </div>
    </aside>
  );
}
