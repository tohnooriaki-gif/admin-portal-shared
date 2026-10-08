import { describe, it, expect, vi } from "vitest";
import { SearchInput } from "../src/components/SearchInput";
import { createUiKit } from "../src/components/ui";

// コンポーネントはレンダリングしない（状態を持たない関数を直接呼び、返った要素のpropsだけを見る）。
// 見た目（虫眼鏡・×の位置、パディング）は実ブラウザで検証する。

type Props = Record<string, any>;
type El = { props: Props & { children: any[] } };
const render = (props: Parameters<typeof SearchInput>[0]) => SearchInput(props) as unknown as El;
const parts = (el: El) => ({ wrapper: el.props, input: el.props.children[1] as El, clear: el.props.children[2] as El | false });

const base = { value: "", onChange: () => {}, ariaLabel: "請求を検索" };

describe("SearchInput", () => {
  it("入力欄にplaceholderとaria-labelとvalueを渡す", () => {
    const { input } = parts(render({ ...base, value: "abc", placeholder: "検索" }));
    expect(input.props.placeholder).toBe("検索");
    expect(input.props["aria-label"]).toBe("請求を検索");
    expect(input.props.value).toBe("abc");
  });

  it("入力するとイベントではなく文字列をonChangeに渡す", () => {
    const onChange = vi.fn();
    parts(render({ ...base, onChange })).input.props.onChange({ target: { value: "山田" } });
    expect(onChange).toHaveBeenCalledWith("山田");
  });

  it("入力欄はcreateUiKitのinputClassと同じ（accentごとの枠・リング）＋左右の余白", () => {
    for (const accent of ["neutral", "indigo", "emerald", "amber"] as const) {
      const cls = parts(render({ ...base, accent })).input.props.className as string;
      expect(cls).toBe(`${createUiKit(accent).inputClass} pl-9 pr-9`);
    }
    expect(parts(render({ ...base, accent: "amber" })).input.props.className).toContain("focus:border-amber-400");
  });

  it("accent省略時はneutral", () => {
    expect(parts(render(base)).input.props.className).toContain("focus:border-slate-400");
  });

  it("入力が空なら×を出さない／入力があれば出す（title・aria-labelは「検索語を消す」）", () => {
    expect(parts(render({ ...base, value: "" })).clear).toBe(false);
    const { clear } = parts(render({ ...base, value: "x" }));
    expect(clear).toBeTruthy();
    expect((clear as El).props.title).toBe("検索語を消す");
    expect((clear as El).props["aria-label"]).toBe("検索語を消す");
    expect((clear as El).props.type).toBe("button");
  });

  it("×を押すと既定ではonChange('')を呼ぶ", () => {
    const onChange = vi.fn();
    (parts(render({ ...base, value: "x", onChange })).clear as El).props.onClick();
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("onClearを渡すと、×ではそれだけを呼ぶ（onChange('')は呼ばない）", () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    (parts(render({ ...base, value: "x", onChange, onClear })).clear as El).props.onClick();
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("classNameは外側のdivに追加され、relativeは置き換わらない", () => {
    expect(parts(render(base)).wrapper.className).toBe("relative");
    const cls = parts(render({ ...base, className: "min-w-[14rem] flex-1" })).wrapper.className as string;
    expect(cls).toBe("relative min-w-[14rem] flex-1");
  });
});
