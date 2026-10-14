export interface Diagram {
  id: string;
  name: string;
  code: string;
  createdAt: number;
  updatedAt: number;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createDiagram(name: string, code: string): Diagram {
  const now = Date.now();
  return { id: newId(), name, code, createdAt: now, updatedAt: now };
}

const TYPE_LABELS: [RegExp, string][] = [
  [/^(flowchart|graph)\b/, "Flowchart"],
  [/^sequenceDiagram\b/, "Sequence"],
  [/^classDiagram(-v2)?\b/, "Class"],
  [/^stateDiagram(-v2)?\b/, "State"],
  [/^erDiagram\b/, "ER"],
  [/^gantt\b/, "Gantt"],
  [/^pie\b/, "Pie"],
  [/^mindmap\b/, "Mindmap"],
  [/^timeline\b/, "Timeline"],
  [/^journey\b/, "Journey"],
  [/^gitGraph\b/, "Git"],
  [/^quadrantChart\b/, "Quadrant"],
  [/^xychart(-beta)?\b/, "XY Chart"],
  [/^requirementDiagram\b/, "Requirement"],
  [/^C4\w+\b/, "C4"],
  [/^sankey(-beta)?\b/, "Sankey"],
  [/^block(-beta)?\b/, "Block"],
  [/^packet(-beta)?\b/, "Packet"],
  [/^architecture(-beta)?\b/, "Architecture"],
  [/^kanban\b/, "Kanban"],
  [/^radar(-beta)?\b/, "Radar"],
  [/^treemap(-beta)?\b/, "Treemap"],
];

/** Strip YAML front matter, %% comments and %%{init}%% directives so the first real line is the diagram keyword. */
export function firstDiagramLine(code: string): string {
  let text = code.replace(/^﻿/, "");
  const fm = text.match(/^\s*---\r?\n[\s\S]*?\r?\n---\s*(\r?\n|$)/);
  if (fm) text = text.slice(fm[0].length);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    return line;
  }
  return "";
}

export function detectDiagramType(code: string): string {
  const line = firstDiagramLine(code);
  for (const [re, label] of TYPE_LABELS) if (re.test(line)) return label;
  return "Unknown";
}

/** Best-effort title: front matter `title:` or a `title` statement, used to name imported diagrams. */
export function guessTitle(code: string): string | null {
  const fm = code.match(/^\s*---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const t = fm[1]!.match(/^\s*title:\s*["']?(.+?)["']?\s*$/m);
    if (t) return t[1]!;
  }
  const t = code.match(/^\s*title\s+["']?(.+?)["']?\s*$/m);
  return t ? t[1]! : null;
}
