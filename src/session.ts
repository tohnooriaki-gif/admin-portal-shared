import { SignJWT, jwtVerify } from "jose";

/** shell が発行するセッションCookie名。docs/auth-contract.md §2 */
export const PORTAL_SESSION_COOKIE = "portal_session";

/** セッション有効期間（秒）= 90日。docs/auth-contract.md §2 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90;

export interface SessionClaims {
  /** price-app users.login_id（小文字） */
  sub: string;
  /** 表示名 */
  name: string;
  /** ログイン時点のroleスナップショット（advisory）。認可の最終判断は各アプリが自分のデータで再評価してよい */
  role: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret) {
    throw new Error("PORTAL_SESSION_SECRET が未設定です（.env.local / Vercelの環境変数を確認）");
  }
  return new TextEncoder().encode(secret);
}

/** ログイン成功時に shell が portal_session JWT を発行する（HS256）。shell 以外は通常使わない */
export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ name: claims.name, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

/**
 * portal_session JWT を検証してクレームを返す。
 * 署名不正・期限切れ・sub欠落・name欠落・鍵未設定なら null（未認証扱い）。
 * Edge Runtime（各アプリの middleware.ts）でも動作する。
 */
export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.name !== "string") return null;
    return {
      sub: payload.sub,
      name: payload.name,
      role: typeof payload.role === "string" ? payload.role : "",
    };
  } catch {
    return null;
  }
}
