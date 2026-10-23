import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  COMMON_PERMISSIONS,
  loadRoleMatrix,
  PermissionsUnavailableError,
  saveRoleMatrix,
  type PermissionDef,
} from "../src/permissions";

// 実際の supabase-js クライアントを使い、fetch を差し替えて role_permissions の返答を作る。

interface Call {
  url: URL;
  method: string;
  headers: Headers;
  body: string | undefined;
}

function setup(respond: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    const { status = 200, body } = respond(call);
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://localhost:54321", "dummy-key", {
    auth: { persistSession: false },
    global: { fetch: fetchStub },
  });
  return { client, calls };
}

const EDIT: PermissionDef = {
  key: "items.edit",
  label: "項目の編集",
  description: "項目を編集する",
  kind: "write",
  defaults: { 管理者: true, スタッフ: true, 閲覧のみ: false },
};
const DEFS = [EDIT, COMMON_PERMISSIONS.historyView, COMMON_PERMISSIONS.permissionsManage];

const row = (role: string, permission: string, allowed: boolean) => ({ role, permission, allowed });
const dbError = (code: string, message = "boom") => ({ status: 500, body: { code, message, details: null, hint: null } });

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("loadRoleMatrix", () => {
  it("保存された行を読み、正規化した表を返す。問い合わせは1回、スキーマを指定、毎回引く", async () => {
    const { client, calls } = setup(() => ({ body: [row("スタッフ", "items.edit", false), row("スタッフ", "history.view", false)] }));
    const m = await loadRoleMatrix(client, "receipt", DEFS);
    expect(m.スタッフ["items.edit"]).toBe(false);
    expect(m.スタッフ["history.view"]).toBe(false);
    expect(m.管理者["items.edit"]).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.pathname).toBe("/rest/v1/role_permissions");
    expect(calls[0].headers.get("Accept-Profile")).toBe("receipt");
    await loadRoleMatrix(client, "receipt", DEFS);
    expect(calls).toHaveLength(2);
  });

  it("表が空（0行）→ 全項目が既定値", async () => {
    const { client } = setup(() => ({ body: [] }));
    const m = await loadRoleMatrix(client, "payment", DEFS);
    expect(m.スタッフ["items.edit"]).toBe(true);
    expect(m.閲覧のみ["items.edit"]).toBe(false);
    expect(m.管理者["permissions.manage"]).toBe(true);
    expect(m.スタッフ["permissions.manage"]).toBe(false);
    expect(m.スタッフ["history.view"]).toBe(true);
  });

  it("本文が null（行なし）でも空と同じ → 既定値", async () => {
    const { client } = setup(() => ({ body: null }));
    const m = await loadRoleMatrix(client, "receipt", DEFS);
    expect(m.スタッフ["items.edit"]).toBe(true);
    expect(m.閲覧のみ["items.edit"]).toBe(false);
  });

  it("行が欠けた項目は既定値、明示の ✕ は ✕。固定の欄は保存値を無視", async () => {
    const { client } = setup(() => ({
      body: [row("スタッフ", "items.edit", false), row("閲覧のみ", "items.edit", true), row("管理者", "permissions.manage", false), row("オーナー", "items.edit", true)],
    }));
    const m = await loadRoleMatrix(client, "price", DEFS);
    expect(m.スタッフ["items.edit"]).toBe(false);
    expect(m.スタッフ["history.view"]).toBe(true); // 欠け → 既定
    expect(m.閲覧のみ["items.edit"]).toBe(false); // 固定
    expect(m.管理者["permissions.manage"]).toBe(true); // 固定
  });

  it("DBエラー（500・表が無い 42P01／PGRST205・スキーマ未公開 PGRST106）→ PermissionsUnavailableError（既定値にしない）", async () => {
    for (const code of ["XX000", "42P01", "PGRST205", "PGRST106"]) {
      const { client } = setup(() => dbError(code));
      const err = await loadRoleMatrix(client, "receipt", DEFS).catch((e) => e);
      expect(err, code).toBeInstanceOf(PermissionsUnavailableError);
      expect(err.code, code).toBe(code);
      expect(err.message).toContain("receipt.role_permissions");
    }
  });

  it("通信失敗（fetchが例外）→ PermissionsUnavailableError。リトライせず、すぐ返る", async () => {
    const client = createClient("http://localhost:54321", "dummy-key", {
      auth: { persistSession: false },
      global: {
        fetch: (async () => {
          throw new TypeError("fetch failed");
        }) as typeof fetch,
      },
    });
    const started = Date.now();
    await expect(loadRoleMatrix(client, "receipt", DEFS)).rejects.toBeInstanceOf(PermissionsUnavailableError);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("ブラウザ側（windowがある環境）では、503の例外（PermissionsUnavailableError）にせず別の例外。問い合わせもしない", async () => {
    const { client, calls } = setup(() => ({ body: [] }));
    (globalThis as { window?: unknown }).window = {};
    const err = await loadRoleMatrix(client, "receipt", DEFS).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermissionsUnavailableError);
    expect(err.message).toMatch(/サーバー専用/);
    expect(calls).toHaveLength(0);
  });

  it("スキーマ名が不正（空・大文字・記号）→ 例外。問い合わせもしない", async () => {
    const { client, calls } = setup(() => ({ body: [] }));
    for (const schema of ["", "Receipt", "a-b", "a b", "1abc", "public;drop"]) {
      await expect(loadRoleMatrix(client, schema, DEFS), schema).rejects.toThrow(/スキーマ名/);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("saveRoleMatrix", () => {
  it("全役割×全項目を upsert（updated_at・updated_by を入れる）。固定は正規化され、保存した表を返す", async () => {
    const { client, calls } = setup(() => ({ status: 201, body: [] }));
    const saved = await saveRoleMatrix(
      client,
      "payment",
      DEFS,
      { スタッフ: { "items.edit": false }, 閲覧のみ: { "items.edit": true, "history.view": true }, 管理者: { "permissions.manage": false } },
      "大野 隆皓"
    );
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.method).toBe("POST");
    expect(c.url.pathname).toBe("/rest/v1/role_permissions");
    expect(c.url.searchParams.get("on_conflict")).toBe("role,permission");
    expect(c.headers.get("Content-Profile")).toBe("payment");
    expect(c.headers.get("Prefer")).toContain("resolution=merge-duplicates");
    const rows = JSON.parse(c.body as string) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(9); // 3役割 × 3項目
    for (const r of rows) {
      expect(r.updated_by).toBe("大野 隆皓");
      expect(typeof r.updated_at).toBe("string");
      expect(Number.isNaN(Date.parse(r.updated_at as string))).toBe(false);
    }
    const cell = (role: string, permission: string) => rows.find((r) => r.role === role && r.permission === permission)?.allowed;
    expect(cell("スタッフ", "items.edit")).toBe(false);
    expect(cell("閲覧のみ", "items.edit")).toBe(false); // 固定
    expect(cell("閲覧のみ", "history.view")).toBe(false); // 固定
    expect(cell("管理者", "permissions.manage")).toBe(true); // 固定
    expect(saved.スタッフ["items.edit"]).toBe(false);
    expect(saved.閲覧のみ["items.edit"]).toBe(false);
  });

  it("DBエラー → PermissionsUnavailableError", async () => {
    const { client } = setup(() => dbError("42703", "column updated_at does not exist"));
    const err = await saveRoleMatrix(client, "price", DEFS, null, "x").catch((e) => e);
    expect(err).toBeInstanceOf(PermissionsUnavailableError);
    expect(err.code).toBe("42703");
    expect(err.message).toContain("price.role_permissions");
  });

  it("ブラウザ側では例外（書き込みもしない）。スキーマ名が不正でも例外", async () => {
    const { client, calls } = setup(() => ({ status: 201, body: [] }));
    await expect(saveRoleMatrix(client, "Bad", DEFS, null, "x")).rejects.toThrow(/スキーマ名/);
    (globalThis as { window?: unknown }).window = {};
    await expect(saveRoleMatrix(client, "price", DEFS, null, "x")).rejects.toThrow(/サーバー専用/);
    expect(calls).toHaveLength(0);
  });
});
