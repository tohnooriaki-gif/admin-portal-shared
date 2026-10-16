import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  AUTH_FAILURES,
  authFailureBody,
  authorizeActor,
  authorizeWrite,
  canWrite,
  isPortalRole,
  PORTAL_ROLES,
  type AuthFailure,
} from "../src/authorize";
import { PortalUsersError } from "../src/portalUsers";

// 実際の supabase-js クライアントを使い、fetch を差し替えて portal.users の返答を作る。
// 「ユーザーが存在しない」「DBエラー」「ロール不明」がすべて拒否（fail-closed）になることを確認する。

interface Call {
  url: URL;
  headers: Headers;
}

function setup(respond: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: new URL(String(input)), headers: new Headers(init?.headers) };
    calls.push(call);
    const { status = 200, body } = respond(call);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const client = createClient("http://localhost:54321", "dummy-key", {
    auth: { persistSession: false },
    db: { schema: "price" },
    global: { fetch: fetchStub },
  });
  return { client, calls };
}

const row = (role: string, loginId = "Claude") => ({ id: "u1", login_id: loginId, name: "クロード", role });
const withRole = (role: string) => setup(() => ({ body: [row(role)] }));

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

function expectFailure(result: unknown, reason: AuthFailure["reason"], status: 401 | 403 | 503) {
  expect(result).toMatchObject({ ok: false, reason, status });
  expect((result as AuthFailure).message).toBe(AUTH_FAILURES[reason].message);
}

describe("authorizeActor", () => {
  it.each(PORTAL_ROLES)("ロール「%s」のユーザーはok（userにロールと名前が入る）", async (role) => {
    const { client } = withRole(role);
    const result = await authorizeActor(client, "claude");
    expect(result).toEqual({ ok: true, user: { id: "u1", loginId: "Claude", name: "クロード", role } });
  });

  it("portalスキーマを引き、ログインIDの大文字小文字は区別しない（login_key=小文字）", async () => {
    const { client, calls } = withRole("管理者");
    await authorizeActor(client, "CLAUDE");
    await authorizeActor(client, "Claude");
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.url.searchParams.get("login_key")).toBe("eq.claude");
      expect(c.headers.get("Accept-Profile")).toBe("portal");
    }
  });

  it("毎回引く（同じログインIDを続けて呼んでも、そのたびにDBを引く。キャッシュなし）", async () => {
    const { client, calls } = withRole("管理者");
    await authorizeActor(client, "claude");
    await authorizeActor(client, "claude");
    await authorizeActor(client, "claude");
    expect(calls).toHaveLength(3);
  });

  it("ロールの変更・削除が次の呼び出しに即時に反映される", async () => {
    let current: unknown[] = [row("管理者")];
    const { client } = setup(() => ({ body: current }));
    expect((await authorizeActor(client, "claude")).ok).toBe(true);
    current = [row("閲覧のみ")];
    const changed = await authorizeActor(client, "claude");
    expect(changed.ok && changed.user.role).toBe("閲覧のみ");
    current = [];
    expectFailure(await authorizeActor(client, "claude"), "unregistered", 401);
  });

  it("ユーザーが見つからない → unregistered（401）", async () => {
    const { client } = setup(() => ({ body: [] }));
    expectFailure(await authorizeActor(client, "nobody"), "unregistered", 401);
  });

  it("DBエラー（500・スキーマ未公開PGRST106）→ unavailable（503）", async () => {
    const e500 = setup(() => ({ status: 500, body: { code: "XX000", message: "boom", details: null, hint: null } }));
    expectFailure(await authorizeActor(e500.client, "claude"), "unavailable", 503);
    const e406 = setup(() => ({ status: 406, body: { code: "PGRST106", message: "schema", details: null, hint: null } }));
    expectFailure(await authorizeActor(e406.client, "claude"), "unavailable", 503);
  });

  it("通信失敗（fetchが例外）→ unavailable（503）。リトライせず、すぐ返る", async () => {
    const client = createClient("http://localhost:54321", "dummy-key", {
      auth: { persistSession: false },
      global: {
        fetch: (async () => {
          throw new TypeError("fetch failed");
        }) as typeof fetch,
      },
    });
    const started = Date.now();
    expectFailure(await authorizeActor(client, "claude"), "unavailable", 503);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("ロールが3値以外・空・表記違い・空白付き → invalid_role（403）", async () => {
    for (const role of ["オーナー", "", "管理者 ", "admin", "ｽﾀｯﾌ", "スタッフ\n", "閲覧のみ。"]) {
      expectFailure(await authorizeActor(withRole(role).client, "claude"), "invalid_role", 403);
    }
  });

  it("ロールがnull・数値などの文字列でない値でも invalid_role（403）", async () => {
    for (const bad of [null, 1, undefined]) {
      const { client } = setup(() => ({ body: [{ id: "u1", login_id: "Claude", name: "クロード", role: bad }] }));
      expectFailure(await authorizeActor(client, "claude"), "invalid_role", 403);
    }
  });

  it("ログインIDが無い（null・undefined・空文字）→ unauthenticated（401）。DBは引かない", async () => {
    const { client, calls } = withRole("管理者");
    for (const bad of [null, undefined, ""]) {
      expectFailure(await authorizeActor(client, bad), "unauthenticated", 401);
    }
    expect(calls).toHaveLength(0);
  });

  it("ログインIDの形式が不正 → unregistered（401）。DBは引かない", async () => {
    const { client, calls } = withRole("管理者");
    for (const bad of [" ", "a b", "山田", "a".repeat(33), "claude;drop", "K"]) {
      expectFailure(await authorizeActor(client, bad), "unregistered", 401);
    }
    expect(calls).toHaveLength(0);
  });

  it("PortalUsersError以外の想定外の例外は握りつぶさず再throwする", async () => {
    const broken = {
      schema() {
        throw new TypeError("unexpected bug");
      },
    } as unknown as Parameters<typeof authorizeActor>[0];
    await expect(authorizeActor(broken, "claude")).rejects.toThrow("unexpected bug");
    await expect(authorizeActor(broken, "claude")).rejects.not.toBeInstanceOf(PortalUsersError);
  });

  it("ブラウザ側（windowがある環境）で呼ばれたら、503に丸めずに例外にする（問い合わせもしない）", async () => {
    const { client, calls } = withRole("管理者");
    (globalThis as { window?: unknown }).window = {};
    const err = await authorizeActor(client, "claude").catch((e) => e);
    expect(err).toBeInstanceOf(PortalUsersError);
    expect(err.message).toMatch(/サーバー専用/);
    expect(calls).toHaveLength(0);
  });
});

