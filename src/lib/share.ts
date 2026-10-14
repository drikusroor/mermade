/**
 * Share links use the same `#pako:<base64url(zlib(json))>` state format as mermaid.live,
 * so a Mermade link's hash can be opened in mermaid.live and vice versa.
 */

export interface SharedState {
  code: string;
  theme?: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeState(state: SharedState): Promise<string> {
  const json = JSON.stringify({
    code: state.code,
    mermaid: JSON.stringify({ theme: state.theme ?? "default" }, null, 2),
    autoSync: true,
    updateDiagram: true,
  });
  const compressed = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate"));
  return "pako:" + toBase64Url(compressed);
}

/** Decode a `pako:` / `base64:` state string, a URL containing one, or return null. */
export async function decodeState(input: string): Promise<SharedState | null> {
  const match = input.trim().match(/(pako|base64):([A-Za-z0-9_\-+/=]+)/);
  if (!match) return null;
  const [, kind, payload] = match;
  try {
    let json: string;
    if (kind === "pako") {
      json = new TextDecoder().decode(await pipe(fromBase64Url(payload!), new DecompressionStream("deflate")));
    } else {
      json = new TextDecoder().decode(fromBase64Url(payload!));
    }
    const parsed = JSON.parse(json) as { code?: unknown; mermaid?: unknown };
    if (typeof parsed.code !== "string") return null;
    let theme: string | undefined;
    if (typeof parsed.mermaid === "string") {
      try {
        theme = (JSON.parse(parsed.mermaid) as { theme?: string }).theme;
      } catch {
        /* ignore malformed config */
      }
    }
    return { code: parsed.code, theme };
  } catch {
    return null;
  }
}

export async function buildShareUrl(state: SharedState, base = location.href): Promise<string> {
  const url = new URL(base);
  url.hash = await encodeState(state);
  return url.toString();
}
