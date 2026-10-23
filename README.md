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
`format`・`supabase`・`portalUsers`・`authorize`（差し替えたfetchで）・`systemActor`・`actorDisplay`・`permissions`（差し替えたfetchで）・`search`・`components/ui`の`createUiKit()`が返す文字列・`components/StickyActionBar`・`components/SearchValue`・`components/SearchInput`・`components/FilterResetLink`のクラス組み立て）。UIコンポーネント自体の
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
- `portalUsers`: ユーザーとロールの割当（`portal.users`）を読む共通処理（v3.16〜、アカウント一元化フェーズ3）。
  権限マトリクス（ロールごとの機能のON/OFF）は各アプリに残り、ここでは扱わない。**サーバー専用**
  （API Route・Server Componentなど。**Edgeのmiddlewareでは呼ばない**: Supabaseクライアントがwsに依存）。
  - `resolvePortalUser(client, loginId)`: ログインID（JWTクレームの`sub`と同じ。大文字小文字は区別しない）から
    現在のユーザー`{ id, loginId, name, role }`を引く。**存在しなければ`null`**（未登録・削除済み・形式が不正）。
    `login_key`（= `lower(login_id)`の生成列）で照合し、`name`では照合しない（改名できるため）。ログインIDが
    `portal.users`の形式（英数字・`.`・`_`・`-`、1〜32文字）でなければDBに問い合わせず`null`
  - `listPortalUsers(client)`: 全ユーザーをログインID順で返す
  - `PortalUsersError`: **DBエラー**（接続失敗・`portal`が公開されていない等）で投げる。`code`（PostgRESTのコード、
    例: スキーマ未公開は`PGRST106`）と`cause`を持つ。**「存在しない」は`null`、「DBエラー」は例外**と区別できる。
    拒否するかどうか（全拒否=fail-closed、503にする等）は呼び出し側が行う
  - 毎回引く（キャッシュなし。JWTのスナップショットを信用しない）ので、ロール変更・削除が即時に反映される。
    supabase-jsのGETの自動リトライ（障害時に最大約7秒待たされる）は無効にしてあり、失敗はすぐ例外になる
  - **接続の渡し方**: 各アプリが既に持っているservice_roleのSupabaseクライアント（`createServiceClient`が返すもの。
    既定のスキーマはprice・receipt・payment等のままでよい）を引数で渡す。このモジュールはURL・キーを受け取らず・
    保持せず・環境変数も読まない（キーを扱う場所を`createServiceClient`だけに限る）。必ず`portal`スキーマを明示して
    読むので、クライアントの既定スキーマのテーブルを誤って読むことはない。ブラウザ側（`window`がある環境）で
    呼ばれたら実行時に例外にする。**Supabaseの「Exposed schemas」に`portal`の追加が必要**
  - ユーザーの作成・更新・削除（と`user_history`の監査ログ）は、admin-portalの管理画面だけが使うためここには入れず、
    admin-portal側に置く（書き込みの入口を1か所にする）。`PortalUser.role`は`string`のまま。ロールの3値の定義と
    書き込み可否は、v3.20の`authorize`が持つ
  ```ts
  import { createServiceClient } from "admin-portal-shared/supabase";
  import { resolvePortalUser, PortalUsersError } from "admin-portal-shared/portalUsers";

  const supabase = createServiceClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { schema: "price" });

  // API Route / Server Component（verifySessionで得たclaims.subを渡す）
  try {
    const user = await resolvePortalUser(supabase, claims.sub);
    if (!user) return deny(401); // 存在しない（削除済みなど）→ 拒否（判断は呼び出し側）
    // user.role で権限マトリクスを引く。引けないロールも全拒否にする（fail-closed）
  } catch (e) {
    if (e instanceof PortalUsersError) return deny(503); // DBエラー → 拒否して503
    throw e;
  }
  ```
  Vitestは、実際のsupabase-jsクライアント＋差し替えたfetchで、送られるリクエスト（`Accept-Profile: portal`・
  `login_key`のフィルター）、`null`と`PortalUsersError`の区別、形式が不正なログインID（ケルビン記号等）の拒否、
  ブラウザ側での呼び出しの拒否を検証（`tests/portalUsers.test.ts`）。
