import { decodeState } from "./share";
import { guessTitle } from "./diagram";

export interface ImportedDiagram {
  name: string;
  code: string;
}

export const SOURCE_METADATA_ID = "mermade-source";
export const ACCEPTED_FILE_TYPES = ".mmd,.mermaid,.md,.markdown,.txt,.json,.svg";

/** Pull every ```mermaid fenced block (also ~~~ and :::mermaid) out of a markdown document. */
export function extractMermaidBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const fence = /^([ \t]*)(`{3,}|~{3,})[ \t]*mermaid\b[^\n]*\r?\n([\s\S]*?)^\1\2[ \t]*$/gm;
  for (const m of markdown.matchAll(fence)) blocks.push(dedent(m[3]!).trimEnd());
  const azure = /^:::[ \t]*mermaid[ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/gm;
  for (const m of markdown.matchAll(azure)) blocks.push(dedent(m[1]!).trimEnd());
  return blocks.filter((b) => b.trim().length > 0);
}

function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return min ? lines.map((l) => l.slice(min)).join("\n") : text;
}

/** Read the Mermaid source that Mermade embeds into exported SVGs. */
export function extractSourceFromSvg(svg: string): string | null {
  const m = svg.match(/<metadata[^>]*id="mermade-source"[^>]*>([\s\S]*?)<\/metadata>/);
  if (!m) return null;
  return decodeXml(m[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, ""));
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "") || "Untitled";
}

interface BackupFile {
  app?: string;
  diagrams?: { name?: unknown; code?: unknown }[];
}

/** Turn a file's text into zero or more diagrams based on its extension / content. */
export async function parseImport(filename: string, text: string): Promise<ImportedDiagram[]> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const name = baseName(filename);

  if (ext === "json") {
    const data = JSON.parse(text) as BackupFile | { code?: unknown };
    if ("diagrams" in data && Array.isArray(data.diagrams)) {
      return data.diagrams
        .filter((d) => typeof d.code === "string")
        .map((d, i) => ({ name: typeof d.name === "string" ? d.name : `${name} ${i + 1}`, code: d.code as string }));
    }
    if ("code" in data && typeof data.code === "string") return [{ name, code: data.code }];
    throw new Error("JSON file doesn't contain any diagrams");
  }

  if (ext === "svg") {
    const code = extractSourceFromSvg(text);
    if (!code) throw new Error("This SVG has no embedded Mermaid source (only SVGs exported from Mermade do)");
    return [{ name, code }];
  }

  if (ext === "md" || ext === "markdown") {
    const blocks = extractMermaidBlocks(text);
    if (!blocks.length) throw new Error("No ```mermaid code blocks found in this Markdown file");
    return blocks.map((code, i) => ({
      name: guessTitle(code) ?? (blocks.length > 1 ? `${name} ${i + 1}` : name),
      code,
    }));
  }

  return parseText(text, name);
}

/** Parse pasted text: a share link, Markdown with mermaid blocks, or raw Mermaid code. */
export async function parseText(text: string, fallbackName = "Imported diagram"): Promise<ImportedDiagram[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/(pako|base64):[A-Za-z0-9_\-+/=]{8,}/.test(trimmed) && !trimmed.includes("\n")) {
    const state = await decodeState(trimmed);
    if (state) return [{ name: guessTitle(state.code) ?? "Shared diagram", code: state.code }];
    throw new Error("Couldn't decode that share link");
  }
  const blocks = extractMermaidBlocks(text);
  if (blocks.length) {
    return blocks.map((code, i) => ({
      name: guessTitle(code) ?? (blocks.length > 1 ? `${fallbackName} ${i + 1}` : fallbackName),
      code,
    }));
  }
  return [{ name: guessTitle(trimmed) ?? fallbackName, code: text.replace(/^﻿/, "").trimEnd() }];
}
