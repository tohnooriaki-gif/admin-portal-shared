# admin-portal-shared

admin-portal（Multi-Zone shell）配下の各アプリ（shell 本体 / price-app / receipt-app / 今後追加分）が
共有する処理全般のユーティリティ。認証まわりはその一部（詳細は `admin-portal` リポジトリの
`docs/auth-contract.md` を参照）で、各アプリで実装が完全に一致すべき処理であれば認証以外も対象。

ビルドはしない。TypeScript のソースをそのまま各アプリの `node_modules` に git 依存として取り込み、
Next.js の `transpilePackages` でトランスパイルしてもらう方式（社内向け・非公開のため npm 公開はしない）。

統合ポータル配下の全セッション共通の作業ルールは、統合ポータル全体管理セッションが管理する
`D:\dev\admin-portal-management\WORKFLOW.md`（ローカルgitリポジトリ、2026-09-18〜）を参照。
このリポジトリ内では管理しない（変更したい場合は統合ポータル全体管理セッションに依頼する）。

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

- `supabase`: `createServiceClient(url, serviceRoleKey)`。サーバー専用Supabaseクライアント
  （service_role key。RLSバイパスにつき絶対にブラウザへ渡さないこと）。`ws`をrealtime transport
  に渡すワークアラウンド（Node18未満でグローバルWebSocketが無い問題への対処）を含む。
- `components/UserMenu`: ヘッダー右上のユーザーメニュー（`{ portalUrl, userName }`を受け取る）。
  「アプリ一覧へ戻る」「ログアウト」のドロップダウン。price-app/receipt-app双方で実装が完全に
  一致していたため共通化（v3〜）。
- `db`: `unwrap<T>({ data, error })`。Supabaseレスポンスからdataを取り出し、errorがあれば例外にする。
- `format`: `formatDate` / `formatDateTime`。`formatYen`はアプリごとに挙動が違う
  （receipt-appはマイナス値対応）ため対象外。
- `components/ui`: UI基本部品。`Card` / `SecondaryButton` / `Field`はそのままexport。
  `PrimaryButton` / `inputClass` / `selectClass`はアクセントカラー（price-app: indigo、
  receipt-app: emerald）だけが違ったため、`createUiKit(accent)`で生成する形にした
  （新しいアクセントカラーは`ui.tsx`内の`ACCENT_CLASSES`に追加すること。Tailwindは
  クラス名を静的に解析するため、`` `bg-${accent}-600` `` のような動的生成はできない）。
  **注意**: `createUiKit()`はコンポーネントではなく普通の関数なので、呼び出す側の
  ファイル（アプリの`components/ui.tsx`等）にも`"use client"`が必要（無いとサーバー
  コンポーネント経由の`next build`で「Attempted to call createUiKit() from the
  server」エラーになる）。アイコンをpropsで渡す等サーバーコンポーネントからも使いたい
  ものが同じファイルに混在するなら、`createUiKit()`を呼ぶ部分だけ別ファイルに分離する
  （price-appの`components/ui-shared.tsx`が実例）。

**Tailwindを使うUI系モジュール（`components/UserMenu`・`components/ui`）の注意**:
各アプリの`tailwind.config.js`の`content`に、このパッケージのソースを含めること
（例: `"./node_modules/admin-portal-shared/src/**/*.{ts,tsx}"`）。含めないと、アプリ側の
コードに同じクラス名が偶然残っていない限りTailwindがこれらのクラスを生成せず、見た目が
崩れる（ビルドエラーにはならないため気づきにくい）。

**含めていないもの**（アプリごとに正当な理由で異なるため、あえて共通化しない）:
- 権限・role の解決方法（price-appはDBの`users`/`role_permissions`を引く。receipt-appは当面なし）
- `AppShell`のナビ構成そのもの（メニュー項目・アイコン・権限表示の有無がアプリごとに違う。
  ヘッダーの`UserMenu`部分だけは実装が完全に一致していたため`components/UserMenu`で共通化）
- バッジ類（`KindBadge`/`SourceBadge`等）・`StatCard`/`StatTile`（price-appは`delta`前月比表示が
  あり微妙に差分がある）・`lib/search.ts`の検索ロジック・`ActionHistoryEntry`型（見た目は似て
  いても実装・フィールドがアプリごとに異なる）
- middleware本体・matcherの除外パス方針そのもの（`/api/`除外要否などアプリ固有の判断がある部分。
  matcherの形＋静的アセット除外の判定だけは`middlewareMatcher`で共通化）
- `next.config.js`のwebpack設定（`ws`の未使用ネイティブ依存の除外など）。`next.config.js`は
  Next.jsのトランスパイル前にプレーンなNode.jsとして実行されるため、TypeScriptソースのまま
  配布する現状の方式ではこのパッケージから直接importできない（各アプリにコピーが必要）

## 使い方（各アプリ側）

`package.json`:
```json
"dependencies": {
  "admin-portal-shared": "git+https://github.com/tohnooriaki-gif/admin-portal-shared.git#v3.2"
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

タグ運用。`#main` 追従だと知らないうちに全アプリが同時に変わってしまうため、`#v1` のように
タグ固定を推奨。各アプリ側でタグを明示的に上げることで追従する。

- **破壊的変更**: メジャータグを切る（`v1` → `v2` → `v3`）
- **非破壊的変更**（新規exportの追加・バグ修正・ドキュメント修正など）: マイナータグを切る
  （`v2` → `v2.1`、`v3` → `v3.1` → `v3.2`）。既存のメジャータグは動かさない（他アプリが意図せず
  巻き込まれないように）

最新のタグは `git tag -l --sort=-creatordate` で確認するか、`CHANGELOG.md` を参照。
