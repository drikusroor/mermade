import { useEffect, useState } from "react";
import { TEMPLATES, type Template } from "../lib/templates";
import { renderDiagram } from "../lib/render";
import type { MermaidConfig } from "mermaid";
import { Modal } from "./ui";

export type CompileFn = (code: string) => { code: string; config: MermaidConfig; canvas: string };

const thumbCache = new Map<string, string>();

function Thumb({ template, compile }: { template: Template; compile: CompileFn }) {
  const compiled = compile(template.code);
  const key = `${template.id}|${JSON.stringify(compiled.config)}`;
  const [svg, setSvg] = useState(thumbCache.get(key) ?? null);
  useEffect(() => {
    if (thumbCache.has(key)) return setSvg(thumbCache.get(key)!);
    let alive = true;
    renderDiagram(compiled.code, compiled.config).then((r) => {
      if (!r.ok) return;
      thumbCache.set(key, r.svg);
      if (alive) setSvg(r.svg);
    });
    return () => {
      alive = false;
    };
  }, [key]); // compiled is derived from key
  return (
    <div
      className="thumb flex h-28 items-center justify-center overflow-hidden p-2"
      style={{ backgroundColor: compiled.canvas }}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {svg ? undefined : <div className="h-full w-full animate-pulse rounded bg-zinc-200/60 dark:bg-zinc-700/40" />}
    </div>
  );
}

export function TemplatePicker({
  open,
  onClose,
  onPick,
  compile,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (t: Template) => void;
  compile: CompileFn;
}) {
  return (
    <Modal open={open} onClose={onClose} title="New diagram" wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="group overflow-hidden rounded-xl border border-zinc-200 text-left transition hover:-translate-y-0.5 hover:border-cyan-600 hover:shadow-md focus-visible:outline-2 focus-visible:outline-cyan-600 dark:border-zinc-700 dark:hover:border-cyan-500"
          >
            <div>{open && <Thumb template={t} compile={compile} />}</div>
            <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="text-xs text-zinc-500">{t.description}</div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
