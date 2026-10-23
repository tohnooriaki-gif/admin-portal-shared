import { describe, it, expect } from "vitest";
import {
  can,
  COMMON_PERMISSIONS,
  definePermissions,
  diffMatrix,
  effectivePermissions,
  HISTORY_VIEW_KEY,
  matrixFromRows,
  normalizeMatrix,
  PERMISSION_ACTIONS,
  PERMISSION_FAILURES,
  permissionFailureBody,
  permissionLock,
  type PermissionDef,
} from "../src/permissions";
import { effectiveHistoryView, historyViewLock, PORTAL_ROLES } from "../src/authorize";

// 純粋な部分（DB・Next.jsに依存しない）。DB の読み書きは tests/permissionsStore.test.ts。

const EDIT: PermissionDef = {
  key: "items.edit",
  label: "項目の編集",
  description: "項目を編集する",
  kind: "write",
  defaults: { 管理者: true, スタッフ: true, 閲覧のみ: false },
};
const DELETE: PermissionDef = {
  key: "items.delete",
  label: "項目の削除",
  description: "項目を削除する",
  kind: "write",
  defaults: { 管理者: true, スタッフ: false, 閲覧のみ: false },
};
const PICTURE: PermissionDef = {
  key: "items.view",
  label: "項目の閲覧（読み取り系・固定なし）",
  description: "閲覧",
  kind: "read",
  defaults: { 管理者: true, スタッフ: true, 閲覧のみ: true },
};
const LOCKED_READ: PermissionDef = {
  key: "reports.view",
  label: "レポート",
  description: "レポートを見る",
  kind: "read",
  defaults: { 管理者: true, スタッフ: true, 閲覧のみ: true },
  lock: { スタッフ: "off", 閲覧のみ: "on" },
};
const DEFS = [EDIT, DELETE, PICTURE, LOCKED_READ, COMMON_PERMISSIONS.historyView, COMMON_PERMISSIONS.permissionsManage, COMMON_PERMISSIONS.dataExport];

const BAD_ROLES: Array<string | null | undefined> = ["", "オーナー", " 管理者", "管理者 ", "admin", null, undefined];

describe("definePermissions（項目の検証）", () => {
  it("正しい一覧はそのまま返る（共通3項目を含む）", () => {
    expect(definePermissions(DEFS)).toBe(DEFS);
  });

  it("動作の語彙", () => {
    expect([...PERMISSION_ACTIONS]).toEqual(["edit", "delete", "import", "export", "bulk", "revert", "view", "manage"]);
    for (const a of PERMISSION_ACTIONS) {
      expect(() => definePermissions([{ ...EDIT, key: `things.${a}` }])).not.toThrow();
    }
  });

  it("key が <対象>.<動作> の形でない・動作が語彙に無い → 例外", () => {
    for (const key of ["edit", "products", "products.save", "Products.edit", "products.Edit", "products.edit.x", ".edit", "products-1.edit", "1products.edit", ""]) {
      expect(() => definePermissions([{ ...EDIT, key }]), key).toThrow(/<対象>\.<動作>/);
    }
  });

  it("key の重複 → 例外", () => {
    expect(() => definePermissions([EDIT, { ...EDIT, label: "別の名前" }])).toThrow(/重複/);
  });

  it("表示名・説明が空（空白だけを含む）→ 例外", () => {
    expect(() => definePermissions([{ ...EDIT, label: "  " }])).toThrow(/空/);
    expect(() => definePermissions([{ ...EDIT, description: "" }])).toThrow(/空/);
  });

  it("kind が不正 → 例外", () => {
    expect(() => definePermissions([{ ...EDIT, kind: "rw" as unknown as "write" }])).toThrow(/kind/);
  });

  it("既定値が全ロール分の真偽値でない → 例外", () => {
    const bad = { ...EDIT, defaults: { 管理者: true, スタッフ: true } as unknown as PermissionDef["defaults"] };
    expect(() => definePermissions([bad])).toThrow(/既定値/);
  });
});

