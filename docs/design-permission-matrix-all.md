# 3アプリの権限項目（権限表）の全体設計

2026-10-23 作成。**設計だけ（コード・タグ・DB の変更なし）**。依頼: 統合ポータル全体管理セッション（ユーザー了承済み 2026-10-23）。
材料（読み取りのみ）: 各アプリの `docs/permission-inventory.md` — price-app（71da120）・payment-app（6b4a130）・receipt-app（4c46eb3）。
**ユーザー判断（2026-10-23）: §5 の論点6つは、すべて推奨どおりで確定**。付随（§5 の末尾）も承認。**実装（共通部品）は、ユーザーの指示があるまで開始しない**。
ユーザー方針: **システムごとに分かれることは基本なくす。分かれる場合は理由を書く**。receipt-app の権限表（7項目）は案どおり作る（ユーザー判断）。
バックログ「権限設定のポータル一元化」（中）の土台にもなる。操作履歴の設計は [design-history-scope.md](design-history-scope.md)（v3.21 で実装済み）。

## 0. 結論（要約）

| # | 内容 |
|---|---|
| 1 | 項目の名前は **`<対象>.<動作>`**。動作は `edit`（登録・変更）／`delete`（削除・復元）／`import`／`export`／`bulk`／`revert`（取消）／`view`（閲覧）／`manage`（管理）の語彙に限る。**共通の項目は3つ**: `history.view`・`permissions.manage`・`data.export`（アプリに機能があるとき同じ key で足す） |
| 2 | そろえる: (a) `users.manage`→`permissions.manage`（price。3e のあと） (b) **削除・復元を独立項目に**（price に `products.delete` を足す。既定は編集と同じで挙動は変わらない） (c) **行が欠けた項目は既定値で補う**（payment 方式。price の `ADDED_LATER` を廃止） (d) **権限表が読めないときは3アプリとも 503**（表が空・行が欠けたときだけ既定値）。「表がまだ無い＝既定値」の分岐は消す (e) price の `GET /api/permissions` を `permissions.manage` に限る (f) `role_permissions` に `updated_at`・`updated_by`（price に足す） (g) 変更の記録の形 |
| 3 | そろえない（理由つき）: 項目の粒度（機能グループ単位か操作単位か。基準だけ共通にして、各アプリの項目は残す）／`products.bulk` と `arrivals.manage`／`pricehistory.view`（price 固有の機能）／編集停止モード・機能フラグ（権限表の外）／receipt-app の `receipts.import` など固有の項目 |
| 4 | 共通部品に置く（新モジュール `admin-portal-shared/permissions`）: 項目の型・共通3項目の定義・固定の判定・正規化と判定・失敗時の文言・`role_permissions` の読み書きの共通ヘルパー。**置かない**: アプリ固有の項目の定義、画面（権限設定の UI は別項目）。`history.view` は v3.21 の `historyViewLock`/`effectiveHistoryView` を**そのまま使う**（二重に定義しない） |
| 5 | 順番: 共通部品（追加のみ）→ payment-app（小）→ receipt-app（権限表を新設）→ price-app（最大。3e のあと）。各段階で単独のデプロイ・戻しは Instant Rollback |
| 6 | 論点6つは**すべて確定**（§5）。共通部品のタグは **v3.22 を権限表（`permissions`）にする**ことを提案（キャッシュ設定は後ろの番号へ。§4-6） |

## 1. 3アプリの項目の対応表

種類: **書**＝書き込み系（閲覧のみには付けられない＝常に不可で固定。`authorizeWrite` が先に拒否）／**読**＝読み取り系。既定は 管理者／スタッフ／閲覧のみ（◯＝可、✕＝不可）。

### 1-1. 共通の項目（3アプリで同じ key・同じ意味）

| key | 表示名 | 種類 | price-app | payment-app | receipt-app（予定） | 既定 | 固定 |
|---|---|---|---|---|---|---|---|
| `history.view` | 操作履歴の閲覧 | 読 | ◯（横断の操作履歴） | ◯ | ◯ | ◯／◯／✕ | 管理者 ◯、閲覧のみ ✕（`historyViewLock`）。範囲は役割固定（`historyAccess`） |
| `permissions.manage` | 権限設定の変更 | 書 | `users.manage` が該当（改名の対象） | ◯ | ◯ | ◯／✕／✕ | 管理者 ◯（締め出し防止）、閲覧のみ ✕ |
| `data.export` | データ出力 | 読 | ◯（CSV・作業報告 Excel） | 機能なし | ◯（CSV） | ◯／◯／◯ | なし |

