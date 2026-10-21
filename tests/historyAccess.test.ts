import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  authorizeActor,
  canViewHistory,
  effectiveHistoryView,
  HISTORY_NONE_MESSAGE,
  HISTORY_SCOPE_LABELS,
  historyAccess,
  historyScope,
  historyViewLock,
  PORTAL_ROLES,
  type HistoryAccess,
  type HistoryScope,
} from "../src/authorize";

// 操作履歴を権限で制限する純粋な関数（DBを引かない。window検査も無い=ブラウザでも呼べる）。

const BAD_ROLES: Array<string | null | undefined> = ["", "オーナー", " 管理者", "管理者 ", "admin", "ｽﾀｯﾌ", "スタッフ\n", null, undefined];

describe("historyScope（役割だけで決まる範囲の上限）", () => {
  it("管理者=all・スタッフ=own・閲覧のみ=none", () => {
    expect(historyScope("管理者")).toBe("all");
    expect(historyScope("スタッフ")).toBe("own");
    expect(historyScope("閲覧のみ")).toBe("none");
  });

  it("不明・表記違い・空白付き・空・null・undefined は none（fail-closed）", () => {
    for (const r of BAD_ROLES) expect(historyScope(r), String(r)).toBe("none");
  });

  it("すべての PORTAL_ROLES に範囲が定義されている", () => {
    for (const r of PORTAL_ROLES) expect(["all", "own", "none"]).toContain(historyScope(r));
  });
});

describe("historyViewLock（history.viewの欄の固定）", () => {
  it("管理者=on（常に可）・スタッフ=null（設定できる）・閲覧のみ=off（常に不可）", () => {
    expect(historyViewLock("管理者")).toBe("on");
    expect(historyViewLock("スタッフ")).toBeNull();
    expect(historyViewLock("閲覧のみ")).toBe("off");
  });

  it("不明・空・null・undefined は off（fail-closed）", () => {
    for (const r of BAD_ROLES) expect(historyViewLock(r), String(r)).toBe("off");
  });

  it("すべての PORTAL_ROLES に固定が定義されている（on / off / null のどれか）", () => {
    for (const r of PORTAL_ROLES) expect(["on", "off", null]).toContain(historyViewLock(r));
  });
});

describe("effectiveHistoryView / canViewHistory（履歴の画面を開けるか）", () => {
  const grants = [true, false, null, undefined] as const;

  it("管理者は granted が false・null・undefined でも可（保存値は無視される）", () => {
    for (const g of grants) expect(effectiveHistoryView("管理者", g), String(g)).toBe(true);
  });

  it("閲覧のみは granted が true でも不可（保存値は無視される）", () => {
    for (const g of grants) expect(effectiveHistoryView("閲覧のみ", g), String(g)).toBe(false);
  });

  it("スタッフは granted が true のときだけ可（false・null・undefined は不可）", () => {
    expect(effectiveHistoryView("スタッフ", true)).toBe(true);
    for (const g of [false, null, undefined] as const) expect(effectiveHistoryView("スタッフ", g), String(g)).toBe(false);
  });

  it("不明なロールは granted が true でも不可", () => {
    for (const r of BAD_ROLES) expect(effectiveHistoryView(r, true), String(r)).toBe(false);
  });

  it("canViewHistory は effectiveHistoryView と同じ", () => {
    expect(canViewHistory).toBe(effectiveHistoryView);
    expect(canViewHistory("スタッフ", true)).toBe(true);
    expect(canViewHistory("閲覧のみ", true)).toBe(false);
  });
});

