# admin-portal-shared

admin-portal（Multi-Zone shell）配下の各アプリ（shell 本体 / price-app / receipt-app / 今後追加分）が
共有する認証まわりのユーティリティ。契約の詳細は `admin-portal` リポジトリの `docs/auth-contract.md` を参照。

ビルドはしない。TypeScript のソースをそのまま各アプリの `node_modules` に git 依存として取り込み、
Next.js の `transpilePackages` でトランスパイルしてもらう方式（社内向け・非公開のため npm 公開はしない）。

## 何が入っているか（＝各アプリで実装が完全に一致すべき部分だけ）

- `session`: `portal_session` JWT の検証（`verifySession`）・発行（`signSession`、shell専用）。`jose`/HS256。
- `sessionHeaders`: middleware で検証したクレームをリクエストヘッダーに詰めて後続へ渡す共通の詰め方
  （DBに突き合わせず名前表示だけで足りるアプリ向け。price-appのように権限をDBで解決するアプリは対象外）。
- `basePath`: `withBasePath()` パターン（アプリごとの basePath値は各アプリが持つ）。
- `loginRedirect`: 未認証時の `${PORTAL_URL}/login?redirect=...` 組み立てと、ログアウト遷移先の組み立て。

**含めていないもの**（アプリごとに正当な理由で異なるため、あえて共通化しない）:
- 権限・role の解決方法（price-appはDBの`users`/`role_permissions`を引く。receipt-appは当面なし）
- `AppShell`等のUIコンポーネント（ナビ構成・権限表示の有無がアプリごとに違う）
- middleware本体（matcherの絞り込み方針・除外パスがアプリごとに微妙に違う）

## 使い方（各アプリ側）

`package.json`:
```json
"dependencies": {
  "admin-portal-shared": "github:tohnooriaki-gif/admin-portal-shared#main"
}
```

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

const BASE_PATH = "/delivery";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  const claims = await verifySession(token);
  if (claims) return NextResponse.next();

  const portalUrl = process.env.PORTAL_URL;
  if (!portalUrl) return new NextResponse("PORTAL_URL が設定されていません", { status: 500 });
  return NextResponse.redirect(buildLoginRedirectUrl(portalUrl, BASE_PATH, req.nextUrl.pathname, req.nextUrl.search));
}
```

## バージョン管理

タグ運用（`v1`, `v2`, ...）。破壊的変更をするときはタグを切り、各アプリ側で明示的に上げる
（`#main` 追従だと知らないうちに全アプリが同時に変わってしまうため、本運用では `#v1` のようにタグ固定を推奨）。
