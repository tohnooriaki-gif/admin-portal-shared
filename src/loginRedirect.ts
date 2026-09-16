/**
 * 未認証時に shell のログイン画面へ遷移させるURLを組み立てる。docs/auth-contract.md §2/§4/§5。
 * redirect先は basePath 付きの元パス（例: /delivery/receipts?foo=1）。
 */
export function buildLoginRedirectUrl(portalUrl: string, basePath: string, pathname: string, search: string): URL {
  const loginUrl = new URL("/login", portalUrl);
  loginUrl.searchParams.set("redirect", `${basePath}${pathname}${search}`);
  return loginUrl;
}

/** ログアウト遷移先（shell が Cookie 削除 → /login へ遷移させる）。docs/auth-contract.md §3 */
export function buildLogoutUrl(portalUrl: string): string {
  return `${portalUrl}/logout`;
}