- `authorize`: 全アプリ共通の「毎回引く」認可（v3.20〜、アカウント一元化フェーズ3の3c）。リクエストごとに`portal.users`を
  引き（キャッシュなし。削除・ロール変更が即時に反映される）、結果を共通の形で返す。**すべて全拒否（fail-closed）**。
  サーバー専用（API Route・Server Component）。**Edgeのmiddlewareでは呼ばない**。ブラウザ側で呼ばれたら実行時に例外。
  リトライなし。**JWTの`role`クレームは参照しない**（ロールは常に`portal.users`の現在の値）。`verifySession`は各アプリのまま行い、
  得られた`sub`を渡す。内部で`resolvePortalUser`（v3.16）を再利用する
  - `authorizeActor(client, loginId)`: ユーザーの存在とロール（3値）を確認する。読み取りの入口用。`loginId`は`claims.sub`
  - `authorizeWrite(client, loginId)`: 上に加えて、**「閲覧のみ」を書き込み不可として拒否**する。書き込み（編集・取込・削除など）の
    入口用。どのAPIが書き込みかの分類は各アプリが決める（CSV出力のような読み取りは`authorizeActor`）
  - 戻り値は`{ ok: true, user: { id, loginId, name, role } }`か`{ ok: false, reason, status, message }`。`user.role`は
    `PortalRole`（3値）であることが保証される。`authFailureBody(result)`で`{ error, code }`のJSON本文にでき、
    `NextResponse.json(authFailureBody(r), { status: r.status })`のように使う（共通部品はNext.jsに依存しない）
  - 拒否の種類（`reason`）とHTTPステータス:

    | reason | status | 場合 |
    |---|---|---|
    | `unauthenticated` | 401 | `loginId`が無い（`null`・`undefined`・空文字。セッションが無効） |
    | `unregistered` | 401 | `portal.users`に無い（削除済み・ログインIDの形式が不正を含む）。**ログアウト扱い**（ページは呼び出し側がログアウトへ遷移） |
    | `unavailable` | 503 | DBエラー（`PortalUsersError`: 接続失敗・`portal`スキーマが公開されていない等） |
    | `invalid_role` | 403 | ロールが3値以外・空 |
    | `read_only` | 403 | `authorizeWrite`だけ。ロールが「閲覧のみ」 |
  - **利用者向けのメッセージは`AUTH_FAILURES`（`status`と`message`）の1か所**にまとめてある。文言を変えるときはここだけ
    （ユーザーが後で確認する予定）
  - **ロール**: `PORTAL_ROLES`（「管理者」「スタッフ」「閲覧のみ」。DBのCHECK制約と同じ）、`PortalRole`、`isPortalRole(x)`、
    `canWrite(role)`（管理者・スタッフは可、閲覧のみ・不明・空・`null`・`undefined`は不可）。**ロールを追加するときは、3か所を直すこと**:
    (1)DBの`portal.users`のCHECK制約（`users_role_known`） (2)この定数（`PORTAL_ROLES`・`canWrite`） (3)各アプリの権限マトリクス
  - **fail-open だった所が拒否になる**: 以前は、アプリによって「DBエラーでロールを引けなければ全許可」「未知のロール・ロールが空なら
    全許可」「ユーザー表が空なら既定のゲスト（管理者）で全許可」「JWTのロールを最大90日そのまま信頼（削除・ロール変更が反映されない）」
    「ユーザー・権限の仕組みが無い」などの違いがあった。この関数を使うと、すべて拒否（DBエラーは503、ロール不明は403、
    ユーザー不在は401）に統一される
  - **前提: `portal.users`に管理者が最低1人いること**（現在は管理者3人）。ユーザー表が空・該当者なしだと、全員が`unregistered`（401）で
    締め出される（ゲストの代替は無い）。ローカル開発・テスト環境に`portal`スキーマが無いと、全リクエストが`unavailable`（503）になる
    （迂回の仕組みは入れていない。テストは共通部品をスタブ・モックする）
  - **アプリ側の注意**: **「閲覧のみ」の書き込み不可は、各アプリの権限マトリクスより優先する**（`authorizeWrite`が先に拒否する）。
    price-app・payment-appでは、権限設定の画面で閲覧のみに書き込み系の権限を設定できても無効になる。この矛盾の扱い
    （画面で、閲覧のみの書き込み系をロックするなど）は各アプリで決める。アプリ固有の細かい権限は、これまでどおりマトリクスで
    重ねる（ロールは`authorizeWrite`の結果の`user.role`で引く）。同一リクエスト内の重複（layout・page・APIなど）は、各アプリで
    Reactの`cache()`で包めば1クエリに減らせる（共通部品はフレームワーク非依存のため入れていない）
  ```ts
  import { createServiceClient } from "admin-portal-shared/supabase";
  import { authorizeActor, authorizeWrite, authFailureBody } from "admin-portal-shared/authorize";

  const supabase = createServiceClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { schema: "receipt" });

  // 書き込みAPIの入口（receipt-app・price-app・payment-app共通）
  const claims = await verifySession(token); // 各アプリのまま。無効なら401
  const auth = await authorizeWrite(supabase, claims?.sub);
  if (!auth.ok) return NextResponse.json(authFailureBody(auth), { status: auth.status });
  // price-app・payment-app: ここに、アプリごとの権限マトリクス（auth.user.role で引く）を重ねる

  // 読み取りAPI・ページ: 存在確認とロールの確認だけ
  const read = await authorizeActor(supabase, claims?.sub);
  ```
  Vitestは、実際のsupabase-jsクライアント＋差し替えたfetchで、未登録・DBエラー（500・PGRST106・通信失敗）・ロール不明（空・表記違い・
  null）・閲覧のみ・大文字小文字の違うログインID・毎回引くこと・ロール変更の即時反映・想定外の例外の再throw・ブラウザ側での呼び出しの
  拒否を検証（`tests/authorize.test.ts`）。
