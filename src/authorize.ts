import type { SupabaseClient } from "@supabase/supabase-js";
import { PortalUsersError, resolvePortalUser, type PortalUser } from "./portalUsers";
import { hasSystemActorPrefix } from "./systemActor";

/**
 * 全アプリ共通の「毎回引く」認可（アカウント一元化フェーズ3の3c）。
 * リクエストごとに`portal.users`を引き（キャッシュなし。削除・ロール変更が即時に反映される）、
 * 結果を共通の形で返す。**すべて全拒否（fail-closed）**: ユーザーが見つからない・DBエラー・ロールが
 * 3値以外や空、のどれでも拒否になる（アプリごとの「ロール不明なら全許可」のような fail-open は無い）。
 *
 * サーバー専用（API Route・Server Component）。Edgeのmiddlewareでは呼ばない（Supabaseクライアントが
 * wsに依存する）。ブラウザ側で呼ばれたら実行時に例外。リトライなし（`resolvePortalUser`と同じ）。
 * **JWTの`role`クレームは参照しない**（ロールは常に`portal.users`の現在の値）。`verifySession`
 * （セッションの検証）は各アプリのまま行い、得られた`sub`をここに渡す。
 *
 * - `authorizeActor`: ユーザーの存在とロール（3値）を確認する。読み取りの入口に使う
 * - `authorizeWrite`: 上に加えて、**「閲覧のみ」を書き込み不可として拒否**する。書き込み（編集・取込・
 *   削除など）の入口に使う。どのAPIが書き込みかの分類は各アプリが決める
 * - 結果は`{ ok: true, user }`か`{ ok: false, reason, status, message }`。`authFailureBody`で
 *   JSON本文（`{ error, code }`）にでき、`NextResponse.json(body, { status: result.status })`に渡せる
 *   （共通部品はNext.jsに依存しない）
 *
 * **「閲覧のみ」の書き込み不可は、各アプリの権限マトリクスより優先する**（`authorizeWrite`が先に拒否する）。
 * マトリクス側で閲覧のみに書き込み系の権限を設定できても、無効になる。
 *
 * 利用者向けのメッセージは`AUTH_FAILURES`の1か所にまとめてある（文言は後から変えやすいように。
 * 変えるときはここだけ）。
 */

// 既定のスキーマ等が型に出るクライアントも受け取れるようにする
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

/**
 * ポータルのロール（`portal.users.role`のCHECK制約と同じ3値）。
 * **ロールを追加するときは、3か所を直すこと**: (1)DBの`portal.users`のCHECK制約（`users_role_known`）
 * (2)この定数 (3)各アプリの権限マトリクス（price-app・payment-appなど）。
 */
export const PORTAL_ROLES = ["管理者", "スタッフ", "閲覧のみ"] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export function isPortalRole(role: unknown): role is PortalRole {
  return typeof role === "string" && (PORTAL_ROLES as readonly string[]).includes(role);
}

/** 書き込み（編集・取込・削除など）ができるロールか。管理者・スタッフは可、閲覧のみ・不明・空は不可（fail-closed） */
export function canWrite(role: string | null | undefined): boolean {
  return role === "管理者" || role === "スタッフ";
}

export type AuthFailureReason = "unauthenticated" | "unregistered" | "unavailable" | "invalid_role" | "read_only";

/** 拒否の種類ごとのHTTPステータスと、利用者向けの共通メッセージ（文言はここだけで管理する） */
export const AUTH_FAILURES: Record<AuthFailureReason, { status: 401 | 403 | 503; message: string }> = {
  unauthenticated: { status: 401, message: "ログインが必要です" },
  unregistered: { status: 401, message: "ユーザーが登録されていません。もう一度ログインしてください" },
  unavailable: { status: 503, message: "ユーザー情報を確認できませんでした。しばらくしてからもう一度お試しください" },
  invalid_role: { status: 403, message: "権限が設定されていません。管理者に連絡してください" },
  read_only: { status: 403, message: "閲覧のみの権限では、この操作はできません" },
};

