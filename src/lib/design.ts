/**
 * Diagram design: a structural *style* (shapes, borders, shadows) combined with a colour *palette*.
 * Everything compiles down to Mermaid's `base` theme variables, scoped CSS, and (for colour-by-group)
 * a few classDef/class lines appended to the render code — the diagram source is never modified.
 */
import type { FlowModel } from "./flow/parse";

export type StyleId = "classic" | "modern" | "soft" | "outline" | "glow";
export type FontId = "auto" | "sans" | "rounded" | "mono" | "serif" | "hand";
export type CurveId = "auto" | "rounded" | "basis" | "linear" | "step";
export type LayoutId = "dagre" | "elk";
export type Spacing = "compact" | "normal" | "roomy";

export interface Palette {
  id: string;
  name: string;
  bg: string;
  surface: string;
  text: string;
  line: string;
  accents: string[];
  custom?: boolean;
}

export interface Design {
  style: StyleId;
  /** Built-in Mermaid theme, used by the classic style ("auto" follows the app). */
  classicTheme: string;
  palette: string;
  colorGroups: boolean;
  font: FontId;
  curve: CurveId;
  layout: LayoutId;
  look: "classic" | "handDrawn";
  spacing: Spacing;
}

export const DEFAULT_DESIGN: Design = {
  style: "modern",
  classicTheme: "auto",
  palette: "ocean",
  colorGroups: true,
  font: "auto",
  curve: "auto",
  layout: "dagre",
  look: "classic",
  spacing: "normal",
};

/* ---------------- palettes ---------------- */

export const PALETTES: Palette[] = [
  { id: "ocean", name: "Ocean", bg: "#f8fafc", surface: "#ffffff", text: "#0f172a", line: "#64748b", accents: ["#0284c7", "#7c3aed", "#0d9488", "#d97706", "#db2777", "#16a34a", "#4f46e5", "#dc2626"] },
  { id: "slate", name: "Slate", bg: "#ffffff", surface: "#f8fafc", text: "#1e293b", line: "#94a3b8", accents: ["#475569", "#64748b", "#334155", "#0f766e", "#6d28d9", "#9f1239", "#1d4ed8", "#a16207"] },
  { id: "sunset", name: "Sunset", bg: "#fffbf5", surface: "#ffffff", text: "#431407", line: "#a8a29e", accents: ["#ea580c", "#e11d48", "#d97706", "#c026d3", "#dc2626", "#ca8a04", "#9333ea", "#be123c"] },
  { id: "forest", name: "Forest", bg: "#f7faf5", surface: "#ffffff", text: "#1a2e05", line: "#84906f", accents: ["#4d7c0f", "#047857", "#a16207", "#0f766e", "#65a30d", "#78350f", "#15803d", "#854d0e"] },
  { id: "grape", name: "Grape", bg: "#faf7ff", surface: "#ffffff", text: "#2e1065", line: "#a39bb8", accents: ["#7c3aed", "#c026d3", "#4f46e5", "#db2777", "#9333ea", "#2563eb", "#a21caf", "#6d28d9"] },
  { id: "candy", name: "Candy", bg: "#fffafc", surface: "#ffffff", text: "#3b0764", line: "#c4b5c9", accents: ["#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#f43f5e", "#3b82f6", "#a855f7"] },
  { id: "paper", name: "Paper", bg: "#fbf8f1", surface: "#fffdf8", text: "#2b2118", line: "#8a7f72", accents: ["#b45309", "#1d4ed8", "#b91c1c", "#047857", "#7e22ce", "#a16207", "#0e7490", "#9d174d"] },
  { id: "solarized", name: "Solarized", bg: "#fdf6e3", surface: "#fffbee", text: "#073642", line: "#93a1a1", accents: ["#268bd2", "#2aa198", "#859900", "#b58900", "#cb4b16", "#d33682", "#6c71c4", "#dc322f"] },
  { id: "nord", name: "Nord", bg: "#2e3440", surface: "#3b4252", text: "#eceff4", line: "#7b88a1", accents: ["#88c0d0", "#a3be8c", "#ebcb8b", "#b48ead", "#81a1c1", "#d08770", "#8fbcbb", "#bf616a"] },
  { id: "midnight", name: "Midnight", bg: "#0b1020", surface: "#121a33", text: "#e2e8f0", line: "#5b6b8c", accents: ["#22d3ee", "#e879f9", "#a3e635", "#fbbf24", "#60a5fa", "#fb7185", "#34d399", "#c084fc"] },
  { id: "dracula", name: "Dracula", bg: "#282a36", surface: "#343746", text: "#f8f8f2", line: "#7c7f99", accents: ["#bd93f9", "#ff79c6", "#8be9fd", "#50fa7b", "#ffb86c", "#f1fa8c", "#ff5555", "#6272a4"] },
  { id: "blueprint", name: "Blueprint", bg: "#123a6b", surface: "#123a6b", text: "#e6f0ff", line: "#9cc2f0", accents: ["#e6f0ff", "#ffd166", "#9cf0ff", "#ffadad", "#caffbf", "#bdb2ff", "#ffc6ff", "#fdffb6"] },
  { id: "terminal", name: "Terminal", bg: "#0a0f0a", surface: "#0d160d", text: "#b8f5b8", line: "#3f8f3f", accents: ["#4ade80", "#facc15", "#22d3ee", "#f472b6", "#a3e635", "#fb923c", "#60a5fa", "#e879f9"] },
  { id: "carbon", name: "Carbon", bg: "#161616", surface: "#232323", text: "#f4f4f4", line: "#6f6f6f", accents: ["#78a9ff", "#ff7eb6", "#3ddbd9", "#be95ff", "#42be65", "#ffab00", "#ff8389", "#08bdba"] },
];