- **操作履歴を権限で制限する部品**（v3.21〜、`authorize`・`systemActor`・`actorDisplay`。設計は`docs/design-history-scope.md`）。
  **追加のみ**（既存の関数は変えていない）。**v3.21を取り込んだだけでは、アプリの挙動は何も変わらない**（呼ばれない限り影響しない）。
  効き始めるのは、アプリが読み取り側でこれらを呼ぶ段階（本番切替の④。下の「呼ぶ時期」）から。環境変数・フラグは持たない
  - **管理者=全件／スタッフ=自分の操作だけ／閲覧のみ=見られない**。履歴の操作者は名前ではなく**`portal.users.id`**（`actor_id`列）で管理する
  - `historyScope(role)`: 役割だけで決まる範囲の上限（`"all"`／`"own"`／`"none"`）。管理者=all、スタッフ=own、閲覧のみ・不明・空・`null`・
    `undefined`=none（fail-closed）。DBを引かない純粋な関数で、**ブラウザ側（メニューの出し分け）でも呼べる**（`window`の検査は無い）。
    内部は`Record<PortalRole, …>`なので、ロールを追加すると型エラーで範囲と固定を決めさせる
  - `historyViewLock(role)`: 各アプリの権限`history.view`（「履歴の画面を開けるか」）の欄の固定。管理者=`"on"`（常に可）、閲覧のみ・不明・空=`"off"`
    （常に不可）、スタッフ=`null`（設定できる）。**画面（チェックボックスの無効化）とサーバー（実効の判定）が同じ関数を見る**。固定された
    役割の保存済みの値は**無視**される。各アプリの固定表に`history.view`を直接書かず、これを呼んで反映する
  - `effectiveHistoryView(role, granted)`／`canViewHistory`（同じ）: 実効の`history.view`。固定があれば固定、無ければ`granted === true`のときだけ可。
    メニュー・ページの入口の判定に使う。**権限項目の無いアプリ（receipt-app）は`granted`に`true`を明示する**（名前付き定数にして理由をコメントすること。
    将来、権限マトリクスを導入するときは同時に`history.view`を足す）
  - `historyAccess(user, granted)`: **データを読む側が使う**。範囲（役割固定）と`history.view`（`granted`。**必須**）の積。結果は判別共用体で、
    **`own`のときは`actorId`が必ず付く**（`{ scope: "all" }`／`{ scope: "own", actorId }`／`{ scope: "none" }`）。`authorizeActor`の結果の`user`を
    そのまま渡せる（認可に失敗したときは`null`→none）。`history.view`は範囲を**広げられず、止めることだけできる**。
    **idが`sys_`で始まる「ユーザー」は役割にかかわらずnone**（人のセッションがシステムの行を名乗れない）。idが空・文字列でなくてもnone
  - **絞り込みを問い合わせに付ける処理は共通部品に入れていない**（各アプリのクエリが違うため）。次の約束を守る:
    1. `none`は**DBを読まない**（空、または`HISTORY_NONE_MESSAGE`の案内）
    2. `own`は`actor_id = access.actorId`を**問い合わせの条件**にしてから`order`・`limit`（画面側で隠さない。他人の行をサーバーから出さない）
    3. `all`は条件なし（`actor_id`がnullの行も含む）
    4. キーは**必ず`portal.users.id`**（ログインID・名前では絞らない。ログインIDは再利用されうる。名前は改名で変わる）
    5. **ブラウザ側で出し分けても、強制は必ずサーバー側**。メニューを消すだけでは見えてしまうので、データを読む関数（Server Component・API）が
       `historyAccess`を通すこと。履歴を読む画面以外（商品詳細・ダッシュボードなど）も、履歴を出すなら同じ判定を通す
  - `HISTORY_NONE_MESSAGE`（「閲覧のみの権限では、操作履歴は見られません」）と`HISTORY_SCOPE_LABELS`（全件／自分の操作だけ／見られない）:
    画面の文言を全アプリでそろえる。`HISTORY_NONE_MESSAGE`は閲覧のみ向けの文言なので、**スタッフが`history.view`を✕にされて見られない場合は、
    アプリ側で別の案内（例: 権限が無い）を出す**こと
  - `admin-portal-shared/systemActor`: **システム用の操作者**（人がログインしていない操作: 将来のMakeShop連携のAPI・バッチなど）の規約。
    `actor_id`が**`sys_`で始まる値を予約**（`SYSTEM_ACTOR_PREFIX`。例: `sys_makeshop`、形式は`^sys_[a-z0-9_]{1,32}$`）。**nullの`actor_id`
    （照合できなかった旧い行=管理者だけが見える）とは別**で、システム操作はnullにしない。idは**サーバーが決める**（各APIルートのコード内の定数。
    画面・外部入力から受けない）。`isSystemActor(id)`は形式に合うものだけtrue（表示で「(削除済み)」を付けない判定に）、`hasSystemActorPrefix(id)`は
    形式を問わず大文字小文字を区別せず`sys_`で始まればtrue（`historyAccess`のガードと、ユーザー作成時の検査用）。予約名の一覧は持たない
  - `admin-portal-shared/actorDisplay`: **履歴に出す操作者の名前の解決**（サーバー専用）。履歴には**今の名前**を出す（`actor_id`から`portal.users`を
    引く）。`withActorDisplays(client, rows, pick)`が履歴の行の配列に`actor`（`{ name, status }`）を付けて返す（順序・元の項目は保つ）。
    `status`は`current`（今の名前）／`deleted`（`portal.users`にいない=記録時の名前。`actorLabel(actor)`が「名前 (削除済み)」にする）／
    `system`（`sys_…`）／`legacy`（`actor_id`がnull=旧い行）／`unknown`（一覧が引けなかった）。**「(削除済み)」は削除を確認できたときだけ**付く
    （`system`・`legacy`・`unknown`には付かない）。`displayActor`（純粋関数）・`loadActorDirectory(client)`（一覧を1回だけ引く）・
    `ACTOR_DELETED_SUFFIX`も使える
    - 一覧は**行数にかかわらず1回**だけ引く（人のidが無ければ引かない）。毎回引く（キャッシュなし）。**渡すSupabaseクライアントは
      データキャッシュに載らないもの（`fetch`が`cache: "no-store"`）にすること**（載ると、改名前の名前が出続ける）
    - **認可とは逆に、失敗しても履歴は出す**: DBエラー・一覧が空のときは全行`unknown`（記録時の名前）で続行する。想定外の例外は再throw。
      ブラウザ側で呼ばれたら`unknown`に丸めず例外
    - **ユーザー一覧は返さない**（他のユーザーの名前・ロール・ログインIDはクライアントに渡らない）。検索・絞り込みには解決後の表示名を渡す。
      名前が空の現ユーザーはログインIDを表示。`actor_id`を持たないテーブル（price-appの価格改定履歴など）には使わない。「旧: ○○」の併記は未対応
  - **履歴テーブルの規約**（各アプリのテーブルの形は別々のまま、共通にするのは次の考え方）: `actor_id text null`（`portal.users.id`。外部キーなし）＋
    名前のスナップショット（表示用・記録時の名前）＋索引`(actor_id, date desc)`。書き込みAPIは`authorizeActor`の結果の`user`から`id`と名前を**同じ`user`から**入れる。
    過去の行は、名前が現ユーザーちょうど1人に一致する行だけ`actor_id`を埋め、残りはnullのまま（管理者だけが見える）。照合SQLのテンプレートは
    `docs/design-history-scope.md`の§3-3
  - **呼ぶ時期（本番切替の4段階。フラグなし、戻しはInstant Rollback）**: ①DBに`actor_id`列を足す → ②`actor_id`を**書くだけ**のデプロイ（`authorizeActor`の
    `user.id`を使う。v3.20で足りる。読み取り側の関数は呼ばない） → ③過去の行を埋める → ④**絞り込みを有効にする**デプロイ（ここで初めて
    `historyAccess`・`canViewHistory`・`historyViewLock`・`withActorDisplays`を呼ぶ）。**v3.21の取り込みは、④とは別のデプロイで先に**行う
    （共通部品の更新を単独で出して確かめてから、挙動を変える④を出す）
  Vitestは、役割×`granted`の全表・`sys_`のガード・`authorizeActor`の結果との結合（ロール変更の即時反映）・システム用idの形式・名前の解決
  （改名・削除・`sys_`・旧い行・DBエラー・一覧が空・問い合わせが1回・ブラウザ側での拒否・他のユーザーの情報が出ないこと）を検証
  （`tests/historyAccess.test.ts`・`tests/systemActor.test.ts`・`tests/actorDisplay.test.ts`）。
