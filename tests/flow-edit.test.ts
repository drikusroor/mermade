import "./setup-dom";
import { describe, expect, test } from "bun:test";
import { parseFlow, type FlowModel } from "../src/lib/flow/parse";
import {
  addEdge,
  addNode,
  deleteNode,
  groupNodes,
  moveNode,
  moveSubgraph,
  removeEdges,
  renameNode,
  renameSubgraph,
  reverseEdge,
  setEdgeLabel,
  ungroup,
} from "../src/lib/flow/edit";
import { CORPUS } from "./flow-corpus";

/** Mermaid must accept the edited code, and our parser must agree with it. */
async function check(code: string): Promise<FlowModel> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false });
  const d = await mermaid.mermaidAPI.getDiagramFromText(code);
  const db = d.db as unknown as { getEdges(): { start: string; end: string }[]; getSubGraphs(): { id: string; nodes: string[] }[] };
  const model = parseFlow(code);
  expect(model.edges.map((e) => [e.from, e.to])).toEqual(db.getEdges().map((e) => [e.start, e.end]));
  for (const sg of db.getSubGraphs()) expect([...model.subgraphs.get(sg.id)!.members].sort()).toEqual([...sg.nodes].sort());
  return model;
}

const pairs = (m: FlowModel) => m.edges.map((e) => `${e.from}>${e.to}${e.label ? ":" + e.label : ""}`);

const ARCH = CORPUS.architecture!;

describe("rename", () => {
  test("node with shape keeps its shape", async () => {
    const out = renameNode(ARCH, "usersdb", 'Users "primary" DB');
    expect(out).toContain('usersdb[("Users #quot;primary#quot; DB")]');
    const m = await check(out);
    expect(m.nodes.get("usersdb")!.label).toBe('Users "primary" DB');
    expect(m.nodes.get("usersdb")!.shape).toBe("cylinder");
  });

  test("node without a shape gets one at its first mention", async () => {
    const out = renameNode("flowchart LR\n  a --> b\n  b --> c", "b", "Bee");
    expect(out).toBe('flowchart LR\n  a --> b["Bee"]\n  b --> c');
    await check(out);
  });

  test("@{} metadata label", async () => {
    const out = renameNode('flowchart LR\n  n1@{ shape: cyl, label: "Old" } --> x', "n1", "New");
    expect((await check(out)).nodes.get("n1")!.label).toBe("New");
  });

  test("subgraph title (explicit and implicit ids)", async () => {
    let out = renameSubgraph(ARCH, "core", "Core platform");
    expect(out).toContain('subgraph core["Core platform"]');
    expect((await check(out)).subgraphs.get("core")!.title).toBe("Core platform");
    out = renameSubgraph(CORPUS.subgraphs!, "subGraph3", "Named now");
    const m = await check(out);
    expect(m.subgraphs.get("named_now")!.members.sort()).toEqual(["x1", "x2"]);
  });
});

describe("connections", () => {
  test("add at the top level", async () => {
    const out = addEdge(ARCH, "mailer", "usersdb", "looks up");
    const m = await check(out);
    expect(pairs(m)).toContain("mailer>usersdb:looks up");
    // still before nothing else; membership unchanged
    expect(m.nodes.get("mailer")!.parent).toBeNull();
  });

  test("remove a simple edge keeps both nodes, shapes and membership", async () => {
    const before = parseFlow(ARCH);
    const idx = before.edges.find((e) => e.from === "orders" && e.to === "payments")!.index;
    const out = removeEdges(ARCH, [idx]);
    const m = await check(out);
    expect(pairs(m)).not.toContain("orders>payments");
    expect(m.nodes.get("payments")!.label).toBe("Payment Service");
    expect(m.nodes.get("payments")!.parent).toBe("core");
    expect(m.edges.length).toBe(before.edges.length - 1);
  });

  test("remove from chains and & groups", async () => {
    const code = "flowchart LR\n  A[Alpha] & B --> C --> D[Delta]\n  E --> A";
    const m0 = parseFlow(code);
    const bc = m0.edges.find((e) => e.from === "B" && e.to === "C")!.index;
    const cd = m0.edges.find((e) => e.from === "C" && e.to === "D")!.index;
    const out = removeEdges(code, [bc, cd]);
    const m = await check(out);
    expect(pairs(m)).toEqual(["A>C", "E>A"]);
    expect(m.nodes.get("D")!.label).toBe("Delta");
    expect(m.nodes.has("B")).toBe(true);
  });

  test("relabel", async () => {
    const m0 = parseFlow(ARCH);
    const idx = m0.edges.find((e) => e.from === "users" && e.to === "usersdb")!.index;
    let out = setEdgeLabel(ARCH, idx, "SQL | reads");
    expect(pairs(await check(out))).toContain("users>usersdb:SQL | reads");
    out = setEdgeLabel(out, idx, "");
    expect(pairs(await check(out))).toContain("users>usersdb");
    const chain = setEdgeLabel(CORPUS.groups!, 0, "x");
    expect((await check(chain)).edges[0]!.label).toBe("x");
  });

  test("reverse", async () => {
    const m0 = parseFlow(ARCH);
    const idx = m0.edges.find((e) => e.from === "queue" && e.to === "mailer")!.index;
    expect(pairs(await check(reverseEdge(ARCH, idx)))).toContain("mailer>queue");
  });

  test("linkStyle indices follow their edges", async () => {
    const code = "flowchart LR\n  A --> B\n  B --> C\n  C --> D\n  linkStyle 2 stroke:red\n  linkStyle 0,1 stroke:blue";
    const out = removeEdges(code, [1]);
    expect(out).toContain("linkStyle 1 stroke:red");
    expect(out).toContain("linkStyle 0 stroke:blue");
    const out2 = removeEdges(code, [2]);
    expect(out2).not.toContain("stroke:red");
    await check(out2);
  });
});

