import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canWrite,
  HISTORY_SCOPE_LABELS,
  historyViewLock,
  isPortalRole,
  PORTAL_ROLES,
  type PortalRole,
} from "./authorize";

/**
 * 3アプリ（price・payment・receipt）共通の権限項目（権限表）の部品（v3.22〜、設計は`docs/design-permission-matrix-all.md`）。
 * **追加のみ**（既存の関数は変えていない）。取り込んだだけでは、アプリの挙動は何も変わらない。
 *
 * 共通部品に置くもの: 項目の型・共通3項目の定義・固定の判定・正規化と判定・失敗時の文言・`role_permissions`の読み書き。
 * 置かないもの: アプリ固有の項目の定義（key・表示名・既定の一覧。各アプリが`definePermissions`に並べる）、設定画面（UI）、
 * 変更の記録（操作履歴への書き込み）、どのAPIがどの項目を要求するか。
 *
 * - 前半（型・定義・判定）はDB・Next.jsに依存しない純粋な関数で、**ブラウザでも呼べる**
 * - 後半（`loadRoleMatrix`・`saveRoleMatrix`）は**サーバー専用**。ブラウザ側で呼ばれたら実行時に例外
 * - `history.view`の固定・実効は`authorize`の`historyViewLock`に**委譲**する（二重に定義しない）。書き込み系の固定は`canWrite`に委譲する
 * - **すべて全拒否（fail-closed）**: 未知・空・nullのロールは全項目不可。権限表が読めないときは例外（呼び出し側は503）。
 *   既定値で補うのは、**表が空・行が欠けた項目だけ**
 */

// ---------------------------------------------------------------------------------------------
// 項目の型
// ---------------------------------------------------------------------------------------------

/** 書き込み系（閲覧のみには付けられない=常に不可で固定。`authorizeWrite`が先に拒否する）／読み取り系 */
export type PermissionKind = "write" | "read";

/** 欄の固定: "on"=常に可、"off"=常に不可。固定が無い欄は設定できる */
export type PermissionLockState = "on" | "off";