- `permissions`: **3アプリ（price・payment・receipt）共通の権限項目（権限表）の部品**（v3.22〜、設計は`docs/design-permission-matrix-all.md`）。
  **追加のみ**（既存の関数は変えていない）。**取り込んだだけでは、アプリの挙動は何も変わらない**。前半（型・定義・判定）はDB・Next.jsに依存しない
  純粋な関数で**ブラウザでも呼べる**。`loadRoleMatrix`・`saveRoleMatrix`は**サーバー専用**（ブラウザ側で呼ばれたら例外）。すべて全拒否（fail-closed）
  - **置くもの**: 項目の型`PermissionDef`・共通3項目`COMMON_PERMISSIONS`・固定の判定・正規化と判定・失敗時の文言・`role_permissions`の読み書き。
    **置かないもの**: アプリ固有の項目の定義（各アプリが`definePermissions`に並べる）、設定画面（UI）、変更の記録（操作履歴への書き込み）、どのAPIがどの項目を要求するか
  - `PermissionDef`: `key`（`<対象>.<動作>`）・`label`・`description`・`kind`（`"write"`＝閲覧のみには付けられない／`"read"`）・`defaults`（管理者／スタッフ／閲覧のみ）・
    `lock`（追加の固定）。`definePermissions([...])`が**起動時に検証**する（key重複・命名規則・動作の語彙`PERMISSION_ACTIONS`＝edit／delete／import／export／bulk／revert／view／manage・
    表示名の空・既定値の欠け→例外）
  - `COMMON_PERMISSIONS`（`historyView`・`permissionsManage`・`dataExport`）: 3アプリで同じkey・意味の共通の項目。各アプリが自分の一覧に取り込む。
    `data.export`は機能のあるアプリが同じkeyで足す
  - `permissionLock(def, role)`: 欄の固定（`"on"`＝常に可／`"off"`＝常に不可／`null`＝設定できる）。**画面（チェックボックスの無効化）とサーバー（実効の判定）が同じ関数**を見る。
    順序: 未知・空のロール→off／**`history.view`は`historyViewLock`に委譲**（二重に定義しない）／書き込み系の閲覧のみ→off（`canWrite`に委譲）／`def.lock`
  - `normalizeMatrix(defs, raw)`: 全役割×全項目を埋めた表にする。未知のキー・ロールは捨てる、真偽値でない値・**行が欠けた項目は既定値**、**固定の欄は保存値を無視**。冪等。
    `matrixFromRows(rows)`で`role_permissions`の行を`raw`にできる
  - `effectivePermissions(defs, matrix, role)`・`can(defs, matrix, role, key)`: 実効権限。**未知・空・nullのロールは全項目不可**。未知のkeyも不可。
    **`history.view`の実効は`effectiveHistoryView`と全表で一致**する（テストで保証）
  - `diffMatrix(defs, before, after)`: 変更されたセルの一覧（役割→項目の順、表示名つき）。操作履歴の`changes`・`detail`の材料（書き込みは各アプリ）
  - `PERMISSION_FAILURES`（`forbidden`＝403「この操作を行う権限がありません。管理者にお問い合わせください。」／`unavailable`＝503「権限設定を読み込めませんでした…」）・`permissionFailureBody(reason)`
    （`{ error, code }`）: 文言は1か所
  - `loadRoleMatrix(client, schema, defs)`: `<schema>.role_permissions`を**1回**で読む。毎回引く（キャッシュなし）・リトライなし。
    **表が空・行が欠けた項目だけ既定値で補う。表が無い（`42P01`・`PGRST205`）・DBエラー・通信失敗は`PermissionsUnavailableError`**（既定値にしない。呼び出し側は503）。
    渡すクライアントは**`fetch`が`cache: "no-store"`のもの**にすること
  - `saveRoleMatrix(client, schema, defs, matrix, updatedBy)`: 正規化（固定を固定どおりに直す）して**全役割×全項目を`upsert`**（`updated_at`・`updated_by`を入れる）。
    保存した表を返す。書き込みの認可（`authorizeWrite`と`permissions.manage`の検査）は呼び出し側。表に`updated_at`・`updated_by`の列が必要（price-appは先に足す）
  - **使い方（案）**: API→`authorizeWrite`のあとに`can(DEFS, await loadRoleMatrix(...), auth.user.role, "xxx.edit")`を重ねる。`PermissionsUnavailableError`は
    `PERMISSION_FAILURES.unavailable`（503）にする。画面には`effectivePermissions`を渡す（UIの出し分け専用。実際の制限は各API・ページがサーバーで行う）
  - **`role_permissions`の表の形**（3アプリ共通）: `role text`・`permission text`・`allowed boolean`・`updated_at timestamptz`・`updated_by text`、主キー`(role, permission)`、RLS有効（service_roleのみ）
  - ロールを追加するとき、DBのCHECK・`PORTAL_ROLES`に加えて、各項目の`defaults`（`Record<PortalRole, boolean>`）が**型エラーで漏れを防ぐ**
  Vitestは、`definePermissions`の検証・固定の全表・正規化（欠け・未知・真偽値でない値・固定の上書き・プロトタイプのキー・冪等）・`can`/`effectivePermissions`（未知のロールは全拒否）・
  `history.view`が`effectiveHistoryView`と一致すること・差分・失敗時の文言と、実際のsupabase-jsクライアント＋差し替えたfetchで読み書き（問い合わせが1回・スキーマの指定・upsertの中身・
  表が無い／DBエラー／通信失敗が例外・ブラウザ側での拒否）を検証（`tests/permissions.test.ts`・`tests/permissionsStore.test.ts`）。
