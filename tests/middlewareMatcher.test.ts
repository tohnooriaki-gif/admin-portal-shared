import { describe, it, expect } from "vitest";
import { AUTH_AWARE_MATCHER, isStaticAssetPath } from "../src/middlewareMatcher";

describe("AUTH_AWARE_MATCHER", () => {
  it("全パス対象のリテラル配列", () => {
    expect(AUTH_AWARE_MATCHER).toEqual(["/:path*"]);
  });
});

describe("isStaticAssetPath", () => {
  it("_next/static配下はtrue", () => {
    expect(isStaticAssetPath("/_next/static/chunk.js")).toBe(true);
  });

  it("_next/image配下はtrue", () => {
    expect(isStaticAssetPath("/_next/image?url=x")).toBe(true);
  });

  it("favicon.icoはtrue（完全一致のみ）", () => {
    expect(isStaticAssetPath("/favicon.ico")).toBe(true);
    expect(isStaticAssetPath("/foo/favicon.ico")).toBe(false);
  });

  it("それ以外はfalse", () => {
    expect(isStaticAssetPath("/receipts")).toBe(false);
    expect(isStaticAssetPath("/api/products")).toBe(false);
    expect(isStaticAssetPath("/_nextish/static")).toBe(false);
  });
});
