import { describe, it, expect } from "vitest";
import { createUiKit } from "../src/components/ui";

// コンポーネント自体はレンダリングしない（見た目のスナップショットは対象外）。
// createUiKit()が返す文字列（ロジック部分）だけを検証する。

describe("createUiKit", () => {
  it("indigo: inputClassにfocus:border-indigo-400を含む", () => {
    const kit = createUiKit("indigo");
    expect(kit.inputClass).toContain("focus:border-indigo-400");
    expect(kit.inputClass).toContain("focus:ring-indigo-100");
  });

  it("emerald: inputClassにfocus:border-emerald-400を含む", () => {
    const kit = createUiKit("emerald");
    expect(kit.inputClass).toContain("focus:border-emerald-400");
    expect(kit.inputClass).toContain("focus:ring-emerald-100");
  });

  it("amber: inputClassにfocus:border-amber-400を含む", () => {
    const kit = createUiKit("amber");
    expect(kit.inputClass).toContain("focus:border-amber-400");
    expect(kit.inputClass).toContain("focus:ring-amber-100");
  });

  it("neutral: inputClassにfocus:border-slate-400を含む（アプリのアクセントに依存しない中立色）", () => {
    const kit = createUiKit("neutral");
    expect(kit.inputClass).toContain("focus:border-slate-400");
    expect(kit.inputClass).toContain("focus:ring-slate-100");
  });

  it("inputClassはinputClassBaseの先頭にw-fullを付けたもの", () => {
    const kit = createUiKit("indigo");
    expect(kit.inputClass).toBe(`w-full ${kit.inputClassBase}`);
  });

  it("selectClass/selectClassBaseはinputClass/inputClassBaseと同じ値", () => {
    const kit = createUiKit("emerald");
    expect(kit.selectClass).toBe(kit.inputClass);
    expect(kit.selectClassBase).toBe(kit.inputClassBase);
  });

  it("アクセントが違えばinputClassBaseの中身も異なる", () => {
    expect(createUiKit("indigo").inputClassBase).not.toBe(createUiKit("emerald").inputClassBase);
  });
});
