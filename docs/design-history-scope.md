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
| 5 | `history.view` | **廃止して役割で固定**（payment-app の提案と同じ。例外: price-app は「価格改定履歴」が同じ権限を使っているので、別に決める）。権限画面は、読み取り専用の説明行に置き換える案 |
| 6 | 見落としやすい読み取り経路 | 履歴の画面以外にも履歴を読む所がある（price-app の商品詳細・ユーザー管理）。**同じ規則を通す**かの判断が要る（§5） |
| 6b | システム用の操作者 | `actor_id` が `sys_…` ならシステム用（予約）。null の旧行とは別。`isSystemActor(id)` の共通ヘルパーを1つだけ置く案（§3-5・§3-6） |
| 7 | タグ | `historyScope` は **v3.21 として単独**。`createServiceClient` の既定を `cache: "no-store"` にする案は**別のタグ**（§7） |

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
export function historyAccess(user: { id: string; role: string } | null | undefined): HistoryAccess;
```

- **内部の対応表は `Record<PortalRole, HistoryScope>`** にする。ロールを追加したとき、**型エラーで「履歴の範囲」を決めさせる**
  （今の README の「ロール追加は3か所」に、範囲の決定が漏れない。`canWrite` も同じ形に寄せられるが、v3.20 の挙動は変えない）
- `historyScope(role)`: 画面側（メニューを出すか）は role だけで足りる。payment-app・receipt-app の希望どおり
- `historyAccess(user)`: データを読む側（`getActionHistory`）が使う。`authorizeActor` の結果の `user` をそのまま渡せる
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
- `historyAccess`: 管理者→`{ scope: "all" }`（id があっても `actorId` を持たない）、スタッフ→`{ scope: "own", actorId: id }`、
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
- **できる**: 照合の SQL の**テンプレート**。payment-app の案が上位互換（名前→ログインIDの順）。置き換えるのは `<schema>.<table>` と `<名前の列>` だけ。
  実装時に README か `docs/` に載せる（§3-3）
- **アプリごとに違うまま**: テーブル名・列の構成（payment-app は `changes` jsonb、receipt-app は取込の `__000` 行）、DDL のマイグレーションファイル、
  上限件数、画面。これらは各アプリの設計のとおり

### 3-3. テンプレート（実行はユーザー。各アプリの設計書の SQL と同じ内容を一般化したもの）

```sql
-- (A) 列と索引（何度実行しても同じ。既存の行は変えない）
alter table <schema>.<table> add column if not exists actor_id text;
create index if not exists <table>_actor_date_idx on <schema>.<table> (actor_id, date desc);

-- (B1) 確認: portal.users に同じ名前の人がいないか（出たら、その名前は自動では埋めない）
select name, count(*) from portal.users group by name having count(*) > 1;

-- (B2) 確認: 名前が、ある人の「名前」と別の人の「ログインID」の両方に一致していないか
--      （出たら、名前の一致を優先すると別人の行を埋めてしまう。手で確認する）
select u1.name, u1.id as by_name, u2.id as by_login_id
from portal.users u1 join portal.users u2 on lower(u2.login_id) = lower(u1.name) and u2.id <> u1.id;

-- (B3) 確認: 履歴の名前ごとの件数と、照合の見込み（matched_by: name / login_id / ambiguous / none）
with names as (
  select <名前の列> as name, count(*) as rows from <schema>.<table> where actor_id is null group by <名前の列>
)
select n.name, n.rows,
  case
    when (select count(*) from portal.users u where u.name = n.name) = 1 then 'name'
    when (select count(*) from portal.users u where u.name = n.name) > 1 then 'ambiguous'
    when (select count(*) from portal.users u where lower(u.login_id) = lower(n.name)) = 1 then 'login_id'
    else 'none'
  end as matched_by
from names n order by n.rows desc;

-- (C) 埋める（トランザクション。埋まらなかった行を確かめてから commit。違えば rollback）
begin;
update <schema>.<table> h set actor_id = u.id::text
  from portal.users u
 where h.actor_id is null and u.name = h.<名前の列>
   and (select count(*) from portal.users u2 where u2.name = h.<名前の列>) = 1;
update <schema>.<table> h set actor_id = u.id::text
  from portal.users u
 where h.actor_id is null and lower(u.login_id) = lower(h.<名前の列>)
   and not exists (select 1 from portal.users u3 where u3.name = h.<名前の列>);
select <名前の列>, count(*) from <schema>.<table> where actor_id is null group by <名前の列>;
commit;  -- 問題があれば rollback;

