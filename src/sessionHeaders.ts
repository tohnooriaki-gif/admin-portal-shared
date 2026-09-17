import type { SessionClaims } from "./session";

/**
 * middleware で検証済みの SessionClaims を、リクエストヘッダーに詰めて後続の
 * Server Component / API Route へ渡すための共通の詰め方。
 * DBに突き合わせず portal_session の中身だけで足りるアプリ（例: receipt-app）向け。
 * 権限解決のため自前DBを引く必要があるアプリ（例: price-app）はこれを使わず
 * 独自の /api/me 等を使ってよい。
 */
const HEADER_SUB = "x-portal-user-sub";
const HEADER_NAME = "x-portal-user-name";
const HEADER_ROLE = "x-portal-user-role";

export function setSessionHeaders(headers: Headers, claims: SessionClaims): void {
  headers.set(HEADER_SUB, claims.sub);
  headers.set(HEADER_NAME, encodeURIComponent(claims.name));
  // role（「管理者」等）も日本語を含みうる。HTTPヘッダー値はByteString(Latin1)しか
  // 許容せず、非ASCII文字を含むまま headers.set() に渡すと例外になるためエンコードする。
  headers.set(HEADER_ROLE, encodeURIComponent(claims.role));
}

function decodeHeaderValue(raw: string | null): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** API Route（NextRequestのheaders）・Server Component（next/headersのheaders()）どちらでも読める */
export function getSessionFromHeaders(headers: { get(name: string): string | null }): SessionClaims | null {
  const sub = headers.get(HEADER_SUB);
  if (!sub) return null;
  return {
    sub,
    name: decodeHeaderValue(headers.get(HEADER_NAME)),
    role: decodeHeaderValue(headers.get(HEADER_ROLE)),
  };
}
