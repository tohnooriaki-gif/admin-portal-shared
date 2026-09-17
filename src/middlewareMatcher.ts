/**
 * 各ゾーンアプリの middleware.ts が使う matcher と静的アセット除外判定。
 *
 * basePath配下では、絞り込んだマッチャー（negative lookahead併用の正規表現、
 * 例: `/((?!_next/static|_next/image|favicon.ico).*)`）が、basePathのルート
 * 直下（例: 素の /products や /delivery）への到達時にmiddlewareを素通りさせて
 * しまう不具合が price-app / receipt-app 双方で確認された。
 *
 * 対策として matcher は全パス対象（`/:path*`）に広げ、静的アセットの除外判定は
 * middleware関数本体側（`isStaticAssetPath`）で行う。これなら basePath の
 * 正規化に左右されない。
 *
 * `/api/` 配下の除外要否などアプリ固有の判断はここに含めない（各アプリの
 * middleware.ts 側で個別に判定する）。
 *
 * **重要**: Next.js は middleware の `config.matcher` をビルド時に静的解析するため、
 * この定数を import してそのまま `config.matcher` に渡しても認識されず、警告だけを
 * 出して「デフォルト設定」に黙ってフォールバックする（price-app / receipt-app 双方が
 * 実際に踏んだ不具合。basePath直下の認証バイパス対策が無効化されたまま気づかず本番
 * 稼働していたことがある）。`config.matcher` にはこの定数の中身をリテラルで書くこと
 * （`admin-portal-shared` の README の使用例を参照）。
 */
export const AUTH_AWARE_MATCHER = ["/:path*"];

export function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico"
  );
}
