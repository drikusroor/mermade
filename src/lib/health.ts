// Browser-side reachability check for the URLs attached to diagram nodes.
// A `no-cors` fetch yields an opaque response with no status code, so "up"
// only means the server answered at all (a 500 is still up).

export type HealthStatus = "up" | "down" | "timeout" | "checking";

export interface HealthResult {
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
  checkedAt?: number;
}

export type Rollup = "green" | "amber" | "red" | "grey";

export interface CheckOptions {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const DEFAULT_TIMEOUT_MS = 5000;
export const MAX_CONCURRENT = 6;

export async function checkUrl(url: string, opts: CheckOptions = {}): Promise<HealthResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const start = performance.now();
  try {
    await doFetch(url, {
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });
    return { status: "up", latencyMs: elapsed(start), checkedAt: Date.now() };
  } catch (err) {
    return {
      status: timedOut ? "timeout" : "down",
      latencyMs: elapsed(start),
      error: timedOut ? `No answer within ${timeoutMs} ms` : String((err as Error)?.message ?? err),
      checkedAt: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface CheckAllOptions extends CheckOptions {
  concurrency?: number;
  onResult?: (url: string, result: HealthResult) => void;
}

export async function checkAll(
  urls: string[],
  opts: CheckAllOptions = {},
): Promise<Map<string, HealthResult>> {
  const unique = [...new Set(urls)];
  const limit = Math.max(1, opts.concurrency ?? MAX_CONCURRENT);
  const results = new Map<string, HealthResult>();
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++]!;
      const result = await checkUrl(url, opts);
      results.set(url, result);
      opts.onResult?.(url, result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, unique.length) }, worker));
  return results;
}

export function rollup(urls: string[], health: Map<string, HealthResult>): Rollup {
  if (urls.length === 0) return "grey";
  let up = 0;
  for (const url of urls) {
    const r = health.get(url);
    if (!r || r.status === "checking") return "grey";
    if (r.status === "up") up++;
  }
  if (up === urls.length) return "green";
  if (up === 0) return "red";
  return "amber";
}

function elapsed(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}
