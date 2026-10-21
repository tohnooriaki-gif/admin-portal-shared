# 操作履歴を権限で制限する共通部品（設計）

2026-10-20 作成。**設計だけ（コードなし・タグなし・DB未変更）**。実装はユーザーの了承後。
依頼: 統合ポータル全体管理セッション（ユーザーの指示「設計を進める」2026-10-20）。
要件はユーザーのメモ（2026-10-16）。各アプリの設計は、それぞれの `docs/design-history-scope.md`
（payment-app・receipt-app は作成済みを読んだ。price-app は未作成）。

## 0. 要件と、各アプリの設計から見えた共通点

- 管理者＝全件／スタッフ＝自分の操作履歴だけ／閲覧のみ＝見られない。役割が不明・空は見られない（fail-closed）
- 履歴の操作者は、名前の文字列ではなく `portal.users.id` で管理する（改名しても自分の分が見える）
- payment-app と receipt-app は、同じ形を希望している:
  - `historyScope(role)` は**ロールの文字列を受け取る純粋関数**（`canWrite(role)` と同じ形）。ブラウザ側（メニューの出し分け）でも使いたい
  - テーブルに `actor_id text`（null 可・外部キーなし）を足し、名前の列は**その時点の表示名のスナップショット**として残す
  - 既存の行は、名前が `portal.users` に**ちょうど1人**一致する行だけ埋める。残りは null のまま＝**管理者だけが見える**
  - 絞り込みは**必ずサーバー側**（DB の問い合わせの条件にする。画面側で隠さない）。上限件数は絞ったあとに数える
- 履歴の列名・型・照合の規則がアプリごとにずれると、あとで「同じ人の履歴が、アプリによって見えたり見えなかったりする」不具合になる。
  そこで、共通部品で決めるのは**範囲の判定と、規約（列名・型・キー）**まで。SQL の実行や、テーブルの形は各アプリのまま

## 1. 結論（要約）

| # | 内容 | 案 |
|---|---|---|
| 1 | `authorize` に足すもの | `historyScope(role)`（純粋関数）、`historyAccess(user)`（own のときに id を持つ判別共用体）、`HistoryScope`・`HistoryAccess` 型 |
| 2 | サーバー専用の規則との関係 | `historyScope`・`historyAccess` は**ブラウザでも呼べる**（DB を引かない）。DB を引く `authorizeActor` / `authorizeWrite` だけが従来どおりサーバー専用 |
| 3 | 履歴テーブルの規約 | 列名 `actor_id`（text・null 可・外部キーなし・`portal.users.id` を入れる）＋名前のスナップショット＋索引 `(actor_id, date desc)` |
| 4 | SQL の共通化 | **実行できる共通の関数・ビューは作らない**。照合の SQL は**テンプレート**（README か docs）として共有し、各アプリが自分のテーブルに当てはめてユーザーが実行する |
| 5 | `history.view` | **残す（案 B、確定 2026-10-20）**。意味は「履歴の画面を開けるか」。範囲は役割固定で、止めることだけできる。閲覧のみ✕固定（確定）。方針: システムごとに分けない。**例外は receipt-app だけ**（権限マトリクスの仕組み自体が無いため。理由と条件は §4-6）。共通ヘルパー `historyViewLock`・`canViewHistory(role, granted)`・`historyAccess(user, granted)`（§4-4）。管理者の欄は◯固定（確定、§4-3）。price-app の価格改定履歴は別権限 `pricehistory.view` に分ける（確定、§4-9。共通部品への影響なし） |
| 6 | 見落としやすい読み取り経路 | 履歴の画面以外にも履歴を読む所がある（price-app の商品詳細・ユーザー管理）。**同じ規則を通す**かの判断が要る（§5） |
| 6b | システム用の操作者 | `actor_id` が `sys_…` ならシステム用（予約）。null の旧行とは別。`isSystemActor(id)` の共通ヘルパーを1つだけ置く案（§3-5・§3-6） |
| 6c | 操作者の名前の解決 | **確定**（2026-10-21）= 共通部品の新しい場所 `admin-portal-shared/actorDisplay` に入れる。履歴には**今の名前**（`actor_id` から `portal.users` を一覧で1回だけ引く）、削除済みは記録時の名前＋「(削除済み)」（`sys_` と旧行・引けなかったときは付けない）。引けなかったときは記録時の名前で続行。「旧: ○○」は後回し（§3-7） |
| 7 | タグ | **確定**（2026-10-21）= 履歴まわりの追加は**すべて v3.21 にまとめる**（`historyScope` 系・`isSystemActor`・`actorDisplay`。追加のみ）。`createServiceClient` のキャッシュ設定（`cache: "no-store"`）は**別の v3.22**（§7） |

## 2. 共通部品に足す案（`admin-portal-shared/authorize`、v3.20 の上に足す）

### 2-1. 形（設計のスケッチ。実装は了承後）

```ts
/** 操作履歴をどこまで見られるか。all=全件、own=自分の操作だけ、none=見られない */
export type HistoryScope = "all" | "own" | "none";

/** 管理者=all、スタッフ=own、閲覧のみ・不明・空・null・undefined=none（fail-closed） */
export function historyScope(role: string | null | undefined): HistoryScope;

/**
 * own のときに絞り込みの条件（自分の id）を一緒に持つ形。ユーザーが無い（認可に失敗した）・id が空のときは none。
 * 型で「own なのに id が無い」を作れなくする（`.eq("actor_id", undefined)` のような書き間違いを防ぐ）。
 */
export type HistoryAccess =
  | { scope: "all" }
  | { scope: "own"; actorId: string }
  | { scope: "none" };
export function historyAccess(user: { id: string; role: string } | null | undefined, granted: boolean | null | undefined): HistoryAccess;
// 第2引数 granted は各アプリの history.view の値（§4。権限項目の無い receipt-app は true を明示。§4-6）
```

- **内部の対応表は `Record<PortalRole, HistoryScope>`** にする。ロールを追加したとき、**型エラーで「履歴の範囲」を決めさせる**
  （今の README の「ロール追加は3か所」に、範囲の決定が漏れない。`canWrite` も同じ形に寄せられるが、v3.20 の挙動は変えない）
- `historyScope(role)`: 画面側（メニューを出すか）は role だけで足りる。payment-app・receipt-app の希望どおり
- `historyAccess(user, granted)`: データを読む側（`getActionHistory`）が使う。`authorizeActor` の結果の `user` をそのまま渡せる。`granted` は `history.view` の値（実効 = 役割の範囲 かつ `history.view`。§4）
  （`historyAccess(auth.ok ? auth.user : null)`）。**認可に失敗した結果から `all` や `own` が出る経路を作らない**。さらに、**`id` が `sys_` で始まる「ユーザー」は none**（システム用の操作者 id の予約。人のセッションが `sys_…` を名乗って、システムの行を自分のものとして読めないように。§3-5）
- 絞り込みを DB の問い合わせに付ける処理（`.eq("actor_id", …)`）は**共通部品に入れない**。各アプリのクエリビルダー・テーブルの形が違い、
  ビルダーの型を共通部品が持つと壊れやすい。代わりに README に次の約束を書く:
  1. `none` は DB を読まずに空（または「見られない」の案内）
  2. `own` は `actor_id = access.actorId` を**問い合わせの条件**にしてから `order`・`limit`
  3. `all` は条件なし（`actor_id` が null の行も含む）
  4. キーは**必ず `portal.users.id`**。ログインID・名前では絞らない（ログインIDは再利用されうる。名前は改名で変わる）

### 2-2. 任意で足すもの（論点）

- `HISTORY_NONE_MESSAGE`（「閲覧のみの権限では、操作履歴は見られません」）: 画面の案内文を全アプリで揃える。`AUTH_FAILURES` と同じく1か所で管理
- `HISTORY_SCOPE_LABELS`（`all`→「全件」、`own`→「自分の操作だけ」、`none`→「見られない」）: 権限画面の説明行（§4）の文言を揃える

### 2-3. サーバー専用の規則との整合

- v3.20 の `authorize.ts` の「サーバー専用」は、`authorizeActor` の先頭の `typeof window` の検査（実行時に例外）だけ。
  `PORTAL_ROLES`・`isPortalRole`・`canWrite` は DB を引かないので、すでにブラウザでも呼べる
- `authorize.ts` が import するのは `portalUsers.ts`（`import type` の supabase-js だけ。`ws` を引かない）なので、
  クライアントコンポーネントから `admin-portal-shared/authorize` を import してもバンドルに DB 関連は入らない
  （実装時に、実際にクライアントのバンドルへ入れて確かめる。`canWrite` が先に同じ使われ方をしていれば、その実績で足りる）
- **ブラウザで出し分けても、強制は必ずサーバー側**。メニューを消すだけでは見えてしまうので、データを読む関数（Server Component・API）が
  `historyAccess` を通ること。README にも書く
