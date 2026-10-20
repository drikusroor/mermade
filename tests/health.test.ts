import { describe, expect, test } from "bun:test";
import { checkAll, checkUrl, rollup, type HealthResult } from "../src/lib/health";

type FetchFn = typeof fetch;

const resolving: FetchFn = (async () => new Response(null)) as unknown as FetchFn;
const rejecting: FetchFn = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as FetchFn;
const hanging: FetchFn = ((_url: string, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
  })) as unknown as FetchFn;

describe("checkUrl", () => {
  test("a resolved fetch is up, with latency", async () => {
    const r = await checkUrl("https://a.example", { fetch: resolving });
    expect(r.status).toBe("up");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("a rejected fetch is down", async () => {
    const r = await checkUrl("https://a.example", { fetch: rejecting });
    expect(r.status).toBe("down");
    expect(r.error).toContain("Failed to fetch");
  });

  test("a fetch that never answers times out", async () => {
    const r = await checkUrl("https://a.example", { fetch: hanging, timeoutMs: 20 });
    expect(r.status).toBe("timeout");
  });

  test("uses no-cors mode", async () => {
    let mode: string | undefined;
    const spy = (async (_u: string, init?: RequestInit) => {
      mode = init?.mode;
      return new Response(null);
    }) as unknown as FetchFn;
    await checkUrl("https://a.example", { fetch: spy });
    expect(mode).toBe("no-cors");
  });
});

describe("checkAll", () => {
  test("never runs more than 6 at once and returns every url", async () => {
    let inFlight = 0;
    let max = 0;
    const slow = (async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response(null);
    }) as unknown as FetchFn;
    const urls = Array.from({ length: 15 }, (_, i) => `https://h${i}.example`);
    const seen: string[] = [];
    const out = await checkAll(urls, { fetch: slow, onResult: (u) => seen.push(u) });
    expect(max).toBeLessThanOrEqual(6);
    expect(max).toBeGreaterThan(1);
    expect(out.size).toBe(15);
    expect(seen.length).toBe(15);
    expect([...out.values()].every((r) => r.status === "up")).toBe(true);
  });

  test("checks a duplicate url once", async () => {
    let calls = 0;
    const counting = (async () => {
      calls++;
      return new Response(null);
    }) as unknown as FetchFn;
    await checkAll(["https://a.example", "https://a.example"], { fetch: counting });
    expect(calls).toBe(1);
  });
});

describe("rollup", () => {
  const up: HealthResult = { status: "up", latencyMs: 1 };
  const down: HealthResult = { status: "down", latencyMs: 1 };
  const timeout: HealthResult = { status: "timeout", latencyMs: 5000 };
  const checking: HealthResult = { status: "checking" };
  const m = (entries: [string, HealthResult][]) => new Map(entries);

  test("all up is green", () => {
    expect(rollup(["a", "b"], m([["a", up], ["b", up]]))).toBe("green");
  });
  test("none up is red", () => {
    expect(rollup(["a", "b"], m([["a", down], ["b", timeout]]))).toBe("red");
  });
  test("mixed is amber", () => {
    expect(rollup(["a", "b"], m([["a", up], ["b", down]]))).toBe("amber");
  });
  test("unchecked is grey", () => {
    expect(rollup(["a"], m([]))).toBe("grey");
  });
  test("any still checking is grey", () => {
    expect(rollup(["a", "b"], m([["a", up], ["b", checking]]))).toBe("grey");
  });
  test("no urls is grey", () => {
    expect(rollup([], m([]))).toBe("grey");
  });
});
