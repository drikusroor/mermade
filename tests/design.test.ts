import "./setup-dom";
import { describe, expect, test } from "bun:test";
import { DEFAULT_DESIGN, PALETTES, PRESETS, compileDesign, groupAccents, isDark, mix } from "../src/lib/design";
import { parseFlow } from "../src/lib/flow/parse";
import { CORPUS } from "./flow-corpus";

const model = parseFlow(CORPUS.subgraphs!);

describe("design", () => {
  test("every preset produces code Mermaid accepts", async () => {
    const mermaid = (await import("mermaid")).default;
    for (const preset of PRESETS) {
      const design = { ...DEFAULT_DESIGN, ...preset.design };
      const out = compileDesign(design, { appDark: false, customPalettes: [], model });
      mermaid.initialize(out.config as never);
      await mermaid.mermaidAPI.getDiagramFromText(`${CORPUS.subgraphs}\n${out.extraCode}`);
      if (design.style !== "classic" && design.colorGroups) expect(out.extraCode).toContain("class ");
      expect(out.extraCode).not.toContain("classDef");
    }
  });

  test("nested groups inherit their top-level accent", () => {
    const accents = groupAccents(model, ["#111111", "#222222", "#333333"]);
    expect(accents.get("inner")).toBe(accents.get("api"));
    expect(accents.get("api")).not.toBe(accents.get("data"));
  });

  test("nodes with their own styling keep it", () => {
    const m = parseFlow("flowchart LR\n  subgraph g\n    a:::mine --> b\n    c\n  end\n  style c fill:#f00\n  classDef mine fill:#0f0");
    const out = compileDesign(DEFAULT_DESIGN, { appDark: false, customPalettes: [], model: m });
    expect(out.extraCode).toBe("class b mmdg0");
  });

  test("palettes and colour helpers", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    for (const p of PALETTES) expect(p.accents.length).toBeGreaterThanOrEqual(6);
    expect(isDark("#0b1020")).toBe(true);
    expect(isDark("#f8fafc")).toBe(false);
    const dark = compileDesign({ ...DEFAULT_DESIGN, palette: "midnight" }, { appDark: false, customPalettes: [], model: null });
    expect(dark.dark).toBe(true);
    expect(dark.canvas).toBe("#0b1020");
    const classic = compileDesign({ ...DEFAULT_DESIGN, style: "classic", classicTheme: "auto" }, { appDark: true, customPalettes: [], model: null });
    expect((classic.config as { theme: string }).theme).toBe("dark");
  });
});
