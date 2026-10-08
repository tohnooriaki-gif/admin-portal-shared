import { describe, it, expect, vi } from "vitest";
import { FilterResetLink } from "../src/components/FilterResetLink";

// コンポーネントはレンダリングしない（状態を持たない関数を直接呼び、返った要素のpropsだけを見る）。

type El = { props: { className: string; children: string; type: string; onClick: () => void } };
const render = (props: Parameters<typeof FilterResetLink>[0]) => FilterResetLink(props) as unknown as El;

describe("FilterResetLink", () => {
  it("既定の文言は「最初の絞り込みに戻す」、labelで上書きできる", () => {
    expect(render({ onClick: () => {} }).props.children).toBe("最初の絞り込みに戻す");
    expect(render({ onClick: () => {}, label: "検索条件クリア" }).props.children).toBe("検索条件クリア");
  });

  it("type=buttonで、押すとonClickを呼ぶ", () => {
    const onClick = vi.fn();
    const el = render({ onClick });
    expect(el.props.type).toBe("button");
    el.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("見た目はpayment-appと同じ（text-xs text-slate-500 underline hover:text-slate-700）", () => {
    expect(render({ onClick: () => {} }).props.className).toBe("text-xs text-slate-500 underline hover:text-slate-700");
  });

  it("classNameは既定のクラスを置き換えず、後ろに足される", () => {
    const base = render({ onClick: () => {} }).props.className;
    const extra = render({ onClick: () => {}, className: "ml-auto" }).props.className;
    expect(extra).toBe(`${base} ml-auto`);
  });
});