/** 項目の名前（`<対象>.<動作>`）の「動作」の語彙 */
export const PERMISSION_ACTIONS = ["edit", "delete", "import", "export", "bulk", "revert", "view", "manage"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** 項目の型。各アプリは自分の項目を、この型で並べるだけ */
export interface PermissionDef<K extends string = string> {
  /** `<対象>.<動作>`（例: `products.edit`）。動作は`PERMISSION_ACTIONS`のどれか */
  key: K;
  /** 表示名 */
  label: string;
  /** 説明 */
  description: string;
  /** `write`は閲覧のみに付けられない（`canWrite`に委譲して固定） */
  kind: PermissionKind;
  /** 既定値（管理者／スタッフ／閲覧のみ）。行が無い項目はこれで補う */
  defaults: Readonly<Record<PortalRole, boolean>>;
  /** `kind`の固定とは別の、追加の固定（例: `permissions.manage`の管理者=on） */
  lock?: Readonly<Partial<Record<PortalRole, PermissionLockState>>>;
}

/** 役割→項目のkey→可否。`normalizeMatrix`を通した値は、全役割×全項目が埋まる */
export type PermissionMatrix = Record<PortalRole, Record<string, boolean>>;

/** 変更された1セル（操作履歴の差分の材料） */
export interface PermissionChange {
  role: PortalRole;
  key: string;
  label: string;
  before: boolean;
  after: boolean;
}

const KEY_PATTERN = /^[a-z][a-z0-9]*\.(edit|delete|import|export|bulk|revert|view|manage)$/;

/**
 * 項目の一覧を検証して返す。アプリは起動時（モジュールの読み込み時）に1回呼ぶ。
 * 命名規則（`<対象>.<動作>`、動作は`PERMISSION_ACTIONS`）・key重複・表示名の空・既定値の欠け（全ロール分の真偽値）を検査し、
 * 違反があれば例外（実装の書き間違いを、その場で見つける）。
 */
export function definePermissions<const T extends readonly PermissionDef[]>(defs: T): T {
  const seen = new Set<string>();
  for (const def of defs) {
    if (!KEY_PATTERN.test(def.key)) {
      throw new Error(`権限項目のkey「${def.key}」は<対象>.<動作>の形ではありません（動作: ${PERMISSION_ACTIONS.join("・")}）`);
    }
    if (seen.has(def.key)) throw new Error(`権限項目のkey「${def.key}」が重複しています`);
    seen.add(def.key);
    if (def.label.trim() === "" || def.description.trim() === "") {
      throw new Error(`権限項目「${def.key}」の表示名・説明が空です`);
    }
    if (def.kind !== "write" && def.kind !== "read") throw new Error(`権限項目「${def.key}」のkindが不正です`);
    for (const role of PORTAL_ROLES) {
      if (typeof def.defaults[role] !== "boolean") throw new Error(`権限項目「${def.key}」の既定値（${role}）がありません`);
    }
  }
  return defs;
}

// ---------------------------------------------------------------------------------------------
// 共通の3項目
// ---------------------------------------------------------------------------------------------

/** `history.view`のkey（固定・実効は`authorize`の`historyViewLock`に委譲する） */
export const HISTORY_VIEW_KEY = "history.view";

/**
 * 共通の3項目の定義（key・表示名・説明・種類・既定・固定）。各アプリが自分の一覧に取り込む。
 * - `history.view`: 操作履歴の画面を開けるか。範囲は役割固定（`historyAccess`）で、止めることだけできる。管理者=常に可、閲覧のみ=常に不可
 * - `permissions.manage`: 権限設定の変更。管理者=常に可（締め出し防止）、閲覧のみ=常に不可（書き込み系）。スタッフの既定は不可
 * - `data.export`: データ出力（CSV・Excelなど）。機能のあるアプリが同じkeyで足す。固定なし
 */
export const COMMON_PERMISSIONS = {
  historyView: {
    key: HISTORY_VIEW_KEY,
    label: "操作履歴の閲覧",
    description: `操作履歴の画面を開く。見える範囲は役割で固定（管理者＝${HISTORY_SCOPE_LABELS.all}／スタッフ＝${HISTORY_SCOPE_LABELS.own}／閲覧のみ＝${HISTORY_SCOPE_LABELS.none}）で、この権限は止めることだけできる`,
    kind: "read",
    defaults: { 管理者: true, スタッフ: true, 閲覧のみ: false },
  },
  permissionsManage: {
    key: "permissions.manage",
    label: "権限設定の変更",
    description: "この権限設定を変更する",
    kind: "write",
    defaults: { 管理者: true, スタッフ: false, 閲覧のみ: false },
    lock: { 管理者: "on" },
  },
  dataExport: {
    key: "data.export",
    label: "データ出力",
    description: "CSV・Excelなどでデータを出力する",
    kind: "read",
    defaults: { 管理者: true, スタッフ: true, 閲覧のみ: true },
  },
} as const satisfies {
  historyView: PermissionDef<"history.view">;
  permissionsManage: PermissionDef<"permissions.manage">;
  dataExport: PermissionDef<"data.export">;
};

// ---------------------------------------------------------------------------------------------
// 固定・正規化・判定（純粋な関数）
// ---------------------------------------------------------------------------------------------

/**
 * 欄の固定: "on"（常に可）／"off"（常に不可）／null（設定できる）。画面（チェックボックスの無効化）とサーバー（実効の判定）が
 * **同じ関数**を見る。固定された欄の保存済みの値は無視される。
 *
 * 1. 未知・空・nullのロール → "off"（fail-closed）
 * 2. `history.view` → `historyViewLock`（唯一の定義。管理者=on、閲覧のみ=off、スタッフ=null）
 * 3. 書き込み系（`kind: "write"`）で書き込み不可のロール（閲覧のみ。`canWrite`が偽）→ "off"
 * 4. `def.lock`の指定
 */
export function permissionLock(def: PermissionDef, role: string | null | undefined): PermissionLockState | null {
  if (!isPortalRole(role)) return "off";
  if (def.key === HISTORY_VIEW_KEY) return historyViewLock(role);
  if (def.kind === "write" && !canWrite(role)) return "off";
  return def.lock?.[role] ?? null;
}

function cellValue(def: PermissionDef, role: PortalRole, raw: unknown): boolean {
  const lock = permissionLock(def, role);
  if (lock === "on") return true;
  if (lock === "off") return false;
  return typeof raw === "boolean" ? raw : def.defaults[role];
}

function rawCell(matrix: unknown, role: PortalRole, key: string): unknown {
  if (typeof matrix !== "object" || matrix === null) return undefined;
  const row = (matrix as Record<string, unknown>)[role];
  if (typeof row !== "object" || row === null) return undefined;
  return Object.prototype.hasOwnProperty.call(row, key) ? (row as Record<string, unknown>)[key] : undefined;
}

/**
 * 保存値・送信値・古い行を正規化して、全役割×全項目を埋めた表にする。
 * - 未知のキー・ロールは捨てる
 * - 真偽値でない値・行が欠けた項目は**既定値**
 * - 固定の欄は、保存値に関係なく固定どおり
 * `raw`は`{ 役割: { key: boolean } }`の形（それ以外・null・undefinedは「保存なし」=全項目が既定値）。
 */
export function normalizeMatrix(defs: readonly PermissionDef[], raw: unknown): PermissionMatrix {
  const matrix = {} as PermissionMatrix;
  for (const role of PORTAL_ROLES) {
    const row: Record<string, boolean> = {};
    for (const def of defs) row[def.key] = cellValue(def, role, rawCell(raw, role, def.key));
    matrix[role] = row;
  }
  return matrix;
}

/** `role_permissions`の行（`{ role, permission, allowed }`）を、`normalizeMatrix`が読める形にする。不正な行は捨てる */
export function matrixFromRows(rows: ReadonlyArray<{ role?: unknown; permission?: unknown; allowed?: unknown }>): Record<string, Record<string, boolean>> {
  const raw: Record<string, Record<string, boolean>> = {};
  for (const r of rows) {
    if (!isPortalRole(r.role) || typeof r.permission !== "string" || typeof r.allowed !== "boolean") continue;
    (raw[r.role] ??= {})[r.permission] = r.allowed;
  }
  return raw;
}

/**
 * 役割の実効権限（全項目のkey→可否）。未知・空・nullのロールは**全項目不可**（fail-closed）。
 * `matrix`に値が無い項目は既定値（`normalizeMatrix`を通していなくても同じ）。
 */
export function effectivePermissions(
  defs: readonly PermissionDef[],
  matrix: unknown,
  role: string | null | undefined
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const def of defs) {
    result[def.key] = isPortalRole(role) ? cellValue(def, role, rawCell(matrix, role, def.key)) : false;
  }
  return result;
}