/* ---------------- presets (one-click looks) ---------------- */

export interface Preset {
  id: string;
  name: string;
  design: Partial<Design>;
}

export const PRESETS: Preset[] = [
  { id: "modern", name: "Modern", design: { style: "modern", palette: "ocean", font: "sans", curve: "rounded", look: "classic", colorGroups: true } },
  { id: "soft", name: "Soft", design: { style: "soft", palette: "candy", font: "rounded", curve: "basis", look: "classic", colorGroups: true } },
  { id: "outline", name: "Outline", design: { style: "outline", palette: "slate", font: "sans", curve: "step", look: "classic", colorGroups: true } },
  { id: "blueprint", name: "Blueprint", design: { style: "outline", palette: "blueprint", font: "mono", curve: "step", look: "classic", colorGroups: false } },
  { id: "neon", name: "Neon", design: { style: "glow", palette: "midnight", font: "sans", curve: "basis", look: "classic", colorGroups: true } },
  { id: "nord", name: "Nord", design: { style: "modern", palette: "nord", font: "rounded", curve: "rounded", look: "classic", colorGroups: true } },
  { id: "sketch", name: "Sketch", design: { style: "soft", palette: "paper", font: "hand", curve: "basis", look: "handDrawn", colorGroups: true } },
  { id: "terminal", name: "Terminal", design: { style: "outline", palette: "terminal", font: "mono", curve: "linear", look: "classic", colorGroups: true } },
  { id: "classic", name: "Classic", design: { style: "classic", look: "classic" } },
];

export const STYLES: { id: StyleId; name: string; description: string }[] = [
  { id: "modern", name: "Modern", description: "Rounded cards, soft shadows" },
  { id: "soft", name: "Soft", description: "Borderless pastel fills" },
  { id: "outline", name: "Outline", description: "Crisp lines, no fills" },
  { id: "glow", name: "Glow", description: "Luminous borders for dark palettes" },
  { id: "classic", name: "Classic", description: "Mermaid's built-in themes" },
];