- 新しい `historyScope` は `window` の検査を**入れない**（入れると、メニューの出し分けに使えない）。DB を引く関数ではないため

### 2-4. テスト方針（`tests/authorize.test.ts` に追加、または `tests/historyScope.test.ts`）

- `historyScope`: 3ロール（管理者=all・スタッフ=own・閲覧のみ=none）、不明・表記違い・空白付き・空・null・undefined は `none`
- **すべての `PORTAL_ROLES` に範囲が定義されている**こと（`PORTAL_ROLES` を回して `all`/`own`/`none` のどれかが返る）
- `history.view`（§4）: `historyViewLock`（管理者=on・閲覧のみ・不明・空=off・スタッフ=null）、`effectiveHistoryView`/`canViewHistory`（管理者は granted が false/null でも可、閲覧のみ・不明は granted が true でも不可、スタッフは true のときだけ可）。`historyAccess` の組み合わせを役割×granted（true/false/null/undefined）の全表で確認（閲覧のみ＋true→none、スタッフ＋false→none、スタッフ＋null→none、管理者＋false→all）。`PORTAL_ROLES` を回して、すべての役割に固定が定義されていること
- `historyAccess`: 管理者→`{ scope: "all" }`（id があっても `actorId` を持たない）、スタッフ（granted=true）→`{ scope: "own", actorId: id }`、
  閲覧のみ→none、id が空・null のスタッフ→none（fail-closed）、user が null・undefined→none、ロール不明→none
- 結合: 実際の supabase-js クライアント＋差し替えた fetch で `authorizeActor` を通した `user` を `historyAccess` に渡し、
  ロールを変えた次の呼び出しで範囲が変わること（毎回引く＝キャッシュなしがそのまま効く）
- システム操作者: `id` が `sys_makeshop` のようなユーザー→none（`own` にならない）、`sys_` で始まる形式違い（`sys_Make`・`sys_` のみ等）も none（接頭辞だけで判定。大文字小文字は区別せず、`SYS_x` も none）、`u_sys_x` のように途中に含むだけの id は通常どおり `own`。`isSystemActor` は形式表（正常・`sys_` のみ・大文字・33文字・空白・null）
- 型: 判別共用体なので、`scope === "own"` のときだけ `actorId` が読めること（`tsc` で確認）
- カバレッジ 100% を維持

## 3. 履歴テーブルの共通の考え方

### 3-1. 規約（共通化する部分）

| 項目 | 規約 |
|---|---|
| 列名・型 | `actor_id text null`。値は `portal.users.id`（receipt-app の実測では `u_…` の文字列。`id::text` で入れれば型に依存しない） |
| 外部キー | **張らない**。ユーザーを削除しても履歴は残す。`on delete set null` にもしない（削除した人の履歴が「誰のものでもない」になる） |
| 名前の列 | その時点の表示名のスナップショットとして残す（改名しても過去の行は書き換えない）。表示専用で、絞り込みには使わない |
| 索引 | `(actor_id, date desc)` |
| 書き込み | 書き込み API が持っている `auth.user`（`authorizeActor` の結果）から `{ id, name }` を入れる。`id` と名前は**同じ `user` から**取る（別々の取得にしない） |
| 照合できない行 | `actor_id` は null のまま＝**管理者だけが見える**。スタッフの「自分の分」には出ない |
| 保守スクリプト | 過去の行（2026-10-20 より前）は null のまま（旧行扱い）。**これから作るシステム操作は null にしない**（§3-5。`sys_…` の id を入れる） |
| 取込などで1操作が複数行になるもの | 同じ操作者の `actor_id` を全行に入れる（receipt-app の PDF 取込のまとめ行＋伝票ごとの行） |

### 3-2. 共通の SQL にできる部分・できない部分

- **できない（しない）**: 実行できる共通の関数・ビュー（例: `portal.backfill_actor_id('payment','action_history','"user"')`）
  - テーブル名・列名を文字列で受け取る動的 SQL になり、`portal` スキーマに権限の強い関数が1つ増える。1回きりの作業のために置く物ではない
  - 実行は各アプリのテーブルごとにユーザーが SQL Editor で行う（確認の結果を見てから埋める）。共通の関数に包むと、確認の段取りが見えにくくなる
  - 戻しも関数だと「消すのを忘れる」物が増える
- **できる**: 照合の SQL の**テンプレート**（確定の形は §3-3。**名前のみで照合**）。置き換えるのは `<schema>.<table>` と `<名前の列>` だけ。
  実装時に README か `docs/` に載せる
- **アプリごとに違うまま**: テーブル名・列の構成（payment-app は `changes` jsonb、receipt-app は取込の `__000` 行）、DDL のマイグレーションファイル、
  上限件数、画面。これらは各アプリの設計のとおり

### 3-3. 過去の行の照合ルールとテンプレート（確定 2026-10-20、ユーザー判断）

**確定した照合ルール**:

1. 過去の行のうち、履歴の名前が `portal.users.name` の**現ユーザーちょうど1人だけ**に一致する行だけ、`actor_id` を埋める
2. それ以外（一致する人がいない・同じ名前が2人以上）は、`actor_id` を**空（null）のまま**にする ＝ **管理者だけが見える**（スタッフの `own` には出ない）
3. **`login_id` の照合は採用しない**（名前のみ）。当初の案にあった「名前で一致しなければ `login_id` でも照合する」2本目の更新は、テンプレートに**入れない**
4. 手で埋める（個別の対応づけ）は、このルールには含めない。必要になったら、各アプリがユーザーの指示で別に行う

テンプレート（実行はユーザー。各アプリの設計書の SQL と同じ内容を一般化したもの）:

```sql
-- (A) 列と索引（何度実行しても同じ。既存の行は変えない）
alter table <schema>.<table> add column if not exists actor_id text;
create index if not exists <table>_actor_date_idx on <schema>.<table> (actor_id, date desc);

-- (B1) 確認: portal.users に同じ名前の人がいないか（出たら、その名前の行は自動では埋まらない＝null のまま）
select name, count(*) from portal.users group by name having count(*) > 1;

-- (B2) 確認: ある人の「名前」が、別の人の「ログインID」と同じになっていないか（出たら、手で確認する）
--      （3c 以降は、名前が空だった人の操作を「ログインID」で履歴に記録している。そのログインIDと同じ名前の別人がいると、
--       その行を別人のものとして埋めてしまう。照合は名前のみだが、この衝突は埋める前に必ず見る）
select u1.name, u1.id as by_name, u2.id as by_login_id
from portal.users u1 join portal.users u2 on lower(u2.login_id) = lower(u1.name) and u2.id <> u1.id;

-- (B3) 確認: 履歴の名前ごとの件数と、照合の見込み（matched_by: name＝埋まる / ambiguous・none＝null のまま）
with names as (
  select <名前の列> as name, count(*) as rows from <schema>.<table> where actor_id is null group by <名前の列>
)
select n.name, n.rows,
  case
    when (select count(*) from portal.users u where u.name = n.name) = 1 then 'name'
    when (select count(*) from portal.users u where u.name = n.name) > 1 then 'ambiguous'
    else 'none'
  end as matched_by
from names n order by n.rows desc;

-- (C) 埋める（名前が現ユーザーちょうど1人に一致する行だけ。トランザクションの中で。埋まらなかった行を確かめてから commit。違えば rollback）
begin;
update <schema>.<table> h set actor_id = u.id::text
  from portal.users u
 where h.actor_id is null and u.name = h.<名前の列>
   and (select count(*) from portal.users u2 where u2.name = h.<名前の列>) = 1;
select <名前の列>, count(*) from <schema>.<table> where actor_id is null group by <名前の列>;  -- 埋まらなかった行（管理者だけが見る行になる）
commit;  -- 問題があれば rollback;

-- (E) 戻し（アプリを、actor_id を書かない版に戻してから。先に列を消すと履歴の書き込みが失敗する）
-- drop index if exists <schema>.<table>_actor_date_idx;
-- alter table <schema>.<table> drop column if exists actor_id;
-- 埋めた値だけ戻すなら: update <schema>.<table> set actor_id = null;
```

- **(B2) は、この設計書で足した確認**。照合は名前のみだが、名前が空のときの記録（`name || loginId`）が履歴に残っているため、
  「ある人の名前＝別の人のログインID」だと、その行を別人のものとして埋めてしまう。スタッフが他人の行を見てしまう（制限の目的に反する向きの誤り）ので、埋める前に必ず見る。
  出たときは、その名前の行を埋めない（C の更新から除く）か、手で対応づけるかを、ユーザーと決める
- 名前が空だったとき、ログインIDで記録された行は、名前では当たらないので**埋まらない**（null のまま＝管理者だけ）。これは確定した許容（`login_id` の照合を採らないため）
- 同名の衝突（B1）で埋まらない行、改名前の名前で残っている行も、null のまま。いずれも管理者だけが見える
- 各アプリの設計書との差: payment-app の案にあった `login_id` の2本目の更新と、`matched_by` の `login_id` は**削除**する。receipt-app の案（名前のみ）は、この形に一致している
- 照合ルールは `portal.users.name` が一意でなくてよい前提（B1 で衝突を見るだけ）。`login_id`/`login_key` の一意制約には依存しない