-- (E) 戻し（アプリを、actor_id を書かない版に戻してから。先に列を消すと履歴の書き込みが失敗する）
-- drop index if exists <schema>.<table>_actor_date_idx;
-- alter table <schema>.<table> drop column if exists actor_id;
```

- ログインIDの照合（2本目の update）は、名前が空だったときに 3c 以降が記録する `name || loginId` を拾うため。receipt-app の案には無いので、
  receipt-app は「あっても害は無い」ことを確認して揃えるか、名前のみのままにするかを選ぶ（本番の名前が `portal.users` のログインIDと一致するかは、(B3) で分かる）
- **(B2) は、この設計書で足した確認**。「名前」と「ログインID」が別の人で一致していると、名前の照合が別人の行を埋める。
  その場合スタッフが他人の行を見てしまう（制限の目的に反する向きの誤り）ので、埋める前に必ず見る
- `login_id` の照合は `login_key`（`lower(login_id)` の生成列）でも同じ。一意制約がある前提（`portal.users` のスキーマは変えない）

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
| 5 | ユーザー管理で、予約名（「MakeShop連携」等）のユーザーを作れないようにする | 履歴の表示上、人の「MakeShop連携」とシステムの「MakeShop連携」が見分けられなくなるのを防ぐ。**admin-portal のユーザー管理の変更**（別セッション）。予約名の一覧は共通部品に**入れない**（連携を足すたびに共通部品のタグが要るため）。admin-portal 側の定数か、名前の登録時の検査にする案。同時に `portal.users.id` に `sys_` を使えない検査（id は生成なので通常は不要だが、DB の CHECK で `id not like 'sys\_%' escape '\'` を足す案）も |
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

## 4. `history.view`（権限）と、役割で固定する方式の関係

### 4-1. 現状

| アプリ | `history.view` の中身 | 既定（管理者／スタッフ／閲覧のみ） | 使っている所 |
|---|---|---|---|
| payment-app（7権限） | 「操作履歴の画面を見る」 | 可／可／可（本番の `role_permissions` に行は無く、既定で動いている） | メニュー、`/payments/history` |
| price-app（6権限） | 「価格改定履歴・操作履歴の閲覧」（**2つの画面で1つの権限**） | 可／可／可 | メニュー2つ、`/history/prices`、`/history/actions` |

`history.view` は真偽値で、「全件」「自分の分」を表せない。役割で範囲が決まる（管理者=all・スタッフ=own・閲覧のみ=none）ので、
真偽値の列で選べる余地は**スタッフの on/off だけ**になる（管理者は常に可、閲覧のみは常に不可、が3c の「閲覧のみは役割で固定」と同じ考え）。

### 4-2. 案（比較）

| 案 | 内容 | 良い点 | 悪い点 |
|---|---|---|---|
| **A（推奨）廃止して役割で固定** | `history.view` を権限の一覧から外す。範囲は `historyScope(role)` だけで決まる | 範囲の決め方が1つ（全アプリ同じ）。「スタッフの history.view を外すと自分の履歴も見えない」という組み合わせが無くなる。マトリクスの「無効な設定」が増えない | 管理者が「スタッフの履歴閲覧だけ止める」ことはできなくなる（要件に無い） |
| B 意味を変えて残す | `history.view` を「スタッフ以上のみ・可否を管理者が決める」に変える（実効 = 役割の範囲 かつ `history.view`。閲覧のみの列は不可に固定） | スタッフの履歴閲覧を管理者が止められる | 画面に「不可に固定の列」ができ、3c の「閲覧のみ書き込み不可」と同種の優先ルールが増える。範囲（all/own）はマトリクスで表せないので、半分だけ役割・半分だけ設定になる |
| C そのまま残して範囲を重ねる | 今の `history.view` に、`own` の絞り込みを足すだけ | 変更が小さい | 「閲覧のみに history.view を許可 → 見えてしまう」を別途塞ぐ必要がある（要件に反する）。結局、閲覧のみを役割で固定する必要が出て B になる |

- **A を推奨**。理由: 要件が役割で全部決まっている／ほかの権限と違い、履歴は「許可の粒度」より「誰のものか」で決まる／
  設定が減るほど、アプリ間の違い（fail-open になりうる場所）が減る
- 本番の `role_permissions` に `history.view` の行がある場合は、廃止後は**無視される**（`normalizeMatrix` が知らない権限を捨てる）。
  行を消す SQL は任意（残っていても害は無い）。**行があって `false` のスタッフがいる場合**は、廃止すると見えるようになるので、
  廃止の前に各アプリで `role_permissions` を読み取りで確認する（payment-app は行なしを確認済み。price-app は未確認 → price-app への確認事項）

### 4-3. 権限画面の表示への影響