describe("authorizeWrite", () => {
  it.each(["管理者", "スタッフ"])("ロール「%s」は書き込みもok", async (role) => {
    const result = await authorizeWrite(withRole(role).client, "claude");
    expect(result).toMatchObject({ ok: true, user: { role } });
  });

  it("「閲覧のみ」は read_only（403）で拒否（authorizeActorではok）", async () => {
    const { client } = withRole("閲覧のみ");
    expect((await authorizeActor(client, "claude")).ok).toBe(true);
    expectFailure(await authorizeWrite(client, "claude"), "read_only", 403);
  });

  it("authorizeActorの拒否はそのまま返る（unauthenticated・unregistered・unavailable・invalid_role）", async () => {
    expectFailure(await authorizeWrite(withRole("管理者").client, null), "unauthenticated", 401);
    expectFailure(await authorizeWrite(setup(() => ({ body: [] })).client, "claude"), "unregistered", 401);
    expectFailure(
      await authorizeWrite(setup(() => ({ status: 500, body: { code: "X", message: "m", details: null, hint: null } })).client, "claude"),
      "unavailable",
      503
    );
    expectFailure(await authorizeWrite(withRole("オーナー").client, "claude"), "invalid_role", 403);
  });

  it("毎回引く（authorizeWriteも、そのたびにDBを引く）", async () => {
    const { client, calls } = withRole("スタッフ");
    await authorizeWrite(client, "claude");
    await authorizeWrite(client, "claude");
    expect(calls).toHaveLength(2);
  });
});

describe("ロールと書き込み可否", () => {
  it("PORTAL_ROLESは3値（DBのCHECK制約と同じ）", () => {
    expect([...PORTAL_ROLES]).toEqual(["管理者", "スタッフ", "閲覧のみ"]);
  });

  it("isPortalRole: 3値だけがtrue", () => {
    for (const r of PORTAL_ROLES) expect(isPortalRole(r)).toBe(true);
    for (const r of ["", "オーナー", "管理者 ", null, undefined, 1, {}]) expect(isPortalRole(r)).toBe(false);
  });

  it("canWrite: 管理者・スタッフは可、閲覧のみ・不明・空・null・undefinedは不可（fail-closed）", () => {
    expect(canWrite("管理者")).toBe(true);
    expect(canWrite("スタッフ")).toBe(true);
    for (const r of ["閲覧のみ", "オーナー", "", " 管理者", null, undefined]) expect(canWrite(r)).toBe(false);
  });
});

describe("拒否の種類・ステータス・本文", () => {
  it("reasonごとのHTTPステータス（メッセージの文言は変わりうるので、statusとreasonの対応だけを固定）", () => {
    expect(AUTH_FAILURES.unauthenticated.status).toBe(401);
    expect(AUTH_FAILURES.unregistered.status).toBe(401);
    expect(AUTH_FAILURES.unavailable.status).toBe(503);
    expect(AUTH_FAILURES.invalid_role.status).toBe(403);
    expect(AUTH_FAILURES.read_only.status).toBe(403);
    for (const f of Object.values(AUTH_FAILURES)) expect(f.message.length).toBeGreaterThan(0);
  });

  it("authFailureBodyは{ error: 共通メッセージ, code: reason }", async () => {
    const result = (await authorizeWrite(withRole("閲覧のみ").client, "claude")) as AuthFailure;
    expect(authFailureBody(result)).toEqual({ error: AUTH_FAILURES.read_only.message, code: "read_only" });
  });
});