describe("共通3項目の定義", () => {
  const { historyView, permissionsManage, dataExport } = COMMON_PERMISSIONS;

  it("key・種類・既定", () => {
    expect(historyView.key).toBe("history.view");
    expect(HISTORY_VIEW_KEY).toBe("history.view");
    expect(historyView.kind).toBe("read");
    expect(historyView.defaults).toEqual({ 管理者: true, スタッフ: true, 閲覧のみ: false });
    expect(permissionsManage.key).toBe("permissions.manage");
    expect(permissionsManage.kind).toBe("write");
    expect(permissionsManage.defaults).toEqual({ 管理者: true, スタッフ: false, 閲覧のみ: false });
    expect(dataExport.key).toBe("data.export");
    expect(dataExport.kind).toBe("read");
    expect(dataExport.defaults).toEqual({ 管理者: true, スタッフ: true, 閲覧のみ: true });
  });

  it("history.view の説明に、範囲の共通の文言（全件／自分の操作だけ／見られない）が入る", () => {
    expect(historyView.description).toContain("全件");
    expect(historyView.description).toContain("自分の操作だけ");
    expect(historyView.description).toContain("見られない");
  });

  it("3項目とも definePermissions を通る。全ロール分の既定がある", () => {
    expect(() => definePermissions([historyView, permissionsManage, dataExport])).not.toThrow();
    for (const d of [historyView, permissionsManage, dataExport]) {
      for (const r of PORTAL_ROLES) expect(typeof d.defaults[r]).toBe("boolean");
    }
  });
});

describe("permissionLock（欄の固定）", () => {
  it("書き込み系: 管理者・スタッフは固定なし、閲覧のみは off（canWrite に委譲）", () => {
    expect(permissionLock(EDIT, "管理者")).toBeNull();
    expect(permissionLock(EDIT, "スタッフ")).toBeNull();
    expect(permissionLock(EDIT, "閲覧のみ")).toBe("off");
  });

  it("読み取り系で lock が無ければ、全ロール固定なし", () => {
    for (const r of PORTAL_ROLES) expect(permissionLock(PICTURE, r)).toBeNull();
  });

  it("def.lock の指定が効く（読み取り系）", () => {
    expect(permissionLock(LOCKED_READ, "管理者")).toBeNull();
    expect(permissionLock(LOCKED_READ, "スタッフ")).toBe("off");
    expect(permissionLock(LOCKED_READ, "閲覧のみ")).toBe("on");
  });

  it("書き込み系の閲覧のみは、def.lock が on でも off（書き込み不可が優先）", () => {
    expect(permissionLock({ ...EDIT, lock: { 閲覧のみ: "on" } }, "閲覧のみ")).toBe("off");
  });

  it("permissions.manage: 管理者=on、スタッフ=固定なし、閲覧のみ=off", () => {
    const d = COMMON_PERMISSIONS.permissionsManage;
    expect(permissionLock(d, "管理者")).toBe("on");
    expect(permissionLock(d, "スタッフ")).toBeNull();
    expect(permissionLock(d, "閲覧のみ")).toBe("off");
  });

  it("history.view は historyViewLock と全ロールで一致（二重に定義しない）", () => {
    for (const r of PORTAL_ROLES) expect(permissionLock(COMMON_PERMISSIONS.historyView, r), r).toBe(historyViewLock(r));
    // def の lock・kind の指定より historyViewLock が優先される
    const tampered: PermissionDef = { ...COMMON_PERMISSIONS.historyView, kind: "write", lock: { 管理者: "off", スタッフ: "on" } };
    for (const r of PORTAL_ROLES) expect(permissionLock(tampered, r), r).toBe(historyViewLock(r));
  });

  it("未知・空・null・undefined のロールは、どの項目も off（fail-closed）", () => {
    for (const r of BAD_ROLES) {
      for (const d of DEFS) expect(permissionLock(d, r), `${r}/${d.key}`).toBe("off");
    }
  });
});