describe("historyAccess（範囲 × history.view）", () => {
  const user = (role: string, id = "u_abc123") => ({ id, role });

  it("管理者 → all（id があっても actorId を持たない。granted が何でも all）", () => {
    for (const g of [true, false, null, undefined] as const) {
      const a = historyAccess(user("管理者"), g);
      expect(a).toEqual({ scope: "all" });
      expect("actorId" in a).toBe(false);
    }
  });

  it("スタッフ＋granted=true → own（actorId は自分のid）", () => {
    expect(historyAccess(user("スタッフ", "u_staff1"), true)).toEqual({ scope: "own", actorId: "u_staff1" });
  });

  it("スタッフ＋granted が false・null・undefined → none", () => {
    for (const g of [false, null, undefined] as const) expect(historyAccess(user("スタッフ"), g), String(g)).toEqual({ scope: "none" });
  });

  it("閲覧のみ → granted が true でも none", () => {
    for (const g of [true, false, null, undefined] as const) expect(historyAccess(user("閲覧のみ"), g), String(g)).toEqual({ scope: "none" });
  });

  it("ロール不明・空 → granted が true でも none", () => {
    for (const r of BAD_ROLES) expect(historyAccess({ id: "u_x", role: r as string }, true), String(r)).toEqual({ scope: "none" });
  });

  it("user が null・undefined（認可に失敗）→ none", () => {
    expect(historyAccess(null, true)).toEqual({ scope: "none" });
    expect(historyAccess(undefined, true)).toEqual({ scope: "none" });
  });

  it("id が空・文字列でない → 役割にかかわらず none（fail-closed）", () => {
    for (const role of PORTAL_ROLES) {
      expect(historyAccess({ id: "", role }, true), role).toEqual({ scope: "none" });
      expect(historyAccess({ id: undefined as unknown as string, role }, true), role).toEqual({ scope: "none" });
      expect(historyAccess({ id: 1 as unknown as string, role }, true), role).toEqual({ scope: "none" });
    }
  });

  it("id が sys_ で始まる「ユーザー」は、役割にかかわらず none（人のセッションがシステムの行を名乗れない）", () => {
    for (const role of PORTAL_ROLES) {
      for (const id of ["sys_makeshop", "sys_", "sys_Make", "SYS_x", "Sys_import"]) {
        expect(historyAccess({ id, role }, true), `${role}/${id}`).toEqual({ scope: "none" });
      }
    }
  });

  it("途中に sys_ を含むだけの id は通常どおり（スタッフ=own、管理者=all）", () => {
    expect(historyAccess({ id: "u_sys_x", role: "スタッフ" }, true)).toEqual({ scope: "own", actorId: "u_sys_x" });
    expect(historyAccess({ id: "u_sys_x", role: "管理者" }, true)).toEqual({ scope: "all" });
  });

  it("型: own のときだけ actorId が読める（判別共用体）", () => {
    const a: HistoryAccess = historyAccess({ id: "u_1", role: "スタッフ" }, true);
    const key = a.scope === "own" ? a.actorId : null;
    expect(key).toBe("u_1");
    // @ts-expect-error all には actorId が無い
    void ({ scope: "all", actorId: "x" } as HistoryAccess & { scope: "all" }).actorId;
  });
});

describe("authorizeActor の結果との結合（毎回引く＝ロール変更が次の呼び出しで反映される）", () => {
  it("ロールを変えた次の呼び出しで範囲が変わる。認可に失敗したら none", async () => {
    let current: unknown[] = [{ id: "u_1", login_id: "Claude", name: "クロード", role: "スタッフ" }];
    const fetchStub = (async () =>
      new Response(JSON.stringify(current), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    const client = createClient("http://localhost:54321", "dummy-key", { auth: { persistSession: false }, global: { fetch: fetchStub } });

    const scopeOf = async (granted: boolean): Promise<HistoryScope> => {
      const auth = await authorizeActor(client, "claude");
      return historyAccess(auth.ok ? auth.user : null, granted).scope;
    };

    expect(await scopeOf(true)).toBe("own");
    expect(await scopeOf(false)).toBe("none");
    current = [{ id: "u_1", login_id: "Claude", name: "クロード", role: "管理者" }];
    expect(await scopeOf(false)).toBe("all");
    current = [{ id: "u_1", login_id: "Claude", name: "クロード", role: "閲覧のみ" }];
    expect(await scopeOf(true)).toBe("none");
    current = []; // 削除された → unregistered → none
    expect(await scopeOf(true)).toBe("none");
  });
});

describe("共通の文言", () => {
  it("HISTORY_SCOPE_LABELS は all / own / none の3つ（空でない）", () => {
    expect(Object.keys(HISTORY_SCOPE_LABELS).sort()).toEqual(["all", "none", "own"]);
    for (const v of Object.values(HISTORY_SCOPE_LABELS)) expect(v.length).toBeGreaterThan(0);
  });

  it("HISTORY_NONE_MESSAGE は空でない", () => {
    expect(HISTORY_NONE_MESSAGE.length).toBeGreaterThan(0);
  });
});