- `data.export` は payment-app に機能が無い。**作るときに同じ key で足す**（key・表示名・既定を共通部品で先に決めておく）。取込（`import`）は「対象.import」で足す
- 閲覧（一覧・詳細・検索）は**項目なしで、登録済みのユーザー全員**（閲覧のみを含む）が共通の規則。3アプリで一致している

### 1-2. アプリ固有の項目

| アプリ | key | 表示名 | 種類 | 既定 | 備考 |
|---|---|---|---|---|---|
| price | `products.edit` | 商品の編集 | 書 | ◯／◯／✕ | 登録・編集・**削除・復元を含む（今）**。§2-2 で削除を分ける |
| price | `products.delete`（**新設案**） | 商品の削除・復元 | 書 | ◯／◯／✕ | `products.edit` から分ける。既定は同じ → 挙動は変わらない |
| price | `products.bulk` | 一括操作 | 書 | ◯／◯／✕ | アップロード・テンプレート出力。一括分類変更・一括削除の画面表示（§2-5） |
| price | `masters.edit` | マスタ管理 | 書 | ◯／◯／✕ | 分類・FBA手数料・メーカー・利益率 |
| price | `arrivals.manage` | 入荷・発注の管理 | 書 | ◯／◯／✕ | 機能フラグ `ARRIVALS_ENABLED=1` のときだけ画面・設定に出る |
| price | `pricehistory.view` | 価格改定履歴の閲覧 | 読 | ◯／◯／◯ | price 固有の機能（商品データの変更記録）。閲覧のみにも見せる |
| payment | `invoices.edit` | 請求の登録・編集 | 書 | ◯／◯／✕ | ステータス変更・送付ステータスを含む |
| payment | `payments.edit` | 入金の登録・割当 | 書 | ◯／◯／✕ | まとめて入金を含む |
| payment | `resends.edit` | 再送付の記録 | 書 | ◯／◯／✕ | |
| payment | `payments.revert` | 入金の取り消し | 書 | ◯／◯／✕ | 割り当てた入金を取り消して未入金に戻す |
| payment | `records.delete` | 削除 | 書 | ◯／◯／✕ | 請求・入金の削除、再送付の記録の取り消し（2026-10-02 のユーザー指示でスタッフ◯） |
| receipt | `receipts.edit` | 書類の登録・編集 | 書 | ◯／◯／✕ | 手動登録・編集 |
| receipt | `receipts.import` | PDF取込 | 書 | ◯／◯／✕ | 確認の解析・OCR も含む |
| receipt | `receipts.delete` | 削除・復元 | 書 | ◯／◯／✕ | |
| receipt | `vendors.edit` | 取引先マスタの編集 | 書 | ◯／◯／✕ | |

### 1-3. 命名規則（`<対象>.<動作>`）と動作の語彙

| 動作 | 意味 | 現在の例 | 規則 |
|---|---|---|---|
| `edit` | 登録・変更（削除は含めない） | `products.edit`・`invoices.edit`・`receipts.edit`・`masters.edit`・`vendors.edit` | 書 |
| `delete` | 削除・復元・取消（取り返しがつきにくい） | `records.delete`・`receipts.delete`・（`products.delete`） | 書 |
| `import` / `export` | 取込／出力 | `receipts.import`・`data.export` | 取込=書、出力=読 |
| `bulk` | 一括・大量の操作 | `products.bulk` | 書 |
| `revert` | 取り消して元に戻す | `payments.revert` | 書 |
| `view` | 閲覧（画面を開けるか） | `history.view`・`pricehistory.view` | 読 |
| `manage` | 管理（設定・運用の操作） | `permissions.manage`・`arrivals.manage` | 書 |

- 対象は、画面・データの名詞（`products`・`masters`・`invoices`・`receipts` など）。**対象が複数にまたがる**ときは総称（`records`＝請求・入金・再送付、`data`＝出力するデータ）を使う
- 既存の key は、**意味が合わないもの以外は改名しない**（`DB` の `role_permissions` の行の書き換えが要るため）。改名するのは `users.manage` だけ（§2-1）
- 注意: `arrivals.manage` の `manage` は「管理」だが、実際の操作は発注・入荷の**登録・取消**で `edit` に近い。語彙に完全には合わないが、**改名の効果が小さく（price 固有・機能フラグ内）、移行の手間が要る**ので、改名しない（そろえない点。§2-7）

## 2. そろえる点と、そろえない点

### 2-1. 権限設定の key: `users.manage` → `permissions.manage`（price）【確定】

