import { useEffect, useRef } from "react";
import { EditorState, StateEffect, StateField, type Range } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
  placeholder,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { bracketMatching, indentOnInput, foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
import { setDiagnostics, lintGutter } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import { mermaid } from "codemirror-lang-mermaid";
import { mermaidCompletions } from "../lib/completions";

interface EditorProps {
  docKey: string;
  value: string;
  onChange: (value: string) => void;
  error: { line: number | null; message: string } | null;
  onCursor?: (line: number, col: number, offset: number) => void;
  /** Source ranges to highlight (e.g. the definition of the node selected in the preview). */
  highlight?: { from: number; to: number }[] | null;
}

const setHighlight = StateEffect.define<{ from: number; to: number }[]>();
const highlightLine = Decoration.line({ class: "cm-linked-line" });
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setHighlight)) continue;
      const ranges: Range<Decoration>[] = [];
      const seen = new Set<number>();
      for (const r of e.value) {
        if (r.from > tr.state.doc.length) continue;
        const first = tr.state.doc.lineAt(r.from).number;
        const last = tr.state.doc.lineAt(Math.min(r.to, tr.state.doc.length)).number;
        for (let n = first; n <= last; n++) {
          const line = tr.state.doc.line(n);
          if (!seen.has(line.from)) ranges.push(highlightLine.range(line.from));
          seen.add(line.from);
        }
      }
      deco = Decoration.set(ranges.sort((a, b) => a.from - b.from));
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const syntaxColors = HighlightStyle.define([
  { tag: [t.typeName, t.keyword], color: "var(--cm-keyword)", fontWeight: "600" },
  { tag: [t.string, t.special(t.string)], color: "var(--cm-string)" },
  { tag: [t.number, t.bool], color: "var(--cm-number)" },
  { tag: [t.lineComment, t.comment, t.blockComment], color: "var(--cm-comment)", fontStyle: "italic" },
  { tag: [t.contentSeparator, t.operator, t.punctuation], color: "var(--cm-operator)" },
  { tag: [t.variableName, t.propertyName, t.labelName], color: "var(--cm-variable)" },
]);

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px", backgroundColor: "transparent", color: "var(--cm-fg)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--cm-caret)" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--cm-gutter)" },
  ".cm-activeLine": { backgroundColor: "var(--cm-active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--cm-fg)" },
  ".cm-cursor": { borderLeftColor: "var(--cm-caret)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--cm-selection) !important",
  },
  ".cm-selectionMatch": { backgroundColor: "var(--cm-match)" },
  "&.cm-focused": { outline: "none" },
  ".cm-tooltip": {
    backgroundColor: "var(--cm-tooltip-bg)",
    border: "1px solid var(--cm-tooltip-border)",
    borderRadius: "8px",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--cm-selection)", color: "inherit" },
  ".cm-panels": { backgroundColor: "var(--cm-tooltip-bg)", color: "var(--cm-fg)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--cm-tooltip-border)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy #ef4444",
    textUnderlineOffset: "3px",
  },
  ".cm-lint-marker": { width: "0.9em", height: "0.9em" },
  ".cm-linked-line": { backgroundColor: "var(--cm-linked)", boxShadow: "inset 3px 0 0 var(--cm-caret)" },
});

export function Editor({ docKey, value, onChange, error, onCursor, highlight }: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onCursor });
  callbacks.current = { onChange, onCursor };

  // Create the view once.
  useEffect(() => {
    const v = new EditorView({ parent: host.current! });
    view.current = v;
    return () => v.destroy();
  }, []);

  // A new document gets a fresh state (and a fresh undo history).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.setState(
      EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          lintGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          indentUnit.of("    "),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ override: [mermaidCompletions], icons: false }),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          mermaid(),
          syntaxHighlighting(syntaxColors),
          baseTheme,
          placeholder("Type Mermaid code here…"),
          highlightField,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
            if (u.selectionSet || u.docChanged) {
              const head = u.state.selection.main.head;
              const line = u.state.doc.lineAt(head);
              callbacks.current.onCursor?.(line.number, head - line.from + 1, head);
            }
          }),
        ],
      }),
    );
  }, [docKey]);

  // External changes (another tab, import into current doc) — replace content if it differs.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current === value) return;
    // Replace only the changed middle so the cursor and undo history stay sensible.
    let start = 0;
    while (start < current.length && start < value.length && current[start] === value[start]) start++;
    let endA = current.length;
    let endB = value.length;
    while (endA > start && endB > start && current[endA - 1] === value[endB - 1]) (endA--, endB--);
    v.dispatch({ changes: { from: start, to: endA, insert: value.slice(start, endB) } });
  }, [value]);

  // Show render errors as diagnostics on the offending line.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    if (!error || !error.line || error.line > doc.lines) {
      v.dispatch(setDiagnostics(v.state, []));
      return;
    }
    const line = doc.line(error.line);
    v.dispatch(
      setDiagnostics(v.state, [
        { from: line.from, to: Math.max(line.to, line.from), severity: "error", message: error.message },
      ]),
    );
  }, [error, docKey]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const ranges = highlight ?? [];
    v.dispatch({ effects: setHighlight.of(ranges) });
    const first = ranges[0];
    if (first && first.from <= v.state.doc.length && !v.hasFocus) {
      v.dispatch({ effects: EditorView.scrollIntoView(first.from, { y: "center" }) });
    }
  }, [highlight, docKey]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="editor" />;
}