export const FONTS: Record<Exclude<FontId, "auto">, { name: string; stack: string }> = {
  sans: { name: "Sans", stack: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  rounded: { name: "Rounded", stack: 'ui-rounded, "SF Pro Rounded", Nunito, "Varela Round", "Arial Rounded MT Bold", system-ui, sans-serif' },
  mono: { name: "Mono", stack: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' },
  serif: { name: "Serif", stack: 'ui-serif, "Iowan Old Style", Charter, Georgia, "Times New Roman", serif' },
  hand: { name: "Hand", stack: '"Comic Neue", "Comic Sans MS", "Chalkboard SE", "Segoe Print", "Bradley Hand", cursive' },
};

/* ---------------- colour helpers ---------------- */

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

/** Linear mix: t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function alpha(hex: string, a: number): string {
  return toHex(parseHex(hex)) + Math.round(a * 255).toString(16).padStart(2, "0");
}

export function luminance(hex: string): number {
  const c = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export const isDark = (hex: string) => luminance(hex) < 0.2;

export function isValidHex(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
}

/* ---------------- compile ---------------- */

export interface CompiledDesign {
  /** Mermaid config passed to initialize(). */
  config: Record<string, unknown>;
  /** Extra statements appended to flowchart render code (group colouring). */
  extraCode: string;
  /** Canvas colour behind the diagram in the preview / "theme" export background. */
  canvas: string;
  dark: boolean;
}

export function findPalette(id: string, custom: Palette[] = []): Palette {
  return custom.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

const SPACING: Record<Spacing, { nodeSpacing: number; rankSpacing: number; padding: number }> = {
  compact: { nodeSpacing: 30, rankSpacing: 35, padding: 10 },
  normal: { nodeSpacing: 50, rankSpacing: 55, padding: 15 },
  roomy: { nodeSpacing: 80, rankSpacing: 90, padding: 20 },
};

const DARK_CLASSIC = new Set(["dark", "neo-dark", "redux-dark", "redux-dark-color"]);

interface StyleColors {
  nodeFill: string;
  nodeStroke: string;
  clusterFill: string;
  clusterStroke: string;
  groupNode: (accent: string) => { fill: string; stroke: string; extra?: string };
  groupCluster: (accent: string) => { fill: string; stroke: string; title: string };
  css: string;
}

function styleColors(style: Exclude<StyleId, "classic">, p: Palette, dark: boolean): StyleColors {
  const shadow = dark
    ? "drop-shadow(0 1px 2px rgba(0,0,0,0.5)) drop-shadow(0 6px 16px rgba(0,0,0,0.35))"
    : "drop-shadow(0 1px 1.5px rgba(15,23,42,0.08)) drop-shadow(0 4px 12px rgba(15,23,42,0.07))";
  const a0 = p.accents[0] ?? p.text;
  const edgeLabel = `
    .edgeLabel rect, .edgeLabel .background { fill: ${p.bg}; opacity: 1; rx: 6px; ry: 6px; }
    .edgeLabel text, .edgeLabel span { fill: ${mix(p.text, p.bg, 0.25)}; color: ${mix(p.text, p.bg, 0.25)}; font-size: 12px; }
    .cluster-label text, .cluster-label span { font-weight: 600; letter-spacing: 0.01em; }
    .marker, marker path { fill: ${p.line}; stroke: ${p.line}; }
    .flowchart-link { stroke: ${p.line}; }`;
  switch (style) {
    case "modern":
      return {
        nodeFill: p.surface,
        nodeStroke: mix(p.surface, p.text, dark ? 0.22 : 0.16),
        clusterFill: mix(p.bg, p.text, dark ? 0.06 : 0.035),
        clusterStroke: mix(p.bg, p.text, dark ? 0.16 : 0.1),
        groupNode: (a) => ({ fill: mix(p.surface, a, dark ? 0.24 : 0.09), stroke: mix(p.surface, a, dark ? 0.8 : 0.55) }),
        groupCluster: (a) => ({ fill: mix(p.bg, a, dark ? 0.14 : 0.06), stroke: mix(p.bg, a, dark ? 0.5 : 0.28), title: mix(a, p.text, dark ? 0.1 : 0.35) }),
        css: `
          .node rect, .node polygon, .node circle, .node ellipse, .node path { stroke-width: 1px; filter: ${shadow}; }
          .node rect { rx: 10px; ry: 10px; }
          .cluster rect { rx: 16px; ry: 16px; stroke-width: 1px; }
          .flowchart-link { stroke-width: 1.5px; }
          ${edgeLabel}`,
      };
    case "soft":
      return {
        nodeFill: mix(p.bg, a0, dark ? 0.22 : 0.14),
        nodeStroke: mix(p.bg, a0, dark ? 0.22 : 0.14),
        clusterFill: mix(p.bg, p.text, dark ? 0.05 : 0.03),
        clusterStroke: mix(p.bg, p.text, dark ? 0.25 : 0.18),
        groupNode: (a) => ({ fill: mix(p.bg, a, dark ? 0.28 : 0.2), stroke: mix(p.bg, a, dark ? 0.28 : 0.2) }),
        groupCluster: (a) => ({ fill: mix(p.bg, a, dark ? 0.08 : 0.06), stroke: mix(p.bg, a, dark ? 0.45 : 0.35), title: mix(a, p.text, 0.3) }),
        css: `
          .node rect, .node polygon, .node circle, .node ellipse, .node path { stroke-width: 1px; filter: ${shadow}; }
          .node rect { rx: 14px; ry: 14px; }
          .cluster rect { rx: 20px; ry: 20px; stroke-width: 1.25px; stroke-dasharray: 5 5; }
          .flowchart-link { stroke-width: 1.75px; stroke-linecap: round; }
          ${edgeLabel}`,
      };
    case "outline":
      return {
        nodeFill: p.bg,
        nodeStroke: mix(p.text, p.bg, 0.15),
        clusterFill: p.bg,
        clusterStroke: mix(p.bg, p.text, 0.35),
        groupNode: (a) => ({ fill: p.bg, stroke: a }),
        groupCluster: (a) => ({ fill: p.bg, stroke: mix(p.bg, a, 0.6), title: a }),
        css: `
          .node rect, .node polygon, .node circle, .node ellipse, .node path { stroke-width: 1.5px; }
          .node rect { rx: 4px; ry: 4px; }
          .cluster rect { rx: 6px; ry: 6px; stroke-width: 1px; stroke-dasharray: 6 4; }
          .flowchart-link { stroke-width: 1.25px; }
          ${edgeLabel}`,
      };
    case "glow": {
      const glow = (c: string) => `drop-shadow(0 0 5px ${alpha(c, 0.55)}) drop-shadow(0 0 14px ${alpha(c, 0.25)})`;
      return {
        nodeFill: p.surface,
        nodeStroke: a0,
        clusterFill: mix(p.bg, p.text, 0.03),
        clusterStroke: mix(p.bg, p.text, 0.18),
        groupNode: (a) => ({ fill: mix(p.surface, a, 0.1), stroke: a, extra: `filter: ${glow(a)};` }),
        groupCluster: (a) => ({ fill: mix(p.bg, a, 0.05), stroke: mix(p.bg, a, 0.45), title: a }),
        css: `
          .node rect, .node polygon, .node circle, .node ellipse, .node path { stroke-width: 1.5px; filter: ${glow(a0)}; }
          .node rect { rx: 8px; ry: 8px; }
          .cluster rect { rx: 14px; ry: 14px; stroke-width: 1px; }
          .flowchart-link { stroke-width: 1.5px; filter: drop-shadow(0 0 3px ${alpha(p.line, 0.6)}); }
          ${edgeLabel}`,
      };
    }
  }
}

/** Top-level groups get an accent each; nested groups inherit their ancestor's accent. */
export function groupAccents(model: FlowModel, accents: string[]): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  for (const id of model.subgraphOrder) {
    const sg = model.subgraphs.get(id);
    if (!sg) continue;
    if (!sg.parent) out.set(id, accents[i++ % accents.length]!);
  }
  for (const id of model.subgraphOrder) {
    let p: string | null = id;
    while (p && !out.has(p)) p = model.subgraphs.get(p)?.parent ?? null;
    if (p && !out.has(id)) out.set(id, out.get(p)!);
  }
  return out;
}

export function compileDesign(
  design: Design,
  opts: { appDark: boolean; customPalettes: Palette[]; model: FlowModel | null; viewModel?: FlowModel | null },
): CompiledDesign {
  const curve = design.curve === "auto" ? undefined : design.curve;
  const spacing = SPACING[design.spacing];
  const fontStack = design.font === "auto" ? undefined : FONTS[design.font].stack;
  const base = {
    startOnLoad: false,
    securityLevel: "strict",
    look: design.look,
    layout: design.layout,
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve, ...spacing },
    fontFamily: fontStack ?? FONTS.sans.stack,
  };

  if (design.style === "classic") {
    const theme = design.classicTheme === "auto" ? (opts.appDark ? "dark" : "default") : design.classicTheme;
    const dark = DARK_CLASSIC.has(theme);
    return {
      config: { ...base, theme },
      extraCode: "",
      canvas: dark ? "#18181b" : "#fafafa",
      dark,
    };
  }

  const p = findPalette(design.palette, opts.customPalettes);
  const dark = isDark(p.bg);
  const c = styleColors(design.style, p, dark);
  const fontFamily = fontStack ?? (design.style === "outline" && p.id === "blueprint" ? FONTS.mono.stack : FONTS.sans.stack);

  let groupCss = "";
  let extraCode = "";
  const model = opts.model;
  if (design.colorGroups && model && model.subgraphs.size) {
    const accents = groupAccents(model, p.accents);
    const used = [...new Set(accents.values())];
    const classOf = new Map(used.map((a, i) => [a, `mmdg${i}`]));
    const styled = new Set<string>();
    for (const s of model.statements) {
      if (s.kind === "style") styled.add(s.id);
      if (s.kind === "class") s.ids.forEach((x) => styled.add(x.id));
      if (s.kind === "vertex") for (const r of s.groups.flat()) if (r.classes.length) styled.add(r.id);
    }
    const members = new Map<string, string[]>();
    for (const n of (opts.viewModel ?? model).nodes.values()) {
      if (!n.parent || styled.has(n.id) || !accents.has(n.parent)) continue;
      const cls = classOf.get(accents.get(n.parent)!)!;
      (members.get(cls) ?? members.set(cls, []).get(cls)!).push(n.id);
    }
    // Only class *membership* goes into the code: classDef styles are inlined with !important,
    // which would beat the selection outline. Colours live in the scoped CSS below.
    const lines: string[] = [];
    for (const [cls, ids] of members) lines.push(`class ${ids.join(",")} ${cls}`);
    extraCode = lines.join("\n");
    for (const [a, cls] of classOf) {
      const g = c.groupNode(a);
      const shapes = `.node.${cls} :is(rect, polygon, circle, ellipse, path).label-container, .node.${cls} > :is(rect, polygon, circle, ellipse):first-child`;
      groupCss += `
        ${shapes} { fill: ${g.fill} !important; stroke: ${g.stroke} !important; ${g.extra ?? ""} }`;
    }
    for (const [sg, a] of accents) {
      const g = c.groupCluster(a);
      const sel = `[id$="-${sg.replace(/["\\]/g, "\\$&")}"]`;
      groupCss += `
        .cluster${sel} rect { fill: ${g.fill} !important; stroke: ${g.stroke} !important; }
        .cluster${sel} .cluster-label text, .cluster${sel} .cluster-label span { fill: ${g.title}; color: ${g.title}; }
        .node${sel} .collapsed-group { fill: ${g.fill} !important; stroke: ${g.stroke} !important; }
        .node${sel} .collapsed-indicator { fill: ${g.stroke} !important; }`;
    }
  }

  const themeVariables = {
    darkMode: dark,
    background: p.bg,
    fontFamily,
    fontSize: "14px",
    primaryColor: c.nodeFill,
    primaryTextColor: p.text,
    primaryBorderColor: c.nodeStroke,
    secondaryColor: mix(p.bg, p.accents[1] ?? p.text, 0.15),
    tertiaryColor: mix(p.bg, p.text, 0.04),
    mainBkg: c.nodeFill,
    nodeBorder: c.nodeStroke,
    nodeTextColor: p.text,
    textColor: p.text,
    titleColor: p.text,
    lineColor: p.line,
    clusterBkg: c.clusterFill,
    clusterBorder: c.clusterStroke,
    edgeLabelBackground: p.bg,
    // sequence / other diagrams
    actorBkg: c.nodeFill,
    actorBorder: c.nodeStroke,
    actorTextColor: p.text,
    signalColor: p.text,
    signalTextColor: p.text,
    labelBoxBkgColor: c.nodeFill,
    noteBkgColor: mix(p.bg, p.accents[3] ?? "#f59e0b", 0.15),
    noteTextColor: p.text,
    noteBorderColor: mix(p.bg, p.accents[3] ?? "#f59e0b", 0.5),
    pie1: p.accents[0],
    pie2: p.accents[1],
    pie3: p.accents[2],
    pie4: p.accents[3],
    pie5: p.accents[4],
    pie6: p.accents[5],
    pie7: p.accents[6],
    pie8: p.accents[7],
    git0: p.accents[0],
    git1: p.accents[1],
    git2: p.accents[2],
    git3: p.accents[3],
    git4: p.accents[4],
    git5: p.accents[5],
    git6: p.accents[6],
    git7: p.accents[7],
    cScale0: p.accents[0],
    cScale1: p.accents[1],
    cScale2: p.accents[2],
    cScale3: p.accents[3],
    cScale4: p.accents[4],
    cScale5: p.accents[5],
    cScale6: p.accents[6],
    cScale7: p.accents[7],
  };

  return {
    config: {
      ...base,
      fontFamily,
      theme: "base",
      themeVariables,
      themeCSS: `${c.css}\n${groupCss}`,
    },
    extraCode,
    canvas: p.bg,
    dark,
  };
}

export function makeCustomPalette(name: string, from: Palette): Palette {
  return { ...from, accents: [...from.accents], id: `custom-${Date.now().toString(36)}`, name, custom: true };
}