- 理由: ユーザー管理はポータルに一本化された（price は 3e で `ACCOUNT_SOURCE` を撤去）。残るのは権限設定の変更だけで、payment-app・receipt-app はすでに `permissions.manage`「権限設定の変更」。意味と名前を合わせる
- 時期: **3e のあと**（旧方式のユーザー管理が残っている間は、同じ権限で守っているため）
- 移行（`role_permissions` の key の書き換え）は、**追加→切替→削除**の3段（§4-4）で、締め出しを起こさない

### 2-2. 削除・復元の粒度【確定: 独立させる】

| アプリ | 今 | 提案 |
|---|---|---|
| price | `products.edit` に含む（論理削除・ゴミ箱から復元できる） | **`products.delete`（削除・復元）を分ける** |
| payment | `records.delete` が独立 | 今のまま |
| receipt | `receipts.delete`（削除・復元）が独立 | 案のまま |

- 基準: **削除・復元は「編集」とは別の項目にする**（閲覧のみの固定・「管理者だけに絞る」などの運用がしやすい）。receipt-app は論理削除（復元あり）でも独立させている → price だけ含めるのは**分かれる理由として弱い**（論理削除でも、一括削除は影響が大きい）
- 既定は `products.edit` と同じ（◯／◯／✕）にするので、**今の挙動は変わらない**。分けたあとで、管理者が必要に応じてスタッフの削除だけ✕にできる
- 影響: price の `DELETE /api/products/[code]`・`POST …/restore`・一括削除の画面・設定画面の行が1つ増える（8→9 項目。`users.manage` の改名後も9）
- 「取り返しがつくか」を基準にする案（取り返しのつかない操作だけ独立）もある。ただし payment・receipt はすでに独立しており、price だけ例外にする理由が弱い。**そろえる（独立）案を推す**

### 2-3. 粒度の基準（そろえる点＝基準。そろえない点＝各アプリの項目）

- 基準（共通）: **機能グループ単位を基本**とし、**取り返しのつかない・影響の大きい操作だけ単独の項目**にする（削除・取消・大量の取込など）。payment-app は操作単位に細かい（請求・入金・再送付・取消・削除）が、この基準に収まる（取消・削除が単独、残りは領域ごと）
- そろえない理由: 項目の数・分け方は**業務の違い**による（入金処理は操作ごとに任せる人を分けたい場面がある。商品は項目が多く、操作別にすると表が大きくなる）。無理に同じ数にしない

### 2-4. 欠けた行の扱い（そろえる: payment 方式）

| アプリ | 今 | 提案 |
|---|---|---|
| price | 表に行がある場合、**行が無い項目は不可**（ただし `ADDED_LATER` の `arrivals.manage`・`pricehistory.view` は既定値） | **行が無い項目は既定値**に統一し、`ADDED_LATER` を廃止 |
| payment | 欠けた項目は既定値 | 今のまま |
| receipt | （予定）既定値で補う | 案のまま |

- 規則（共通）: **行が無い＝既定値（ロールごとの既定）。明示的に✕と保存された行は✕のまま**
- 理由: 新しい項目を足すたびに、DB の行や `ADDED_LATER` の登録を忘れて管理者が使えなくなる（または意図せず不可になる）事故を防ぐ。項目の追加が「コードだけ」で済む
- 効果: `products.delete` の新設（§2-2）も、DB の変更なしで入れられる

### 2-5. 表が読めないとき【確定: 3アプリとも 503】

| 場合 | price（今） | payment（今） | receipt（予定） | 提案（共通） |
|---|---|---|---|---|
| 表が空（0行） | 全項目が既定値 | 全項目が既定値 | 既定値 | **既定値**（初期状態） |
| 行が欠けた項目 | 不可（`ADDED_LATER` 以外） | 既定値 | 既定値 | **既定値**（§2-4） |
| 表が無い（未作成。`42P01`・`PGRST205`） | 既定値で動く | 既定値で動く | — | **503**（この分岐を**消す**） |
| DB エラー（接続・権限・その他） | **既定値で動く**（全許可にはならない） | **503** | 503 | **503**（fail-closed） |

- 理由: price の「どんなエラーでも既定値」は、DB の障害のあいだ、**管理者が✕にした項目が既定で通る**余地がある（スタッフの削除を✕にしていても、障害中は◯になる）。3c の「すべて拒否」と同じ考え方に統一する
- **「表が無い＝既定値」の分岐を消す**: 本番ではすでに表がある。表の作成（SQL）を**デプロイより前**に行う順序（§4）を守れば要らない。分岐が残ると、移行忘れが気づかれないまま既定値で動く（権限設定が効いていないことに気づけない）
- 失敗時の文言は共通（§3-3）。画面は「権限設定を読み込めませんでした」の案内（編集系は不可、閲覧は閲覧のみの範囲）

