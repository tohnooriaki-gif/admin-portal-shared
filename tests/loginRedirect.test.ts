import { describe, it, expect } from "vitest";
import { buildLoginRedirectUrl, buildLogoutUrl } from "../src/loginRedirect";

describe("buildLoginRedirectUrl", () => {
  it("basePath付きの元パスをredirectクエリに組み立てる", () => {
    const url = buildLoginRedirectUrl("https://portal.example", "/delivery", "/receipts", "?foo=1");
    expect(url.origin).toBe("https://portal.example");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("redirect")).toBe("/delivery/receipts?foo=1");
  });

  it("searchが空文字でも組み立てられる", () => {
    const url = buildLoginRedirectUrl("https://portal.example", "/products", "/", "");
    expect(url.searchParams.get("redirect")).toBe("/products/");
  });
});

describe("buildLogoutUrl", () => {
  it("portalUrl + /logout を返す", () => {
    expect(buildLogoutUrl("https://portal.example")).toBe("https://portal.example/logout");
  });
});
