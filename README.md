# admin-portal-shared

admin-portal（Multi-Zone shell）配下の各アプリ（shell 本体 / price-app / receipt-app / 今後追加分）が
共有する処理全般のユーティリティ。認証まわりはその一部（詳細は `admin-portal` リポジトリの
`docs/auth-contract.md` を参照）で、各アプリで実装が完全に一致すべき処理であれば認証以外も対象。

ビルドはしない。TypeScript のソースをそのまま各アプリの `node_modules` に git 依存として取り込み、
Next.js の `transpilePackages` でトランスパイルしてもらう方式（社内向け・非公開のため npm 公開はしない）。

開発ルール（コミット・プッシュの進め方等）は [`CLAUDE.md`](./CLAUDE.md) 参照。

## テスト（v3.5〜）

`tests/`配下にVitest（price-appと同一）でユニットテストがある。対象は`src/`配下の**純粋なロジック
のみ**（`session`・`sessionHeaders`・`basePath`・`loginRedirect`・`middlewareMatcher`・`db`・
`format`・`supabase`・`components/ui`の`createUiKit()`が返す文字列・`components/StickyActionBar`・`components/SearchValue`・`components/SearchInput`のクラス組み立て）。UIコンポーネント自体の
レンダリング・見た目のスナップショットは対象外（`UserMenu`の外側クリック等のインタラクションは
未着手。全体管理セッションのTODO.mdで管理、`TODO.md`参照）。

```bash
npm test          # 1回実行
npm run test:watch
npm run test:cov  # カバレッジ付き
```

**注意**: `npm install`は`--legacy-peer-deps`が必要（`vitest`5.0.0の依存解決で、npm 10.9.8/
Node 22.23.2の環境では`--legacy-peer-deps`無しだと`Cannot read properties of null
(reading 'edgesOut')`でクラッシュする既知のnpmの不具合を踏む。price-appも同じ`vitest`
バージョンを使っているが、既にlockfileが確定しているため再現しない）。

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
- `middlewareMatcher`: `isStaticAssetPath()`（`_next/static`/`_next/image`/`favicon.ico` の
  除外判定）と、`AUTH_AWARE_MATCHER`（`["/:path*"]`。**v3.11〜非推奨**: `config.matcher`はimport
  不可でリテラルを写すしかなく、どのアプリもimportしていない。値の目安として残してあり、次の
  破壊的変更（v4）で削除予定）。basePath配下で絞り込みmatcher
  （negative lookahead併用）がbasePathルート直下を素通りさせる不具合が price-app / receipt-app
  双方で見つかったため導入（v2〜）。`/api/`除外などアプリ固有の判断はここに含めない。

- `supabase`: `createServiceClient(url, serviceRoleKey, options?)`。サーバー専用Supabaseクライアント
  （service_role key。RLSバイパスにつき絶対にブラウザへ渡さないこと）。`ws`をrealtime transport
  に渡すワークアラウンド（Node18未満でグローバルWebSocketが無い問題への対処）を含む。
  `options.schema`（v3.6〜）で対象のPostgresスキーマを指定できる（未指定なら従来通り`public`。
  既存の呼び出し元は無改修で動く）。**注意**: 非publicスキーマをSupabase Data API経由で使うには、
  Supabase側の管理画面（Project Settings > API > Exposed schemas）にそのスキーマを追加登録する
  必要がある（このパッケージからは設定できない）。
- `components/UserMenu`: ヘッダー右上のユーザーメニュー（`{ portalUrl, userName }`を受け取る）。
  「アプリ一覧へ戻る」「ログアウト」のドロップダウン。price-app/receipt-app双方で実装が完全に
  一致していたため共通化（v3〜）。v3.3で長い名前・メールアドレスへの耐性を追加（名前は
  `truncate`で省略表示、フルネームは`title`）、ドロップダウンはpillの高さに追従、外側クリック/
  Escapeで閉じる方式を、ヘッダーの`backdrop-blur`でも効くよう`fixed`オーバーレイから
  documentイベントに変更。
  **狭い画面（320px級）でヘッダーからはみ出させないための注意（v3.4〜）**: このコンポーネントを
  包む要素（例: `<div className="ml-auto">`）に`min-w-0`を付けること。flex項目は既定で内容の
  最小幅より縮まないため、包む要素が縮められないと、ボタンは内容幅（約162px）のままはみ出す
  （ボタン側は`max-w-full min-w-0`で縮められる作りにしてあり、名前が省略表示される）。
  ヘッダーの他の要素（タイトル等）を縮めない構成にする場合に特に必要。
- `db`: `unwrap<T>({ data, error })`。Supabaseレスポンスからdataを取り出し、errorがあれば例外にする。
- `format`: `formatDate` / `formatDateTime`。`formatYen`はアプリごとに挙動が違う
  （receipt-appはマイナス値対応）ため対象外。