- `search`: 検索語・検索対象の正規化と、スペース区切りAND検索のマッチング（v3.17〜）。receipt-appの
  `lib/search.ts`を**挙動を変えずに**移したもの（全アプリの検索のひらがな・カタカナ対応の共通化）。DOM・
  Next.jsに依存しない純粋関数で、サーバー側でもクライアント側でも使える。
  - `normalizeForSearch(s)`: NFKC（全角英数→半角、半角カナ→全角カナ（濁点は合成）、全角スペース→半角、
    NFDの結合濁点→合成）→ 小文字化 → ひらがな→カタカナ寄せ（コードポイント+0x60。「ゔ」→「ヴ」）。
    空白は除去しない。`undefined`/`null`は空文字
    **バックスラッシュ（U+005C）を「¥」（U+00A5）にそろえる（v3.19〜）**: 日本語キーボードの「¥」キーは多くの環境で
    バックスラッシュを入力するため（「¥」「￥」「バックスラッシュ」「全角バックスラッシュ」はすべて同じ文字になる。
    検索語・検索対象の両方に効き、`stripForMatch`・`matchesQuery`・`matchesFields`・`buildSearchText`にも及ぶ）。
    バックスラッシュを含まない文字列の結果は変わらない。記号の無い検索語（「23,507」）は、どの記号付きの項目にも一致する
  - `stripForMatch(s)`: 上に加えて、半角・全角の空白をすべて除去する（対象テキスト側用。「運 賃」と「運賃」を同一視）
  - `matchesQuery(haystack, query)`: クエリを`normalizeForSearch`してスペース（半角・全角）で区切り、**すべての語**が
    `stripForMatch(haystack)`に部分一致すればtrue（AND）。空・空白だけのクエリは常にtrue
  - **吸収しないもの（現状の仕様。テストで固定）**: 「ヴ」と「ブ」、小書きかな（「ゃ」と「や」、「ッ」と「ツ」は別扱い）、
    漢字とかな、繰り返し記号「ゝ」。長音「ー」はそのまま（半角「ｰ」は「ー」になる）
  - **複数項目を対象にする検索は、`matchesFields`を使う（v3.18〜）。文字列を自前で空白連結して`matchesQuery`に渡さない**
    （`stripForMatch`は対象側の空白をすべて除去するため、項目を空白でつなぐと項目の境界をまたいで偽の一致が出る。
    例: 「ウマ」「カレー」の連結に「マカ」がマッチする）。検索処理を各アプリで共通にし、システムごとの違いを出さないための規則
  - `matchesFields(fields, query)`: `fields`は`ReadonlyArray<string | number | null | undefined>`。各項目を`stripForMatch`と
    同じ正規化にして、空白以外の区切り（`\u0001`）でつなぎ、クエリは`matchesQuery`と同じ（スペース区切りのAND、半角・全角
    スペース、空・空白だけは常にtrue）。**語は1つの項目の中で一致したときだけ一致**（境界をまたがない）が、複数の語が
    別々の項目に一致するのはOK。`null`・`undefined`・空文字（正規化後に空になるもの）の項目は飛ばし、数値は文字列にする
    （金額・残金の検索用。0・負数・小数も。NaN・Infinityは飛ばす）。金額をカンマ区切りで表示している画面で、カンマ付きの
    表記でも検索させたい場合は、数値と整形した文字列の両方を項目に渡す
  - `buildSearchText(fields)`: 検索対象のテキストの組み立てだけを行う（事前に作っておきたいとき用。500件規模なら
    キーストロークごとに`matchesFields`で都度組み立てて問題ない）。結果は`matchesQuery(text, query)`にも渡せ、
    境界をまたぐ偽の一致は起きない
  - 項目が1つだけなら`matchesFields([x], q)`は`matchesQuery(x, q)`と同じ結果（テストで確認）
  - **DB側の検索（ILIKE）はひらがな・カタカナを吸収できない**。これらの関数はJS側の絞り込み用。DBに渡す検索語を
    表記違いに展開する処理は含まない（必要になれば別途追加）
  ```ts
  import { matchesFields } from "admin-portal-shared/search";

  // 複数項目（名前・コード・備考・金額）を対象にする。自前で空白連結しない
  const hits = items.filter((it) => matchesFields([it.name, it.code, it.note, it.amount], query));
  ```
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
- `components/FilterResetLink`: 絞り込みを最初の状態に戻す、小さな下線つきのテキストリンク
  （v3.14〜）。payment-appの「最初の絞り込みに戻す」の見た目（`text-xs text-slate-500 underline
  hover:text-slate-700`、アイコンなし）を見本に、price-app（「検索条件クリア」「条件クリア」）・
  receipt-app（「クリア」「検索条件クリア」）のリセットリンクもそろえるため共通化した。props:
  `onClick`、`label`（省略時「最初の絞り込みに戻す」）、`className`（**追加分のみ**。既定のクラスは
  置き換わらない）。**表示するか（既定の絞り込み状態でないときだけ出す、など）は呼び出し側が決める**。
  何をリセットするか（検索語・各フィルター・ページ）も`onClick`で呼び出し側が行う。フィルター行の
  中に置くか、`<div>`で包んで独立した行にするかも呼び出し側が決める。`"use client"`付き。
  ```tsx
  {!isDefaultFilter && (
    <div>
      <FilterResetLink onClick={() => { setQuery(""); setStatuses(new Set(OPEN_STATUSES)); resetPage(); }} />
    </div>
  )}
  ```
  Vitestは既定の文言・`label`の上書き・`onClick`の呼び出し・クラスが追加のみであることを検証
  （`tests/filterResetLink.test.ts`）。

