# admin-portal-shared

admin-portal（Multi-Zone shell）配下の各アプリ（shell 本体 / price-app / receipt-app / 今後追加分）が
共有する認証まわりのユーティリティ。契約の詳細は `admin-portal` リポジトリの `docs/auth-contract.md` を参照。

ビルドはしない。TypeScript のソースをそのまま各アプリの `node_modules` に git 依存として取り込み、
Next.js の `transpilePackages` でトランスパイルしてもらう方式（社内向け・非公開のため npm 公開はしない）。

統合ポータル配下の全セッション共通の作業ルールは [`WORKFLOW.md`](./WORKFLOW.md) 参照。

## 何が入っているか（＝各アプリで実装が完全に一致すべき部分だけ）

- `session`: `portal_session` JWT の検証（`verifySession`）・発行（`signSession`、shell専用）。`jose`/HS256。
- `sessionHeaders`: middleware で検証したクレームをリクエストヘッダーに詰めて後続へ渡す共通の詰め方
  （DBに突き合わせず名前表示だけで足りるアプリ向け。price-appのように権限をDBで解決するアプリは対象外）。
- `basePath`: `withBasePath()` パターン（アプリごとの basePath値は各アプリが持つ）。
  **既知の制約**: アプリ内部のルートのトップレベルセグメント名が自分のbasePath値と
  偶然一致する場合（例: basePath `/products` のアプリに `/products/{code}` という
  内部ルートがある）、二重付与防止ガードが「もうbasePathが付いている」と誤判定し、
  basePathが付かない。該当するアプリはこのモジュールを使わず独自実装で対応すること
  （price-appはこの理由で不採用）。
- `loginRedirect`: 未認証時の `${PORTAL_URL}/login?redirect=...` 組み立てと、ログアウト遷移先の組み立て。
- `middlewareMatcher`: `AUTH_AWARE_MATCHER`（middlewareのmatcher設定）と `isStaticAssetPath()`
  （`_next/static`/`_next/image`/`favicon.ico` の除外判定）。basePath配下で絞り込みmatcher
  （negative lookahead併用）がbasePathルート直下を素通りさせる不具合が price-app / receipt-app
  双方で見つかったため導入（v2〜）。`/api/`除外などアプリ固有の判断はここに含めない。

**含めていないもの**（アプリごとに正当な理由で異なるため、あえて共通化しない）:
- 権限・role の解決方法（price-appはDBの`users`/`role_permissions`を引く。receipt-appは当面なし）
- `AppShell`等のUIコンポーネント（ナビ構成・権限表示の有無がアプリごとに違う）
- middleware本体・matcherの除外パス方針そのもの（`/api/`除外要否などアプリ固有の判断がある部分。
  matcherの形＋静的アセット除外の判定だけは`middlewareMatcher`で共通化）

## 使い方（各アプリ側）

`package.json`:
```json
"dependencies": {
  "admin-portal-shared": "git+https://github.com/tohnooriaki-gif/admin-portal-shared.git#v2"
}
```

**注意**:
- `git+https://`＋タグ固定（`#v2`等）で書くこと。`github:...#main`のような短縮形式は
  `package-lock.json`内で`git+ssh://`に正規化されることがあり、SSH鍵の無いビルド環境
  （Vercel等）でインストールが失敗するリスクがある
- `npm install admin-portal-shared@<何か>`のように、このパッケージ単体を指定する
  `npm install`コマンドは使わないこと。バージョンを変更したいときは`package.json`を
  直接編集してから、引数無しの`npm install`を実行する（単体指定のコマンドを一度でも
  実行すると、`package.json`側の`git+https://`表記が`git+ssh://`の短縮形式に自動で
  書き換わってしまうことを確認済み。手動で書き戻す必要がある）

`next.config.js`:
```js
module.exports = {
  transpilePackages: ["admin-portal-shared"],
  // ...
};
```

例（middleware.ts）:
```ts
import { NextRequest, NextResponse } from "next/server";
import { verifySession, PORTAL_SESSION_COOKIE } from "admin-portal-shared/session";
import { buildLoginRedirectUrl } from "admin-portal-shared/loginRedirect";
import { AUTH_AWARE_MATCHER, isStaticAssetPath } from "admin-portal-shared/middlewareMatcher";

const BASE_PATH = "/delivery";

export async function middleware(req: NextRequest) {
  if (isStaticAssetPath(req.nextUrl.pathname)) return NextResponse.next();

  const token = req.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  const claims = await verifySession(token);
  if (claims) return NextResponse.next();

  const portalUrl = process.env.PORTAL_URL;
  if (!portalUrl) return new NextResponse("PORTAL_URL が設定されていません", { status: 500 });
  return NextResponse.redirect(buildLoginRedirectUrl(portalUrl, BASE_PATH, req.nextUrl.pathname, req.nextUrl.search));
}

// Next.js は middleware の config.matcher をビルド時に静的解析するため、import した
// 定数をそのまま渡すと認識されず「デフォルト設定」に**警告だけで黙って**フォールバックする
// （price-app / receipt-app 双方で実際に踏んだ不具合。basePath直下の認証バイパス対策が
// 無効化されたまま気づかず本番稼働していたことがある）。値は必ずリテラルで書き、
// AUTH_AWARE_MATCHER の中身と一致させること。
export const config = {
  matcher: ["/:path*"],
};
```

## バージョン管理

タグ運用（`v1`, `v2`, ...）。破壊的変更をするときはタグを切り、各アプリ側で明示的に上げる
（`#main` 追従だと知らないうちに全アプリが同時に変わってしまうため、本運用では `#v1` のようにタグ固定を推奨）。