describe("normalizeMatrix", () => {
  it("保存なし（null・undefined・オブジェクトでない値）→ 全項目が既定値（固定を反映）", () => {
    for (const raw of [null, undefined, "x", 1, []]) {
      const m = normalizeMatrix(DEFS, raw);
      expect(m.管理者["items.edit"]).toBe(true);
      expect(m.スタッフ["items.edit"]).toBe(true);
      expect(m.閲覧のみ["items.edit"]).toBe(false);
      expect(m.スタッフ["items.delete"]).toBe(false);
      expect(m.管理者["permissions.manage"]).toBe(true);
      expect(m.スタッフ["history.view"]).toBe(true);
      expect(m.閲覧のみ["history.view"]).toBe(false);
      expect(m.閲覧のみ["data.export"]).toBe(true);
    }
  });

  it("全役割×全項目が埋まる（未知のキー・ロールは捨てる）", () => {
    const m = normalizeMatrix(DEFS, { 管理者: { "items.edit": false, "unknown.edit": true }, オーナー: { "items.edit": true } });
    expect(Object.keys(m).sort()).toEqual([...PORTAL_ROLES].sort());
    for (const r of PORTAL_ROLES) expect(Object.keys(m[r]).sort()).toEqual(DEFS.map((d) => d.key).sort());
    expect("unknown.edit" in m.管理者).toBe(false);
    expect(m.管理者["items.edit"]).toBe(false);
  });

  it("行が欠けた項目は既定値で補う。明示的に ✕ と保存された行は ✕ のまま", () => {
    const m = normalizeMatrix(DEFS, { スタッフ: { "items.edit": false } });
    expect(m.スタッフ["items.edit"]).toBe(false); // 明示の ✕
    expect(m.スタッフ["items.view"]).toBe(true); // 欠け → 既定
    expect(m.スタッフ["items.delete"]).toBe(false); // 欠け → 既定（✕）
  });

  it("スタッフの ✕ を ◯ に保存すれば ◯（既定が ✕ の項目）", () => {
    expect(normalizeMatrix(DEFS, { スタッフ: { "items.delete": true } }).スタッフ["items.delete"]).toBe(true);
  });

  it("真偽値でない値は既定値", () => {
    const m = normalizeMatrix(DEFS, { スタッフ: { "items.edit": "false", "items.delete": 1, "items.view": null } });
    expect(m.スタッフ["items.edit"]).toBe(true);
    expect(m.スタッフ["items.delete"]).toBe(false);
    expect(m.スタッフ["items.view"]).toBe(true);
  });

  it("固定の欄は保存値を無視（管理者の permissions.manage=false／閲覧のみの書き込み系=true／閲覧のみの history.view=true）", () => {
    const m = normalizeMatrix(DEFS, {
      管理者: { "permissions.manage": false, "history.view": false },
      閲覧のみ: { "items.edit": true, "items.delete": true, "permissions.manage": true, "history.view": true },
    });
    expect(m.管理者["permissions.manage"]).toBe(true);
    expect(m.管理者["history.view"]).toBe(true);
    expect(m.閲覧のみ["items.edit"]).toBe(false);
    expect(m.閲覧のみ["items.delete"]).toBe(false);
    expect(m.閲覧のみ["permissions.manage"]).toBe(false);
    expect(m.閲覧のみ["history.view"]).toBe(false);
  });

  it("def.lock も保存値を無視する", () => {
    const m = normalizeMatrix(DEFS, { スタッフ: { "reports.view": true }, 閲覧のみ: { "reports.view": false } });
    expect(m.スタッフ["reports.view"]).toBe(false);
    expect(m.閲覧のみ["reports.view"]).toBe(true);
  });

  it("プロトタイプのキー（__proto__・constructor）を保存値に含めても影響しない", () => {
    const raw = JSON.parse('{"__proto__":{"items.edit":false},"スタッフ":{"__proto__":{"x":1},"constructor":true,"items.edit":false}}');
    const m = normalizeMatrix(DEFS, raw);
    expect(m.スタッフ["items.edit"]).toBe(false);
    expect(Object.keys(m.スタッフ)).not.toContain("constructor");
    expect(({} as Record<string, unknown>)["items.edit"]).toBeUndefined();
  });

  it("正規化は冪等（もう一度通しても同じ）", () => {
    const once = normalizeMatrix(DEFS, { スタッフ: { "items.edit": false } });
    expect(normalizeMatrix(DEFS, once)).toEqual(once);
  });
});

describe("matrixFromRows", () => {
  it("role_permissions の行を表にする。不正な行（未知のロール・文字列でない permission・真偽値でない allowed）は捨てる", () => {
    const raw = matrixFromRows([
      { role: "スタッフ", permission: "items.edit", allowed: false },
      { role: "管理者", permission: "items.edit", allowed: true },
      { role: "オーナー", permission: "items.edit", allowed: true },
      { role: "スタッフ", permission: 1, allowed: true },
      { role: "スタッフ", permission: "items.view", allowed: "true" },
      { role: "スタッフ", permission: "items.delete" },
    ]);
    expect(raw).toEqual({ スタッフ: { "items.edit": false }, 管理者: { "items.edit": true } });
  });

  it("空 → 空（正規化すると全項目が既定値）", () => {
    expect(matrixFromRows([])).toEqual({});
  });
});