**Tailwindを使うUI系モジュール（`components/UserMenu`・`components/ui`・`components/SelectCell`・
`components/StickyActionBar`・`components/SearchValue`・`components/SearchInput`・`components/FilterResetLink`）の注意**:
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
  "admin-portal-shared": "git+https://github.com/tohnooriaki-gif/admin-portal-shared.git#v3.22"
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

**タグを上げて追従する手順と、`package-lock.json`の確認**（price-app・payment-appで実際に
起きた事象: `package.json`のタグだけ書き換えて引数無しの`npm install`を実行しても、
`package-lock.json`の`admin-portal-shared`が古いコミットのまま変わらないことがある）:
1. `package.json`の`admin-portal-shared`のタグを新しいもの（例: `#v3.18`）に書き換える
2. **`package-lock.json`の`admin-portal-shared`の項目を消す**（`"node_modules/admin-portal-shared"`の
   ブロックと、ルートの`packages[""].dependencies`の`admin-portal-shared`の行。lockを残したまま
   だと、npmが「すでに満たしている」と判断して古いコミットのままにすることがある）
3. 引数無しの`npm install`を実行する（`npm install admin-portal-shared@...`の単体指定は使わない）
4. **追従後に確認する**: `package-lock.json`の`node_modules/admin-portal-shared`の`resolved`の
   `#`以降（コミット）が、新しいタグのコミットになっていること、`version`が新しいタグに対応
   していること（v3.15〜はタグ`vN.M`→`N.M.0`）。タグのコミットは
   `git ls-remote https://github.com/tohnooriaki-gif/admin-portal-shared.git vN.M`で確認できる。
   一致しなければ、2からやり直す

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
  （`v2` → `v2.1`、`v3` → `v3.1` → `v3.2` → `v3.3` → `v3.4` → `v3.5` → `v3.6` → `v3.7` → `v3.8` → `v3.9` → `v3.10` → `v3.11` → `v3.12` → `v3.13` → `v3.14` → `v3.15` → `v3.16` → `v3.17` → `v3.18` → `v3.19` → `v3.20`）。既存のメジャータグは動かさない（他アプリが意図せず
  巻き込まれないように）

