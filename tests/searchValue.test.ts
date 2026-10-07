import { describe, it, expect, vi } from "vitest";
import { SearchValue } from "../src/components/SearchValue";

// コンポーネントはレンダリングしない（状態を持たない関数を直接呼び、返った要素のpropsだけを見る）。
// ホバーの見た目・クリックが行へ伝わらないことは実ブラウザで検証する。

type El = { props: { className: string; title: string; children: string; onClick: (e: unknown) => void } } | null;
const render = (props: Parameters<typeof SearchValue>[0]) => SearchValue(props) as unknown as El;

describe("SearchValue", () => {
  it("valueが空なら何も描画しない", () => {
    expect(render({ value: "", onSearch: () => {} })).toBeNull();
  });

  it("既定のtitleは「『値』で検索」、titleで上書きできる", () => {
    expect(render({ value: "山田商店", onSearch: () => {} })!.props.title).toBe("「山田商店」で検索");
    expect(render({ value: "山田商店", onSearch: () => {}, title: "「山田商店」で再検索" })!.props.title).toBe(
      "「山田商店」で再検索"
    );
  });

  it("押すとstopPropagationしてonSearch(value)を呼ぶ（既定）", () => {
    const onSearch = vi.fn();
    const stopPropagation = vi.fn();
    render({ value: "A001", onSearch })!.props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("A001");
  });

  it("stopPropagation={false}なら行へ伝える", () => {
    const onSearch = vi.fn();
    const stopPropagation = vi.fn();
    render({ value: "A001", onSearch, stopPropagation: false })!.props.onClick({ stopPropagation });
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(onSearch).toHaveBeenCalledWith("A001");
  });

  it("classNameは既定のクラスを置き換えず、後ろに足される", () => {
    const base = render({ value: "x", onSearch: () => {} })!.props.className;
    const extra = render({ value: "x", onSearch: () => {}, className: "min-w-0 flex-1 truncate" })!.props.className;
    expect(extra.startsWith(base)).toBe(true);
    expect(extra.endsWith("min-w-0 flex-1 truncate")).toBe(true);
  });

  it("ホバーの手がかりは色の変化と点線の下線（リンクの実線と区別）", () => {
    const c = render({ value: "x", onSearch: () => {} })!.props.className;
    expect(c).toContain("hover:underline");
    expect(c).toContain("hover:decoration-dotted");
    expect(c).toContain("focus-visible:decoration-dotted");
  });

  it("accentでホバー色が変わる（hoverとfocus-visibleの両方）", () => {
    for (const [accent, color] of [
      ["neutral", "slate-900"],
      ["indigo", "indigo-700"],
      ["emerald", "emerald-700"],
      ["amber", "amber-700"],
    ] as const) {
      const c = render({ value: "x", onSearch: () => {}, accent })!.props.className;
      expect(c).toContain(`hover:text-${color}`);
      expect(c).toContain(`focus-visible:text-${color}`);
    }
  });
});