/** その役割が、その項目を実行できるか。未知のkey・未知のロールは不可 */
export function can(defs: readonly PermissionDef[], matrix: unknown, role: string | null | undefined, key: string): boolean {
  const def = defs.find((d) => d.key === key);
  if (!def || !isPortalRole(role)) return false;
  return cellValue(def, role, rawCell(matrix, role, key));
}

/** 変更されたセルの一覧（役割→項目の順）。操作履歴の`changes`・`detail`の材料。記録先への書き込みは各アプリ */
export function diffMatrix(defs: readonly PermissionDef[], before: unknown, after: unknown): PermissionChange[] {
  const changes: PermissionChange[] = [];
  for (const role of PORTAL_ROLES) {
    for (const def of defs) {
      const b = cellValue(def, role, rawCell(before, role, def.key));
      const a = cellValue(def, role, rawCell(after, role, def.key));
      if (a !== b) changes.push({ role, key: def.key, label: def.label, before: b, after: a });
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------------------------
// 失敗時の共通の文言
// ---------------------------------------------------------------------------------------------

export type PermissionFailureReason = "forbidden" | "unavailable";

/** 失敗の種類ごとのHTTPステータスと、利用者向けの共通メッセージ（文言はここだけで管理する） */
export const PERMISSION_FAILURES: Record<PermissionFailureReason, { status: 403 | 503; message: string }> = {
  forbidden: { status: 403, message: "この操作を行う権限がありません。管理者にお問い合わせください。" },
  unavailable: { status: 503, message: "権限設定を読み込めませんでした。しばらくしてからもう一度お試しください" },
};

/** JSONの本文（`{ error, code }`）。`NextResponse.json(permissionFailureBody("forbidden"), { status: PERMISSION_FAILURES.forbidden.status })`の形で使う */
export function permissionFailureBody(reason: PermissionFailureReason): { error: string; code: PermissionFailureReason } {
  return { error: PERMISSION_FAILURES[reason].message, code: reason };
}

// ---------------------------------------------------------------------------------------------
// `<schema>.role_permissions`の読み書き（サーバー専用）
// ---------------------------------------------------------------------------------------------

// 既定のスキーマ等が型に出るクライアントも受け取れるようにする
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

/** 権限表を読めない・書けない（接続失敗・表が無い・権限・スキーマ未公開など）。呼び出し側は503にする */
export class PermissionsUnavailableError extends Error {
  /** PostgRESTのエラーコード（表が無い場合は`42P01`・`PGRST205`など）。無ければundefined */
  readonly code?: string;
  readonly cause?: unknown;

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "PermissionsUnavailableError";
    this.code = options.code;
    this.cause = options.cause;
  }
}

const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

function assertServer(schema: string): void {
  // ブラウザでの誤用は、503（PermissionsUnavailableError）に丸めず、別の例外にする
  if (typeof window !== "undefined") throw new Error("permissions の loadRoleMatrix／saveRoleMatrix はサーバー専用です（ブラウザ側では呼べません）");
  if (!SCHEMA_PATTERN.test(schema)) throw new Error(`スキーマ名が不正です: ${schema}`);
}

interface RoleRow {
  role: string;
  permission: string;
  allowed: boolean;
}

/**
 * `<schema>.role_permissions`を**1回**で読み、正規化した表を返す。毎回引く（キャッシュなし）・リトライなし。
 * - 表が**空**・行が**欠けた項目** → 既定値で補う
 * - **表が無い・DBエラー・通信失敗は`PermissionsUnavailableError`**（既定値にしない=fail-closed。呼び出し側は503）
 * - 渡すクライアントは、Next.jsのデータキャッシュに載らないもの（`fetch`が`cache: "no-store"`）にすること
 * - ブラウザ側で呼ばれたら実行時に例外（`PermissionsUnavailableError`ではない）
 */
export async function loadRoleMatrix(client: AnyClient, schema: string, defs: readonly PermissionDef[]): Promise<PermissionMatrix> {
  assertServer(schema);
  const { data, error } = await client
    .schema(schema)
    .from("role_permissions")
    .select("role, permission, allowed")
    .retry(false)
    .returns<RoleRow[]>();
  if (error) {
    throw new PermissionsUnavailableError(`${schema}.role_permissions の取得に失敗しました: ${error.message}`, { code: error.code, cause: error });
  }
  return normalizeMatrix(defs, matrixFromRows(data ?? []));
}

/**
 * 表を正規化（固定の欄を固定どおりに直す）して、**全役割×全項目**を`upsert`する（`updated_at`・`updated_by`を入れる）。
 * 保存した（正規化後の）表を返す。書き込みの認可（`authorizeWrite`と、アプリの`permissions.manage`の検査）は呼び出し側。
 * 失敗は`PermissionsUnavailableError`。表に`updated_at`・`updated_by`の列が必要（price-appは先に足す）。
 */
export async function saveRoleMatrix(
  client: AnyClient,
  schema: string,
  defs: readonly PermissionDef[],
  matrix: unknown,
  updatedBy: string
): Promise<PermissionMatrix> {
  assertServer(schema);
  const normalized = normalizeMatrix(defs, matrix);
  const now = new Date().toISOString();
  const rows = PORTAL_ROLES.flatMap((role) =>
    defs.map((def) => ({ role, permission: def.key, allowed: normalized[role][def.key], updated_at: now, updated_by: updatedBy }))
  );
  const { error } = await client.schema(schema).from("role_permissions").upsert(rows, { onConflict: "role,permission" });
  if (error) {
    throw new PermissionsUnavailableError(`${schema}.role_permissions の保存に失敗しました: ${error.message}`, { code: error.code, cause: error });
  }
  return normalized;
}
