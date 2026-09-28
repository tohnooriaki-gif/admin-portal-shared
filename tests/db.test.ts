import { describe, it, expect } from "vitest";
import { unwrap } from "../src/db";

describe("unwrap", () => {
  it("errorが無ければdataを返す", () => {
    expect(unwrap({ data: { id: 1 }, error: null })).toEqual({ id: 1 });
  });

  it("data配列もそのまま返す", () => {
    expect(unwrap({ data: [1, 2, 3], error: null })).toEqual([1, 2, 3]);
  });

  it("errorがあれば例外にする（メッセージを引き継ぐ）", () => {
    expect(() => unwrap({ data: null, error: { message: "boom" } })).toThrow("boom");
  });
});
