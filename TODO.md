# TODO

`WORKFLOW.md`の「メモ：」の扱いに準じ、ユーザーからの「メモ：」指示や、対応を見送った候補をここに記録する。対応したら削除し、`CHANGELOG.md`に記録する。

## テストのTier 2（見送り、2026-09-28）

`UserMenu.tsx`のインタラクション（外側クリック/Escapeで閉じる挙動。v3.3で実際に直したロジック）のテスト。Tier 1（純粋ロジックのみ）に対して、jsdom + Testing Library + user-eventの追加セットアップが必要になるため、ユーザー承認で今回は見送り。将来必要になったら着手する。

`SelectCell.tsx`（v3.8）のクリック伝播（`stopPropagation`・labelのクリック委譲）も同様にUI
インタラクションのためTier 1の対象外。実装時にesbuild+Tailwind+簡易サーバーで実ブラウザ検証済み
（price-app方式・payment-app方式どちらの行クリックハンドラでも正しく動作することを確認）だが、
自動テストとしては未着手。

## basePathのルート名衝突ガードの再設計（保留、2026-10-06記録）

`basePath.ts`の二重付与防止ガードが、アプリ内部ルートのトップレベルセグメント名と自分のbasePath値が偶然一致すると誤判定する（READMEの「既知の制約」参照）。直すと挙動が変わる破壊的変更になるため見送り中。price-appはこの理由で`basePath`モジュールを不採用。

## AUTH_AWARE_MATCHERのexport継続可否（保留、2026-10-06記録）

Next.jsの`config.matcher`はビルド時の静的解析でimportした定数を認識しないため、`AUTH_AWARE_MATCHER`は実質import不可で、各アプリがリテラルを写すしかない（JSDoc・READMEに注意書き済み）。exportし続けるか再検討する。

## SelectCellのclassName上書き時のmin-w（保留、2026-10-06記録）

`SelectCell`/`SelectAllCell`の`className`は上書き（マージなし）のため、呼び出し側が`min-w`を付け忘れると、他の列が広いテーブルで列が縮み、クリック領域が狭くなる不具合が再発する。v3.9でREADME/JSDocへの明記のみ対応済みで、API側で`min-w`を強制する対策は未実施。
