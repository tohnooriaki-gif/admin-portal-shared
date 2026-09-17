# 変更履歴

admin-portal-shared（統合ポータル配下の各アプリが共有する認証まわりのユーティリティ）の
開発作業の記録です。コード変更・ドキュメント変更など**開発作業そのものの記録**を残す目的の
ファイルです。

凡例：🏗️ インフラ／🆕 追加／🔄 変更／🐛 修正／🗑️ 削除／📝 その他

**目次**
- [📅 2026-09-16（水）](#2026-09-16水)
- [📅 2026-09-17（木）](#2026-09-17木)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-09-16（水）

**概要：初期版の切り出し、middleware matcherヘルパーの共通化、共通WORKFLOW.mdの新設**

### 🏗️ インフラ
- リポジトリ新規作成。`session` / `sessionHeaders` / `basePath` / `loginRedirect` の4モジュールで初期版を切り出し、タグ`v1`発行（`8c74ad9`）。ビルドはせずTypeScriptソースをそのまま各アプリの`transpilePackages`でトランスパイルする方式
- `docs/auth-contract.md`（admin-portalリポジトリ側）の認証コントラクトに準拠する形で`session.ts`（`portal_session` JWT の検証・発行）を実装

### 🆕 追加
- `middlewareMatcher`（`AUTH_AWARE_MATCHER` / `isStaticAssetPath()`）を追加、タグ`v2`発行（`da68830`）。price-app / receipt-app 双方で独立に見つかった同一のバグ（negative lookahead併用のmatcherがbasePathルート直下でmiddlewareを素通りさせる）への対策を共通化。`/api/`除外などアプリ固有の判断は含めない
- 統合ポータル全体で共通の作業ルールをまとめた`WORKFLOW.md`を新設（`5bd0c30`）。検証手順・コミットタイミング・他リポジトリとの関わり方・報告フォーマットを集約。タグ管理はせずmainを都度読みに行く運用
- `CHANGELOG.md`（このファイル）を新設（`87df0b0`）。price-app/receipt-appに倣い、開発作業を日付ごとに記録

### 🔄 変更
- `WORKFLOW.md`に「receipt-appは動作確認済みならコミット・プッシュの都度確認不要（データ削除・認証まわり等の大きな変更を除く）」という例外を追記（`f0614a5`、receipt-app担当セッションが直接編集）
- `WORKFLOW.md`自体を「他リポジトリを勝手に編集しない」ルールの唯一の例外に設定。admin-portal / price-app / receipt-app のどのセッションからでも直接編集・コミット・pushしてよいことを明記（`c667a17`）
- `WORKFLOW.md`に、各リポジトリで`CHANGELOG.md`を日付ごとに記録する運用ルールを追記（`d98fa69`）

### 🐛 修正
（なし）

### 🗑️ 削除
（なし）

### 📝 その他
（なし）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-09-17（木）

**概要：price-app/receipt-appの移行作業で見つかった3件をドキュメントへ反映、目的を処理全般の共通化に拡張**

### 🆕 追加
- `supabase`（`createServiceClient(url, serviceRoleKey)`）を追加。price-app/receipt-appの`lib/supabase.ts`がコメント文言まで完全一致していたため、サーバー専用Supabaseクライアント生成をファクトリ関数として共通化
- `components/UserMenu`（本パッケージ初のReact/JSXコンポーネント）を追加。ヘッダーのユーザーメニュー（`{portalUrl, userName}`）が両アプリで実装完全一致だったため共通化。`react`/`lucide-react`をpeerDependenciesに追加、tsconfigに`jsx`設定を追加
- タグ`v3`発行（`684c8af`）
- `db`（`unwrap<T>`）・`format`（`formatDate`/`formatDateTime`）・`components/ui`（`Card`/`SecondaryButton`/`Field`/`createUiKit(accent)`）を追加。admin-portalセッションの棚卸し経由の提案を検証し反映（タグ`v3.2`、`7a6878c`）。バッジ類・`StatCard`/`StatTile`・`lib/search.ts`・`ActionHistoryEntry`型は実装差分があるため対象外と判断

### 🔄 変更
- `admin-portal-shared`の目的を「認証まわりのユーティリティ」から「処理全般のユーティリティ（認証はその一部）」に拡張（ユーザー確認済み）。README/package.jsonのdescriptionを更新
- README「含めていないもの」を整理: `AppShell`のナビ構成は引き続き対象外だが、ヘッダーの`UserMenu`部分だけは共通化。`next.config.js`のwebpack externals(3件目の提案)は、`next.config.js`がNext.jsのトランスパイル前にプレーンなNode.jsとして実行されるためTypeScriptソース配布の現行方式では共通化できないと判断し見送り

### 🐛 修正
- README使用例の`matcher: AUTH_AWARE_MATCHER`をリテラル`["/:path*"]`に修正し、Next.jsが`config.matcher`をビルド時に静的解析するため定数importをそのまま渡すと認識されない（警告のみで黙ってデフォルト設定にフォールバックする）という注意をREADME/`middlewareMatcher.ts`のJSDocに追加。price-app・receipt-app双方がこれを実際に踏んでいたことを確認（price-app commit `ac76f3b`、receipt-app commit `ef2ef3f`）
- **`sessionHeaders.setSessionHeaders()`が`claims.role`をエンコードせず`headers.set()`に渡しており、roleに日本語（「管理者」等）を含むユーザーの認証時に必ず`TypeError`で500になるバグを修正**（`870eca0`、タグ`v3.1`）。`name`と同様に`encodeURIComponent`/`decodeURIComponent`で往復させる形に統一。price-appの`users`テーブルのroleは全て日本語のため、`setSessionHeaders`を使う全アプリ（現状receipt-app）で実質全ユーザーが影響を受けていた。receipt-appセッションがv3移行の実機確認（shell経由の実ログインフロー）で発見
- `basePath`の二重付与防止ガードが、アプリ内部ルートのトップレベルセグメント名がbasePath値と偶然一致する場合に誤判定する既知の制約をREADME/`basePath.ts`のJSDocに明記（price-appはこの理由で不採用というのを確認）
- README依存指定の例を`git+https://...#v2`（タグ固定）に修正し、`npm install <pkg>@<spec>`単体指定コマンドが`package.json`の表記を`git+ssh://`形式へ自動で書き換えてしまう（SSH鍵の無いビルド環境で失敗しうる）注意を追加
- タグ`v2.1`発行（`24b7628`）。コード挙動の変更はなし（ドキュメント/JSDocのみ）