describe("effectivePermissions / can", () => {
  const m = normalizeMatrix(DEFS, { スタッフ: { "items.edit": false, "data.export": false } });

  it("役割の実効権限（全項目のkey→可否）", () => {
    const staff = effectivePermissions(DEFS, m, "スタッフ");
    expect(staff["items.edit"]).toBe(false);
    expect(staff["items.delete"]).toBe(false);
    expect(staff["items.view"]).toBe(true);
    expect(staff["data.export"]).toBe(false);
    expect(staff["history.view"]).toBe(true);
    expect(staff["permissions.manage"]).toBe(false);
    expect(Object.keys(staff).sort()).toEqual(DEFS.map((d) => d.key).sort());
    expect(effectivePermissions(DEFS, m, "管理者")["permissions.manage"]).toBe(true);
    expect(effectivePermissions(DEFS, m, "閲覧のみ")["items.edit"]).toBe(false);
  });

  it("未知・空・null・undefined のロールは全項目不可（fail-closed）", () => {
    for (const r of BAD_ROLES) {
      const eff = effectivePermissions(DEFS, m, r);
      expect(Object.keys(eff).length).toBe(DEFS.length);
      for (const v of Object.values(eff)) expect(v, String(r)).toBe(false);
    }
  });

  it("正規化していない表・null でも、欠けは既定値・固定は固定どおり", () => {
    expect(effectivePermissions(DEFS, null, "スタッフ")["items.edit"]).toBe(true);
    expect(effectivePermissions(DEFS, {}, "閲覧のみ")["items.edit"]).toBe(false);
    expect(effectivePermissions(DEFS, { 閲覧のみ: { "items.edit": true } }, "閲覧のみ")["items.edit"]).toBe(false);
  });

  it("can: 項目と役割で引く。未知の key・未知のロールは不可", () => {
    expect(can(DEFS, m, "スタッフ", "items.view")).toBe(true);
    expect(can(DEFS, m, "スタッフ", "items.edit")).toBe(false);
    expect(can(DEFS, m, "管理者", "items.edit")).toBe(true);
    expect(can(DEFS, m, "管理者", "unknown.edit")).toBe(false);
    for (const r of BAD_ROLES) expect(can(DEFS, m, r, "items.view"), String(r)).toBe(false);
  });

  it("history.view の実効は effectiveHistoryView と、全ロール×保存値で一致（二重に定義しない）", () => {
    for (const role of [...PORTAL_ROLES, ...BAD_ROLES]) {
      for (const granted of [true, false, null, undefined]) {
        const matrix = granted === null || granted === undefined ? {} : { [role as string]: { "history.view": granted } };
        const expected =
          granted === undefined || granted === null
            ? effectiveHistoryView(role, COMMON_PERMISSIONS.historyView.defaults[role as keyof typeof COMMON_PERMISSIONS.historyView.defaults])
            : effectiveHistoryView(role, granted);
        expect(can(DEFS, matrix, role, "history.view"), `${role}/${granted}`).toBe(expected);
      }
    }
  });
});

describe("diffMatrix", () => {
  it("変更されたセルだけを、役割→項目の順で返す（表示名つき）", () => {
    const before = normalizeMatrix(DEFS, null);
    const after = normalizeMatrix(DEFS, { 管理者: { "items.delete": false }, スタッフ: { "items.edit": false, "items.delete": true } });
    const diff = diffMatrix(DEFS, before, after);
    expect(diff).toEqual([
      { role: "管理者", key: "items.delete", label: "項目の削除", before: true, after: false },
      { role: "スタッフ", key: "items.edit", label: "項目の編集", before: true, after: false },
      { role: "スタッフ", key: "items.delete", label: "項目の削除", before: false, after: true },
    ]);
  });

  it("固定の欄の変更は差分にならない（保存値が違っても実効が同じ）", () => {
    const diff = diffMatrix(DEFS, normalizeMatrix(DEFS, null), { 閲覧のみ: { "items.edit": true }, 管理者: { "permissions.manage": false } });
    expect(diff).toEqual([]);
  });

  it("変更が無ければ空。before が保存なし（null）でも既定値と比べる", () => {
    expect(diffMatrix(DEFS, null, null)).toEqual([]);
    expect(diffMatrix(DEFS, null, { スタッフ: { "items.view": false } })).toEqual([
      { role: "スタッフ", key: "items.view", label: "項目の閲覧（読み取り系・固定なし）", before: true, after: false },
    ]);
  });
});

describe("失敗時の共通の文言", () => {
  it("ステータス（文言は変わりうるので、statusと対応だけを固定）", () => {
    expect(PERMISSION_FAILURES.forbidden.status).toBe(403);
    expect(PERMISSION_FAILURES.unavailable.status).toBe(503);
    for (const f of Object.values(PERMISSION_FAILURES)) expect(f.message.length).toBeGreaterThan(0);
  });

  it("permissionFailureBody は { error: 共通メッセージ, code: 種類 }", () => {
    expect(permissionFailureBody("forbidden")).toEqual({ error: PERMISSION_FAILURES.forbidden.message, code: "forbidden" });
    expect(permissionFailureBody("unavailable")).toEqual({ error: PERMISSION_FAILURES.unavailable.message, code: "unavailable" });
  });
});
