# TODO

`WORKFLOW.md`の「メモ：」の扱いに準じ、ユーザーからの「メモ：」指示や、対応を見送った候補をここに記録する。対応したら削除し、`CHANGELOG.md`に記録する。

## テストのTier 2（見送り、2026-09-28）

`UserMenu.tsx`のインタラクション（外側クリック/Escapeで閉じる挙動。v3.3で実際に直したロジック）のテスト。Tier 1（純粋ロジックのみ）に対して、jsdom + Testing Library + user-eventの追加セットアップが必要になるため、ユーザー承認で今回は見送り。将来必要になったら着手する。

`SelectCell.tsx`（v3.8）のクリック伝播（`stopPropagation`・labelのクリック委譲）も同様にUI
インタラクションのためTier 1の対象外。実装時にesbuild+Tailwind+簡易サーバーで実ブラウザ検証済み
（price-app方式・payment-app方式どちらの行クリックハンドラでも正しく動作することを確認）だが、
自動テストとしては未着手。
