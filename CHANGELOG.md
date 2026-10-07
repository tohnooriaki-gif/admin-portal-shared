# 変更履歴

admin-portal-shared（統合ポータル配下の各アプリが共有する処理全般のユーティリティ）の
開発作業の記録です。コード変更・ドキュメント変更など**開発作業そのものの記録**を残す目的の
ファイルです。

凡例：🏗️ インフラ／🆕 追加／🔄 変更／🐛 修正／🗑️ 削除／📝 その他

各項目の先頭に、その変更が含まれるタグ名を `**\`vX.Y\`**` の形で明記する
（`WORKFLOW.md`のようにタグ管理の対象外のファイルへの変更は「（タグ管理対象外）」と表記）。

**目次**
- [📅 2026-09-16（水）](#2026-09-16水)
- [📅 2026-09-17（木）](#2026-09-17木)
- [📅 2026-09-18（金）](#2026-09-18金)
- [📅 2026-09-24（木）](#2026-09-24木)
- [📅 2026-09-25（金）](#2026-09-25金)
- [📅 2026-09-28（月）](#2026-09-28月)
- [📅 2026-09-29（火）](#2026-09-29火)
- [📅 2026-10-01（木）](#2026-10-01木)
- [📅 2026-10-02（金）](#2026-10-02金)
- [📅 2026-10-06（火）](#2026-10-06火)
- [📅 2026-10-07（水）](#2026-10-07水)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-09-16（水）

**概要：初期版の切り出し、middleware matcherヘルパーの共通化、共通WORKFLOW.mdの新設**

### 🏗️ インフラ
- **`v1`** リポジトリ新規作成。`session` / `sessionHeaders` / `basePath` / `loginRedirect` の4モジュールで初期版を切り出し（`8c74ad9`）。ビルドはせずTypeScriptソースをそのまま各アプリの`transpilePackages`でトランスパイルする方式
- **`v1`** `docs/auth-contract.md`（admin-portalリポジトリ側）の認証コントラクトに準拠する形で`session.ts`（`portal_session` JWT の検証・発行）を実装

### 🆕 追加
- **`v2`** `middlewareMatcher`（`AUTH_AWARE_MATCHER` / `isStaticAssetPath()`）を追加（`da68830`）。price-app / receipt-app 双方で独立に見つかった同一のバグ（negative lookahead併用のmatcherがbasePathルート直下でmiddlewareを素通りさせる）への対策を共通化。`/api/`除外などアプリ固有の判断は含めない
- **（タグ管理対象外）** 統合ポータル全体で共通の作業ルールをまとめた`WORKFLOW.md`を新設（`5bd0c30`）。検証手順・コミットタイミング・他リポジトリとの関わり方・報告フォーマットを集約。タグ管理はせずmainを都度読みに行く運用
- **（タグ管理対象外）** `CHANGELOG.md`（このファイル）を新設（`87df0b0`）。price-app/receipt-appに倣い、開発作業を日付ごとに記録

### 🔄 変更
- **（タグ管理対象外）** `WORKFLOW.md`に「receipt-appは動作確認済みならコミット・プッシュの都度確認不要（データ削除・認証まわり等の大きな変更を除く）」という例外を追記（`f0614a5`、receipt-app担当セッションが直接編集）
- **（タグ管理対象外）** `WORKFLOW.md`自体を「他リポジトリを勝手に編集しない」ルールの唯一の例外に設定。admin-portal / price-app / receipt-app のどのセッションからでも直接編集・コミット・pushしてよいことを明記（`c667a17`）
- **（タグ管理対象外）** `WORKFLOW.md`に、各リポジトリで`CHANGELOG.md`を日付ごとに記録する運用ルールを追記（`d98fa69`）

### 🐛 修正
（なし）

### 🗑️ 削除
（なし）

### 📝 その他
（なし）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-09-17（木）

**概要：price-app/receipt-appの移行作業で見つかった不具合・重複コードを反映、目的を処理全般の共通化に拡張**

### 🆕 追加
- **`v3`** `supabase`（`createServiceClient(url, serviceRoleKey)`）を追加（`684c8af`）。price-app/receipt-appの`lib/supabase.ts`がコメント文言まで完全一致していたため、サーバー専用Supabaseクライアント生成をファクトリ関数として共通化
- **`v3`** `components/UserMenu`（本パッケージ初のReact/JSXコンポーネント）を追加（`684c8af`）。ヘッダーのユーザーメニュー（`{portalUrl, userName}`）が両アプリで実装完全一致だったため共通化。`react`/`lucide-react`をpeerDependenciesに追加、tsconfigに`jsx`設定を追加
- **`v3.2`** `db`（`unwrap<T>`）・`format`（`formatDate`/`formatDateTime`）・`components/ui`（`Card`/`SecondaryButton`/`Field`/`createUiKit(accent)`）を追加（`7a6878c`）。admin-portalセッションの棚卸し経由の提案を検証し反映。バッジ類・`StatCard`/`StatTile`・`lib/search.ts`・`ActionHistoryEntry`型は実装差分があるため対象外と判断

### 🔄 変更
- **`v3`** `admin-portal-shared`の目的を「認証まわりのユーティリティ」から「処理全般のユーティリティ（認証はその一部）」に拡張（ユーザー確認済み）。README/package.jsonのdescriptionを更新
- **`v3`** README「含めていないもの」を整理: `AppShell`のナビ構成は引き続き対象外だが、ヘッダーの`UserMenu`部分だけは共通化。`next.config.js`のwebpack externals(3件目の提案)は、`next.config.js`がNext.jsのトランスパイル前にプレーンなNode.jsとして実行されるためTypeScriptソース配布の現行方式では共通化できないと判断し見送り

### 🐛 修正
- **`v2.1`** README使用例の`matcher: AUTH_AWARE_MATCHER`をリテラル`["/:path*"]`に修正し、Next.jsが`config.matcher`をビルド時に静的解析するため定数importをそのまま渡すと認識されない（警告のみで黙ってデフォルト設定にフォールバックする）という注意をREADME/`middlewareMatcher.ts`のJSDocに追加（`24b7628`）。price-app・receipt-app双方がこれを実際に踏んでいたことを確認（price-app commit `ac76f3b`、receipt-app commit `ef2ef3f`）
- **`v2.1`** `basePath`の二重付与防止ガードが、アプリ内部ルートのトップレベルセグメント名がbasePath値と偶然一致する場合に誤判定する既知の制約をREADME/`basePath.ts`のJSDocに明記（`24b7628`）。price-appはこの理由で不採用というのを確認
- **`v2.1`** README依存指定の例を`git+https://...#v2`（タグ固定）に修正し、`npm install <pkg>@<spec>`単体指定コマンドが`package.json`の表記を`git+ssh://`形式へ自動で書き換えてしまう（SSH鍵の無いビルド環境で失敗しうる）注意を追加（`24b7628`）
- **`v3.1`** **`sessionHeaders.setSessionHeaders()`が`claims.role`をエンコードせず`headers.set()`に渡しており、roleに日本語（「管理者」等）を含むユーザーの認証時に必ず`TypeError`で500になるバグを修正**（`870eca0`）。`name`と同様に`encodeURIComponent`/`decodeURIComponent`で往復させる形に統一。price-appの`users`テーブルのroleは全て日本語のため、`setSessionHeaders`を使う全アプリ（現状receipt-app）で実質全ユーザーが影響を受けていた。receipt-appセッションがv3移行の実機確認（shell経由の実ログインフロー）で発見
- **`v3.2`**（ドキュメントのみ、タグ発行なし）`createUiKit()`はコンポーネントではなく普通の関数のため、呼び出し側ファイルに`"use client"`が無いとサーバーコンポーネント経由の`next build`で「Attempted to call createUiKit() from the server」エラーになる注意をREADME/`ui.tsx`のJSDocに追加（`ea31eb3`）。receipt-appセッションが実機確認（`next build`）で発見。price-appは`components/ui-shared.tsx`への分離で既に対応済みだったため、その実例を分離パターンとして明記

### 🗑️ 削除
（なし）

### 📝 その他
- **（タグ管理対象外）** `CHANGELOG.md`の各項目にタグ名を明記する形式に変更（このファイル自体はWORKFLOW.mdと同様タグ管理の対象外）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-09-18（金）

**概要：統合ポータル全体管理セッションの新設に伴い、WORKFLOW.mdの正本を移管**

### 🗑️ 削除
- **（タグ管理対象外）** `WORKFLOW.md`を削除。統合ポータル全体管理セッション（新設）が正本を`D:\dev\admin-portal-management`（ローカルgitリポジトリ、commit `b0783c6`）で管理する運用に移管。admin-portal-sharedは処理の共通化に専念し、ルール管理は管理セッション側に分離する方針（ユーザー確認済み）。README.mdの参照先を更新

### 🔄 変更
- README.mdの「統合ポータル配下の全セッション共通の作業ルール」の参照先を、削除した`./WORKFLOW.md`から`D:\dev\admin-portal-management\WORKFLOW.md`（ローカル絶対パス。GitHub非公開、他マシンでの開発予定が無いため現時点ではローカルgitのみで十分と判断）に変更

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-09-24（木）

**概要：統合ポータル全体管理セッションからのドキュメント鮮度チェック依頼を受けて対応**

### 🐛 修正
- **（タグ管理対象外）** README使用例の依存指定が古いタグ(`#v3`)のままだったのを最新(`#v3.2`)に修正。「バージョン管理」節も、実際の運用(非破壊的変更はマイナータグ、破壊的変更はメジャータグ)を反映する内容に更新（`72b4cd4`）。他の記述(exports一覧・技術的注意書き)は`package.json`・実ソース・`CHANGELOG.md`と照合し矛盾なしと確認

### 🆕 追加
- **（タグ管理対象外）** `CLAUDE.md`を新設（`8298dc8`）。Claude Codeがセッション開始時に自動読み込みする特別なファイル名だが、これまで開発ルールへのポインタがREADME.md冒頭に同居しており自動読み込みされていなかったため分離。統合ポータル全体管理セッションからの依頼（ユーザー承認済み）

### 🔄 変更
- **（タグ管理対象外）** README.mdの開発ルールへのポインタを`CLAUDE.md`に移動し、README.mdはリポジトリ自体の説明（何が入っているか・使い方等）に専念する形に整理（`8298dc8`）
- **（タグ管理対象外）** `admin-portal-management`がGitHubにpush（Private）されたのを受け、`CLAUDE.md`の参照先をローカル絶対パスからGitHub URL主体に更新（`c48c902`）。他マシンでも参照可能に

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-09-25（金）

**概要：共有UI部品の長い文字列耐性・外側クリック修正・`inputClassBase`提供（v3.3）、UserMenuの縮小対応（v3.4）**

price-appで見つかった「長い文字列でボタン位置がずれる」不具合と同種の問題を共有UI部品で調査（管理セッション経由の依頼）し、判明した点を全て反映（v3.3）。続けてreceipt-appからの報告（320pxではみ出す）に対応（v3.4）。いずれも見た目の防御的変更で非破壊的（マイナータグ）。

### 🆕 追加
- **`v3.3`** `createUiKit()`が`inputClassBase` / `selectClassBase`（幅指定を含まない変種）を返すように（`df3fbad`）。`${inputClass} w-auto`のように後ろに足してもTailwindの生成順で`w-full`が後勝ちして効かず全幅で縦積みになる問題（receipt-appの一覧フィルターselectで発生）の解消用。price-appは`inputClass.replace(/^w-full\s+/, "")`で自前導出していたが、共有側で提供するようにした。`inputClass`自体の文字列は変更なし

### 🔄 変更
- **`v3.3`** `UserMenu`: 名前を`max-w-[7rem] sm:max-w-[10rem] truncate`＋`title`（フルネーム）、アイコンに`shrink-0`（`df3fbad`）。ドロップダウンを`top-9`固定から`top-full mt-1`に変更しpillの高さに追従。実ブラウザで修正前後を比較（幅375/320px × 短い名前/長い日本語名/長いメール）: 旧版は長い名前でpillが2行に伸び（34→42px）ドロップダウンが6px重なる、メールだと画面外へ最大59pxはみ出す・ヘッダーが165pxに膨らむ。新版はpill 34px固定・はみ出しなし・ドロップダウンとの間隔4px一定
- **`v3.3`** `PrimaryButton` / `SecondaryButton` / `UserMenu`のドロップダウンリンクに`whitespace-nowrap`（`df3fbad`）
- **`v3.4`** `UserMenu`のボタンに`max-w-full min-w-0`、名前に`min-w-0`を追加し、親が狭いときにボタンが縮んで名前が省略表示される作りに（`8198944`）。receipt-appからの報告（320pxでボタンが内容幅162pxのまま突き抜けて横スクロールになる。アプリ側でタイトルを縮める方針に直して回避済み）への対応（管理セッション経由、ユーザー指示）。実際の`UserMenu.tsx`をv3.3版と新版でバンドルし、実ヘッダー構成（receipt-app: モバイルはタイトル表示／タイトルを縮めない版・縮む版、price-app: タイトルなし）で320/375px幅で比較
  - **重要（実測で判明）: 共有側の変更だけでは不十分で、呼び出し側のUserMenuを包む要素（`<div className="ml-auto">`）にも`min-w-0`が必要**。flex項目は既定で内容の最小幅より縮まないため、包む要素が縮められないと中身が縮められても親が縮まずはみ出す。320px・タイトルを縮めない構成でラッパーに`min-w-0`が無い場合は新旧とも33pxはみ出し（共有側では解決不能）。ラッパーに`min-w-0`を付けると、新版はボタン128px＋名前省略・はみ出しなし（旧v3.3は33pxはみ出し。タイトルが縮む構成でも旧版は20pxはみ出し＝ラッパーに`min-w-0`を付ける場合は新版が必須）
  - 375px幅・price-app構成・短い名前はv3.3と同一の見た目（pill 34px、幅98/162px）。ドロップダウン間隔4px・外側クリック・Escape・メニュー内操作もv3.3から退行なし
  - READMEとJSDocに、呼び出し側ラッパーへの`min-w-0`が必要な旨を明記

### 🐛 修正
- **`v3.3`** `UserMenu`の「外側クリックで閉じる」が本文側では効いていなかった不具合を修正（`df3fbad`）。`fixed inset-0`の透明オーバーレイは、ヘッダーが`backdrop-blur`を持つと`fixed`の基準がヘッダーになりヘッダー領域しか覆わない（実ブラウザで確認: オーバーレイ985×58、`backdrop-blur`を外すと985×700）。price-app/receipt-appのヘッダーはどちらも`backdrop-blur-md`のため、共通化前から本文側のクリックでは閉じなかった。オーバーレイをやめ、documentの`pointerdown`（メニュー外）と`Escape`で閉じる方式に変更（ヘッダーの余白・本文どちらのクリックでも閉じる。クリックはメニューを閉じつつ下の要素にも通常通り届く）。合成イベントと実マウス操作の両方で確認

### 📝 その他
- 検証方法: 実際の`UserMenu.tsx`を修正前後で`esbuild`でバンドルし、Tailwind CLIで生成したCSSと合わせて実ブラウザで計測（テスト用ハーネスとサーバーは検証後に削除済み、リポジトリには含めない）。アプリ本体への組み込み後の確認は各アプリ側で必要

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-09-28（月）

**概要：純粋ロジックにVitestのユニットテストを導入（v3.5）**

ユーザー指示（統合ポータル全体で4リポジトリ中テストが無いのはadmin-portal-shared/admin-portal/receipt-app。影響範囲最大の共通化から着手）。技術選定は price-app と同一の Vitest。事前に規模（Tier1=純粋ロジックのみ／Tier2=UserMenuのインタラクション）を見積もり管理セッションに報告し、Tier1のみで承認を得て実施。

### 🆕 追加
- **`v3.5`** `tests/`配下にVitestのユニットテストを追加（`9365c62`）。対象8ファイル・45テスト、行/分岐/関数カバレッジ100%：`session`（signSession/verifySessionの往復、改ざん・別鍵・期限切れ・sub/name欠落でnull、role省略時の既定値、鍵未設定で例外）、`sessionHeaders`（name/roleの往復。**日本語roleのエンコード漏れ＝v3.1で修正した実バグの回帰防止として明記**）、`basePath`（通常付与・二重付与防止・絶対パス以外はそのまま。**READMEに書いてある既知のルート名衝突バグは直さず、現在の挙動を固定するテストとして明記**）、`loginRedirect`／`middlewareMatcher`／`db`／`format`／`supabase`（正常系・異常系）、`components/ui`（`createUiKit()`が返す文字列のみ検証。コンポーネントのレンダリング・見た目は対象外）
- `package.json`に`test`/`test:watch`/`test:cov`スクリプトを追加。`vitest`/`@vitest/coverage-v8`/`vite`をdevDependenciesに追加（exportsの変更なし、非破壊的）

### 🗑️ 削除
- **（タグ管理対象外）** UserMenuのインタラクション（外側クリック/Escape。Tier2）のテストはユーザー判断で今回見送り、`TODO.md`（新設）に将来の候補として記録

### 📝 その他
- 環境メモ: npm 10.9.8/Node 22.23.2で`vitest`5.0.0の依存解決がnpmのバグ（`Cannot read properties of null (reading 'edgesOut')`）を踏むため、`npm install`は`--legacy-peer-deps`必須（README追記）。price-appは同じ`vitest`バージョンだがlockfile確定済みのため再現しない
- `coverage/`を`.gitignore`に追加

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-09-29（火）

**概要：Supabase統合準備として`createServiceClient`にスキーマ指定オプションを追加（v3.6）**

管理セッションからの依頼（price-app・receipt-app・payment-appを1つのSupabaseプロジェクトに統合し、各アプリ専用スキーマを持たせる方針の準備）。実際の移行作業は今回行わず、共通クライアント生成部分のオプション追加のみ。

### 🆕 追加
- **`v3.6`** `createServiceClient(url, serviceRoleKey, options?)`に`options.schema`を追加。指定したPostgresスキーマを`db.schema`として`@supabase/supabase-js`の`createClient`に渡す。未指定時は従来通り`public`（既存の呼び出し元は無改修で動作、後方互換）
- `tests/supabase.test.ts`にschema省略時/指定時のテストを追加（`client.rest.schemaName`で実際に設定されたスキーマ名を検証）。カバレッジ100%を維持
- README: 非publicスキーマをSupabase Data API経由で使うには、Supabase側の管理画面（Project Settings > API > Exposed schemas）への追加登録が必要な旨を追記（実際の設定は統合先プロジェクト作成後）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-10-01（木）

**概要：`createUiKit`のACCENT_CLASSESにamberを追加（v3.7、payment-app向け）**

payment-app担当からの依頼（管理セッション経由）。payment-appが`createUiKit`を使う際のアクセントカラー。

### 🆕 追加
- **`v3.7`** `ui.tsx`の`Accent`型・`ACCENT_CLASSES`に`amber`を追加（`bg-amber-600` / `hover:bg-amber-700` / `focus:border-amber-400` / `focus:ring-amber-100`）。既存のindigo/emeraldには影響なし、非破壊的な追加
- `tests/ui.test.ts`にamberのテストを追加。カバレッジ100%を維持

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-10-02（金）

**概要：行クリックで遷移する一覧テーブルのチェックボックス列を共通化（`components/SelectCell`、v3.8）**

管理セッションからの依頼（price-app・payment-appで個別に発生・個別に修正済みだった「チェックボックスが小さく、少しずれると行の詳細遷移が発火してしまう」問題を、手戻り覚悟でユーザー判断により共通化）。price-app（商品一覧、`428f531`）・payment-app（請求一覧、`f21023a`）双方の実装を読み、統一した設計で新規コンポーネントとして追加した。

### 🆕 追加
- **`v3.8`** `components/SelectCell`を新設（`SelectCell`: 本体行の`<td>`・個別選択用、`SelectAllCell`: ヘッダーの`<th>`・ページ全選択用）。`<label>`でセル全体をクリック領域にし（ブラウザ標準のlabel→input委譲を使うため、クリック位置の自前判定が不要）、セルの`onClick`で`stopPropagation`することで、行側のクリックハンドラの実装方法（price-appの`closest()`除外方式・payment-appの素の`onClick`方式、どちらでも）を問わず機能する設計に統一。`selectable={false}`で、選べない行でもチェックボックス無しで行遷移だけを止められる（payment-appの「選べない行」要件に対応）。行の`<tr>`自体のクリック遷移の仕組みは含まないため、各アプリ側の既存の行コンポーネントと組み合わせて使う
- 実ブラウザでの検証: esbuild（price-appのreact/react-domをalias）+ Tailwind CLI + ローカルHTTPサーバーで、price-app方式・payment-app方式双方の行クリックハンドラを模したテストハーネスを作成し、(1)チェックボックスからずれた位置のクリックで正しくトグルし遷移しないこと (2)選べない行でもセルクリックで遷移しないこと (3)セル外のクリックでは通常どおり遷移すること、を実機確認

### 📝 その他
- `TODO.md`に、`SelectCell.tsx`のクリック伝播インタラクションはTier 1 Vitestの対象外である旨を追記（`UserMenu.tsx`と同様の理由。実ブラウザでは検証済み）

### `SelectCell`の幅が縮む不具合（price-appからのフィードバック）

#### 🐛 修正
- **`v3.9`** `SelectCell`/`SelectAllCell`の既定`className`を`"w-12 p-0"`から`"w-12 min-w-[3rem] p-0"`に変更。table auto layoutでは`w-*`だけだと「希望幅」に過ぎないため、他の列が広いテーブル（price-appの商品一覧は`min-w-[960px]`）ではこの列がチェックボックス本体の幅（16px）まで縮み、せっかく広げたクリック領域（labelが16×44pxに縮小）が意味を成さなくなる不具合があった。price-appが`className="w-12 min-w-[3rem] p-0"`を自前で渡して回避・報告（置き換えpush済み）。`min-w`併記の必要性をソースのJSDoc・READMEにも明記

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-10-06（火）

**概要：保留事項3件をTODO.mdに記録**

### 📝 その他
- **（タグ管理対象外）** 管理セッションの棚卸しを受け、保留中の事項3件（basePathのルート名衝突ガードの再設計／AUTH_AWARE_MATCHERのexport継続可否／SelectCellのclassName上書き時のmin-w）を`TODO.md`に記録。コード変更なし
- **（タグ管理対象外）** メモ・未着手タスクの一元管理化（ユーザー指示、全体管理セッションの`D:\dev\admin-portal-management\TODO.md`へ）に伴い、上記3件とTier 2テストの一覧を全体管理TODO.mdへ移し、このリポジトリの`TODO.md`はポインタのみに整理。READMEの`TODO.md`参照の文言も更新。コード変更なし

### 長い画面の保存ボタンを画面下端に固定する帯の共通化（v3.10）

管理セッションからの依頼（ユーザー指示）。長い画面で保存(確定)ボタンが最下部にあって使いづらい問題が3アプリで見つかり、receipt-appが`sticky bottom-0`の固定バーで直した（`7ef4903`）方式を、price-app・payment-appでも使えるよう共通化した。payment-appの既存の浮かぶ帯（請求一覧の「まとめて入金」、`sticky bottom-4`・amber）と、入金の登録・編集のform内の送信ボタン・合計表示の要件も取り込んだ。

#### 🆕 追加
- **`v3.10`** `components/StickyActionBar`を新設。左に`status`（未保存の表示・合計・エラー等）、右に`children`（ボタン）、狭い幅では折り返す。`variant`: `"bar"`（既定、画面下端に密着・上線のみ）／`"floating"`（下端から16px浮いた角丸のカード）。`accent`: `"neutral"`（既定、白背景＋グレーの線）／`"indigo"`・`"emerald"`・`"amber"`（`createUiKit`と同じ名前、線と背景がその色の薄い色）。iPhoneのセーフエリア下部の余白は`env(safe-area-inset-bottom)`で確保（`viewport-fit=cover`未指定なら既定の余白のみ）
- SelectCellのmin-w（v3.9）の教訓として、**`className`は追加分だけ**の作りにした。固定表示に必要な指定（sticky・bottom・z-index・背景・線）は常に効き、`className`は後ろに足されるだけで置き換えない。背景・線の色はTailwindでは`className`の後勝ちにならないため上書き不可とし、色は`accent`・形は`variant`で選ぶ。`"use client"`は付けていない（状態・イベントを持たず、Server Componentからも使える）
- `tests/stickyActionBar.test.ts`（7テスト）: `className`を渡しても固定表示用の指定が消えないこと、variant/accentごとのクラス、`status`の有無を検証（状態を持たない関数を直接呼んで返る要素のpropsを見る方式。`jsdom`等は不要）
- 実ブラウザでの検証（esbuild＋Tailwind CLI＋ローカルサーバーの検証ハーネス）: 長いフォーム（40行）でスクロール位置が先頭・中ほどでも帯が画面下端に密着し、フォーム末尾では通常の位置に戻ること／帯の中の`type="submit"`でフォームが送信されること／幅375pxで`status`が折り返しボタンが右寄せの下段に並び、横スクロールが出ないこと／`floating`＋`amber`で下端から16px浮き、amber-50/95の背景・amber-300の枠線・角丸・影になること。`env(safe-area-inset-bottom)`は実機（iPhone）では未確認（ブラウザではフォールバックの12pxになることのみ確認）

### `AUTH_AWARE_MATCHER`の非推奨化（v3.11）

管理セッション経由のユーザー判断（2026-10-06）。「export し続ける意味があるか」を再検討するため全アプリの使い方を調べたところ、どのアプリも`AUTH_AWARE_MATCHER`をimportしておらず（price-app・receipt-app・payment-appは`["/:path*"]`のリテラルを自前で書き、importするのは`isStaticAssetPath`のみ。admin-portal本体は独自のmatcherで`middlewareMatcher`自体を使っていない）、Next.jsの静的解析の制約上import先として使えない定数だった。削除は慣例上破壊的変更になるため、次の破壊的変更（v4）のついでに行うこととし、まず非推奨化した。

#### 🔄 変更
- **`v3.11`** `AUTH_AWARE_MATCHER`のJSDocに`@deprecated`を追加（値は`["/:path*"]`のまま、コードの動作は変えない）。READMEの`middlewareMatcher`の説明にも非推奨・v4で削除予定の旨を明記
- **`v3.11`** READMEの使用例（middleware.ts）から、使っていない`AUTH_AWARE_MATCHER`のimport行を外し（コピーすると未使用importになるため）、`config.matcher`の注釈を「importせずリテラルを写す。値の目安は非推奨の定数」に書き直した

#### 📝 その他
- `SelectCell`の`className`が上書き（マージなし）である件は、ユーザー判断で現状維持（README/JSDocの注意書きのまま）。次の破壊的変更（v4）が出たときに再検討する（全体管理TODO.mdで管理）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📅 2026-10-07（水）

**概要：一覧の値を押すとその値で検索するボタンを共通化（`components/SearchValue`、v3.12）**

管理セッション経由のユーザー指示。payment-app（請求一覧・操作履歴、`components/SearchValue.tsx`、`ca4c3bd`）とreceipt-app（品目一覧`ItemExplorer.tsx`の品名）に、ほぼ同じ形のボタンが個別にあったため共通化した。payment-app版を土台にした。

### 🆕 追加
- **`v3.12`** `components/SearchValue`を新設。props: `value`（空なら`null`）、`onSearch(value)`、`accent`（`neutral`[既定]/`indigo`/`emerald`/`amber`、ホバー・フォーカス時の文字色）、`title`（既定「『値』で検索」、上書き可）、`stopPropagation`（既定`true`）、`className`（**追加のみ**。`truncate`・`flex-1`・`min-w-0`等を足す用途で、既定のクラスは置き換わらない。SelectCellのmin-wの教訓）。検索の中身は共通化せず`onSearch`で呼び出し側が決める。`"use client"`付き。既存のAPIは変更なし
- **ホバーの手がかりをリンクと区別**: payment-appで、詳細へ移動するリンクの`hover:underline`（実線）とSearchValueの下線が同じに見えて紛らわしいという指摘があったため、SearchValueは**色の変化＋点線の下線**（`hover:underline hover:decoration-dotted`、`focus-visible`も同様）にした。普段は装飾なしで一覧の見た目は変えない。実ブラウザで、ホバー時にSearchValueは点線（amber-700）、リンクは実線になることを確認
- `tests/searchValue.test.ts`（7テスト）: 空値で`null`、`title`の既定と上書き、`onSearch`の呼び出しと`stopPropagation`の有無、`className`が追加のみであること、ホバーの点線、`accent`ごとのホバー色
- 実ブラウザでの検証: 値のボタンを押しても行のクリックが発火せず`onSearch`だけが呼ばれること（行の空きセルを押すと行のクリックが発火することも確認）、`className`の`min-w-0 flex-1 truncate`で長い名前が省略表示され隣の要素が潰れないこと、空の`value`では何も描画されないこと

### 📝 その他
- receipt-appの品名ボタンは、空のときに「-」を表示し`disabled`にしている。共通版は空なら`null`のため、receipt-app側で空のときの表示（「-」）を自前で出す必要がある（READMEに明記）
