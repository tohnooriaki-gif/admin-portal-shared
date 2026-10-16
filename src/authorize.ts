import type { SupabaseClient } from "@supabase/supabase-js";
import { PortalUsersError, resolvePortalUser, type PortalUser } from "./portalUsers";

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
