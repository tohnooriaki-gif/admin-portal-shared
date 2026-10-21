import { describe, it, expect } from "vitest";
import { hasSystemActorPrefix, isSystemActor, SYSTEM_ACTOR_PREFIX } from "../src/systemActor";

describe("システム用の操作者id", () => {
  it("接頭辞は sys_", () => {
    expect(SYSTEM_ACTOR_PREFIX).toBe("sys_");
  });

  it("isSystemActor: 形式 ^sys_[a-z0-9_]{1,32}$ に合うものだけtrue", () => {
    for (const ok of ["sys_makeshop", "sys_import", "sys_a", "sys_a_1", "sys__", "sys_" + "a".repeat(32)]) {
      expect(isSystemActor(ok), ok).toBe(true);
    }
  });

  it("isSystemActor: sys_のみ・大文字入り・33文字以上・空白入り・人のid・null・undefined・空・文字列でない値はfalse", () => {
    const bad: unknown[] = [
      "sys_",
      "SYS_makeshop",
      "sys_Make",
      "sys_" + "a".repeat(33),
      "sys_make shop",
      "sys_make-shop",
      " sys_makeshop",
      "sys_makeshop\n",
      "u_sys_makeshop",
      "u_mtgunnji3ihpw",
      "ſys_makeshop", // 長いs（U+017F）
      "",
      null,
      undefined,
      1,
    ];
    for (const id of bad) expect(isSystemActor(id as string), String(id)).toBe(false);
  });

  it("hasSystemActorPrefix: 形式を問わず、sys_で始まればtrue（大文字小文字は区別しない）", () => {
    for (const id of ["sys_makeshop", "sys_", "sys_Make", "SYS_x", "Sys_x", "sys_ x", "sys_" + "a".repeat(40)]) {
      expect(hasSystemActorPrefix(id), id).toBe(true);
    }
  });

  it("hasSystemActorPrefix: 途中に含むだけ・空・null・undefined・ASCII以外の似た文字はfalse", () => {
    for (const id of ["u_sys_x", "xsys_", "sys", "sy_s_", "", " sys_x", "ſys_x", null, undefined]) {
      expect(hasSystemActorPrefix(id), String(id)).toBe(false);
    }
  });
});
