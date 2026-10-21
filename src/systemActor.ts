/**
 * システム用の操作者（人がログインしていない操作: 将来のMakeShop連携のAPI・バッチ、自動処理など）の識別子の規約。
 *
 * - 操作履歴の`actor_id`が **`sys_`で始まる値をシステム用に予約**する（例: `sys_makeshop`、`sys_import`）。
 *   人のid（`portal.users.id`、サーバーが生成する`u_…`）とは衝突しない
 * - 形式は`^sys_[a-z0-9_]{1,32}$`（小文字・数字・`_`だけ）
 * - **空（null）の`actor_id`とは別**: nullは「照合できなかった旧い行」（管理者だけが見える）。システム操作はnullにせず、必ず`sys_…`を入れる
 * - システム用のidは**サーバーが決める**（各APIルートのコード内の定数）。画面・外部入力からは受けない
 *
 * DB・Next.jsに依存しない純粋な関数だけ（ブラウザでも呼べる）。
 */

/** システム用の操作者idの接頭辞（予約） */
export const SYSTEM_ACTOR_PREFIX = "sys_";

const SYSTEM_ACTOR_PATTERN = /^sys_[a-z0-9_]{1,32}$/;
// 大文字小文字を区別しない。`u`フラグ無しの`i`はASCII以外を畳み込まない（例: 長いs「ſ」は`s`に一致しない）
const SYSTEM_PREFIX_PATTERN = /^sys_/i;

/**
 * 形式に合う、システム用の操作者idか。`sys_`だけ・大文字入り・33文字以上・空白入り・null・undefined・空は`false`。
 * 表示（「(削除済み)」を付けない等）の判定に使う。
 */
export function isSystemActor(id: string | null | undefined): boolean {
  return typeof id === "string" && SYSTEM_ACTOR_PATTERN.test(id);
}

/**
 * 予約済みの接頭辞`sys_`で始まるか（**形式を問わず、大文字小文字も区別しない**）。
 * 「人のidがシステム用を名乗っていないか」のガード（`historyAccess`）と、ユーザー作成時の検査に使う。
 * 形式違いの`sys_…`（`sys_Make`・`SYS_x`・`sys_`のみ）も`true`にする（通さない側=fail-closed）。
 */
export function hasSystemActorPrefix(id: string | null | undefined): boolean {
  return typeof id === "string" && SYSTEM_PREFIX_PATTERN.test(id);
}
