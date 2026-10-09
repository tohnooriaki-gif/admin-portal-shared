import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listPortalUsers, PortalUsersError, resolvePortalUser } from "../src/portalUsers";

// 実際の supabase-js クライアントを使い、ネットワークの代わりに fetch を差し替えて、
// 送られるリクエスト（スキーマ・フィルター）と、返答ごとの結果（null／例外）を検証する。

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
  // 既定のスキーマはprice（アプリ側の既存クライアントを想定）。それでもportalを読むことを確認する
  const client = createClient("http://localhost:54321", "dummy-key", {
    auth: { persistSession: false },
    db: { schema: "price" },
    global: { fetch: fetchStub },
  });
  return { client, calls };
}

const ROW = { id: "u1", login_id: "Claude", name: "クロード", role: "管理者" };

describe("resolvePortalUser", () => {
  it("portalスキーマのusersをlogin_key（小文字）で引き、PortalUserに変換して返す", async () => {
    const { client, calls } = setup(() => ({ body: [ROW] }));
    const user = await resolvePortalUser(client, "CLAUDE");
    expect(user).toEqual({ id: "u1", loginId: "Claude", name: "クロード", role: "管理者" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url.pathname).toBe("/rest/v1/users");
    expect(calls[0].url.searchParams.get("login_key")).toBe("eq.claude");
    expect(calls[0].url.searchParams.get("select")).toBe("id,login_id,name,role");
    // 既定のスキーマ(price)ではなくportalを読む
    expect(calls[0].headers.get("Accept-Profile")).toBe("portal");
  });

  it("存在しなければnull（DBエラーではない）", async () => {
    const { client } = setup(() => ({ body: [] }));
    expect(await resolvePortalUser(client, "nobody")).toBeNull();
  });

  it("DBエラーはPortalUsersErrorを投げる（nullにしない）。codeとcauseを持つ", async () => {
    const { client } = setup(() => ({
      status: 406,
      body: { code: "PGRST106", message: "The schema must be one of the following: public", details: null, hint: null },
    }));
    const err = await resolvePortalUser(client, "claude").catch((e) => e);
    expect(err).toBeInstanceOf(PortalUsersError);
    expect(err.name).toBe("PortalUsersError");
    expect(err.code).toBe("PGRST106");
    expect(err.message).toContain("The schema must be one of the following");
    expect(err.cause).toBeTruthy();
  });

  it("通信そのものの失敗（fetchが例外）もPortalUsersErrorとして区別できる", async () => {
    const client = createClient("http://localhost:54321", "dummy-key", {
      auth: { persistSession: false },
      global: {
        fetch: (async () => {
          throw new TypeError("fetch failed");
        }) as typeof fetch,
      },
    });
    await expect(resolvePortalUser(client, "claude")).rejects.toBeInstanceOf(PortalUsersError);
  });

  it("portal.usersの形式に合わないログインIDは、DBに問い合わせずnull", async () => {
    const { client, calls } = setup(() => ({ body: [ROW] }));
    // "K"（ケルビン記号）はtoLowerCase()でASCIIの"k"になる。形式で先に弾くので、別ユーザー"k"と一致しない
    for (const bad of ["", " ", "a b", "山田", "a".repeat(33), "claude;drop", "K", "x%", "a,b", "a)"]) {
      expect(await resolvePortalUser(client, bad)).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });

  it("形式に合うログインIDは、記号（. _ -）を含めてそのまま照合する", async () => {
    const { client, calls } = setup(() => ({ body: [] }));
    await resolvePortalUser(client, "A.b_c-9");
    expect(calls[0].url.searchParams.get("login_key")).toBe("eq.a.b_c-9");
  });

  it("ブラウザ側（windowがある環境）で呼ばれたら例外にする（問い合わせもしない）", async () => {
    const { client, calls } = setup(() => ({ body: [ROW] }));
    (globalThis as { window?: unknown }).window = {};
    await expect(resolvePortalUser(client, "claude")).rejects.toThrow(/サーバー専用/);
    await expect(listPortalUsers(client)).rejects.toThrow(/サーバー専用/);
    expect(calls).toHaveLength(0);
  });
});

describe("listPortalUsers", () => {
  it("portalスキーマの全ユーザーをlogin_key順で取得して変換する", async () => {
    const { client, calls } = setup(() => ({
      body: [ROW, { id: "u2", login_id: "taro", name: "太郎", role: "閲覧のみ" }],
    }));
    const users = await listPortalUsers(client);
    expect(users).toEqual([
      { id: "u1", loginId: "Claude", name: "クロード", role: "管理者" },
      { id: "u2", loginId: "taro", name: "太郎", role: "閲覧のみ" },
    ]);
    expect(calls[0].url.searchParams.get("order")).toBe("login_key.asc");
    expect(calls[0].headers.get("Accept-Profile")).toBe("portal");
  });

  it("ユーザーが0件なら空配列（本文が空でも空配列）", async () => {
    expect(await listPortalUsers(setup(() => ({ body: [] })).client)).toEqual([]);
    expect(await listPortalUsers(setup(() => ({ body: null })).client)).toEqual([]);
  });

  it("DBエラーはPortalUsersErrorを投げる", async () => {
    const { client } = setup(() => ({ status: 500, body: { code: "XX000", message: "boom", details: null, hint: null } }));
    const err = await listPortalUsers(client).catch((e) => e);
    expect(err).toBeInstanceOf(PortalUsersError);
    expect(err.code).toBe("XX000");
  });
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});