### 3-4. 規約に載せるべき注意（README に明記する）

1. 照合は**今の名前**でしか当たらない。改名済みの人の過去の行は埋まらない → **改名が起きる前に埋める**（今は改名の実績なし）
2. 埋め終えたあとに、同じ名前の人が `portal.users` に増えても、`actor_id` で見るので影響は出ない（名前で見るのは埋める1回だけ）
3. ユーザーを削除すると、その人の `actor_id` の行は誰にも `own` で見えなくなり、管理者だけが見える。同じログインIDで作り直した人は**別の id**になるので、
   前の人の履歴は引き継がれない（意図した挙動。ログインIDで絞らない理由）
4. スタッフがロールを「閲覧のみ」に変えられると、自分の履歴も見えなくなる。管理者に戻ると、また見える（ロールは毎回引くので即時）

### 3-5. システム用の操作者（人がログインしていない操作）の規約案

追記 2026-10-20（管理セッション経由。ユーザー了承済みの方針）。将来の MakeShop 連携（API・バッチで商品・在庫を更新）や自動処理には、
ログインした人がいない。履歴には「人ではない操作者」として残す。

| # | 規約 | 補足・この設計書の見解 |
|---|---|---|
| 1 | `actor_id` が **`sys_` で始まる値をシステム用に予約**する（例: `sys_makeshop`、`sys_import`）。人の id（`u_…`）と衝突しない。用途ごとに分ける。名前のスナップショットは「MakeShop連携」など | 形式は `^sys_[a-z0-9_]{1,32}$` に限る案（小文字・数字・`_` だけ。表記ゆれと、`like 'sys_%'` の `_` がワイルドカードになる点を避ける）。SQL で見分けるときは `left(actor_id, 4) = 'sys_'`（`like` を使うなら `like 'sys\_%' escape '\'`） |
| 2 | **null ＝「照合できない旧行」（管理者だけが見える）とは別**。システム操作は null にしない | null は「不明」、`sys_…` は「正常な操作者」。システム操作を書く関数は `actor_id` を**必須**にして、null を渡せない形にする（書き忘れが「旧行」に化けるのを防ぐ） |
| 3 | 表示: `portal.users` に無い `sys_…` には「(削除済み)」を付けない。`own` では `sys_…` の行は**決して自分のものにならない**。管理者の全件には出る | 「(削除済み)」を付ける実装がある場合は、`isSystemActor(id)` で除外する（§3-6）。商品詳細（price-app）に出すかは、論点6（§8）の結論に従う |
| 4 | 操作者 id は**常にサーバーが決める**（画面・外部入力から受けない）。偽装できない。**人のセッションが `sys_…` を名乗れない**ことを確認する | `historyAccess` は、`actorId` が `sys_` で始まる id なら `own` にせず **none** を返す（多重防御。§2-1 に反映）。人の id は `portal.users.id`（`u_…`、サーバーが生成）なので通常は起きないが、**`portal.users.id` に `sys_` を許さない**ことを DB 側でも保証する（下の「ポータル側」）。システム操作の `actor_id` は、各 API ルートの**コード内の定数**にし、リクエストの内容から作らない |
| 5 | ユーザー管理で、予約名（「MakeShop連携」等）のユーザーを作れないようにする（**確定**: ポータルへ依頼する） | 履歴の表示上、人の「MakeShop連携」とシステムの「MakeShop連携」が見分けられなくなるのを防ぐ。**admin-portal のユーザー管理の変更**（別セッションへの依頼）。予約名の一覧は共通部品に**入れない**（連携を足すたびに共通部品のタグが要るため）。admin-portal 側の定数か、名前の登録時の検査にする。**`portal.users.id` に `sys_` を許さない DB の CHECK は見送り**（確定。id はサーバーが生成するので通常は起きない）。代わりの歯止めは、共通部品の `historyAccess` の `sys_` ガード（`sys_` で始まる id の「ユーザー」は `none`）だけになる |
| 6 | システム操作は「閲覧のみは書き込み不可」（`authorizeWrite`）の**対象外**。ただし履歴は**必ず残す** | ユーザーのセッションではなく、**秘密のキーで認証する別経路**だから。`authorizeWrite` を通らない書き込み経路が増えるので、**その経路が人のセッションで到達できないこと**（キー以外で通らない、ユーザーのクッキーでは認証されない）を各アプリのテストで確かめる。履歴を残せなかったとき（`action_history` への書き込みの失敗）に、操作自体を失敗にするか続行するかは論点（§8）。**秘密のキーの検証**（タイミング攻撃に強い比較・キーの再発行・ローテーション）は、この設計書の範囲外（別の設計。共通部品に `authorizeSystem` のような関数を足すかは、MakeShop 連携の設計のときに） |

- 範囲の判定（`historyScope`）には影響しない。システム操作の行は、`all`（管理者）にだけ出る。スタッフの `own` の問い合わせは `actor_id = <自分の id>` なので、
  `sys_…` の行は条件に一致しない（コードを足さなくてよい）
- 照合のテンプレート（§3-3）は、`actor_id is null` の行だけを対象にするので、`sys_…` の行には触れない
- 取込などで、**人が始めた操作**（ログインした人が PDF 取込を実行する）は、これまでどおり**人の id**。システム用の id は、人が関与しない実行（定期バッチ・外部からの更新）だけ。
  「人が押した操作を、システム名で記録する」ことは避ける（誰がやったかが消える）
- 人が始めて、バッチが実行する場合（例: 管理者が「今すぐ同期」を押す）は、人が始めた分は人の id にする案（システムが肩代わりする場合のみ `sys_…`）

### 3-6. 共通のヘルパー `isSystemActor(id)`（案）

```ts
/** システム用の操作者 id の接頭辞（予約。人の id `u_…` と衝突しない） */
export const SYSTEM_ACTOR_PREFIX = "sys_";
/** システム用の操作者 id か。形式（^sys_[a-z0-9_]{1,32}$）に合うものだけ true。null・undefined・空は false */
export function isSystemActor(id: string | null | undefined): boolean;
```

- 役割: (1) `historyAccess` が、`sys_…` の id を持つ「ユーザー」を none にする（人のセッションがシステムの行を自分のものにしない）、
  (2) 各アプリの表示で「(削除済み)」を付ける判定から除く、(3) admin-portal のユーザー管理が、`portal.users.id` に `sys_…` を許さない検査に使える
  （admin-portal は共通部品に追従済みなので import できる）
- 作る価値: 接頭辞の文字列を3アプリ＋admin-portal でばらばらに書くと、`sys_` の綴りや形式（大文字小文字）がずれて、偽装防止の穴になる。
  1か所に置けば、テストも1か所で済む。ただし**関数は1つだけ**で、名前の一覧（予約名）は持たない
- `isSystemActor` は「形式に合う `sys_…`」だけを true にする（`sys_` だけ・大文字・長すぎる・空白入りは false。null・undefined・空も false）。表示の判定（「(削除済み)」を付けない）に使う
- `historyAccess` の「人の id が `sys_` を名乗っていないか」の判定は、形式を見ずに**接頭辞だけ**（`id.toLowerCase().startsWith(SYSTEM_ACTOR_PREFIX)`。大文字小文字を区別しない）で none にする。
  形式に合わない `sys_…`（大文字など）を「人の id」として通さない＝fail-closed にするため。`isSystemActor` を使うと形式違いが素通りする
- 作らない案: ヘルパーなしで、各アプリが `id.startsWith("sys_")` と書く。小さいが、歯止めが各所の書き方に依る

### 3-7. 履歴に出す操作者の名前の解決（共通ヘルパー案）

追記 2026-10-20（ユーザー判断）。履歴に出す操作者の名前は**「今の名前」**（`actor_id` から `portal.users` を引く）。ユーザーが削除済みなら、**記録時の名前＋「(削除済み)」**（`sys_…` には付けない）。
「旧: ○○」の併記は任意で後回し。一覧は**共通部品で一括1回**引く。名前のスナップショット（`"user"` 列）は、この解決で使う「記録時の名前」として残る（§3-1）。

#### 3-7-1. 表示のルール（確定した方針）

| 履歴の行 | 表示する名前 | 状態（`status`） |
|---|---|---|
| `actor_id` が `portal.users` にいる | **今の名前**（空なら、3c と同じくログインID） | `current` |
| `actor_id` が `portal.users` にいない（削除済み） | 記録時の名前 ＋ **「(削除済み)」** | `deleted` |
| `actor_id` が `sys_…`（システム用。§3-5） | 記録時の名前（「MakeShop連携」など）。**「(削除済み)」は付けない** | `system` |
| `actor_id` が null（照合できなかった旧行） | 記録時の名前。**「(削除済み)」は付けない**（誰か不明であって、削除されたとは限らない） | `legacy` |
| ユーザー一覧が引けなかった（DB エラー・空） | 記録時の名前。**「(削除済み)」は付けない** | `unknown` |