### 2-6. price の `GET /api/permissions`（認可なし）【確定: 削除】

- 今: ログイン済みなら誰でも、権限表（全ロール×全項目）を読める。**price-app の画面は使っていない**（`PermissionsEditor` が呼ぶのは `PUT` だけ。画面の出し分けは `GET /api/me` の実効権限）
- **確定: 削除する**（`permissions.manage` に限る案は不採用。payment-app・receipt-app には読み取りの API が無く、画面がサーバーで直接読むので、削除が最もそろう。使われていないので影響は小さい）
- 理由: 最小限の公開（どの役割に何が許されているかを、一般のユーザーに見せる必要は無い）。情報としては軽いので、緊急度は低い

### 2-7. 一括操作の権限の置き場（price）【確定】

- 今: 画面（一括分類変更・一括削除の選択操作）は `products.bulk`、**サーバーは 1 件ずつの `products.edit` の API を呼ぶ**（専用の一括 API が無い）。アップロード・テンプレート出力だけがサーバーでも `products.bulk`
- **確定**: **`products.bulk` は、アップロード（一括取込）とテンプレート出力に限る**。商品一覧の一括分類変更・一括削除は、**1件ずつの API の繰り返し**なので、**画面の表示も、サーバーの検査と同じ項目に合わせる**（一括分類変更＝`products.edit`、一括削除＝`products.delete`）。専用の一括 API は作らない
- 理由: 画面とサーバーで見ている権限が違うと、「画面で一括を隠しても API は直接呼べる」（権限設定の意味が曖昧）になる。画面をサーバーの検査に合わせれば、ずれが無くなる。件数の上限など、一括固有の制約が必要になれば、そのとき専用 API を作る
- 影響: 設定画面の `products.bulk` の説明を「一括アップロード・テンプレート出力」に絞る

### 2-8. `role_permissions` の `updated_at`・`updated_by`

- 今: payment は有り、price は無し。receipt は予定で有り
- 提案: **price に足す**（`alter table price.role_permissions add column if not exists updated_at timestamptz, add column if not exists updated_by text`。null 可・既存行は null のまま）。優先度は低い（変更は操作履歴にも残る）が、表の形が3アプリで同じになる
- 共通部品の読み書きヘルパー（§3-2）が、3アプリで同じ表の形を前提にできる利点

### 2-9. 変更の記録の形

| アプリ | 今 | 提案 |
|---|---|---|
| price | 操作履歴 action `update`・対象「権限設定」・`changes` に「役割.権限」の前後 | 新しい記録から **action `permission`**（payment と同じ）にそろえる案。**過去の行は書き換えない** |
| payment | action `permission`・変わったセルごとに「スタッフ: 削除」「可 → 不可」 | 今のまま |
| receipt | （予定）action `permissions` | **`permission`** にする（payment に合わせる） |

- 変更の差分（セルごとの前後）の組み立ては共通部品に置ける（§3-2。価格は `diffPermissions` を持つ）。**記録先（操作履歴）への書き込みは各アプリ**

### 2-10. そろえない点（理由つき）

| 点 | 理由 |
|---|---|
| `pricehistory.view`（price 固有の項目） | 価格改定履歴は price 固有の機能（商品データの変更記録）。閲覧のみにも見せるため別権限にした（確定）。他アプリに同種の機能が出たら、同じ命名 `<対象>history.view`（例: `xxxhistory.view`）で足す |
| `arrivals.manage` | 動作が `manage` だが、実質 `edit`。price 固有で機能フラグ内、改名の手間（行の書き換え）に対して効果が小さい |
| `receipts.import` など固有の項目 | 機能が固有。命名規則（`<対象>.<動作>`）には従っている |
| 編集停止モード（`PRICE_APP_READ_ONLY`）・機能フラグ（`ARRIVALS_ENABLED`） | 移行・段階導入のための運用機能で、権限表の外。他アプリで必要になれば同じ名前の規約を作る |
| 項目の数・分け方 | 業務の違い（§2-3） |
| 画面のメニュー名・説明文の細かい文言 | アプリの言葉に合わせてよい。ただし**共通の項目の表示名**（`history.view`＝操作履歴の閲覧、`permissions.manage`＝権限設定の変更、`data.export`＝データ出力）は共通部品に置いて揃える |

## 3. 共通部品に置くもの・置かないもの

### 3-1. 方針

