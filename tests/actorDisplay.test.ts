import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  ACTOR_DELETED_SUFFIX,
  actorLabel,
  displayActor,
  loadActorDirectory,
  withActorDisplays,
} from "../src/actorDisplay";
import { PortalUsersError } from "../src/portalUsers";

// 実際の supabase-js クライアントを使い、fetch を差し替えて portal.users の返答を作る。

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
    global: { fetch: fetchStub },
  });
  return { client, calls };
}

const user = (id: string, name: string, loginId = id, role = "スタッフ") => ({ id, login_id: loginId, name, role });
const USERS = [user("u_admin", "大野 隆皓", "ohno", "管理者"), user("u_staff", "山田花子（改名後）", "hanako")];

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("actorLabel / ACTOR_DELETED_SUFFIX", () => {
  it("deleted のときだけ「名前 (削除済み)」", () => {
    expect(ACTOR_DELETED_SUFFIX).toBe("(削除済み)");
    expect(actorLabel({ name: "山田", status: "deleted" })).toBe("山田 (削除済み)");
    for (const status of ["current", "system", "legacy", "unknown"] as const) {
      expect(actorLabel({ name: "山田", status })).toBe("山田");
    }
  });
});

describe("displayActor（純粋関数）", () => {
  const dir = new Map([
    ["u_admin", "大野 隆皓"],
    ["u_staff", "山田花子（改名後）"],
  ]);

  it("現ユーザー → 今の名前（記録時の名前と違えば、今の名前）", () => {
    expect(displayActor("u_staff", "山田花子", dir)).toEqual({ name: "山田花子（改名後）", status: "current" });
    expect(displayActor("u_admin", "大野 隆皓", dir)).toEqual({ name: "大野 隆皓", status: "current" });
  });

  it("ユーザーがいない（削除済み）→ 記録時の名前 + deleted", () => {
    expect(displayActor("u_gone", "退職者", dir)).toEqual({ name: "退職者", status: "deleted" });
  });

  it("sys_（システム用）→ 記録時の名前。削除済みにしない（一覧に無くても）", () => {
    expect(displayActor("sys_makeshop", "MakeShop連携", dir)).toEqual({ name: "MakeShop連携", status: "system" });
    expect(displayActor("sys_makeshop", "MakeShop連携", null)).toEqual({ name: "MakeShop連携", status: "system" });
  });

  it("actor_id が null・undefined・空（旧い行）→ 記録時の名前 + legacy（削除済みにしない）", () => {
    for (const id of [null, undefined, ""]) {
      expect(displayActor(id, "旧い名前", dir), String(id)).toEqual({ name: "旧い名前", status: "legacy" });
      expect(displayActor(id, "旧い名前", null), String(id)).toEqual({ name: "旧い名前", status: "legacy" });
    }
  });

  it("一覧が引けなかった（directory が null）→ 記録時の名前 + unknown（削除済みにしない）", () => {
    expect(displayActor("u_staff", "山田花子", null)).toEqual({ name: "山田花子", status: "unknown" });
  });

  it("記録時の名前が null・undefined → 空文字", () => {
    expect(displayActor(null, null, dir)).toEqual({ name: "", status: "legacy" });
    expect(displayActor("u_gone", undefined, dir)).toEqual({ name: "", status: "deleted" });
  });
});