- 「(削除済み)」は、**削除されたと確認できたときだけ**付ける。引けなかった・不明・システムのときに付けると、全行が「削除済み」に見える誤表示になる
- 「旧: ○○」の併記（今の名前と記録時の名前が違うときだけ、記録時の名前を添える）は**任意・後回し**。返す型に `previousName` のような項目を**あとから足せる**形にしておく（足しても既存の呼び出しは壊れない）。最初の版には入れない

#### 3-7-2. 形の案（設計のスケッチ。実装は了承後）

```ts
export type ActorStatus = "current" | "deleted" | "system" | "legacy" | "unknown";
export interface ActorDisplay {
  /** 表示する名前。現ユーザーは今の名前、それ以外は記録時の名前 */
  name: string;
  status: ActorStatus;
}
/** 削除済みのときの接尾辞（文言はここだけで管理する）。全アプリで同じ表記にそろえる */
export const ACTOR_DELETED_SUFFIX = "(削除済み)";

/** 画面に出す文字列。deleted のときだけ「名前 (削除済み)」 */
export function actorLabel(actor: ActorDisplay): string;

/** 純粋関数。ユーザー一覧（引けたもの）から、表示を決める。directory が null のときは unknown */
export function displayActor(
  actorId: string | null | undefined,
  recordedName: string,
  directory: ReadonlyMap<string, string> | null
): ActorDisplay;

/** ユーザー一覧を1回だけ引いて、id→今の名前の対応を作る。引けなかった・空のときは null（＝unknown 扱い） */
export async function loadActorDirectory(client: AnyClient): Promise<ReadonlyMap<string, string> | null>;

/** 上の2つをまとめた入口。履歴の行の配列に `actor`（ActorDisplay）を付けて返す。一覧は1回だけ引く */
export async function withActorDisplays<T>(
  client: AnyClient,
  rows: readonly T[],
  pick: (row: T) => { actorId: string | null | undefined; name: string }
): Promise<Array<T & { actor: ActorDisplay }>>;
```

- アプリ側は `await withActorDisplays(supabase, rows, (r) => ({ actorId: r.actorId, name: r.user }))` を呼んで、画面には `actorLabel(row.actor)` を出すだけ（解決の書き方がずれない）
- **純粋関数を分けて export** する理由: 画面のテスト・複数ページで一覧を共有したいとき（ダッシュボードの「最近の操作」など）に、DB を引かずに表示だけ決められる

#### 3-7-3. 動作の約束（共通部品に持たせる）

1. **ユーザー一覧は1回だけ引く**（`listPortalUsers` を1回。行の数にかかわらず問い合わせは1回）。`portal.users` は小さい（現在6人）ので、全件を引いて id→名前の対応を作る。必要な id だけに絞る（`in`）最適化は、ユーザー数が増えたら
2. **毎回引く・キャッシュなし**（認可と同じ。改名・削除がすぐ反映される）。渡す Supabase クライアントは**データキャッシュに載らないもの**（receipt-app の `authSupabase` と同じ `no-store`）にする。載ると、改名前の名前が出続ける（§7 の注意）
3. **サーバー専用**: `listPortalUsers` と同じく、ブラウザ側で呼ばれたら例外（`PortalUsersError`）。`authorizeActor` と同様、**ブラウザでの誤用を「引けなかった」に丸めない**（先に検査して投げる）
4. **失敗しても履歴は出す（認可と逆）**: 名前の解決は表示だけで、認可ではない。`PortalUsersError`（DB エラー）や一覧が空のときは、全行を `unknown`（記録時の名前）にして**画面は止めない**。
   空は異常（`portal.users` に管理者が最低1人いる前提）なので、「全員が削除済み」とは扱わない。想定外の例外は握りつぶさず再 throw
5. **ユーザー一覧そのものは返さない**: 返すのは、渡された行ごとの `ActorDisplay` だけ。他のユーザーの名前・ロール・ログインIDがクライアントへ渡らない
   （スタッフの `own` では、自分の行の自分の名前だけ。管理者でも、履歴に出る人の名前だけ）
6. **`sys_…` と null は一覧を引かずに決める**（`isSystemActor`。§3-6）。`sys_` のユーザーは `portal.users` に存在しない前提
7. **名前が空の現ユーザー**は、ログインIDを表示（3c が `name || loginId` で記録するのと同じ）。履歴の名前の検索・絞り込み（クライアント側）には、**解決後の表示名**を渡す（改名後の名前で探せる）
8. 解決は**範囲の判定（`historyAccess`）のあと**。`none` のときは履歴も読まず、解決もしない。`own` のときは、絞り込んだ行だけを解決する
9. **`actor_id` を持たないテーブル**（price-app の価格改定履歴 `price_history` など、操作者が名前だけのもの）には使わない。名前のままで、解決は不要（`actor_id` が無い＝`legacy` 扱いで記録時の名前を出す、と同じ結果になる）

#### 3-7-4. テスト方針

- 純粋関数 `displayActor`: 現ユーザー（名前が変わっていれば今の名前）／削除済み（記録時の名前＋`deleted`）／`sys_…`／null・undefined・空の `actor_id`／directory が null（`unknown`）／名前が空の現ユーザー（ログインIDに）。`actorLabel` は `deleted` のときだけ接尾辞が付く
- `loadActorDirectory`: 実際の supabase-js クライアント＋差し替えた fetch。**問い合わせが1回だけ**（行が多くても）、`Accept-Profile: portal`、DB エラー（500・通信失敗）→ null、空の一覧 → null、**ブラウザ側（`window` あり）では例外で、問い合わせもしない**、想定外の例外は再 throw
- `withActorDisplays`: 行の順序・元の項目が保たれる／改名後の名前が出る／削除済みに接尾辞／DB エラーのとき全行 `unknown` で例外にならない／一覧の中身（他のユーザーの情報）が結果に含まれない
- カバレッジ 100% を維持

#### 3-7-5. 共通部品に入れるかの判断（確定 2026-10-21、ユーザー判断）

- **入れる**（確定）: 3アプリが同じ表記（「(削除済み)」の文言・`sys_` の扱い・失敗時の挙動）になる。引けなかったときに「全行が削除済み」と出す実装のずれは、各アプリでは気づきにくい。
  `portalUsers.ts`（`listPortalUsers`）の上に載るだけで、新しい DB の依存は無い。不採用の案（各アプリが自分で書く）は、文言・失敗時・`sys_` の扱いがずれるため採らない
- **置き場所は新しい `admin-portal-shared/actorDisplay`**（`src/actorDisplay.ts`。確定）: 認可ではなく表示で、失敗時の方針が逆（認可は fail-closed、表示は続行）だから。`authorize` に混ぜない
- **引けなかったとき**（DB エラー・一覧が空）は、**記録時の名前で続行し、「(削除済み)」は付けない**（確定）。画面は止めない。空は異常（`unknown`）扱い
- **「旧: ○○」の併記は後回し**（確定）。`previousName` のような項目をあとから足せる形にしておく（足しても既存の呼び出しは壊れない）。最初の版には入れない
- **タグは v3.21 にまとめる**（確定）: 追加のみ（呼ばれなければ何も変わらない）ので、`historyScope` 系・`isSystemActor`・`actorDisplay` を**同じ v3.21** で出す（§7）
- 依存の順序: この解決は `actor_id` が書かれてから（②以降）意味を持つ。実際に呼ぶのは④（絞り込み）のデプロイ。それまでは記録時の名前をそのまま出す

## 4. `history.view`（権限）と、役割で固定する方式の関係

**確定（2026-10-20、ユーザー判断）**: `history.view` は**残す**（案 B）。案 A（廃止）は不採用（§4-8）。
あわせて方針: **システムごとに「残す・廃止」が分かれることは基本的になくす。分かれる場合は、ちゃんとした理由を設計書に書く**。
この方針に照らした例外は、receipt-app の1点だけ（§4-6）。未決定は無い（price-app の価格改定履歴は別権限 `pricehistory.view` に分ける、で確定。§4-9）。

### 4-1. 現状

| アプリ | `history.view` の中身 | 既定（管理者／スタッフ／閲覧のみ） | 使っている所 |
|---|---|---|---|
| payment-app（7権限） | 「操作履歴の画面を見る」 | 可／可／可（本番の `role_permissions` に行は無く、既定で動いている） | メニュー、`/payments/history` |
| price-app（6権限） | 「価格改定履歴・操作履歴の閲覧」（**2つの画面で1つの権限**） | 可／可／可 | メニュー2つ、`/history/prices`、`/history/actions` |
| receipt-app | **権限項目なし**（権限マトリクスの仕組み自体が無い） | — | 役割だけで決める（§4-6） |