/** 認可を通ったユーザー。`role`は3値のどれかであることが保証される */
export interface AuthorizedUser extends PortalUser {
  role: PortalRole;
}

export interface AuthFailure {
  ok: false;
  reason: AuthFailureReason;
  status: 401 | 403 | 503;
  message: string;
}

export type AuthResult = { ok: true; user: AuthorizedUser } | AuthFailure;

function fail(reason: AuthFailureReason): AuthFailure {
  return { ok: false, reason, status: AUTH_FAILURES[reason].status, message: AUTH_FAILURES[reason].message };
}

/**
 * ログインID（JWTクレームの`sub`）から、現在のユーザーとロールを確認する。
 *
 * - `loginId`が無い（`null`・`undefined`・空文字）→ `unauthenticated`（401）
 * - `portal.users`に無い（削除済み・形式不正を含む）→ `unregistered`（401。ログアウト扱い）
 * - DBエラー（`PortalUsersError`）→ `unavailable`（503）
 * - ロールが3値以外・空 → `invalid_role`（403）
 * - `PortalUsersError`以外の想定外の例外は握りつぶさず再throw（呼び出し側では500になり、拒否のまま）
 */
export async function authorizeActor(client: AnyClient, loginId: string | null | undefined): Promise<AuthResult> {
  if (typeof window !== "undefined") {
    throw new PortalUsersError("authorize はサーバー専用です（ブラウザ側では呼べません）");
  }
  if (typeof loginId !== "string" || loginId === "") return fail("unauthenticated");
  let user: PortalUser | null;
  try {
    user = await resolvePortalUser(client, loginId);
  } catch (e) {
    if (e instanceof PortalUsersError) return fail("unavailable");
    throw e;
  }
  if (!user) return fail("unregistered");
  if (!isPortalRole(user.role)) return fail("invalid_role");
  return { ok: true, user: { ...user, role: user.role } };
}

/**
 * `authorizeActor`に加えて、書き込み不可のロール（閲覧のみ）を`read_only`（403）で拒否する。
 * 書き込み（編集・取込・削除など）の入口に使う。アプリ側の権限マトリクスより先にこれを通すこと。
 */
export async function authorizeWrite(client: AnyClient, loginId: string | null | undefined): Promise<AuthResult> {
  const result = await authorizeActor(client, loginId);
  if (!result.ok) return result;
  if (!canWrite(result.user.role)) return fail("read_only");
  return result;
}

/** 拒否結果をJSONの本文（`{ error, code }`）にする。`NextResponse.json(authFailureBody(r), { status: r.status })`の形で使う */
export function authFailureBody(failure: AuthFailure): { error: string; code: AuthFailureReason } {
  return { error: failure.message, code: failure.reason };
}

// ---------------------------------------------------------------------------------------------
// 操作履歴を権限で制限する（v3.21〜）。**DBを引かない純粋な関数**なので、ブラウザ側（メニューの出し分け）でも呼べる
// （`window`の検査は入れない）。ただし**強制は必ずサーバー側**（データを読む関数が`historyAccess`を通すこと）。
// ---------------------------------------------------------------------------------------------

/** 操作履歴をどこまで見られるか。all=全件、own=自分の操作だけ、none=見られない */
export type HistoryScope = "all" | "own" | "none";

// ロールを追加したとき、型エラーで「履歴の範囲」と「history.viewの欄の固定」を決めさせる（Record<PortalRole, …>）
const HISTORY_SCOPES: Record<PortalRole, HistoryScope> = {
  管理者: "all",
  スタッフ: "own",
  閲覧のみ: "none",
};

/**
 * 役割だけで決まる、操作履歴の範囲の上限。管理者=all、スタッフ=own、閲覧のみ・不明・空・null・undefined=none（fail-closed）。
 * `history.view`（各アプリの権限）はこの範囲を**広げられず、止めることだけできる**（`historyAccess`で重ねる）。
 */
export function historyScope(role: string | null | undefined): HistoryScope {
  return isPortalRole(role) ? HISTORY_SCOPES[role] : "none";
}