describe("loadActorDirectory", () => {
  it("id→今の名前の対応を作る。問い合わせは1回、portalスキーマ、毎回引く", async () => {
    const { client, calls } = setup(() => ({ body: USERS }));
    const dir = await loadActorDirectory(client);
    expect(dir?.get("u_staff")).toBe("山田花子（改名後）");
    expect(dir?.get("u_admin")).toBe("大野 隆皓");
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get("Accept-Profile")).toBe("portal");
    await loadActorDirectory(client);
    expect(calls).toHaveLength(2);
  });

  it("名前が空（空白だけを含む）のユーザーはログインIDを使う", async () => {
    const { client } = setup(() => ({ body: [user("u_1", "", "login1"), user("u_2", "   ", "login2")] }));
    const dir = await loadActorDirectory(client);
    expect(dir?.get("u_1")).toBe("login1");
    expect(dir?.get("u_2")).toBe("login2");
  });

  it("DBエラー（500・スキーマ未公開）→ null（例外にしない）", async () => {
    const e500 = setup(() => ({ status: 500, body: { code: "XX000", message: "boom", details: null, hint: null } }));
    expect(await loadActorDirectory(e500.client)).toBeNull();
    const e406 = setup(() => ({ status: 406, body: { code: "PGRST106", message: "schema", details: null, hint: null } }));
    expect(await loadActorDirectory(e406.client)).toBeNull();
  });

  it("通信失敗（fetchが例外）→ null。リトライせず、すぐ返る", async () => {
    const client = createClient("http://localhost:54321", "dummy-key", {
      auth: { persistSession: false },
      global: {
        fetch: (async () => {
          throw new TypeError("fetch failed");
        }) as typeof fetch,
      },
    });
    const started = Date.now();
    expect(await loadActorDirectory(client)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("一覧が空 → null（全員が削除済みとは扱わない）", async () => {
    const { client } = setup(() => ({ body: [] }));
    expect(await loadActorDirectory(client)).toBeNull();
  });

  it("PortalUsersError以外の想定外の例外は握りつぶさず再throwする", async () => {
    const broken = {
      schema() {
        throw new TypeError("unexpected bug");
      },
    } as unknown as Parameters<typeof loadActorDirectory>[0];
    await expect(loadActorDirectory(broken)).rejects.toThrow("unexpected bug");
  });

  it("ブラウザ側（windowがある環境）では、nullに丸めずに例外にする（問い合わせもしない）", async () => {
    const { client, calls } = setup(() => ({ body: USERS }));
    (globalThis as { window?: unknown }).window = {};
    const err = await loadActorDirectory(client).catch((e) => e);
    expect(err).toBeInstanceOf(PortalUsersError);
    expect(err.message).toMatch(/サーバー専用/);
    expect(calls).toHaveLength(0);
  });
});

describe("withActorDisplays", () => {
  interface Row {
    id: string;
    actorId: string | null;
    user: string;
  }
  const pick = (r: Row) => ({ actorId: r.actorId, name: r.user });
  const rows: Row[] = [
    { id: "1", actorId: "u_staff", user: "山田花子" },
    { id: "2", actorId: "u_admin", user: "大野 隆皓" },
    { id: "3", actorId: "u_gone", user: "退職者" },
    { id: "4", actorId: "sys_makeshop", user: "MakeShop連携" },
    { id: "5", actorId: null, user: "システム利用者" },
    { id: "6", actorId: "u_staff", user: "山田花子" },
  ];

  it("順序と元の項目を保ち、actor を付ける。一覧の問い合わせは行数にかかわらず1回", async () => {
    const { client, calls } = setup(() => ({ body: USERS }));
    const result = await withActorDisplays(client, rows, pick);
    expect(calls).toHaveLength(1);
    expect(result.map((r) => r.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(result.map((r) => r.actor)).toEqual([
      { name: "山田花子（改名後）", status: "current" },
      { name: "大野 隆皓", status: "current" },
      { name: "退職者", status: "deleted" },
      { name: "MakeShop連携", status: "system" },
      { name: "システム利用者", status: "legacy" },
      { name: "山田花子（改名後）", status: "current" },
    ]);
    expect(result.map((r) => actorLabel(r.actor))[2]).toBe("退職者 (削除済み)");
    expect(result[0]).toMatchObject({ id: "1", actorId: "u_staff", user: "山田花子" });
  });

  it("結果に他のユーザーの情報（ロール・ログインID・一覧）が含まれない", async () => {
    const { client } = setup(() => ({ body: USERS }));
    const result = await withActorDisplays(client, [rows[0]], pick);
    const json = JSON.stringify(result);
    expect(json).not.toContain("ohno");
    expect(json).not.toContain("管理者");
    expect(json).not.toContain("hanako");
    expect(Object.keys(result[0]).sort()).toEqual(["actor", "actorId", "id", "user"]);
  });

  it("DBエラーのとき全行 unknown（例外にならず、削除済みも付けない）。システム・旧い行はそのまま", async () => {
    const { client } = setup(() => ({ status: 500, body: { code: "XX000", message: "boom", details: null, hint: null } }));
    const result = await withActorDisplays(client, rows, pick);
    expect(result.map((r) => r.actor.status)).toEqual(["unknown", "unknown", "unknown", "system", "legacy", "unknown"]);
    expect(result.map((r) => actorLabel(r.actor)).some((l) => l.includes(ACTOR_DELETED_SUFFIX))).toBe(false);
    expect(result[0].actor.name).toBe("山田花子");
  });

  it("一覧が空のときも全行 unknown（全員が削除済みに見えない）", async () => {
    const { client } = setup(() => ({ body: [] }));
    const result = await withActorDisplays(client, [rows[0], rows[2]], pick);
    expect(result.map((r) => r.actor.status)).toEqual(["unknown", "unknown"]);
  });

  it("人のid が無い（システム・旧い行だけ）・行が空のときは、問い合わせをしない", async () => {
    const { client, calls } = setup(() => ({ body: USERS }));
    const sysOnly = await withActorDisplays(client, [rows[3], rows[4]], pick);
    expect(sysOnly.map((r) => r.actor.status)).toEqual(["system", "legacy"]);
    expect(await withActorDisplays(client, [], pick)).toEqual([]);
    const emptyId = await withActorDisplays(client, [{ id: "9", actorId: "", user: "x" }], pick);
    expect(emptyId[0].actor).toEqual({ name: "x", status: "legacy" });
    expect(calls).toHaveLength(0);
  });

  it("ブラウザ側では、行が無くても例外（問い合わせもしない）", async () => {
    const { client, calls } = setup(() => ({ body: USERS }));
    (globalThis as { window?: unknown }).window = {};
    const err = await withActorDisplays(client, [], pick).catch((e) => e);
    expect(err).toBeInstanceOf(PortalUsersError);
    expect(calls).toHaveLength(0);
  });

  it("改名が次の呼び出しで反映される（キャッシュなし）。削除も同様", async () => {
    let current: unknown[] = [user("u_staff", "旧名", "hanako")];
    const { client } = setup(() => ({ body: current }));
    const one = [rows[0]];
    expect((await withActorDisplays(client, one, pick))[0].actor).toEqual({ name: "旧名", status: "current" });
    current = [user("u_staff", "新名", "hanako"), user("u_other", "他の人", "other")];
    expect((await withActorDisplays(client, one, pick))[0].actor).toEqual({ name: "新名", status: "current" });
    current = [user("u_other", "他の人", "other")];
    expect((await withActorDisplays(client, one, pick))[0].actor).toEqual({ name: "山田花子", status: "deleted" });
  });
});