### 4-2. 決まった意味（2つの軸を重ねる）

- `history.view` ＝ **「履歴の画面を開けるか」**。管理者・スタッフの欄に出る（下の固定を除き、設定できる）
- **見える範囲**（`all`/`own`/`none`）は `historyScope(role)` で**役割固定**（管理者=all・スタッフ=own・閲覧のみ=none）
- 実効 ＝ 両方の積。**`history.view` は範囲を広げられず、止めることだけできる**
  - スタッフ: `history.view`=可 → `own`／不可 → `none`
  - 閲覧のみ: `history.view` が可でも `none`（役割で固定）
  - 管理者: 常に `all`（◯固定。確定、§4-3）
  - 役割が不明・空: `none`（fail-closed）

| 役割 | `history.view` の欄 | 実効の範囲 |
|---|---|---|
| 管理者 | **◯に固定**（外せない）。確定 | `all` |
| スタッフ | 設定できる（既定 ◯） | ◯なら `own`、✕なら `none` |
| 閲覧のみ | **✕に固定**（◯にできない）。確定 | `none` |

### 4-3. 固定する欄

- **閲覧のみ＝✕に固定（確定）**: 書き込み系の権限と同じ方式（price-app の `PermissionsEditor` の `isLockedOff`、payment-app の同種の固定）。チェックボックスは無効化し、
  ツールチップ「閲覧のみでは、操作履歴は見られません（常に不可）」。保存済みの値が ◯ でも**実効は ✕**（`normalizeMatrix` 相当で表示も実効も ✕ に直す）
- **管理者＝◯に固定（確定。ユーザー判断 2026-10-20、price-app・payment-app 共通）**: 理由は3つ。(1) 管理者が自分の履歴の権限を外すと、**誰も全件を見られなくなる**（監査・調査のため）。(2) 既存の固定（price-app の `lockedOn`:
  「この権限は管理者から外せません」＝ユーザー管理・権限管理など）と同じ考え方。(3) 要件が「管理者=全件」と役割で定めている。
  管理者の欄を設定できるようにする案は、自分で自分を締め出せる／保存データの不整合で管理者が見られなくなる、という穴が残るため採らない
- **固定の判定は共通部品の1か所に置く（確定）**: `historyViewLock(role)` が、管理者="on"・閲覧のみ・不明・空="off"・スタッフ=null を返す（§4-4）。
  - 画面（チェックボックスの無効化・ツールチップ）とサーバー（実効の判定 `effectiveHistoryView`/`canViewHistory`/`historyAccess`）が**同じ関数**を見る。固定の定義が画面とサーバーでずれない
  - 管理者・閲覧のみの**保存済みの値は無視**される（管理者に `false`、閲覧のみに `true` が保存されていても、実効は固定のとおり）。行の書き換えは不要
  - 各アプリには、すでに固定の仕組みがある（price-app の `isLockedOn`/`isLockedOff`、payment-app の書き込み系の固定）。`history.view` の行は、アプリ側の固定表に**直接書かず**、`historyViewLock` を呼んで画面に反映する（固定の定義が2か所になって、ずれるのを避ける）
  - 固定を変えるとき（例: 将来、管理者の固定を外す）は、共通部品の1か所を直してタグを上げる。全アプリが追従すれば揃う
- **固定の判定は共通部品の1か所に置く**（`historyViewLock(role)`。§4-4）。画面（チェックボックスの無効化）とサーバー（実効の判定）が**同じ関数**を見るので、
  保存済みの値（古い行・直接書かれた値）に左右されない。固定された役割の保存値は**無視**される

### 4-4. 共通のヘルパー

```ts
/** history.view の欄の固定。管理者="on"（常に可）、閲覧のみ・不明・空="off"（常に不可）、スタッフ=null（設定できる） */
export type HistoryViewLock = "on" | "off" | null;
export function historyViewLock(role: string | null | undefined): HistoryViewLock;

/** 実効の history.view。固定があれば固定、無ければ granted === true のときだけ可（null・undefined・false は不可） */
export function effectiveHistoryView(role: string | null | undefined, granted: boolean | null | undefined): boolean;

/** 履歴の画面を開けるか（メニュー・ページの入口の判定）。= effectiveHistoryView */
export const canViewHistory = effectiveHistoryView;

/** データを読む側が使う。none なら DB を読まない、own なら actor_id=自分の id、all なら条件なし。役割固定の historyScope と history.view の積 */
export function historyAccess(
  user: { id: string; role: string } | null | undefined,
  granted: boolean | null | undefined
): HistoryAccess;
```

- `historyScope(role)`（§2-1）は**役割だけの上限**として残す（表示の説明などに使える）。`historyAccess` の第2引数 `granted` は**必須**（書き忘れを型で防ぐ）
- 実効の判定を**全アプリで同じ書き方**にする目的: 「`history.view` が可なら見える」「閲覧のみは別途塞ぐ」のような書き方の違いが、fail-open の穴（閲覧のみに ◯ が保存されていると見える等）になるのを避ける。
  アプリ側は `canViewHistory(role, matrix["history.view"])`（メニュー・入口）と `historyAccess(auth.user, matrix["history.view"])`（データ）を呼ぶだけにする
- 実効の判定に必要な `granted` は、各アプリが自分の `role_permissions`（既定値を含む）から取る。`granted` が取れなかった（DB エラー等）ときは `null`/`false` を渡す（スタッフは `none`。管理者は固定なので影響なし）
- ヘルパーは **DB を引かない・Next.js に依存しない**（§2-3 と同じ。ブラウザでも呼べる）。固定の定義は `PORTAL_ROLES` を使った `Record` で持ち、ロールを追加したとき型エラーで固定の決定を迫る
- 作らない案（不採用の理由）: ヘルパーなしで、各アプリが `role === "閲覧のみ" ? false : …` と書く。ロール追加・固定の変更のたびに全アプリを直すことになり、書き方もずれる
- 権限項目の無い receipt-app の使い方は §4-6

### 4-5. 権限画面の表示への影響

- 権限の行は、payment-app は**減らない**（7権限のまま）。price-app は価格改定履歴を別権限にするので **6 → 7**（§4-9）。変わるのは、`history.view` の行の**閲覧のみ ✕固定・管理者 ◯固定**と、**説明行**
- `history.view` の行の説明（権限の説明文、または行の下の補足）に、範囲を載せる:
  「管理者＝全件／スタッフ＝自分の操作だけ／閲覧のみ＝見られない（役割で固定）」。文言は `HISTORY_SCOPE_LABELS`（§2-2）で全アプリ揃える
- スタッフの欄の説明: 「◯でも見えるのは自分の操作だけです。✕にすると、操作履歴の画面を開けなくなります」（範囲は広げられない、を明記）
- 「閲覧のみに書き込み系の権限を設定しても無効」（v3.20 の README の注意）の隣に、「`history.view` は閲覧のみには付けられない」を並べる
  （price-app の画面の注記「書き込み系の権限は付けられず、常に不可です」に、履歴の一文を足す）

### 4-6. 例外: receipt-app は `history.view` を持たない（理由つき）

方針（システムごとに分けない）に対する、**唯一の例外**。

- **事実**: receipt-app には権限マトリクスの仕組み自体が無い（`role_permissions` も権限の編集画面も `normalizeMatrix` も無く、書き込みの可否を含め、すべてを**役割の1つのルール**で決める）。
  したがって `history.view` という「項目」を置く場所が無い
- **理由（例外として妥当と考える）**:
  1. 分かれているのは「履歴だけ」ではなく、**receipt-app では権限がすべて役割で決まる**から。編集・削除・取込にも設定は無い。履歴だけ設定可能にすると、receipt-app の中で履歴だけが特別な扱いになり、むしろ内側の一貫性が崩れる
  2. `history.view` のためだけに、権限の保存先・画面・正規化・テストを新設するのは過大（半日弱の履歴の実装に対して、権限の仕組み全体が付いてくる）
  3. 実害が小さい: 失うのは「管理者がスタッフの履歴閲覧を**止める**」運用だけ。スタッフに見えるのは**自分の操作だけ**（`own`）で、他人の情報は出ない。閲覧のみ・管理者の扱いは他アプリと同じ（役割で同じ）。スタッフは2人
- **弱い点（指摘）**: この理由は「分けるべき理由がある」ではなく「仕組みが無いから」であり、**恒久的な例外ではない**。
  - receipt-app が将来、権限マトリクスを導入するときは、**同時に `history.view` を足す義務**がある（その時点で例外は消える）。この設計書と receipt-app の README に、「権限マトリクス導入時に `history.view` を足す」と書く
  - `historyAccess(user, true)` のリテラル `true` は、のちのマトリクス導入時に**取りこぼしやすい**。receipt-app 側で名前付き定数（例: `const HISTORY_VIEW_NOT_CONFIGURABLE = true`）にして理由をコメントし、README にも書く。
    共通部品に「権限項目なし用」の別関数（`historyAccessByRole(user)`）を足す案もあるが、2つの入口があると書き方がずれるので、`granted: true` の明示にとどめる案を推す
  - 運用の差は残る: receipt-app だけ、スタッフが自分の履歴を必ず見られる。これを許容できない運用になったときは、役割の別ルールを足すのではなく、権限マトリクスを導入する