- 置く: **3アプリで実装が完全に一致すべき部分**（このパッケージの方針）= 項目の型、共通3項目、固定の判定、正規化と判定、失敗時の文言、`role_permissions` の読み書き
- 置かない: アプリ固有の項目の定義（key・表示名・既定の一覧）、画面（権限設定の UI）、記録先（操作履歴）への書き込み、どの API がどの項目を要求するか
- `history.view` の判定は **v3.21 の `historyViewLock`・`effectiveHistoryView`・`historyAccess` が唯一の定義**。新しい `permissions` モジュールは、`history.view` の固定・実効をそれに**委譲する**（二重に定義しない）。同様に、書き込み系の固定は `canWrite`（v3.20）に委譲する

### 3-2. 新モジュール `admin-portal-shared/permissions`（案。サーバー・ブラウザ両用の純粋な部分と、サーバー専用の DB 部分を分ける）

純粋な部分（DB・Next.js に依存しない。ブラウザでも呼べる）:

```ts
export type PermissionKind = "write" | "read";
/** 項目の型。各アプリは自分の項目を、この型で並べるだけ */
export interface PermissionDef<K extends string = string> {
  key: K;
  label: string;          // 表示名
  description: string;    // 説明
  kind: PermissionKind;   // 書き込み系は閲覧のみに付けられない
  defaults: Readonly<Record<PortalRole, boolean>>;  // 管理者／スタッフ／閲覧のみ
  lock?: Partial<Record<PortalRole, "on" | "off">>; // 固定（kind と別の追加の固定）
}

/** 共通の3項目の定義（key・表示名・説明・種類・既定・固定）。各アプリが自分の一覧に取り込む */
export const COMMON_PERMISSIONS: { historyView: PermissionDef<"history.view">; permissionsManage: PermissionDef<"permissions.manage">; dataExport: PermissionDef<"data.export"> };

/** 欄の固定: "on"／"off"／null。書き込み系の閲覧のみ=off（canWrite）、history.view は historyViewLock、permissions.manage の管理者=on、def.lock */
export function permissionLock(def: PermissionDef, role: string | null | undefined): "on" | "off" | null;

/** 保存値・送信値・古い行を正規化: 未知のキー・ロールは捨てる／真偽値でなければ既定値／行が無い項目は既定値／固定の欄は固定どおり */
export function normalizeMatrix(defs: readonly PermissionDef[], raw: unknown): PermissionMatrix;
/** 役割の実効権限（未知・空のロールは全項目不可=fail-closed） */
export function effectivePermissions(defs: readonly PermissionDef[], matrix: PermissionMatrix, role: string | null | undefined): Record<string, boolean>;
export function can(defs: readonly PermissionDef[], matrix: PermissionMatrix, role: string | null | undefined, key: string): boolean;

/** 変更の差分（「役割.権限」ごとの前後）。操作履歴の changes／detail の材料 */
export function diffMatrix(defs, before: PermissionMatrix, after: PermissionMatrix): PermissionChange[];

/** 失敗時の共通の文言・ステータス（AUTH_FAILURES と同じ形） */
export const PERMISSION_FAILURES: { denied: { status: 403; message: string }; unavailable: { status: 503; message: string } };
```

サーバー専用の部分（`role_permissions` の読み書き。表の形が3アプリで同じ前提 = §2-8）:

```ts
/** <schema>.role_permissions を1回で読む。表が空は []。表が無い・DB エラーは PermissionsUnavailableError（=503）。毎回引く（キャッシュなし。リトライなし） */
export async function loadRoleMatrix(client, schema: string, defs): Promise<PermissionMatrix>;
/** 正規化した全役割×全項目を upsert（updated_at・updated_by を入れる）。書き込み認可（authorizeWrite と permissions.manage）は呼び出し側 */
export async function saveRoleMatrix(client, schema: string, defs, matrix, updatedBy: string): Promise<void>;
```

- 使い方（案）: 各アプリは `const DEFS = [..., COMMON_PERMISSIONS.historyView, ...]` を並べ、API の入口で `authorizeWrite` のあとに `can(DEFS, await loadRoleMatrix(...), role, "xxx.edit")` を重ねる
- `authorize.ts` の既存の関数（`authorizeActor`・`authorizeWrite`・`historyAccess` など）は**変えない**。`permissions` はその上に載る（`canWrite`・`historyViewLock`・`PORTAL_ROLES`）
- **ロールを追加するときの直す所**は、今の3か所（DB の CHECK・`PORTAL_ROLES` 等・各アプリの権限表）から、「DB の CHECK・共通部品の `Record<PortalRole, …>`（型エラーで漏れを防ぐ）・各アプリの `defaults`（型エラーで漏れを防ぐ）」に減る