describe("nodes", () => {
  test("add into a group and at the top level", async () => {
    const a = addNode(ARCH, "Audit Log", "data");
    let m = await check(a.code);
    expect(a.id).toBe("audit_log");
    expect(m.nodes.get("audit_log")!.parent).toBe("data");
    const b = addNode(a.code, "Audit Log", null);
    m = await check(b.code);
    expect(b.id).toBe("audit_log_2");
    expect(m.nodes.get("audit_log_2")!.parent).toBeNull();
  });

  test("delete removes its connections and references", async () => {
    const out = deleteNode(CORPUS.styling!, "B");
    const m = await check(out);
    expect(m.nodes.has("B")).toBe(false);
    expect(out).toContain("class C hot");
    expect(pairs(m)).toEqual([]);
    expect(m.nodes.has("A")).toBe(true);
    expect(m.nodes.has("C")).toBe(true);
  });
});

describe("moving between groups", () => {
  test("into another group, keeping neighbours where they were", async () => {
    const out = moveNode(ARCH, "payments", "data");
    const m = await check(out);
    expect(m.nodes.get("payments")!.parent).toBe("data");
    expect(m.nodes.get("payments")!.label).toBe("Payment Service");
    expect(m.nodes.get("orders")!.parent).toBe("core");
    expect(pairs(m).sort()).toEqual(pairs(parseFlow(ARCH)).sort());
  });

  test("out to the top level", async () => {
    const out = moveNode(ARCH, "lb", null);
    const m = await check(out);
    expect(m.nodes.get("lb")!.parent).toBeNull();
    expect(m.nodes.get("cdn")!.parent).toBe("edge");
    expect(m.nodes.get("web")!.parent).toBe("core");
    expect(pairs(m).sort()).toEqual(pairs(parseFlow(ARCH)).sort());
  });

  test("from the top level into a group", async () => {
    const out = moveNode(ARCH, "mailer", "core");
    const m = await check(out);
    expect(m.nodes.get("mailer")!.parent).toBe("core");
    expect(m.nodes.get("mailer")!.label).toBe("Mailer");
    expect(m.nodes.get("queue")!.parent).toBe("data");
  });

  test("into a nested group", async () => {
    const out = moveNode(CORPUS.subgraphs!, "gw", "inner");
    const m = await check(out);
    expect(m.nodes.get("gw")!.parent).toBe("inner");
    expect(m.nodes.get("auth")!.parent).toBe("api");
  });

  test("group a set of nodes, then ungroup", async () => {
    const g = groupNodes(ARCH, ["orders", "payments"], "Checkout");
    let m = await check(g.code);
    expect(m.nodes.get("orders")!.parent).toBe("checkout");
    expect(m.nodes.get("payments")!.parent).toBe("checkout");
    expect(m.subgraphs.get("checkout")!.parent).toBe("core");
    const u = ungroup(g.code, "checkout");
    m = await check(u);
    expect(m.subgraphs.has("checkout")).toBe(false);
    expect(m.nodes.get("orders")!.parent).toBe("core");
    expect(pairs(m).sort()).toEqual(pairs(parseFlow(ARCH)).sort());
  });

  test("ungroup drops links to the group itself", async () => {
    const out = ungroup(CORPUS.subgraphs!, "data");
    const m = await check(out);
    expect(m.nodes.has("data")).toBe(false);
    expect(m.nodes.get("db")!.parent).toBeNull();
  });

  test("move a whole group", async () => {
    let out = moveSubgraph(ARCH, "data", "core");
    let m = await check(out);
    expect(m.subgraphs.get("data")!.parent).toBe("core");
    expect(m.nodes.get("usersdb")!.parent).toBe("data");
    out = moveSubgraph(out, "data", null);
    m = await check(out);
    expect(m.subgraphs.get("data")!.parent).toBeNull();
    expect(() => moveSubgraph(CORPUS.subgraphs!, "api", "inner")).toThrow();
  });
});
