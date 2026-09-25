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

**概要：共有UI部品の長い文字列耐性・外側クリック修正・`inputClassBase`提供（v3.3）**

price-appで見つかった「長い文字列でボタン位置がずれる」不具合と同種の問題を共有UI部品で調査（管理セッション経由の依頼）し、判明した点を全て反映。いずれも見た目の防御的変更で非破壊的（マイナータグ）。

### 🆕 追加
- **`v3.3`** `createUiKit()`が`inputClassBase` / `selectClassBase`（幅指定を含まない変種）を返すように（`df3fbad`）。`${inputClass} w-auto`のように後ろに足してもTailwindの生成順で`w-full`が後勝ちして効かず全幅で縦積みになる問題（receipt-appの一覧フィルターselectで発生）の解消用。price-appは`inputClass.replace(/^w-full\s+/, "")`で自前導出していたが、共有側で提供するようにした。`inputClass`自体の文字列は変更なし

### 🔄 変更
- **`v3.3`** `UserMenu`: 名前を`max-w-[7rem] sm:max-w-[10rem] truncate`＋`title`（フルネーム）、アイコンに`shrink-0`（`df3fbad`）。ドロップダウンを`top-9`固定から`top-full mt-1`に変更しpillの高さに追従。実ブラウザで修正前後を比較（幅375/320px × 短い名前/長い日本語名/長いメール）: 旧版は長い名前でpillが2行に伸び（34→42px）ドロップダウンが6px重なる、メールだと画面外へ最大59pxはみ出す・ヘッダーが165pxに膨らむ。新版はpill 34px固定・はみ出しなし・ドロップダウンとの間隔4px一定
- **`v3.3`** `PrimaryButton` / `SecondaryButton` / `UserMenu`のドロップダウンリンクに`whitespace-nowrap`（`df3fbad`）

### 🐛 修正
- **`v3.3`** `UserMenu`の「外側クリックで閉じる」が本文側では効いていなかった不具合を修正（`df3fbad`）。`fixed inset-0`の透明オーバーレイは、ヘッダーが`backdrop-blur`を持つと`fixed`の基準がヘッダーになりヘッダー領域しか覆わない（実ブラウザで確認: オーバーレイ985×58、`backdrop-blur`を外すと985×700）。price-app/receipt-appのヘッダーはどちらも`backdrop-blur-md`のため、共通化前から本文側のクリックでは閉じなかった。オーバーレイをやめ、documentの`pointerdown`（メニュー外）と`Escape`で閉じる方式に変更（ヘッダーの余白・本文どちらのクリックでも閉じる。クリックはメニューを閉じつつ下の要素にも通常通り届く）。合成イベントと実マウス操作の両方で確認

### 📝 その他
- 検証方法: 実際の`UserMenu.tsx`を修正前後で`esbuild`でバンドルし、Tailwind CLIで生成したCSSと合わせて実ブラウザで計測（テスト用ハーネスとサーバーは検証後に削除済み、リポジトリには含めない）。アプリ本体への組み込み後の確認は各アプリ側で必要

### 🔄 変更（v3.4、同日追加）
- **`v3.4`** `UserMenu`のボタンに`max-w-full min-w-0`、名前に`min-w-0`を追加し、親が狭いときにボタンが縮んで名前が省略表示される作りに（`8198944`）。receipt-appからの報告（320pxでボタンが内容幅162pxのまま突き抜けて横スクロールになる。アプリ側でタイトルを縮める方針に直して回避済み）への対応（管理セッション経由、ユーザー指示）。実際の`UserMenu.tsx`をv3.3版と新版でバンドルし、実ヘッダー構成（receipt-app: モバイルはタイトル表示／タイトルを縮めない版・縮む版、price-app: タイトルなし）で320/375px幅で比較
  - **重要（実測で判明）: 共有側の変更だけでは不十分で、呼び出し側のUserMenuを包む要素（`<div className="ml-auto">`）にも`min-w-0`が必要**。flex項目は既定で内容の最小幅より縮まないため、包む要素が縮められないと中身が縮められても親が縮まずはみ出す。320px・タイトルを縮めない構成でラッパーに`min-w-0`が無い場合は新旧とも33pxはみ出し（共有側では解決不能）。ラッパーに`min-w-0`を付けると、新版はボタン128px＋名前省略・はみ出しなし（旧v3.3は33pxはみ出し。タイトルが縮む構成でも旧版は20pxはみ出し＝ラッパーに`min-w-0`を付ける場合は新版が必須）
  - 375px幅・price-app構成・短い名前はv3.3と同一の見た目（pill 34px、幅98/162px）。ドロップダウン間隔4px・外側クリック・Escape・メニュー内操作もv3.3から退行なし
  - READMEとJSDocに、呼び出し側ラッパーへの`min-w-0`が必要な旨を明記
