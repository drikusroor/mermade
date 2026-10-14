import { describe, expect, test } from "bun:test";
import { decodeState, encodeState } from "../src/lib/share";
import { extractMermaidBlocks, extractSourceFromSvg, parseImport, parseText } from "../src/lib/importer";
import { detectDiagramType, guessTitle } from "../src/lib/diagram";
import { embedSource, sanitizeFilename, toMarkdown } from "../src/lib/exporter";
import { errorLine } from "../src/lib/render";
import { TEMPLATES } from "../src/lib/templates";

describe("share links", () => {
  test("round-trips code and theme", async () => {
    const code = 'flowchart TD\n  A["héllo & <wörld> 🚀"] --> B';
    const encoded = await encodeState({ code, theme: "forest" });
    expect(encoded.startsWith("pako:")).toBe(true);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(await decodeState(`https://example.com/mermade/#${encoded}`)).toEqual({ code, theme: "forest" });
  });

  test("decodes a mermaid.live pako link", async () => {
    // zlib level 9 + url-safe base64, produced independently of our encoder (same as pako on mermaid.live).
    const live =
      "eNotjk0KwjAQha8yzErBXsCFoBZ6AN01LoZmaIJMEpLporS9uwn4lt_74W04Rct4BZwzJQfv3gSouo9Pl31RofKBrrvtAytIDLzu8DgNEYqLKfkwn_ECKJyFvG0zW-sbVMfCpgKDlvLXoAlHS9Ki8bWGqTqaF65kSZaUe0_1gPzx8QNGxzD8";
    expect(await decodeState(`https://mermaid.live/edit#pako:${live}`)).toEqual({
      code: "graph TD\n    A[Christmas] -->|Get money| B(Go shopping)",
      theme: "dark",
    });
  });

  test("decodes legacy base64 links", async () => {
    const json = JSON.stringify({ code: "pie\n  \"a\": 1", mermaid: '{"theme":"dark"}' });
    const b64 = btoa(json);
    expect(await decodeState(`#base64:${b64}`)).toEqual({ code: 'pie\n  "a": 1', theme: "dark" });
  });

  test("returns null for garbage", async () => {
    expect(await decodeState("#pako:notreallyvalid")).toBeNull();
    expect(await decodeState("hello")).toBeNull();
  });
});

describe("markdown import", () => {
  const md = [
    "# Doc",
    "",
    "```mermaid",
    "flowchart LR",
    "  A --> B",
    "```",
    "",
    "```js",
    "console.log(1)",
    "```",
    "",
    "  ~~~mermaid",
    "  sequenceDiagram",
    "    A->>B: hi",
    "  ~~~",
    "",
    "::: mermaid",
    "pie",
    '  "x": 1',
    ":::",
  ].join("\n");

  test("extracts all mermaid blocks and ignores other languages", () => {
    const blocks = extractMermaidBlocks(md);
    expect(blocks).toEqual(["flowchart LR\n  A --> B", "sequenceDiagram\n  A->>B: hi", 'pie\n  "x": 1']);
  });

  test("parseImport names multiple blocks", async () => {
    const items = await parseImport("notes.md", md);
    expect(items.map((i) => i.name)).toEqual(["notes 1", "notes 2", "notes 3"]);
  });

  test("markdown without diagrams is an error", async () => {
    expect(parseImport("x.md", "# nothing here")).rejects.toThrow();
  });
});

describe("file import", () => {
  test(".mmd is taken verbatim and titled from front matter", async () => {
    const code = "---\ntitle: Checkout flow\n---\nflowchart TD\n  A --> B";
    expect(await parseImport("whatever.mmd", code)).toEqual([{ name: "Checkout flow", code }]);
  });

  test("json backups restore every diagram", async () => {
    const backup = JSON.stringify({ app: "mermade", diagrams: [{ name: "One", code: "pie" }, { name: "Two", code: "gantt" }, { name: "bad" }] });
    expect(await parseImport("backup.json", backup)).toEqual([
      { name: "One", code: "pie" },
      { name: "Two", code: "gantt" },
    ]);
  });

  test("svg export embeds source that can be imported again", async () => {
    const code = 'flowchart TD\n  A["a < b && c > d"] --> B';
    const svg = embedSource('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g/></svg>', code);
    expect(extractSourceFromSvg(svg)).toBe(code);
    expect(await parseImport("diagram.svg", svg)).toEqual([{ name: "diagram", code }]);
  });

  test("foreign svg is rejected with a helpful error", async () => {
    expect(parseImport("x.svg", "<svg></svg>")).rejects.toThrow(/embedded/);
  });

  test("pasted text: share link, markdown, or raw code", async () => {
    const link = await encodeState({ code: "flowchart LR\n  X --> Y" });
    expect((await parseText(`https://mermaid.live/edit#${link}`))[0]!.code).toBe("flowchart LR\n  X --> Y");
    expect((await parseText("```mermaid\npie\n```"))[0]!.code).toBe("pie");
    expect(await parseText("gantt\n  title Plan")).toEqual([{ name: "Plan", code: "gantt\n  title Plan" }]);
    expect(await parseText("   ")).toEqual([]);
  });
});

describe("diagram helpers", () => {
  test("detects diagram types past front matter and comments", () => {
    expect(detectDiagramType("---\ntitle: x\n---\n%% note\n%%{init: {}}%%\nsequenceDiagram\n A->>B: x")).toBe("Sequence");
    expect(detectDiagramType("graph LR\n A-->B")).toBe("Flowchart");
    expect(detectDiagramType("nonsense")).toBe("Unknown");
  });

  test("every template has a recognised type", () => {
    for (const t of TEMPLATES) expect(detectDiagramType(t.code)).not.toBe("Unknown");
  });

  test("guessTitle", () => {
    expect(guessTitle("pie\n  title Budget\n")).toBe("Budget");
    expect(guessTitle("flowchart LR")).toBeNull();
  });

  test("errorLine parses mermaid parse errors", () => {
    expect(errorLine("Parse error on line 3:\n...")).toBe(3);
    expect(errorLine("No diagram type detected")).toBeNull();
  });
});

describe("export helpers", () => {
  test("sanitizeFilename", () => {
    expect(sanitizeFilename("Héllo / Wörld: v2?")).toBe("hello-world-v2");
    expect(sanitizeFilename("///")).toBe("diagram");
  });

  test("toMarkdown wraps code in a fence", () => {
    expect(toMarkdown("pie\n\n")).toBe("```mermaid\npie\n```\n");
  });
});