- 使い方: メニュー・ページの入口は `canViewHistory(role, true)`、データは `historyAccess(auth.user, true)`（閲覧のみ・不明な役割は `true` でも `none`＝固定が効く）。テストで、
  閲覧のみ→`none`、スタッフ→`own`、管理者→`all` を確認する（共通部品側のテストに加えて、receipt-app で1つ）
- **結論**: 例外の理由は十分（仕組みの有無という構造的な差で、挙動の差は「止める」運用だけ）。ただし「期限つきの例外」として、上の条件を設計書・README に残すことを条件にする

### 4-7. リスクと逆の変化

- **「新たに見える」リスクは無い**（案 A を採らない理由の1つ）: 本番の `role_permissions` に `history.view`=不可のスタッフがいても、そのまま不可として効く。
  payment-app は行なし（既定で動いている）を確認済み。price-app は行の有無が未確認だが、残すので影響は出ない
- **見えなくなる側の変化**: 既定で ◯ だった**閲覧のみ**は、実装後に履歴が見られなくなる（意図した変更。要件）。保存済みの閲覧のみの `history.view`=◯ は、実効 ✕ として扱う（行の書き換えは不要）
- 「スタッフの `history.view` を外すと、自分の履歴も見えなくなる」という組み合わせは、**意図した動作**（止めることだけできる）。画面の説明で明示する（§4-5）
- 範囲（`all`/`own`）はマトリクスの真偽値で表せないので、**半分が役割・半分が設定**になる点は残る。そのため、2つの軸を重ねる判定を共通部品の1か所に置く（§4-4）

### 4-8. 不採用: 案 A（`history.view` を廃止して役割で固定）

`history.view` を権限の一覧から外し、範囲を `historyScope(role)` だけで決める案。当初の推奨だったが、ユーザー判断（2026-10-20）で**不採用**。
理由: 管理者がスタッフの履歴閲覧を止められなくなる点、廃止すると本番の `history.view`=不可のスタッフが「新たに見える」リスクがあり、廃止前の読み取り確認が要る点。

### 4-9. price-app の価格改定履歴: 別権限 `pricehistory.view` を新設（確定 2026-10-20、δ）

**確定（ユーザー判断 2026-10-20）**: price-app の価格改定履歴（`price_history`）は、`history.view` から分けて**別の権限 `pricehistory.view`** にする（選択肢 2）。
この設計書の未決定は、これでなくなった。

- **経緯**: price-app の `history.view` は「価格改定履歴・操作履歴」の2画面で1つの権限だった。価格改定履歴は「操作履歴」ではなく**商品データの変更記録**で、
  ダッシュボードの「最近の価格変更」（`lib/insights.ts`）・商品詳細・価格一覧のチャネル別更新日にも出ている。`history.view` を閲覧のみ✕固定にすると、
  同じ権限の価格改定履歴の画面まで閲覧のみが見られなくなるため、分ける
- **決まった内容**:
  - `history.view` ＝ **操作履歴だけ**（payment-app と同じ意味になり、アプリ間で揃う。§4-2〜§4-5 の規則がそのまま適用される）
  - `pricehistory.view` ＝ **価格改定履歴の画面を開けるか**。**読み取り系の権限で、閲覧のみにも許可できる**（✕固定にしない）。範囲の概念は無く、**全件**（`all`/`own` の区別を持たない）
  - price-app の権限は **6 → 7**。価格改定履歴の見え方は、既定では今のまま（既定は全役割 ◯）
- **共通部品への影響: なし**。`pricehistory.view` は price-app だけの権限で、`historyScope`・`historyAccess`・`historyViewLock`・`canViewHistory` は `history.view`（操作履歴）専用のまま。
  役割による固定も、範囲（`own`）も無いので、共通の判定にする部分が無い。`actor_id` の追加（§3）の対象でもない（価格改定履歴の操作者名は表示用の名前のままで、絞り込みに使わない）。
  共通部品のタグ（v3.21）の内容は変わらない
- **price-app 側で決める・確認すること**（共通部品の外）:
  1. **既存の保存値の引き継ぎ**: 本番の `role_permissions` に `history.view`=不可 のスタッフがいると、これまで価格改定履歴も見られなかった。
     分離後は `pricehistory.view` の既定が ◯ なので、**そのスタッフが価格改定履歴を新たに見えるようになる**。実装前に `history.view` の保存値（行の有無・内容）を読み取りで確認し、
     行があるなら `pricehistory.view` に**同じ値を写す**（ユーザーが実行する SQL、または読み取り時の引き継ぎ）。行が無ければ影響なし
  2. **`pricehistory.view` が止めるもの**: 今、`history.view` で止まっているのは `/history/prices` の画面とメニューだけ（`history.view` を見ているのは `AppShell`・`/history/prices`・`/history/actions` の3か所）。
     ダッシュボード・商品詳細・価格一覧のチャネル別更新日は、権限を見ずに価格改定履歴を読んでいる。分離後も、`pricehistory.view` は**画面とメニューだけ**を止める形にすると見え方が変わらない。
     他の表示も止めるかは price-app の判断
  3. **管理者の `pricehistory.view`**: 自分で自分を締め出さないよう、◯固定にする案が自然（`history.view` と同じ理由）。ただし price-app だけの権限なので、固定の定義は price-app の既存の固定表（`lockedOn`）に置く
     （共通部品には入れない）。price-app の判断
  4. **閲覧のみの扱い**: 書き込み系ではないので、閲覧のみにも設定できる（✕固定にしない）。price-app の固定の仕組みは `write` フラグで書き込み系を固定している（`history.view` は `write: false` なので固定されない）。
     `history.view` の「閲覧のみ✕固定」は `historyViewLock` を呼んで反映する形にし、`pricehistory.view` は `write: false` の通常の読み取り系として置く
  5. **権限画面**: 7行になる。`history.view` の説明は「操作履歴の画面を見る」に、`pricehistory.view` の説明は「価格改定履歴の画面を見る」にする。`history.view` の行にだけ範囲の説明（§4-5）を載せる
- **検討した他の選択肢（不採用）**: 1＝価格改定履歴も操作履歴と同じ権限・範囲にする（`own`。価格一覧・商品詳細・ダッシュボードが人によって違って見えてしまう）、
  3＝`history.view` のまま範囲だけ制限しない（閲覧のみは価格改定履歴も見られなくなる）

## 5. 履歴の読み取り経路の洗い出し（共通の注意）

制限は、**履歴の画面だけに掛けても足りない**。履歴を読む経路を、アプリごとに全部洗い出す必要がある（読み取りの grep で確認した範囲）:

| アプリ | 履歴の画面 | それ以外の読み取り |
|---|---|---|
| payment-app | `/payments/history`（Server Component） | なし（設計書の確認どおり。履歴の API・CSV も無い） |
| receipt-app | `/history`（Server Component） | なし（設計書の確認どおり） |
| price-app | `/history/actions`・`/history/prices` | **`/products/[code]`（商品詳細）が `getActionHistory({ productCode })` と `getPriceHistory` を読み、全ロールに全履歴を渡している**（`history.view` の判定を通らない）。`/settings/users`（ユーザー管理）がログイン履歴（`action: "login"`）を読む（最終ログインの表示。ユーザー管理の権限が前提）。`lib/insights.ts`（ダッシュボード）が価格改定履歴の直近5件を読む |
| admin-portal | なし（`action_history` を読む箇所は無い） | — |

- price-app の商品詳細は、`own` を適用すると「その商品の履歴」が人によって違って見える。**商品詳細の履歴タブを制限の対象にするかは、ユーザーへの確認事項**
  （対象にしないなら、閲覧のみ・スタッフにも他人の名前と操作内容が見えたままになる＝要件の「見られない」と食い違う。対象にするなら、同じ `historyAccess` を通す）
- price-app の「ログイン履歴」はユーザー管理（管理者）の画面向けなので `all`。名前でなく `actor_id` で集計するようになると、改名しても最終ログインが追える
- 各アプリの実装では、`getActionHistory` の引数に `HistoryAccess` を必須にして、**呼び出し側が範囲を決めずに履歴を読めない**形にする（読み取り経路の増加への備え）

## 6. 本番切替の段取り（共通。確定 2026-10-20、ユーザー判断）

**確定**: 本番切替は**フラグなしの4段階**を全アプリ共通にする。環境変数のフラグ（price-app の `HISTORY_SCOPE_ENABLED` など）は**使わない**。戻しは Vercel の Instant Rollback。