- `components/ui`: UI基本部品。`Card` / `SecondaryButton` / `Field`はそのままexport。
  `PrimaryButton` / `inputClass` / `selectClass`（と、幅指定を含まない変種の
  `inputClassBase` / `selectClassBase`、v3.3〜）はアクセントカラー（price-app: indigo、
  receipt-app: emerald、payment-app: amber（v3.7〜））だけが違ったため（v3.13〜は、アプリのアクセントに依存しない中立色`"neutral"`も指定できる）、`createUiKit(accent)`で生成する形にした。
  幅を自前で指定したい入力欄（`w-auto`・`w-28`・`flex-1`等）は`inputClassBase`を使うこと
  （`${inputClass} w-auto`は、Tailwindの生成順で`w-full`が後勝ちして効かず全幅になる）。
  ボタン類は`whitespace-nowrap`付き（v3.3〜）
  （新しいアクセントカラーは`ui.tsx`内の`ACCENT_CLASSES`に追加すること。Tailwindは
  クラス名を静的に解析するため、`` `bg-${accent}-600` `` のような動的生成はできない）。
  **注意**: `createUiKit()`はコンポーネントではなく普通の関数なので、呼び出す側の
  ファイル（アプリの`components/ui.tsx`等）にも`"use client"`が必要（無いとサーバー
  コンポーネント経由の`next build`で「Attempted to call createUiKit() from the
  server」エラーになる）。アイコンをpropsで渡す等サーバーコンポーネントからも使いたい
  ものが同じファイルに混在するなら、`createUiKit()`を呼ぶ部分だけ別ファイルに分離する
  （price-appの`components/ui-shared.tsx`が実例）。
- `components/SelectCell`: 行クリックで詳細へ遷移する一覧テーブルの、チェックボックス列
  （v3.8〜）。`SelectCell`（本体行の`<td>`、個別選択用）と`SelectAllCell`（ヘッダーの`<th>`、
  ページ全選択用）の2つをexport。price-app（商品一覧）・payment-app（請求一覧）で個別に
  直した「チェックボックスが小さく、少しずれると行の詳細遷移が発火してしまう」問題
  （2026-10-02）を統一した実装。`<label>`でセル全体をクリック領域にし（ブラウザ標準の
  label→input委譲を使うため、クリック位置の自前判定が不要）、セルの`onClick`で
  `stopPropagation`することで行側のクリックハンドラの実装方法（`closest()`で除外する
  方式・素の`onClick`のみの方式、どちらでも）を問わず機能する。行の`<tr>`自体のクリック
  遷移の仕組みは含まないため、各アプリ側の既存の行コンポーネントと組み合わせて使うこと。
  `SelectCell`の`selectable={false}`で、選べない行でもチェックボックス無しで行遷移だけを
  止められる。アクセントカラー（`accent-amber-600`等）やセル幅は`className`/
  `inputClassName`で上書き可能。**注意（v3.9〜）**: `className`で幅を上書きするときは
  `min-w`も併記すること（table auto layoutでは`w-*`だけだと「希望幅」に過ぎず、他の列が
  広いテーブルではこの列がチェックボックス本体の幅＝16pxまで縮み、クリック領域も狭くなる。
  price-appで実際に踏んだ不具合。既定値`w-12 min-w-[3rem] p-0`は対応済み）。UIコンポーネント
  のため`components/ui`と同様、呼び出し側
  ファイルに`"use client"`が必要（モジュール自体にも付与済み）。レンダリング・クリック
  伝播の挙動は実ブラウザで検証済み（Vitestのユニットテストはcomponents/uiと同様、見た目・
  インタラクションは対象外）。