### 3-3. 失敗時の共通の文言

| 場合 | status | 文言（案。ユーザーが後で確認） |
|---|---|---|
| 権限が無い（✕） | 403 | 「この操作を行う権限がありません。管理者にお問い合わせください。」（receipt-app の案の文言） |
| 権限表を読めない | 503 | 「権限設定を読み込めませんでした。しばらくしてからもう一度お試しください」（payment-app の文言を丁寧に） |

- 認可の失敗（`AUTH_FAILURES`）と同じく、文言は1か所（`PERMISSION_FAILURES`）。`authFailureBody` と同じ形（`{ error, code }`）の本文を作る関数も添える（`code`: `forbidden`／`unavailable`）

### 3-4. 画面（権限設定の UI）は別項目

- price・payment の `PermissionsEditor` は、ほぼ同じ形（行＝項目、列＝役割、固定のセルはグレー＋理由のツールチップ、保存）。共通コンポーネント化できるが、**見た目・操作を伴う**ので、別項目（権限設定のポータル一元化のとき）として扱う。今回は、画面が使う**データ（項目の型・固定の判定・差分）**だけを共通にする → 画面の共通化は、そのデータの上にあとから載せられる
- ポータル一元化との関係: 一元化では、portal が全アプリの項目の定義を知る必要がある。アプリ固有の項目の定義を**共通部品に置かない**今回の方針だと、一元化のときに「各アプリが定義を公開する」か「定義を共通部品に移す」かを決める必要がある（今は決めない。型 `PermissionDef` を共通にしておけば、どちらにもできる）

### 3-5. テスト方針（共通部品）

- 純粋な部分: 3ロール×固定の全表（書き込み系の閲覧のみ=off、管理者の `permissions.manage`=on、`history.view` は `historyViewLock` と一致）、`normalizeMatrix`（未知のキー・ロール・真偽値でない値・欠けた行・固定の欄の保存値を無視）、`effectivePermissions`/`can`（未知・空・null のロール=全項目不可）、`diffMatrix`、共通3項目の定義が `defaults` の全ロールを持つこと（`Record<PortalRole,…>`）。`history.view` の判定が `effectiveHistoryView` と**全表で一致**すること（二重定義の防止）
- DB の部分: 実際の supabase-js クライアント＋差し替えた fetch（`authorize.test.ts` と同じ）で、表が空・行が欠けた・DB エラー（500・`42P01`・`PGRST205`・通信失敗）→ `PermissionsUnavailableError`、問い合わせは1回・リトライなし・毎回引く、スキーマの指定、upsert の中身（`updated_at`・`updated_by`）、ブラウザ側での呼び出しの拒否
- カバレッジ 100% を維持。実バンドルで、純粋な部分がクライアントに DB 関連を持ち込まないこと

## 4. 移行の順番と影響

### 4-1. 全体の順番

| 順 | 内容 | 変更の大きさ | DB の変更 | 戻し方 |
|---|---|---|---|---|
| A | **共通部品**に `permissions` を追加（追加のみ。タグは別途） | 小（新モジュール。既存は変えない） | なし | 追加のみなので戻し不要 |
| B | **payment-app** が共通部品に載せ替え | 小 | なし | Instant Rollback |
| C | **receipt-app** の権限表を新設（共通部品を最初から使う） | 大（新機能） | `receipt.role_permissions` を作る | Instant Rollback（表は残っても害なし） |
| D | **price-app** をそろえる（3e のあと） | 大（項目の追加・改名・判定の変更） | 行の追加→切替→削除、`updated_at`/`updated_by` の列 | Instant Rollback ＋ 行の戻し |

- 各アプリの共通部品の取り込みは、**挙動を変えるデプロイとは別に**行う（v3.21 のときと同じ。2026-10-08 の障害の教訓）
- フラグ（環境変数）は使わない。DB が先、コードが後（表・列・行を先に作る）
- 順番の理由: payment が最も共通部品に近く、載せ替えで共通部品の形を検証できる（小さい）。receipt は共通部品を使って最初から作れば、独自の実装を作らずに済む。price は変更が最大で、3e が前提のため最後

### 4-2. payment-app（小）

- 変更: `lib/permissions.ts` の定義を共通の型に載せ替え、共通3項目を `COMMON_PERMISSIONS` から取る／`42P01`・`PGRST205` の「表が無い＝既定値」の分岐を消す（表が無い＝503）／失敗時の文言を `PERMISSION_FAILURES`／変更の記録の action は今のまま `permission`
- key は変わらない → **DB の変更なし**。権限設定の画面・API の見た目も変わらない
- 影響: 表が無い環境（ローカル・テスト）では 503 になる → テストはスタブに（3c と同じ）

