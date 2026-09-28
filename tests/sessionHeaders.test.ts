import { describe, it, expect } from "vitest";
import { setSessionHeaders, getSessionFromHeaders } from "../src/sessionHeaders";
import type { SessionClaims } from "../src/session";

describe("setSessionHeaders / getSessionFromHeaders", () => {
  it("往復できる（ASCIIのname/role）", () => {
    const headers = new Headers();
    setSessionHeaders(headers, { sub: "tanaka", name: "Taro", role: "staff" });
    expect(getSessionFromHeaders(headers)).toEqual({ sub: "tanaka", name: "Taro", role: "staff" });
  });

  it("往復できる（日本語のname/role。v3.1で修正した回帰防止）", () => {
    const claims: SessionClaims = { sub: "tanaka", name: "田中太郎", role: "管理者" };
    const headers = new Headers();
    setSessionHeaders(headers, claims);
    // headers.set() が例外を投げずに通ること自体が重要（role未エンコードだとByteString変換で例外になる）
    expect(getSessionFromHeaders(headers)).toEqual(claims);
  });

  it("subが無いheadersはnull", () => {
    const headers = new Headers();
    expect(getSessionFromHeaders(headers)).toBeNull();
  });

  it("name/roleヘッダーが無い場合は空文字", () => {
    const headers = new Headers();
    headers.set("x-portal-user-sub", "tanaka");
    expect(getSessionFromHeaders(headers)).toEqual({ sub: "tanaka", name: "", role: "" });
  });

  it("name/roleが不正なパーセントエンコーディングでも例外にならず生の値を返す", () => {
    const headers = new Headers();
    headers.set("x-portal-user-sub", "tanaka");
    headers.set("x-portal-user-name", "%");
    expect(getSessionFromHeaders(headers)).toEqual({ sub: "tanaka", name: "%", role: "" });
  });
});