| 段階 | 内容 | 実行する人 | 効果・戻し |
|---|---|---|---|
| ① | **DB**: `actor_id` 列と索引を足す（§3-3 の (A)） | ユーザー（SQL Editor） | 列が増えるだけ。今のアプリは動く。戻しは (E)（アプリを列を使わない版に戻してから） |
| ② | **デプロイ**: `actor_id` を**書くだけ**（新しい行に `actor_id` と名前を入れる。画面・権限の見え方は変えない） | アプリのセッション／ユーザー（Vercel） | 戻しは Instant Rollback（列が残っていても害は無い） |
| ③ | **DB**: 過去の行を埋める（§3-3 の (B1)〜(C)。確認→埋める） | ユーザー（SQL Editor） | ②のあとに行う（その間に増えた行も②で入るので、埋める対象は②より前の行だけ）。戻しは `actor_id` を null に戻す文 |
| ④ | **デプロイ**: **絞り込みを有効にする**（`historyAccess`・`canViewHistory`・`historyViewLock`・名前の解決・権限画面の変更をまとめて入れる） | アプリのセッション／ユーザー（Vercel） | ここで初めて見え方が変わる。戻しは Instant Rollback で②に戻す（全員が今までどおり見える状態）。そのあと本番確認（ユーザー。管理者=全件／スタッフ=自分の行だけ／閲覧のみ=見られない） |

- **順序の制約**: ①→②（列が無いまま②を出すと、履歴の書き込みが失敗し、登録などの操作がエラーになる）。②→③→④（④は埋め終えてから。埋める前に④を出すと、スタッフの履歴は旧行ぶん空に見える。意図した動作だが、③の確認結果を見てから出す）
- **「制限を外すフラグ」は作らない**: 環境変数の設定ミス・消し忘れで制限が外れる fail-open の経路になる。Vercel では環境変数を変えても再デプロイが必要で、戻す手間は Instant Rollback と同じ。
  段階を**デプロイで分ける**（②と④）ことで、戻しの単位が明確になる
- **price-app の `HISTORY_SCOPE_ENABLED` は使わない**: price-app の設計書にある、フラグ `=== "1"` のときだけ有効にする案（入荷の管理と同じ型）は、採らない。フラグ OFF の間の「従来どおりの挙動」を残す分岐
  （`history.view` と `pricehistory.view` の切り替え、閲覧のみのロックの有効化の同期など）が不要になる。④のデプロイで一緒に有効にする（price-app のセッションが設計書を直す）
- **price-app の追加の順序**: 価格改定履歴の別権限 `pricehistory.view`（§4-9）の値の引き継ぎ（`history.view` の保存値を写す SQL）は、④より前（③と同じ時期）に行う。④で `pricehistory.view` が効き始めるため
- **権限画面の変更**（閲覧のみ ✕固定・管理者 ◯固定・説明行）も④で入る。閲覧のみのロックが効く時点と、操作履歴が見えなくなる時点が同じ④になる

### 6-1. 共通部品側で必要な準備

- **v3.21 を取り込む（タグを上げる）だけでは、何も変わらない**。追加された関数（`historyScope`・`historyAccess`・`canViewHistory`・`historyViewLock`・`effectiveHistoryView`・`isSystemActor`・名前の解決）は、**呼ばれない限り挙動に影響しない**（既存の関数は変えない）。共通部品には環境変数もフラグも持たせない
- **`historyAccess` などが効き始めるのは、アプリが呼ぶ④から**。②は `actor_id` を書くだけで、読み取り側の関数は呼ばない
- **②に必要な共通部品は、すでに v3.20 にある**: `authorizeActor` の結果の `user.id` が `actor_id` に入れる値。つまり②だけなら v3.21 は要らない
- **v3.21 を取り込む時期**: ④より前に、**別のデプロイで**取り込むことを推奨する（②と同時、または②の前後）。理由: 2026-10-08 の障害（タグを上げたのに `version` が同じでビルドキャッシュが食い違った）の教訓で、共通部品の更新は
  **単独で本番に出して問題が無いことを確かめてから**、挙動を変える④を出す。④のデプロイをアプリのコードの変更だけにできる。追従の手順は README の「使い方（各アプリ側）」（`package-lock.json` の確認を含む）に従う
- 共通部品のタグ（v3.21）は**②か、その前**に入っていること（④に必須。取り込み時期は上のとおり）。3アプリが同じタグ（v3.21）に追従する順番は、管理セッションが調整
- 共通部品は**段階を知らない**: 「いま何段階目か」を持たず、アプリが④で呼び始めることで有効になる。共通部品にできる準備は、(1)追加のみであること、(2)`version` を上げること、(3)README に「②・④の段階と、呼ぶ時期」を書くこと、の3つ
- 共通部品を戻したいとき: 追加のみなので、アプリが④より前なら戻しても影響は無い。④以降は、アプリを Instant Rollback で②に戻せば、共通部品の呼び出しも消える（共通部品のタグはそのままでよい）

### 6-2. 実装順（承認済み 2026-10-21）と、v3.21 の中身

**実装はまだ開始しない**。本番の事前確認 SQL が済んでおらず、開始の合図は管理セッションから出る。

| 順 | 内容 | 担当 |
|---|---|---|
| A | **共通部品 v3.21**（追加のみ）を出す | このセッション（admin-portal-shared） |
| B | 3アプリで **①DB 列追加 → ②`actor_id` を書くだけのデプロイ**（②に必要な共通部品は v3.20 で足りる） | 各アプリ（①の SQL はユーザー） |
| C | 各アプリで **v3.21 を単独で取り込むデプロイ**（挙動は変わらない。§6-1） | 各アプリ |
| D | アプリごとに **③過去の行を埋める → ④絞り込みを有効にする**（順番: payment-app → receipt-app → price-app） | 各アプリ（③の SQL はユーザー） |
| E | price-app の**入荷の履歴**（11/19 以降） | price-app |

- A は B・C より前に済んでいればよい（B は v3.20 で足りるので、A と B は並行できる）。C の前に A が必要
- **v3.21 の中身（追加のみ）— すべて確定（2026-10-21、「確認待ち」は解消）**:

| 追加するもの | 根拠 |
|---|---|
| `historyScope(role)`（§2-1） | 各アプリの設計で一致。論点 1 で残すと確定 |
| `historyAccess(user, granted)` — own のとき `actorId` が必ず付く判別共用体（`all`／`own`+`actorId`／`none`）（§2-1・§4-4） | 論点 1 確定 |
| `historyViewLock`・`effectiveHistoryView`・`canViewHistory`（§4-4） | 案 B、管理者◯固定・閲覧のみ✕固定（確定） |
| `isSystemActor`・`SYSTEM_ACTOR_PREFIX`、`historyAccess` の `sys_` ガード（接頭辞だけで `none`、大文字小文字を区別しない）（§3-5・§3-6） | 論点 10・11 確定 |
| `actorDisplay`（`withActorDisplays`・`displayActor`・`loadActorDirectory`・`actorLabel`・`ACTOR_DELETED_SUFFIX`）（§3-7） | 論点 16〜19 確定 |
| `HISTORY_NONE_MESSAGE`・`HISTORY_SCOPE_LABELS`（§2-2） | 論点 7 確定 |

- **v3.21 に含まないもの**: `authorizeSystem`（システム用の認証。論点 15）、予約名の一覧（論点 12。ポータル側）、権限表（権限マトリクス）の判定ロジックの共通化（§10。別項目）、`createServiceClient` のキャッシュ設定（v3.22）、「旧: ○○」の併記（論点 19。後回し）
- **実装の開始の合図は、まだ出ていない**（本番の事前確認 SQL などが残っているため）。合図が出るまで実装しない。実装時の README・CHANGELOG・`package.json` の `version`（3.21.0）・`package-lock.json`・`tests/version.test.ts` は、通常のリリース手順に従う（タグを切るときは `version` も上げる）

## 7. タグの切り方（確定 2026-10-21）

**確定（ユーザー判断）**: 履歴まわりの追加は**すべて v3.21 にまとめる**（追加のみ）。`createServiceClient` のキャッシュ設定（`cache: "no-store"`）は**別の v3.22**。
以下は、分ける理由（この設計書での検討）。

- `historyScope`/`historyAccess` は**追加だけ**（純粋関数。呼ばれなければ何も変わらない）。影響が小さく、3アプリが待っている
- `createServiceClient` の既定を `cache: "no-store"` にする案は**挙動の変更**:
  - すべてのアプリの**すべての DB 読み取り**に効く。Next.js のデータキャッシュに載らなくなる（性能・DB 負荷が変わりうる）
  - Next.js では、`cache: "no-store"` の fetch を含む**静的に作られるはずのページが動的になる**ことがある（ビルド時の挙動が変わりうる）
  - アプリごとに、ビルドと主要画面の応答を確かめる必要がある（`createServiceClient` を使っている全箇所が対象）
