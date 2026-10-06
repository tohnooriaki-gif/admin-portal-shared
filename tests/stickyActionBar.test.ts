import { describe, it, expect } from "vitest";
import { StickyActionBar } from "../src/components/StickyActionBar";

// コンポーネントはレンダリングしない（状態を持たない関数なので直接呼び、返ってきた要素のpropsだけを見る）。
// 見た目・スクロール時の固定は実ブラウザで検証する（TODO: 全体管理TODO.md参照）。

type El = { props: { className: string; children: unknown[] } };
const render = (props: Parameters<typeof StickyActionBar>[0]) => StickyActionBar(props) as unknown as El;

describe("StickyActionBar", () => {
  it("既定はbar: 画面下端に密着(sticky bottom-0)・白背景+上線・セーフエリア対応", () => {
    const c = render({ children: "x" }).props.className;
    expect(c).toContain("sticky bottom-0");
    expect(c).toContain("z-10");
    expect(c).toContain("border-t");
    expect(c).toContain("border-slate-200 bg-white/95");
    expect(c).toContain("env(safe-area-inset-bottom)");
  });

  it("floating: 下端から浮く(bottom-[max(1rem,...)])角丸のカード", () => {
    const c = render({ children: "x", variant: "floating" }).props.className;
    expect(c).toContain("sticky bottom-[max(1rem,env(safe-area-inset-bottom))]");
    expect(c).toContain("rounded-2xl");
    expect(c).toContain("shadow-lg");
    expect(c).not.toContain("border-t");
  });

  it("classNameは既定のクラスを置き換えず、後ろに足される", () => {
    for (const variant of ["bar", "floating"] as const) {
      const base = render({ children: "x", variant }).props.className;
      const withExtra = render({ children: "x", variant, className: "mt-4 foo" }).props.className;
      expect(withExtra.startsWith(base)).toBe(true);
      expect(withExtra.endsWith("mt-4 foo")).toBe(true);
    }
  });

  it("accentを指定すると線と背景がその色になり、レイアウトは同じ", () => {
    const neutral = render({ children: "x" }).props.className;
    const amber = render({ children: "x", accent: "amber" }).props.className;
    expect(amber).toContain("border-amber-200 bg-amber-50/95");
    expect(amber).not.toContain("bg-white/95");
    expect(amber).toContain("sticky bottom-0");
    expect(neutral).not.toContain("amber");
    expect(render({ children: "x", variant: "floating", accent: "amber" }).props.className).toContain(
      "border-amber-300 bg-amber-50/95"
    );
  });

  it("全accent×全variantで、固定表示に必要な指定が常に含まれる", () => {
    for (const accent of ["neutral", "indigo", "emerald", "amber"] as const) {
      for (const variant of ["bar", "floating"] as const) {
        const c = render({ children: "x", accent, variant }).props.className;
        expect(c).toContain("sticky");
        expect(c).toContain("z-10");
        expect(c).toMatch(/bg-\w+-?\d*\/95|bg-white\/95/);
      }
    }
  });

  it("statusが無ければ左側の表示は出さず、ボタンだけを出す", () => {
    expect(render({ children: "x" }).props.children[0]).toBe(false);
    expect(render({ children: "x", status: null }).props.children[0]).toBe(false);
  });

  it("statusがあれば左側に出す", () => {
    expect(render({ children: "x", status: "未保存" }).props.children[0]).toBeTruthy();
  });
});