### 4-3. receipt-app（権限表の新設。大）

- 変更: 7項目（`receipts.edit`・`receipts.import`・`receipts.delete`・`vendors.edit`・`history.view`・`data.export`・`permissions.manage`）を共通の型で定義し、共通3項目を `COMMON_PERMISSIONS` から取る／6つの書き込み API・出力 API に `can(...)` を重ねる／`/settings/permissions` の画面・`PUT /api/permissions` を新設／メニュー・画面の出し分けを実効権限で（`canWrite`・`canViewHistory` の判定を、Context で渡す実効権限に置き換え）
- DB: `receipt.role_permissions`（`role`・`permission`・`allowed`・`updated_at`・`updated_by`、主キー `(role, permission)`、RLS 有効、service_role のみ）を**デプロイの前に**作る（ユーザーが SQL Editor で実行）。行は入れない（既定値で補う＝今の動作と同じ）
- 既定値は今の動作と同じ（§1）→ **デプロイしても見え方は変わらない**。変わるのは、管理者が設定画面で変えたとき
- `history.view` の例外（権限項目なしで `canViewHistory(role, true)`）は**解消する**（`granted` に権限表の値を渡す）。design-history-scope の「期限つきの例外」の条件が満たされる
- 戻し: Instant Rollback。表は残っても害は無い。表を消すのは、アプリを戻してから

### 4-4. price-app（最大。3e のあと）

- 変更と順序:
  1. **DB（ユーザー）**: `role_permissions` に `updated_at`・`updated_by` を足す（null 可。既存行は変えない）／**`permissions.manage` の行を追加**（`users.manage` の値をコピー: `insert into price.role_permissions (role, permission, allowed) select role, 'permissions.manage', allowed from price.role_permissions where permission = 'users.manage' on conflict do nothing`）。古い `users.manage` の行は**残す**（古いコードはそれを使い続けるので、締め出しにならない）
  2. **デプロイ**: 共通部品に載せ替え。`users.manage`→`permissions.manage`、`products.delete` の新設（行が無いので既定値＝今と同じ）、欠けた行＝既定値（`ADDED_LATER` を廃止）、DB エラー＝503、`GET /api/permissions` の削除（または `permissions.manage` に限る）、一括操作の画面をサーバーの検査に合わせる、変更の記録の action を `permission` に
  3. **DB（ユーザー）**: 古い `users.manage` の行を削除（デプロイが安定したあと）
- 影響: 設定画面の行が 8→9（`products.delete` が増える。`users.manage` は改名）。**既定は同じなので、管理者が保存するまで見え方は変わらない**。DB エラー時に既定値で通っていた経路が 503 になる（意図した変更。fail-closed）
- 戻し: Instant Rollback（古いコードは `users.manage` の行を見る → 手順 1 で残してあるので動く）。`permissions.manage` の行は残っても無視される
- 注意: 手順 1 と 2 の間に権限設定を保存すると、古いコードは `users.manage` を更新するが、新しいコードは `permissions.manage` を見る → ずれる。**この間は権限設定を変えない**（短い窓）。もしずれたら、手順 1 の SQL をもう一度実行（`on conflict do nothing` ではなく `do update` に変えて再コピー）
- 3e が済むまで、`users.manage` の改名は**待つ**（旧方式のユーザー管理が同じ権限を使うため）。それ以外（`products.delete`・欠けは既定値・503・列の追加）は 3e を待たずに進められるが、**変更を2回に分けない**ほうが安全 → 3e のあとに一度に行う案を推す

### 4-5. 各アプリの変更の大きさ（まとめ）

| アプリ | 変更の大きさ | DB の変更 | コードの主な変更 |
|---|---|---|---|
| payment | 小 | なし | 載せ替え・分岐の削除・文言 |
| receipt | 大（新機能） | `role_permissions` の新設 | 7項目・API の検査・設定画面・実効権限の配布 |
| price | 大（変更が最大） | 列の追加・行の追加→削除 | 改名・項目追加・判定方式の変更・API の削除・画面の整理 |

### 4-6. 共通部品のタグ番号（提案）

**提案: v3.22 ＝ 権限表（`permissions`）。`createServiceClient` のキャッシュ設定（`cache: "no-store"`）は、その後ろの番号（v3.23 以降）へ。**