- 権限の行が1つ減る（payment-app: 7→6。price-app: §4-4 の判断による）
- 行が消えるだけだと「履歴は誰が見られるのか」が画面から分からなくなる。**読み取り専用の説明行**を権限画面の下に置く案:
  「操作履歴: 管理者＝全件／スタッフ＝自分の操作だけ／閲覧のみ＝見られない（役割で固定。ここでは変更できません）」。
  文言は `HISTORY_SCOPE_LABELS`（§2-2）で全アプリ揃える
- 「閲覧のみに書き込み系の権限を設定しても無効」（v3.20 の README の注意）と同様に、画面の注記に並べる

### 4-4. price-app だけの論点

- price-app の `history.view` は**価格改定履歴**（`price_history`）にも使われている。これは「操作履歴」ではなく**商品データの変更記録**で、
  ダッシュボードの「最近の価格変更」（`lib/insights.ts`）・商品詳細・価格一覧のチャネル別更新日にも出ている。
  `own`（自分の操作だけ）にすると、価格一覧や商品詳細が人によって違う内容になり、ダッシュボードの集計も揃わなくなる
- 要件（ユーザーのメモ）は「**操作履歴**」。価格改定履歴を範囲に含めるかは**ユーザーに確認が必要**。案:
  - 価格改定履歴は対象外（今の全員の閲覧のまま。`history.view` は価格改定履歴のためだけに残す）か、
  - 価格改定履歴も同じ範囲にする（商品詳細・ダッシュボード・価格一覧の「最後に変わった日」は操作者を含まない形にする）
- 対象外にした場合、`history.view` は「廃止」ではなく「価格改定履歴の閲覧」に意味を変えて残る（案 A と案 B の中間）。price-app の設計の判断

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

## 6. 本番切替の段取り（共通）

payment-app の案（フラグを使わず、順番に3回に分ける）を共通の原則にすることを提案する:
(1) DB: 列と索引を足す（今のアプリは動く）→ (2) デプロイ1: 新しい行に `actor_id` を入れる（画面は変えない）→
(3) DB: 確認→埋める → (4) デプロイ2: 絞り込みを有効にする → (5) 本番確認（ユーザー）。

- 戻しは Instant Rollback（デプロイ1に戻れば、全員が今までどおり見える状態）。列を消す SQL は、アプリを列を使わない版に戻してから
- 「制限を外すフラグ」は作らない（残ると fail-open の経路になる）
- 共通部品のタグ（v3.21）は**デプロイ1より前**に入っていること。3アプリが同じタグ（v3.21）に追従する順番は、管理セッションが調整
- 共通部品は、`historyScope`/`historyAccess` が入っただけでは**何も変えない**（呼ばれない限り挙動に影響なし）。追従しても、アプリ側がデプロイ2まで呼ばなければ今のまま

## 7. タグの切り方（v3.21 の `cache: "no-store"` 案との関係）

**別のタグにすることを推奨**する。

- `historyScope`/`historyAccess` は**追加だけ**（純粋関数。呼ばれなければ何も変わらない）。影響が小さく、3アプリが待っている
- `createServiceClient` の既定を `cache: "no-store"` にする案は**挙動の変更**:
  - すべてのアプリの**すべての DB 読み取り**に効く。Next.js のデータキャッシュに載らなくなる（性能・DB 負荷が変わりうる）
  - Next.js では、`cache: "no-store"` の fetch を含む**静的に作られるはずのページが動的になる**ことがある（ビルド時の挙動が変わりうる）
  - アプリごとに、ビルドと主要画面の応答を確かめる必要がある（`createServiceClient` を使っている全箇所が対象）
- 同じタグにまとめると、(1) 履歴の追従のためにキャッシュの変更も受け取ることになり、問題が出たときに**戻す単位が大きくなる**
  （タグを戻すと両方失う）、(2) 履歴の実装（3アプリ待ち）が、キャッシュの確認で遅れる
- 順番は、**v3.21=`historyScope`（追加のみ）、v3.22=キャッシュの既定**を提案。ただし管理セッションが先にキャッシュ案を指示済みで、
  タグ番号が決まっているなら、番号は入れ替えてよい（追加と変更を同じタグにしないことだけが要点）
