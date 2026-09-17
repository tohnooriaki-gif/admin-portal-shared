/**
 * admin-portal（Multi-Zone shell）配下でアプリごとの basePath を扱うヘルパー。
 * <Link> や useRouter().push() は Next.js が自動で basePath を付けてくれるため対象外。
 * fetch()・<a href>・<iframe src> の手動パス構築や history.pushState/replaceState など、
 * Next.js が関与しないパスにだけ使う。
 *
 * 各アプリの next.config.js の basePath と必ず一致させること。
 *
 * 既知の制約: withBasePath() の二重付与防止ガード（`path.startsWith(basePath)` なら
 * 付けない）は、アプリ内部のルートのトップレベルセグメント名が自分の basePath 値と
 * 偶然一致する場合に誤判定する（例: basePath が `/products` で、アプリ内に
 * `/products/{code}` という内部ルートがある場合）。該当するアプリはこのモジュールを
 * 使わず独自実装で対応すること。
 */
export function createBasePathHelpers(basePath: string) {
  function withBasePath(path: string): string {
    if (!path || !path.startsWith("/")) return path;
    if (path === basePath || path.startsWith(`${basePath}/`)) return path;
    return `${basePath}${path}`;
  }
  return { BASE_PATH: basePath, withBasePath };
}