- `components/StickyActionBar`: 長い画面（表・長いフォーム）で、保存・確定などのボタンを画面
  下端に固定して常に見えるようにする帯（v3.10〜）。receipt-appの`sticky bottom-0`の固定バー
  （取引先マスタ・PDF取込の確認画面）とpayment-appの浮かぶ帯（請求一覧）を統一した。
  左に`status`（「未保存の変更があります」・合計・エラー等、画面ごとに違う表示）、右に
  `children`（ボタン）。狭い幅では折り返し、ボタンは右寄せのまま下の段に並ぶ。
  `variant`: `"bar"`（既定、画面下端に密着・上線のみ）／`"floating"`（下端から16px浮いた
  角丸のカード・枠線・影付き）。`accent`: `"neutral"`（既定、白背景＋グレーの線）／`"indigo"`・
  `"emerald"`・`"amber"`（`createUiKit`と同じ名前。線と背景がその色の薄い色になる）。
  **`className`は追加分だけ**（SelectCellのmin-wの教訓）: 固定表示に必要な指定は常に効き、
  `className`は後ろに足されるだけで置き換えない（`mt-4`等の余白の追加用）。背景・線の色を
  `className`で上書きすることはできない（Tailwindは同じプロパティを2つ書いても後勝ちに
  ならない）ので、色は`accent`、形は`variant`で選ぶ。新しいアクセントは`createUiKit`の
  `ACCENT_CLASSES`と`StickyActionBar.tsx`の`COLOR_CLASSES`の両方に追加すること。
  **使い方の注意**: (1)`sticky`は祖先に`overflow-hidden`/`overflow-auto`（`overflow-x-auto`の
  表ラッパー等）があると効かない。帯はそれらの**外側**に置く (2)帯は、固定したい対象と同じ親の
  中、その**後ろ**に置く（親の終わりで通常位置に戻る） (3)`<form>`の中に置け、中の
  `type="submit"`はそのまま送信する。フォームの外に置くときはボタンに`form="フォームのid"`を
  付ける (4)`Card`の中に置くと幅はカードの内側になる（画面幅いっぱいにしたいなら外に置く）
  (5)iPhoneのセーフエリア余白は`env(safe-area-inset-bottom)`で確保しているが、アプリ側が
  `viewport-fit=cover`（Next.jsなら`viewport`の`viewportFit: "cover"`）を指定していないと
  常に0扱いで既定の余白だけになる（害は無い）。状態・イベントを持たないため`"use client"`は
  付けておらず、Server Componentからも使える。
  ```tsx
  <form onSubmit={save}>
    {/* ...長いフォーム... */}
    <StickyActionBar
      className="mt-4"
      status={dirty ? <span className="font-medium text-amber-600">未保存の変更があります</span> : msg}
    >
      <SecondaryButton type="button" onClick={cancel}>キャンセル</SecondaryButton>
      <PrimaryButton type="submit" disabled={saving}>{saving ? "保存中..." : "保存する"}</PrimaryButton>
    </StickyActionBar>
  </form>

  {/* 行を選ぶと出る「まとめて操作」の帯（payment-app流）。表ラッパーの外側・後ろに置く */}
  {selected.size > 0 && (
    <StickyActionBar variant="floating" accent="amber" className="mt-5" status={`${selected.size}件を選択中`}>
      <PrimaryButton onClick={bulkDeposit}>まとめて入金</PrimaryButton>
    </StickyActionBar>
  )}
  ```
  レンダリング・スクロール時の固定・スマホ幅の挙動は実ブラウザで検証済み。Vitestは`className`を
  渡しても固定表示用の指定が消えないこと等のクラス組み立てのみ検証（`tests/stickyActionBar.test.ts`）。
- `components/SearchValue`: 一覧の値（顧客名・コード・担当者・品名など）を押すと、その値で検索する
  ボタン（v3.12〜）。payment-app（請求一覧・操作履歴）とreceipt-app（品目一覧の品名）で個別に
  作っていたものを共通化した。props: `value`（空なら何も描画しない。空のときに「-」を出したい
  ときは呼び出し側で出す）、`onSearch(value)`、`accent`（`"neutral"`[既定]/`"indigo"`/`"emerald"`/
  `"amber"`。ホバー・フォーカス時の文字色。`createUiKit`・`StickyActionBar`と同じ名前）、
  `title`（既定「『値』で検索」。「『値』で再検索」等に上書き可）、`stopPropagation`（既定`true`。
  クリックを行へ伝えない）、`className`（**追加分のみ**。`truncate`・`flex-1`・`min-w-0`・
  `font-medium`等を足す用途で、既定のクラスは置き換わらない。ホバー色の上書きはできないので
  `accent`で選ぶ）。検索の中身（検索欄へ入れる・ほかの絞り込みを外す・完全一致など）は共通化せず、
  `onSearch`で呼び出し側が決める。**ホバーの手がかり**は、色の変化＋**点線**の下線（普段は装飾
  なし）。詳細へ移動するリンクの`hover:underline`（実線）と見分けがつくようにしてある。
  新しいアクセントは`createUiKit`の`ACCENT_CLASSES`・`StickyActionBar`の`COLOR_CLASSES`・
  `SearchValue.tsx`の`HOVER_CLASSES`に追加すること。`"use client"`付き。
  ```tsx
  <SearchValue value={inv.customerName} onSearch={searchByValue} accent="amber" />
  {/* receipt-app流: 長い品名を省略表示し、「再検索」のtitleにする */}
  <SearchValue value={r.name} onSearch={searchByName} accent="emerald" title={`「${r.name}」で再検索`}
    className="min-w-0 flex-1 truncate font-medium" />
  ```
  ホバーの色・点線・クリックが行へ伝わらないこと・`truncate`の挙動は実ブラウザで検証済み。Vitestは
  クラス組み立て・`title`・`onSearch`の呼び出し・`stopPropagation`の有無のみ（`tests/searchValue.test.ts`）。