- **関連する注意（履歴の読み取りと `no-store`）**: receipt-app の `lib/supabase.ts` のコメントのとおり、Next 14 の Route Handler の中の fetch は
  `force-dynamic` でも同じ URL だとデータキャッシュに載りうる。履歴の `own` の問い合わせは URL に `actor_id=eq.<id>` が入るので、
  **別の人の結果が混ざることは無い**が、**自分の新しい操作が履歴に出ない（古い結果が返る）**可能性がある。
  履歴を読むページ・API は、各アプリで `force-dynamic` ＋ `fetchCache = "force-no-store"` を確認する（WORKFLOW.md の既存の注意と同じ）。
  キャッシュ案が入れば、この確認は不要になる。**履歴の実装は、キャッシュ案を待たずに進めてよい**（各アプリ側の設定で足りる）。
  ※この挙動は、このリポジトリでは実測していない（receipt-app のコメントと WORKFLOW.md の記録に依る）

## 8. 決める論点（ユーザーへ）

1. **共通部品の形**: `historyScope(role)`（純粋関数）＋ `historyAccess(user)`（own のとき `actorId` を持つ判別共用体）の2本立てでよいか（§2-1）。
   各アプリの希望は前者のみ。後者は「own なのに id が無い」書き間違いを型で防ぐための追加（不要なら外せる）
2. **規約**: 列名 `actor_id`・text・外部キーなし・名前はスナップショット・キーは `portal.users.id`、を共通の規約にしてよいか（§3-1）
3. **SQL**: 実行できる共通の関数は作らず、テンプレートの共有にとどめてよいか（§3-2）。テンプレートに (B2)（名前と別人のログインIDの衝突の確認）を足してよいか
4. **`history.view`**: 廃止して役割で固定（推奨）でよいか（§4-2）。権限画面に読み取り専用の説明行を出すか（§4-3）
5. **price-app の価格改定履歴**: 対象外（全員が今のまま見る）か、同じ範囲にするか（§4-4）。要件は「操作履歴」
6. **price-app の商品詳細の履歴タブ**（全ロールに全履歴を出している）: 制限の対象にするか（§5）。対象にしないと「閲覧のみは見られない」と食い違う
7. **共通メッセージ**: `HISTORY_NONE_MESSAGE`・`HISTORY_SCOPE_LABELS` を共通部品に持つか（§2-2）
8. **タグ**: `historyScope` は v3.21 単独、キャッシュの既定は別のタグ（§7）でよいか
9. **本番切替**: フラグなしで DB→デプロイ1→埋める→デプロイ2、を3アプリの共通の原則にしてよいか（§6）
10. **システム用の操作者の規約**（§3-5）: `sys_` の予約・形式（`^sys_[a-z0-9_]{1,32}$`）・null とは別・「(削除済み)」を付けない、でよいか
11. **`isSystemActor` を共通部品に置くか**（§3-6）: 置く案（接頭辞を1か所に。`historyAccess` は接頭辞だけで none）か、各アプリが `startsWith("sys_")` と書く案か。予約名の一覧は共通部品に持たない
12. **予約名・予約 id の防止**（§3-5 の 5）: 予約名のユーザーを作れない検査と、`portal.users.id` に `sys_` を許さない DB の CHECK を、admin-portal（別セッション）に依頼するか
13. **履歴を残せなかったとき**: システム操作の本体は成功し、履歴の書き込みだけ失敗した場合に、操作を失敗にする（履歴なしの操作を許さない）か、続行して警告を残すか。要件は「履歴は必ず残す」。同じトランザクションにできるか、アプリごとの確認が要る
14. **人が始めた操作とシステムの操作の線引き**: 人が押したボタンがバッチを動かす場合は人の id（システムが肩代わりしたときだけ `sys_…`）でよいか
15. **システム用の認証経路**（秘密のキー）: この設計書の範囲外。共通部品に `authorizeSystem`（キーの検証・タイミング攻撃に強い比較）を足すかは、MakeShop 連携の設計のときに決める

## 9. 確認できていないこと

- システム用の操作者（§3-5）は、まだ誰も実装していない将来の要件の設計。MakeShop 連携の認証経路・履歴への書き込みの形は未設計
- `portal.users.id` が `sys_` で始まる行が、いま本番に無いことは未確認（読み取りが必要。`select id from portal.users where id like 'sys\_%' escape '\'`。ユーザーが実行）
- price-app の設計（`docs/design-history-scope.md`）は、この設計書の作成時点で未作成。§4-4・§5 の price-app の記述は、コードの読み取り（`app/`・`lib/`）に基づく
- price-app の `role_permissions` に `history.view` の行があるか（本番）は未確認（読み取りが必要。確認はアプリ側のセッション）
- `portal.users` の `login_id`/`login_key` の一意制約は、receipt-app・payment-app の設計書の前提に依る（このリポジトリの `portalUsers.ts` は `login_key` の等価で1行を期待している）
- Next.js のデータキャッシュ（§7）の挙動は、このリポジトリでは実測していない