/** `history.view`の欄の固定: "on"=常に可（管理者）、"off"=常に不可（閲覧のみ・不明・空）、null=設定できる（スタッフ） */
export type HistoryViewLock = "on" | "off" | null;

const HISTORY_VIEW_LOCKS: Record<PortalRole, HistoryViewLock> = {
  管理者: "on",
  スタッフ: null,
  閲覧のみ: "off",
};

/**
 * `history.view`の欄の固定。画面（チェックボックスの無効化）とサーバー（実効の判定）が**同じ関数**を見る。
 * 固定された役割の保存済みの値（管理者に`false`、閲覧のみに`true`など）は無視される。
 */
export function historyViewLock(role: string | null | undefined): HistoryViewLock {
  return isPortalRole(role) ? HISTORY_VIEW_LOCKS[role] : "off";
}

/**
 * 実効の`history.view`（履歴の画面を開けるか）。固定があれば固定、無ければ`granted === true`のときだけ可
 * （`false`・`null`・`undefined`は不可）。権限項目の無いアプリは`granted`に`true`を明示して渡す。
 */
export function effectiveHistoryView(role: string | null | undefined, granted: boolean | null | undefined): boolean {
  const lock = historyViewLock(role);
  if (lock === "on") return true;
  if (lock === "off") return false;
  return granted === true;
}

/** 履歴の画面を開けるか（メニュー・ページの入口の判定）。`effectiveHistoryView`と同じ */
export const canViewHistory = effectiveHistoryView;

/**
 * `historyAccess`の結果。**ownのときは`actorId`が必ず付く**（`.eq("actor_id", undefined)`のような書き間違いを型で防ぐ）。
 * - `all`: 条件なし（`actor_id`がnullの行も含む）
 * - `own`: `actor_id = actorId`を**問い合わせの条件**にしてから`order`・`limit`
 * - `none`: DBを読まない（空、または「見られない」の案内）
 */
export type HistoryAccess = { scope: "all" } | { scope: "own"; actorId: string } | { scope: "none" };

/**
 * データを読む側が使う。役割固定の範囲（`historyScope`）と、各アプリの`history.view`（`granted`）の積。
 * `authorizeActor`の結果の`user`をそのまま渡せる（認可に失敗したときは`null`を渡す→`none`）。
 *
 * - `history.view`が不可（スタッフが✕、閲覧のみ・不明なロール）→ `none`
 * - 管理者 → `all`（`history.view`は常に可）
 * - スタッフ（`granted`が`true`）→ `own`（`actorId`はポータルのユーザーid）
 * - **idが`sys_`で始まる「ユーザー」は役割にかかわらず`none`**: `sys_…`はシステム用の操作者idの予約で、人のセッションが
 *   名乗ってシステムの行を自分のものとして読めないようにする。idが空・文字列でない場合も`none`
 * - 絞り込みのキーは**必ず`portal.users.id`**（ログインID・名前では絞らない）
 */
export function historyAccess(
  user: { id: string; role: string } | null | undefined,
  granted: boolean | null | undefined
): HistoryAccess {
  if (!user) return { scope: "none" };
  const id = user.id;
  if (typeof id !== "string" || id === "" || hasSystemActorPrefix(id)) return { scope: "none" };
  const scope = historyScope(user.role);
  if (scope === "none" || !effectiveHistoryView(user.role, granted)) return { scope: "none" };
  return scope === "all" ? { scope: "all" } : { scope: "own", actorId: id };
}

/** 操作履歴が見られない（`none`）ときの、画面の共通の案内文（文言はここだけで管理する） */
export const HISTORY_NONE_MESSAGE = "閲覧のみの権限では、操作履歴は見られません";

/** 範囲の表示名（権限画面の`history.view`の行の説明などで、全アプリの文言をそろえる） */
export const HISTORY_SCOPE_LABELS: Record<HistoryScope, string> = {
  all: "全件",
  own: "自分の操作だけ",
  none: "見られない",
};
