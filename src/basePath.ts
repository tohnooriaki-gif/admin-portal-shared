/**
 * admin-portal（Multi-Zone shell）配下でアプリごとの basePath を扱うヘルパー。
 * <Link> や useRouter().push() は Next.js が自動で basePath を付けてくれるため対象外。
 * fetch()・<a href>・<iframe src> の手動パス構築や history.pushState/replaceState など、
 * Next.js が関与しないパスにだけ使う。
 *
 * 各アプリの next.config.js の basePath と必ず一致させること。
 */
export function createBasePathHelpers(basePath: string) {
  function withBasePath(path: string): string {
    if (!path || !path.startsWith("/")) return path;
    if (path === basePath || path.startsWith(`${basePath}/`)) return path;
    return `${basePath}${path}`;
  }
  return { BASE_PATH: basePath, withBasePath };
}
