import type { SupabaseClient } from "@supabase/supabase-js";
import { listPortalUsers, PortalUsersError } from "./portalUsers";
import { isSystemActor } from "./systemActor";

/**
 * 操作履歴に出す操作者の名前の解決（v3.21〜）。
 *
 * 履歴には**今の名前**を出す（`actor_id`から`portal.users`を引く。改名がすぐ反映される）。
 *
 * | 履歴の行 | 表示する名前 | status |
 * |---|---|---|
 * | `actor_id`が`portal.users`にいる | 今の名前（空ならログインID） | `current` |
 * | `actor_id`が`portal.users`にいない（削除済み） | 記録時の名前（`actorLabel`で「(削除済み)」が付く） | `deleted` |
 * | `actor_id`が`sys_…`（システム用） | 記録時の名前。「(削除済み)」は付けない | `system` |
 * | `actor_id`がnull・空（照合できなかった旧い行） | 記録時の名前。「(削除済み)」は付けない | `legacy` |
 * | ユーザー一覧が引けなかった（DBエラー・空） | 記録時の名前。「(削除済み)」は付けない | `unknown` |
 *
 * 「(削除済み)」は、**削除されたと確認できたときだけ**付ける（引けなかったときに全行が削除済みに見える誤表示を避ける）。
 *
 * **認可とは逆に、失敗しても履歴は出す**（名前は表示専用）。DBエラー・一覧が空のときは全行を`unknown`にして続行する。
 * 想定外の例外は握りつぶさず再throw。ブラウザ側（`window`がある環境）で呼ばれたら、`unknown`に丸めず例外にする。
 *
 * ユーザー一覧そのものは返さない（返すのは、渡された行ごとの`ActorDisplay`だけ。他のユーザーの名前・ロール・ログインIDは出ない）。
 * 一覧は`withActorDisplays`の中で**1回だけ**引く（行数にかかわらず問い合わせは1回。キャッシュなし=毎回引く）。
 * 渡すSupabaseクライアントは、Next.jsのデータキャッシュに載らないもの（`fetch`が`cache: "no-store"`）にすること。
 * 「旧: ○○」の併記は未対応（後から`previousName`を足せる形にしてある）。
 */

// 既定のスキーマ等が型に出るクライアントも受け取れるようにする
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

export type ActorStatus = "current" | "deleted" | "system" | "legacy" | "unknown";

export interface ActorDisplay {
  /** 表示する名前。現ユーザーは今の名前、それ以外は記録時の名前 */
  name: string;
  status: ActorStatus;
}

/** 削除済みのときの接尾辞（文言はここだけで管理する）。全アプリで同じ表記にそろえる */
export const ACTOR_DELETED_SUFFIX = "(削除済み)";

/** 画面に出す文字列。`deleted`のときだけ「名前 (削除済み)」 */
export function actorLabel(actor: ActorDisplay): string {
  return actor.status === "deleted" ? `${actor.name} ${ACTOR_DELETED_SUFFIX}` : actor.name;
}

/**
 * 表示を決める純粋関数。`directory`はユーザーidから今の名前への対応（`loadActorDirectory`の結果）。
 * `null`のとき（引けなかった）は`unknown`。`sys_…`とnull・空の`actorId`は、一覧を使わずに決まる。
 */
export function displayActor(
  actorId: string | null | undefined,
  recordedName: string | null | undefined,
  directory: ReadonlyMap<string, string> | null
): ActorDisplay {
  const recorded = recordedName ?? "";
  if (typeof actorId !== "string" || actorId === "") return { name: recorded, status: "legacy" };
  if (isSystemActor(actorId)) return { name: recorded, status: "system" };
  if (directory === null) return { name: recorded, status: "unknown" };
  const current = directory.get(actorId);
  return current === undefined ? { name: recorded, status: "deleted" } : { name: current, status: "current" };
}

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new PortalUsersError("actorDisplay はサーバー専用です（ブラウザ側では呼べません）");
  }
}

/**
 * `portal.users`を1回だけ引いて、ユーザーidから今の名前への対応を作る（名前が空ならログインID）。
 * DBエラー・一覧が空のときは`null`（`unknown`扱い）。想定外の例外は再throw。ブラウザ側では例外。
 */
export async function loadActorDirectory(client: AnyClient): Promise<ReadonlyMap<string, string> | null> {
  assertServer();
  let users;
  try {
    users = await listPortalUsers(client);
  } catch (e) {
    if (e instanceof PortalUsersError) return null;
    throw e;
  }
  // portal.users には管理者が最低1人いる前提。空は異常なので「全員が削除済み」とは扱わない
  if (users.length === 0) return null;
  return new Map(users.map((u) => [u.id, u.name.trim() !== "" ? u.name : u.loginId]));
}

/**
 * 履歴の行の配列に`actor`（`ActorDisplay`）を付けて返す。順序と元の項目は保たれる。
 * 一覧を引く必要がある行（人のid）が無いときは、問い合わせをしない。
 *
 * 使い方: `await withActorDisplays(supabase, rows, (r) => ({ actorId: r.actorId, name: r.user }))`
 * →画面には`actorLabel(row.actor)`を出す。検索・絞り込みには解決後の表示名を渡す。
 */
export async function withActorDisplays<T extends object>(
  client: AnyClient,
  rows: readonly T[],
  pick: (row: T) => { actorId: string | null | undefined; name: string | null | undefined }
): Promise<Array<T & { actor: ActorDisplay }>> {
  assertServer();
  const picked = rows.map(pick);
  const needsLookup = picked.some((p) => typeof p.actorId === "string" && p.actorId !== "" && !isSystemActor(p.actorId));
  const directory = needsLookup ? await loadActorDirectory(client) : null;
  return rows.map((row, i) => ({ ...row, actor: displayActor(picked[i].actorId, picked[i].name, directory) }));
}