- 同じタグにまとめると、(1) 履歴の追従のためにキャッシュの変更も受け取ることになり、問題が出たときに**戻す単位が大きくなる**
  （タグを戻すと両方失う）、(2) 履歴の実装（3アプリ待ち）が、キャッシュの確認で遅れる
- 順番は、**v3.21＝履歴まわりの追加（`historyScope` 系・`isSystemActor`・`actorDisplay`。追加のみ）、v3.22＝キャッシュの既定**（確定）。追加と変更を同じタグにしない
- **関連する注意（履歴の読み取りと `no-store`）**: receipt-app の `lib/supabase.ts` のコメントのとおり、Next 14 の Route Handler の中の fetch は
  `force-dynamic` でも同じ URL だとデータキャッシュに載りうる。履歴の `own` の問い合わせは URL に `actor_id=eq.<id>` が入るので、
  **別の人の結果が混ざることは無い**が、**自分の新しい操作が履歴に出ない（古い結果が返る）**可能性がある。
  履歴を読むページ・API は、各アプリで `force-dynamic` ＋ `fetchCache = "force-no-store"` を確認する（WORKFLOW.md の既存の注意と同じ）。
  キャッシュ案が入れば、この確認は不要になる。**履歴の実装は、キャッシュ案を待たずに進めてよい**（各アプリ側の設定で足りる）。
  ※この挙動は、このリポジトリでは実測していない（receipt-app のコメントと WORKFLOW.md の記録に依る）

## 8. 決める論点（ユーザーへ）

1. **共通部品の形**: **確定**（2026-10-21）= `historyScope(role)`（純粋関数）を残し、`historyAccess` は **own のときに `actorId` が必ず付く判別共用体**で返す（§2-1）
   各アプリの希望は前者のみ。後者は「own なのに id が無い」書き間違いを型で防ぐための追加（不要なら外せる）
2. **規約**: 列名 `actor_id`・text・外部キーなし・名前はスナップショット・キーは `portal.users.id`、を共通の規約にしてよいか（§3-1）
3. **SQL**: **確定**（ユーザー判断 2026-10-20）= 実行できる共通の関数は作らず、テンプレートの共有にとどめる（§3-2）。過去の行は、名前が現ユーザーちょうど1人に一致する行だけ `actor_id` を埋め、残りは null のまま（管理者のみ）。`login_id` の照合は不採用（名前のみ）。(B2)（名前と別人のログインIDの衝突の確認）は、埋める前の確認として含める（§3-3）
4. **`history.view`**: **確定**（ユーザー判断 2026-10-20）= 残す。意味は「履歴の画面を開けるか」、範囲は役割固定で止めることだけできる、閲覧のみ✕固定。案 A（廃止）は不採用（§4-8）。権限画面の説明行は `history.view` の行の説明として残す（§4-5）
4-1. **例外の確認**: receipt-app だけ `history.view` を持たない（権限マトリクスの仕組み自体が無い）。理由は十分と考えるが、期限つきの例外として「マトリクス導入時に `history.view` を足す」を設計書・README に残す条件つき（§4-6）
4b. **確定**: 管理者の `history.view` は◯に固定（ユーザー判断 2026-10-20、price-app・payment-app 共通）。固定の判定は共通部品の1か所（`historyViewLock`）に置く（§4-3）
4c. **組み合わせ判定の共通ヘルパー**（案 B 確定により採用前提）: `historyViewLock(role)`・`effectiveHistoryView`/`canViewHistory(role, granted)`・`historyAccess(user, granted)`（`granted` 必須。receipt-app は `true` を明示）を共通部品に置くか（§4-4）。置かない案は、各アプリが自分で「閲覧のみは別途塞ぐ」と書く（書き方がずれて穴になりうる）
5. **確定**: **price-app の価格改定履歴は別権限 `pricehistory.view` を新設**（ユーザー判断 2026-10-20、δ）。`history.view` は操作履歴だけになり payment-app と揃う。読み取り系で閲覧のみにも設定可、範囲は全件。共通部品への影響なし。price-app 側で、既存の `history.view` 保存値の引き継ぎ（不可のスタッフが新たに見えないように）などを確認する（§4-9）
6. **price-app の商品詳細の履歴タブ**（全ロールに全履歴を出している）: 制限の対象にするか（§5）。対象にしないと「閲覧のみは見られない」と食い違う
7. **共通メッセージ**: **確定**（2026-10-21）= `HISTORY_NONE_MESSAGE`・`HISTORY_SCOPE_LABELS` を共通部品に持つ（§2-2）
8. **タグ**: `historyScope` は v3.21 単独、キャッシュの既定は別のタグ（§7）でよいか
9. **本番切替**: **確定**（ユーザー判断 2026-10-20）= フラグなしの4段階を全アプリ共通にする（①DB列追加 ②`actor_id` を書くだけのデプロイ ③過去の行を埋める ④絞り込みを有効にするデプロイ。戻しは Instant Rollback）。price-app の `HISTORY_SCOPE_ENABLED` は使わない（§6）。共通部品は、v3.21 を取り込むだけでは挙動が変わらず、④でアプリが呼び始めて初めて効く（§6-1）
10. **システム用の操作者の規約**（§3-5）: **確定**（2026-10-21）= `sys_` の予約・形式（`^sys_[a-z0-9_]{1,32}$`）・null（照合できない旧行）とは別・「(削除済み)」を付けない
11. **`isSystemActor` を共通部品に置くか**（§3-6）: **確定** = 置く。`isSystemActor`・`SYSTEM_ACTOR_PREFIX`、`historyAccess` の `sys_` ガード（接頭辞だけで `none`）を含める。予約名の一覧は共通部品に持たない
12. **予約名・予約 id の防止**（§3-5 の 5）: **確定** = 予約名のユーザー作成防止は admin-portal（ポータル）へ依頼する。`portal.users.id` に `sys_` を許さない DB の CHECK は**見送り**
13. **履歴を残せなかったとき**: **確定** = MakeShop 連携の設計のときに決める（今は決めない）。要件は「履歴は必ず残す」
14. **人が始めた操作とシステムの操作の線引き**: **確定** = 人が押したボタンが動かす処理は人の id（システムが肩代わりしたときだけ `sys_…`）
15. **システム用の認証経路**（秘密のキー）: **確定** = この設計書の範囲外。共通部品に `authorizeSystem` を足すかは、MakeShop 連携の設計のときに決める
16. **操作者の名前の解決を共通部品に入れるか**: **確定**（2026-10-21）= 入れる（§3-7-5）
17. **置き場所**: **確定** = 新しい `admin-portal-shared/actorDisplay`（`authorize` に混ぜない）
18. **引けなかったとき**（DB エラー・一覧が空）: **確定** = 記録時の名前で続行し、「(削除済み)」は付けない
19. **「旧: ○○」の併記**: **確定** = 後回し（`previousName` をあとから足せる形にしておく）
20. **タグ**: **確定** = 履歴まわりの追加は v3.21 に全部まとめる。`createServiceClient` のキャッシュ設定は v3.22（§7）

## 9. 確認できていないこと

- システム用の操作者（§3-5）は、まだ誰も実装していない将来の要件の設計。MakeShop 連携の認証経路・履歴への書き込みの形は未設計
- `portal.users.id` が `sys_` で始まる行が、いま本番に無いことは未確認（読み取りが必要。`select id from portal.users where id like 'sys\_%' escape '\'`。ユーザーが実行）
- price-app の設計（`docs/design-history-scope.md`）は、この設計書の作成時点で未作成。§4-4・§5 の price-app の記述は、コードの読み取り（`app/`・`lib/`）に基づく
- price-app の `role_permissions` に `history.view` の行があるか（本番）は未確認。`history.view` 自体は残す（確定）ので、閲覧のみに ◯ が保存されていても実効は ✕、スタッフの不可はそのまま効く。
  ただし価格改定履歴を `pricehistory.view` に分けるため（§4-9）、**行があるなら、その値を `pricehistory.view` に引き継ぐ必要がある**（実装前の確認事項）
- `portal.users` の `login_id`/`login_key` の一意制約は、過去の行の照合（§3-3）には使わなくなった（名前のみ）。認可（`portalUsers.ts`）は `login_key` の等価で1行を期待している（従来どおり）

## 10. この設計書の範囲外（別項目）

- **権限表（権限マトリクス）の判定ロジックを共通部品へ寄せる提案**（receipt-app の提案。price-app・payment-app に同じコピーがある）は、操作履歴とは**別項目**として扱う（後日、ユーザーに確認）。
  **今回の v3.21 には含めない**。この設計書の `historyViewLock` などは `history.view` 専用で、権限表の共通化の前提にも依存にもしていない
  （将来、権限表の判定が共通化されたら、`historyViewLock` の固定の定義がその仕組みの一部になりうる。そのときに整理し直す）
- Next.js のデータキャッシュ（§7）の挙動は、このリポジトリでは実測していない
