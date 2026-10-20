export interface LinkUrl {
  label: string;
  url: string;
}

export interface NodeLink {
  href: string;
  tooltip?: string;
  target?: string;
  urls: LinkUrl[];
}

const TARGETS = new Set(["_blank", "_self", "_parent", "_top"]);

function tokens(rest: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|([^\s";]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) out.push(m[1] !== undefined ? `"${m[1]}` : m[2]!);
  return out;
}

/** Reads what follows `click <id>`. Only url forms are links; `call`/`callback` forms return null. */
export function parseClick(rest: string): { href: string; tooltip?: string; target?: string } | null {
  const t = tokens(rest);
  let i = 0;
  if (t[i] === "href") i++;
  const url = t[i];
  if (!url?.startsWith('"')) return null;
  const out: { href: string; tooltip?: string; target?: string } = { href: url.slice(1) };
  i++;
  if (t[i]?.startsWith('"')) out.tooltip = t[i++]!.slice(1);
  if (t[i] && TARGETS.has(t[i]!)) out.target = t[i];
  return out;
}

const LABELLED = /^\s*([^:|]+?)\s*:\s*(https?:\/\/\S+)\s*$/;

/** The href is PRD; each `Label: https://…` segment of the `|`-split tooltip adds one more. */
export function parseLinkUrls(href: string, tooltip?: string): LinkUrl[] {
  const urls: LinkUrl[] = [{ label: "PRD", url: href }];
  for (const seg of tooltip?.split("|") ?? []) {
    const m = seg.match(LABELLED);
    if (m && !urls.some((u) => u.url === m[2])) urls.push({ label: m[1]!, url: m[2]! });
  }
  return urls;
}
