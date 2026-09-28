import { describe, it, expect, vi } from "vitest";
import { signSession, verifySession, SESSION_MAX_AGE } from "../src/session";
import { SignJWT } from "jose";

describe("signSession / verifySession", () => {
  it("往復できる（sub/name/roleがそのまま戻る）", async () => {
    const token = await signSession({ sub: "tanaka", name: "田中太郎", role: "admin" });
    const claims = await verifySession(token);
    expect(claims).toEqual({ sub: "tanaka", name: "田中太郎", role: "admin" });
  });

  it("トークンが未指定（null/undefined）ならnull", async () => {
    expect(await verifySession(null)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("")).toBeNull();
  });

  it("改ざんされた署名はnull", async () => {
    const token = await signSession({ sub: "tanaka", name: "田中太郎", role: "admin" });
    const tampered = token.slice(0, -4) + "abcd";
    expect(await verifySession(tampered)).toBeNull();
  });

  it("別の鍵で署名されたトークンはnull", async () => {
    const wrongKeyToken = await new SignJWT({ name: "田中太郎", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("tanaka")
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(new TextEncoder().encode("別の鍵別の鍵別の鍵別の鍵"));
    expect(await verifySession(wrongKeyToken)).toBeNull();
  });

  it("期限切れはnull", async () => {
    const expired = await new SignJWT({ name: "田中太郎", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("tanaka")
      .setIssuedAt()
      .setExpirationTime("-1s")
      .sign(new TextEncoder().encode(process.env.PORTAL_SESSION_SECRET!));
    expect(await verifySession(expired)).toBeNull();
  });

  it("subが欠落しているとnull", async () => {
    const noSub = await new SignJWT({ name: "田中太郎", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(new TextEncoder().encode(process.env.PORTAL_SESSION_SECRET!));
    expect(await verifySession(noSub)).toBeNull();
  });

  it("nameが欠落している（文字列でない）とnull", async () => {
    const noName = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("tanaka")
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(new TextEncoder().encode(process.env.PORTAL_SESSION_SECRET!));
    expect(await verifySession(noName)).toBeNull();
  });

  it("roleが欠落している場合は空文字になる（advisoryなので必須ではない）", async () => {
    const noRole = await new SignJWT({ name: "田中太郎" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("tanaka")
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(new TextEncoder().encode(process.env.PORTAL_SESSION_SECRET!));
    expect(await verifySession(noRole)).toEqual({ sub: "tanaka", name: "田中太郎", role: "" });
  });

  it("SESSION_MAX_AGEは90日（秒）", () => {
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 24 * 90);
  });

  it("PORTAL_SESSION_SECRET未設定だとsignSession/verifySessionが例外", async () => {
    vi.stubEnv("PORTAL_SESSION_SECRET", "");
    await expect(signSession({ sub: "tanaka", name: "田中太郎", role: "admin" })).rejects.toThrow(
      /PORTAL_SESSION_SECRET/
    );
    vi.unstubAllEnvs();
  });
});