最新のタグは `git tag -l --sort=-creatordate` で確認するか、`CHANGELOG.md` を参照。

### タグを切るときは `package.json` の `version` も上げる（v3.15〜）

**タグを切るたびに、`package.json`（と`package-lock.json`の先頭2か所）の`version`を、タグに対応させて上げる**（タグ`vN.M` → `"N.M.0"`、メジャータグ`vN` → `"N.0.0"`。例: `v3.15` → `"3.15.0"`）。

理由: 各アプリのNext.js（webpack）のビルドキャッシュは、`node_modules`内のパッケージを「`version`が同じなら中身も同じ」とみなす。タグを上げても`version`が同じ（以前は`0.1.0`のままだった）だと、Vercelのように前回の`.next/cache`を引き継ぐ環境で古いファイルのキャッシュが使われ、新しいファイルと食い違って本番で落ちる（2026-10-08、v3.13で既存の`ui.tsx`に`neutral`を足したため、古い`ui.tsx`と新しい`SearchInput.tsx`が食い違った）。過去のタグは動かさず、v3.15から運用する。

手順（これまでの手順に、2番を足したもの）:
1. コードを変更し、README・CHANGELOGを更新する（CHANGELOGの項目の先頭に`**`vX.Y`**`を書く。READMEの使い方の例のタグ`#vX.Y`も新しいタグにする）
2. `package.json`と`package-lock.json`の`version`を`X.Y.0`にする
3. `npx tsc --noEmit`と`npm test`を通す
4. コミットして、`git tag vX.Y`、`git push origin main`・`git push origin vX.Y`

**上げ忘れの防止**: `tests/version.test.ts`が、(a)`package.json`の`version`が`CHANGELOG.md`の最新のタグ（`**`vX.Y`**`の最大のもの）に対応していること、(b)`package-lock.json`の`version`が同じであること、(c)READMEの使い方の例のタグが最新のタグと同じであること、を確認する。CHANGELOGにタグの項目を書いたのに`version`を上げ忘れると、`npm test`が失敗してコミット前に気づける（gitやネットワークには触れない）。タグを切ってからではなく、コミット前に検出する仕組みで、CHANGELOGにタグの項目を書き忘れた場合は検出できない。
