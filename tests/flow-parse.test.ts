import "./setup-dom";
import { describe, expect, test } from "bun:test";
import { parseFlow } from "../src/lib/flow/parse";
import { CORPUS } from "./flow-corpus";
import { TEMPLATES } from "../src/lib/templates";

interface MermaidDb {
  getVertices(): Map<string, { id: string; text: string }>;
  getEdges(): { id: string; start: string; end: string; text: string; stroke: string }[];
  getSubGraphs(): { id: string; title: string; nodes: string[] }[];
}

async function mermaidModel(code: string) {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(code);
  return diagram.db as unknown as MermaidDb;
}

const cases = { ...CORPUS, template: TEMPLATES.find((t) => t.id === "flowchart")!.code };

describe("flowchart parser agrees with Mermaid", () => {
  for (const [name, code] of Object.entries(cases)) {
    test(name, async () => {
      const db = await mermaidModel(code);
      const model = parseFlow(code);
      const sgIds = new Set(db.getSubGraphs().map((s) => s.id));

      expect(
        model.edges.map((e) => [e.id, e.from, e.to, e.label, e.stroke]),
      ).toEqual(db.getEdges().map((e) => [e.id, e.start, e.end, e.text, e.stroke]));

      const vertices = [...db.getVertices().values()].filter((v) => !sgIds.has(v.id));
      expect([...model.nodes.keys()].sort()).toEqual(vertices.map((v) => v.id).sort());
      for (const v of vertices) {
        // Mermaid keeps markdown backticks in text; we strip them for display.
        expect(model.nodes.get(v.id)!.label).toBe(v.text.replace(/^`([\s\S]*)`$/, "$1"));
      }

      const subs = db.getSubGraphs().map((s) => [s.id, s.title, [...s.nodes].sort()]);
      const ours = [...model.subgraphs.values()].map((s) => [s.id, s.title, [...s.members].sort()]);
      expect(ours.sort()).toEqual(subs.sort());
    });
  }
});

describe("parser details", () => {
  test("spans point at the source", () => {
    const code = CORPUS.subgraphs!;
    const m = parseFlow(code);
    const stmt = m.statements.find((s) => s.kind === "vertex" && s.groups[0]![0]!.id === "gw")!;
    if (stmt.kind !== "vertex") throw new Error();
    expect(code.slice(stmt.start, stmt.end)).toBe("gw[Gateway] --> auth(Auth)");
    expect(stmt.groups[0]![0]!.shape!.raw).toBe("[Gateway]");
    expect(stmt.block).toBe("api");
    expect(m.subgraphs.get("inner")!.parent).toBe("api");
    expect(m.nodes.get("svc1")!.parent).toBe("inner");
    expect(m.nodes.get("outside")!.parent).toBeNull();
  });

  test("link plain operators", () => {
    const m = parseFlow(CORPUS.links!);
    const plains = m.statements.flatMap((s) => (s.kind === "vertex" ? s.links.map((l) => l.plain) : []));
    expect(plains).toEqual(["-->", "---", "-.->", "==>", "--o", "--x", "<-->", "~~~", "-->", "-->", "-.->", "==>", "---->", "-->", "-->"]);
  });
});

describe("click links", () => {
  const code = [
    "flowchart LR",
    "  a[A] --> b[B]",
    "  c[C]",
    "  subgraph grp[Group]",
    "    d[D]",
    "  end",
    '  click a "https://a.example"',
    '  click b href "https://b.example" "B svc | ACC: https://b-acc.example" _blank',
    "  click c call doThing()",
    '  click grp "https://grp.example"',
  ].join("\n");

  test("both url forms land in links, call forms and subgraphs do not", () => {
    const m = parseFlow(code);
    expect([...m.links.keys()].sort()).toEqual(["a", "b"]);
    expect(m.links.get("a")).toEqual({ href: "https://a.example", urls: [{ label: "PRD", url: "https://a.example" }] });
    expect(m.links.get("b")).toEqual({
      href: "https://b.example",
      tooltip: "B svc | ACC: https://b-acc.example",
      target: "_blank",
      urls: [
        { label: "PRD", url: "https://b.example" },
        { label: "ACC", url: "https://b-acc.example" },
      ],
    });
  });

  test("click id spans are unchanged", () => {
    const m = parseFlow(code);
    for (const s of m.statements) {
      if (s.kind !== "click") continue;
      expect(code.slice(s.idStart, s.idEnd)).toBe(s.id);
    }
    const call = m.statements.find((s) => s.kind === "click" && s.id === "c");
    expect(call && call.kind === "click" && call.href).toBeUndefined();
  });
});
