import "./setup-dom";
import { describe, expect, test } from "bun:test";
import { parseFlow } from "../src/lib/flow/parse";
import { buildView, effectiveGraph, neighborhood } from "../src/lib/flow/view";
import { CORPUS } from "./flow-corpus";

const ARCH = CORPUS.architecture!;
const model = parseFlow(ARCH);

async function mermaidEdges(code: string) {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false });
  const d = await mermaid.mermaidAPI.getDiagramFromText(code);
  return (d.db as unknown as { getEdges(): { id: string; start: string; end: string; text: string }[] }).getEdges();
}

describe("collapse", () => {
  test("no options returns the source untouched", () => {
    const v = buildView(ARCH, model, { collapsed: new Set(), isolate: null });
    expect(v.code).toBe(ARCH);
    expect(v.sourceEdge).toEqual(model.edges.map((e) => e.index));
  });

  test("collapsed groups merge parallel links with a count", async () => {
    const v = buildView(ARCH, model, { collapsed: new Set(["core", "data"]), isolate: null });
    expect(v.code).toContain("core@{ view: collapsed }");
    expect(v.code).toContain("data@{ view: collapsed }");
    const edges = await mermaidEdges(v.code);
    // core→data had users→usersdb, orders→ordersdb, orders→queue, payments→queue, inventory→queue
    const coreToData = v.model.edges.filter((e) => {
      const g = effectiveGraph(model, new Set(["core", "data"])).rep;
      return g(e.from) === "core" && g(e.to) === "data";
    });
    expect(coreToData.length).toBe(1);
    expect(coreToData[0]!.label).toBe("5 links");
    expect(edges.length).toBe(v.model.edges.length);
    // internal core edges are gone
    expect(v.model.edges.some((e) => e.from === "web" && e.to === "users")).toBe(false);
    // the merged edge maps back to all five source edges
    const i = v.model.edges.indexOf(coreToData[0]!);
    expect(v.sourceEdge[i]).toBeNull();
    expect(v.sources[i]!.length).toBe(5);
    // a plain edge maps back to its source
    // lb is a member of "edge" (it closes before "core"), so cdn→lb stays a plain edge
    const lb = v.model.edges.findIndex((e) => e.from === "cdn" && e.to === "lb");
    expect(v.sourceEdge[lb]).toBe(0);
    const qm = v.model.edges.findIndex((e) => e.from === "queue" && e.to === "mailer");
    expect(model.edges[v.sourceEdge[qm]!]!.to).toBe("mailer");
  });

  test("effective graph", () => {
    const g = effectiveGraph(model, new Set(["data"]));
    expect(g.nodes.has("data")).toBe(true);
    expect(g.nodes.has("queue")).toBe(false);
    const toData = g.edges.filter((e) => e.to === "data");
    expect(toData.map((e) => `${e.from}:${e.sources.length}`).sort()).toEqual(["inventory:1", "orders:2", "payments:1", "users:1"]);
  });
});

describe("focus", () => {
  const edges = model.edges.map((e) => ({ from: e.from, to: e.to }));
  test("downstream / upstream / both", () => {
    expect([...neighborhood(edges, "orders", 1, "down").nodes].sort()).toEqual(["inventory", "orders", "ordersdb", "payments", "queue"]);
    expect([...neighborhood(edges, "orders", 1, "up").nodes].sort()).toEqual(["orders", "web"]);
    expect([...neighborhood(edges, "queue", 2, "both").nodes]).toContain("web");
    expect(neighborhood(edges, "cdn", Infinity, "down").nodes.size).toBe(model.nodes.size);
  });

  test("isolate renders only the neighbourhood", async () => {
    const n = neighborhood(edges, "orders", 1, "both");
    const v = buildView(ARCH, model, { collapsed: new Set(), isolate: n.nodes });
    const m = parseFlow(v.code);
    expect([...m.nodes.keys()].sort()).toEqual([...n.nodes].sort());
    expect(m.subgraphs.has("edge")).toBe(false);
    expect(m.nodes.get("ordersdb")!.parent).toBe("data");
    expect(v.hiddenNodes).toBe(model.nodes.size - n.nodes.size);
    await mermaidEdges(v.code);
    for (const [i, src] of v.sourceEdge.entries()) {
      expect(model.edges[src!]!.from).toBe(m.edges[i]!.from);
      expect(model.edges[src!]!.to).toBe(m.edges[i]!.to);
    }
  });

  test("isolate with collapsed groups", async () => {
    const collapsed = new Set(["data"]);
    const g = effectiveGraph(model, collapsed);
    const n = neighborhood(g.edges, "data", 1, "both");
    const v = buildView(ARCH, model, { collapsed, isolate: n.nodes });
    await mermaidEdges(v.code);
    expect(v.code).toContain("data@{ view: collapsed }");
    expect(parseFlow(v.code).subgraphs.has("edge")).toBe(false);
  });
});
