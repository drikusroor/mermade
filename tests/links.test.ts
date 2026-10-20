import { describe, expect, test } from "bun:test";
import { parseClick, parseLinkUrls } from "../src/lib/flow/links";

describe("parseClick", () => {
  test("bare url form", () => {
    expect(parseClick(' "https://example.com" "tip" _blank')).toEqual({ href: "https://example.com", tooltip: "tip", target: "_blank" });
  });

  test("href keyword form", () => {
    expect(parseClick(' href "https://example.com" "tip" _self')).toEqual({ href: "https://example.com", tooltip: "tip", target: "_self" });
  });

  test("url only", () => {
    expect(parseClick(' "https://example.com"')).toEqual({ href: "https://example.com" });
  });

  test("url and target, no tooltip", () => {
    expect(parseClick(' href "https://example.com" _top')).toEqual({ href: "https://example.com", target: "_top" });
  });

  test("call and callback forms are not links", () => {
    expect(parseClick(" call doThing()")).toBeNull();
    expect(parseClick(" callback")).toBeNull();
    expect(parseClick(' callback "tip"')).toBeNull();
  });

  test("bare callback name is not a link", () => {
    expect(parseClick(" myCallback")).toBeNull();
  });

  test("trailing semicolon is tolerated", () => {
    expect(parseClick(' "https://example.com" "tip";')).toEqual({ href: "https://example.com", tooltip: "tip" });
  });

  test("unknown target is ignored", () => {
    expect(parseClick(' "https://example.com" "tip" _weird')).toEqual({ href: "https://example.com", tooltip: "tip" });
  });
});

describe("parseLinkUrls", () => {
  test("href alone is PRD", () => {
    expect(parseLinkUrls("https://example.com")).toEqual([{ label: "PRD", url: "https://example.com" }]);
  });

  test("labelled urls in the tooltip", () => {
    expect(parseLinkUrls("https://example.com", "Web frontend | ACC: https://acc.example.com")).toEqual([
      { label: "PRD", url: "https://example.com" },
      { label: "ACC", url: "https://acc.example.com" },
    ]);
  });

  test("several labels and duplicates removed", () => {
    expect(parseLinkUrls("https://example.com", "x | PRD: https://example.com | ACC: https://acc.example.com | Swagger: http://api.example.com/docs")).toEqual([
      { label: "PRD", url: "https://example.com" },
      { label: "ACC", url: "https://acc.example.com" },
      { label: "Swagger", url: "http://api.example.com/docs" },
    ]);
  });

  test("segments without a url are ignored", () => {
    expect(parseLinkUrls("https://example.com", "just a note | ACC: not a url")).toEqual([{ label: "PRD", url: "https://example.com" }]);
  });
});
