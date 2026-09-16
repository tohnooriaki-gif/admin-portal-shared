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
  headers.set(HEADER_ROLE, claims.role);
}

/** API Route（NextRequestのheaders）・Server Component（next/headersのheaders()）どちらでも読める */
export function getSessionFromHeaders(headers: { get(name: string): string | null }): SessionClaims | null {
  const sub = headers.get(HEADER_SUB);
  if (!sub) return null;
  const rawName = headers.get(HEADER_NAME) ?? "";
  let name = "";
  try {
    name = decodeURIComponent(rawName);
  } catch {
    name = rawName;
  }
  return { sub, name, role: headers.get(HEADER_ROLE) ?? "" };
}