- 理由1: 権限表は、payment-app・receipt-app・price-app の**3アプリの実装が待っている**（順番 B〜D）。キャッシュ設定は優先度が低いまま（待っているものが無い）。待たれているものを先に出す
- 理由2: 2つは性質が違う。`permissions` は**追加のみ**（呼ばれなければ何も変わらない。v3.21 と同じ）。キャッシュ設定は**全アプリの全 DB 読み取りに効く挙動変更**で、アプリごとにビルドと主要画面の確認が要る。**追加と変更を同じタグにしない**（design-history-scope §7 の方針）。タグ番号の入れ替えは、そこで認めてある
- 理由3: タグは動かさない。順番を入れ替えると、先に出した側の番号が小さくなるだけで、互いに依存しない（キャッシュ設定は権限表の前提ではない。権限表もキャッシュ設定の前提ではない）
- `permissions` を2つのタグに分ける案（純粋な部分と DB の部分）は**採らない**: payment-app が最初に両方を使う。分けると、payment-app の載せ替えを2回に分けることになる。1つのタグ（追加のみ）で出し、payment-app で形を確かめる。**問題が見つかったら、次のタグ（v3.23）で直す**（タグは動かさない）
- 実装の開始は、ユーザーの指示があるまで待つ（段階 A）。取り込み（段階 B〜D）は、各アプリの指示を待つ

## 5. ユーザーに確認したい論点（6つ。**すべて推奨どおりで確定 2026-10-23**）

| # | 論点 | 確定した内容 | 不採用の案 |
|---|---|---|---|
| 1 | 削除・復元の粒度 | **確定**: 3アプリとも独立した項目にする（price に `products.delete`。既定は編集と同じ ◯／◯／✕ で、挙動は変わらない） | price は「編集」に含めたまま（論理削除なので）。payment・receipt が独立で、price だけ含める理由が弱い |
| 2 | 権限表が読めないとき | **確定**: 3アプリとも 503。既定値で補うのは、表が空・行が欠けた項目だけ。price の「どんなエラーでも既定値」と「表が無い＝既定値」の分岐は廃止 | 今のまま（アプリごとに違う）。DB 障害中に管理者が止めた操作が通る穴が残る |
| 3 | price の `users.manage` | **確定**: `permissions.manage`（権限設定の変更）に改名（3e のあと、行の追加→切替→削除の3段）。`GET /api/permissions` は削除 | 改名しない／`GET` を `permissions.manage` に限って残す |
| 4 | price の一括操作 | **確定**: `products.bulk` はアップロード・テンプレート出力だけ。一括の分類変更＝編集、一括削除＝削除の権限に従う | 専用の一括 API を作る（一括固有の制約が必要になってから） |
| 5 | 共通部品の範囲 | **確定**: 項目の型・共通3項目・固定の判定・正規化と判定・失敗時の文言・`role_permissions` の読み書き。アプリ固有の項目の定義と設定画面（UI）は置かない | 設定画面も共通化（見た目を伴うので、ポータル一元化のとき別に決める） |
| 6 | 移行の順番 | **確定**: 共通部品 → payment-app → receipt-app → price-app（3e のあと） | price を先に／各アプリで独自に実装 |

- 付随（**承認済み**。確認なしで進める）（確認なしで進めてよいと考える。反対があれば指摘してほしい）: `role_permissions` に `updated_at`・`updated_by` を price に足す／変更の記録の action を `permission` にそろえる／`pricehistory.view`・`arrivals.manage`・編集停止モード・機能フラグは据え置き（§2-8〜§2-10）

## 6. 確認できていないこと

- receipt-app の `design-permission-matrix.md`（権限表の詳細設計）は、依頼の許可範囲外なので読んでいない。receipt-app の項目・既定・固定は `permission-inventory.md` に依る
- price-app で `GET /api/permissions` を使っているのが `PermissionsEditor` の `PUT` だけであること（`GET` の呼び出しが無いこと）は、`app/`・`components/`・`lib/` の検索で確認した（読み取りのみ）。外部のスクリプト等の利用は未確認
- price-app の本番 `role_permissions` に、`users.manage` 以外の保存済みの行（`history.view`＝不可など）があるかは未確認。移行（§4-4）の前に、読み取りで確認する（ユーザーが実行）
- `42P01`・`PGRST205` の分岐を消した場合の、ローカル・テスト環境での扱い（スタブにする）は、各アプリのテストの書き換えが要る（影響の見積もりは各アプリ）
- 共通部品のタグ番号・実装の時期は決めていない（v3.22＝キャッシュ設定の予定があるため、管理セッションが調整）
