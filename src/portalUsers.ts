import type { SupabaseClient } from "@supabase/supabase-js";

// 既定のスキーマ（price・receipt・payment等）が型に出るクライアントも受け取れるようにする
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

/**
 * ユーザーとロールの割当（`portal.users`）を読むための共通処理（アカウント一元化フェーズ3）。
 * 権限マトリクス（ロールごとの機能のON/OFF）は各アプリに残り、ここでは扱わない。
 *
 * **サーバー専用**。ロールは JWT のスナップショットを信用せず、1リクエストごとに引く（キャッシュなし。
 * ロール変更・削除を即時に反映するため）。呼び出すのは API Route・Server Component など
 * Node.js のサーバー側のみ。Edge の middleware では呼ばないこと（Supabase クライアントが ws に依存する）。
 *
 * **接続の渡し方**: 各アプリが既に持っている service_role の Supabase クライアント
 * （`createServiceClient`が返すもの。同じSupabaseプロジェクトの別スキーマ用でよい）を引数で渡す。
 * このモジュールは URL・キーを受け取らず・保持せず・環境変数も読まない（キーを扱う場所を
 * `createServiceClient`だけに限り、ブラウザ側のコードにキーが混ざる余地を作らない）。クライアントの既定の
 * スキーマに関わらず、必ず`portal`スキーマを明示して読む（price/receipt/paymentのテーブルを誤って
 * 読まない）。Supabase側の「Exposed schemas」に`portal`の追加が必要。
 * 万一ブラウザ側で呼ばれたら、実行時に例外にする（`window`がある環境）。
 *
 * **リトライしない**: supabase-js は GET を通信エラー・503で最大3回（1秒・2秒・4秒の待ち）自動リトライするが、
 * 毎リクエストの認可の参照では、障害時に最大約7秒待たされてからエラーになるため、リトライを無効にして
 * 失敗をすぐ`PortalUsersError`で返す（再試行するかは呼び出し側が決める）。
 *
 * **エラーの区別**: 「ユーザーが存在しない」は`null`、「DBエラー（接続失敗・`portal`が公開されていない等）」は
 * `PortalUsersError`を投げる。拒否するかどうかの判断（全拒否=fail-closed、503にする等）は呼び出し側が行う。
 */

export interface PortalUser {
  id: string;
  loginId: string;
  name: string;
  /** `portal.users.role`（DBのCHECK制約で「管理者」「スタッフ」「閲覧のみ」のどれか）。ロールの意味づけは各アプリが行う */
  role: string;
}

/** DBエラー（接続失敗・クエリの失敗・`portal`スキーマが公開されていない等）。「ユーザーが存在しない」とは別。 */
export class PortalUsersError extends Error {
  /** PostgREST のエラーコード（例: スキーマ未公開は`PGRST106`）。無ければundefined */
  readonly code?: string;
  readonly cause?: unknown;

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "PortalUsersError";
    this.code = options.code;
    this.cause = options.cause;
  }
}

// portal.users の login_id の CHECK 制約（users_login_id_format）と同じ
const LOGIN_ID_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

interface UserRow {
  id: string;
  login_id: string;
  name: string;
  role: string;
}

const COLUMNS = "id, login_id, name, role";

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new PortalUsersError("portalUsers はサーバー専用です（ブラウザ側では呼べません）");
  }
}

function toUser(row: UserRow): PortalUser {
  return { id: row.id, loginId: row.login_id, name: row.name, role: row.role };
}

/**
 * ログインID（JWTクレームの`sub`と同じ）から現在のユーザーを引く。大文字小文字は区別しない
 * （`login_key` = `lower(login_id)` の生成列で照合）。
 *
 * - 見つかれば`PortalUser`、**存在しなければ`null`**（登録が無い・削除済み・ログインIDの形式が不正）
 * - ログインIDが`portal.users`の形式（英数字・`.`・`_`・`-`、1〜32文字）でなければ、DBに問い合わせず`null`
 *   （そのようなユーザーは存在し得ない。`name`では照合しない: 管理者が改名できるため）
 * - **DBエラーは`PortalUsersError`を投げる**（拒否の判断・503にするかは呼び出し側）
 */
export async function resolvePortalUser(client: AnyClient, loginId: string): Promise<PortalUser | null> {
  assertServer();
  if (!LOGIN_ID_PATTERN.test(loginId)) return null;
  const { data, error } = await client
    .schema("portal")
    .from("users")
    .select(COLUMNS)
    .eq("login_key", loginId.toLowerCase())
    .retry(false)
    .maybeSingle<UserRow>();
  if (error) throw new PortalUsersError(`portal.users の取得に失敗しました: ${error.message}`, { code: error.code, cause: error });
  return data ? toUser(data) : null;
}

/** 全ユーザーを、ログインID（大文字小文字を区別しない）順で返す。DBエラーは`PortalUsersError`を投げる。 */
export async function listPortalUsers(client: AnyClient): Promise<PortalUser[]> {
  assertServer();
  const { data, error } = await client
    .schema("portal")
    .from("users")
    .select(COLUMNS)
    .order("login_key", { ascending: true })
    .retry(false)
    .returns<UserRow[]>();
  if (error) throw new PortalUsersError(`portal.users の取得に失敗しました: ${error.message}`, { code: error.code, cause: error });
  return (data ?? []).map(toUser);
}