- `components/SearchInput`: 一覧の検索欄（v3.13〜）。左に虫眼鏡、入力があるときだけ右端の内側に
  「×」（検索語を消す）を出す。payment-app（請求一覧・操作履歴）の実装を見本に、「×」が無かった
  price-app・receipt-appの検索欄も同じ見た目・操作にそろえるため共通化した。props: `value`、
  `onChange(value: string)`（イベントではなく**文字列を直接**渡す）、`placeholder`、`ariaLabel`
  （必須）、`accent`（`"neutral"`[既定]/`"indigo"`/`"emerald"`/`"amber"`。フォーカス時の枠・リングの
  色）、`onClear`（任意。「×」を押したときの処理。既定は`onChange("")`。ページのリセット等も
  要るときに指定。指定すると`onChange("")`は呼ばれない）、`className`（**外側の`<div>`への追加分
  のみ**。`relative`は置き換わらない）。検索の中身（絞り込み・ページのリセットなど）は共通化せず
  呼び出し側が持つ。入力欄のクラスは`createUiKit(accent).inputClass`と同一（＋左右の余白
  `pl-9 pr-9`）なので、同じ画面の他の入力欄と見た目がそろう。「×」のtitle・aria-labelは
  「検索語を消す」。入力欄は`type="text"`のまま（`type="search"`にするとブラウザが独自の「×」を
  足し二重になる）。**注意**: 横並びの行で幅を確保するときは`className="min-w-[14rem] flex-1"`の
  ように`flex-1`と`min-w-*`を付けること（付けないと入力欄が内容幅まで縮む）。`lucide-react`
  （`Search`・`X`）に依存（`UserMenu`と同じpeerDependency）。`"use client"`付き。
  ```tsx
  <SearchInput
    className="min-w-[14rem] flex-1"
    accent="amber"
    ariaLabel="請求を検索"
    placeholder="コード・顧客名・伝票番号・備考で検索"
    value={query}
    onChange={(v) => { setQuery(v); resetPage(); }}
    onClear={() => { setQuery(""); resetPage(); }}
  />
  ```
  `onChange`の中でページをリセットしているなら、`onClear`も同じ処理にする（`onClear`を省略すると
  「×」は`onChange("")`を呼ぶので、`onChange`側のリセットがそのまま効く。上の例は`onChange`に
  リセットがあるため`onClear`は省略してもよい）。実ブラウザで、パディングが`px-3`ではなく
  `pl-9 pr-9`（36px）になること・「×」が入力欄の右端の内側に出て入力が空なら出ないこと・
  フォーカス時にaccentの枠とリングが付くこと・「×」で`onClear`が呼ばれ入力が空になることを確認済み。
  Vitestはクラス組み立て（`createUiKit`の`inputClass`との一致）・`onChange`が文字列を渡すこと・
  「×」の出し分けと`onClear`の呼び分けのみ（`tests/searchInput.test.ts`）。

**Tailwindを使うUI系モジュール（`components/UserMenu`・`components/ui`・`components/SelectCell`・
`components/StickyActionBar`・`components/SearchValue`・`components/SearchInput`）の注意**:
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
  "admin-portal-shared": "git+https://github.com/tohnooriaki-gif/admin-portal-shared.git#v3.13"
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
import { isStaticAssetPath } from "admin-portal-shared/middlewareMatcher";

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
// 無効化されたまま気づかず本番稼働していたことがある）。値は必ずこのようにリテラルで書く
// （importせず写す。値の目安は非推奨の定数 AUTH_AWARE_MATCHER = ["/:path*"]）。
export const config = {
  matcher: ["/:path*"],
};
```

## バージョン管理

タグ運用。`#main` 追従だと知らないうちに全アプリが同時に変わってしまうため、`#v1` のように
タグ固定を推奨。各アプリ側でタグを明示的に上げることで追従する。

- **破壊的変更**: メジャータグを切る（`v1` → `v2` → `v3`）
- **非破壊的変更**（新規exportの追加・バグ修正・ドキュメント修正など）: マイナータグを切る
  （`v2` → `v2.1`、`v3` → `v3.1` → `v3.2` → `v3.3` → `v3.4` → `v3.5` → `v3.6` → `v3.7` → `v3.8` → `v3.9` → `v3.10` → `v3.11` → `v3.12` → `v3.13`）。既存のメジャータグは動かさない（他アプリが意図せず
  巻き込まれないように）

最新のタグは `git tag -l --sort=-creatordate` で確認するか、`CHANGELOG.md` を参照。
