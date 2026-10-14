import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";

const DIAGRAM_KEYWORDS: Completion[] = [
  "flowchart TD",
  "flowchart LR",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "gantt",
  "pie",
  "mindmap",
  "timeline",
  "journey",
  "gitGraph",
  "quadrantChart",
  "xychart-beta",
  "requirementDiagram",
  "sankey-beta",
  "block-beta",
  "architecture-beta",
  "kanban",
].map((label) => ({ label, type: "keyword", boost: 2 }));

const COMMON: Completion[] = [
  "subgraph",
  "end",
  "direction",
  "classDef",
  "class",
  "style",
  "linkStyle",
  "click",
  "participant",
  "actor",
  "activate",
  "deactivate",
  "Note over",
  "Note left of",
  "Note right of",
  "loop",
  "alt",
  "else",
  "opt",
  "par",
  "and",
  "critical",
  "break",
  "rect",
  "autonumber",
  "title",
  "section",
  "dateFormat",
  "axisFormat",
  "excludes",
  "commit",
  "branch",
  "checkout",
  "merge",
  "state",
  "note",
  "accTitle",
  "accDescr",
].map((label) => ({ label, type: "keyword" }));

/** Simple keyword completion: diagram types on the first line, statement keywords elsewhere. */
export function mermaidCompletions(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[\w-]+/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = ctx.state.doc.sliceString(0, line.from);
  const isHeader = !before.split("\n").some((l) => l.trim() && !l.trim().startsWith("%%") && l.trim() !== "---");
  return {
    from: word.from,
    options: isHeader ? DIAGRAM_KEYWORDS : COMMON,
    validFor: /^[\w-]*$/,
  };
}
