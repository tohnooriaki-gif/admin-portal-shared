import { describe, it, expect } from "vitest";
import { createBasePathHelpers } from "../src/basePath";

describe("createBasePathHelpers", () => {
  it("BASE_PATHをそのまま保持する", () => {
    const { BASE_PATH } = createBasePathHelpers("/delivery");
    expect(BASE_PATH).toBe("/delivery");
  });

  it("絶対パスにbasePathを付与する", () => {
    const { withBasePath } = createBasePathHelpers("/delivery");
    expect(withBasePath("/receipts")).toBe("/delivery/receipts");
    expect(withBasePath("/")).toBe("/delivery/");
  });

  it("既にbasePathが付いている場合は二重に付けない", () => {
    const { withBasePath } = createBasePathHelpers("/delivery");
    expect(withBasePath("/delivery/receipts")).toBe("/delivery/receipts");
    expect(withBasePath("/delivery")).toBe("/delivery");
  });

  it("絶対パスでない値（空文字・相対パス）はそのまま返す", () => {
    const { withBasePath } = createBasePathHelpers("/delivery");
    expect(withBasePath("")).toBe("");
    expect(withBasePath("receipts")).toBe("receipts");
  });

  it("既知の制約: basePathとアプリ内部ルートのトップレベルセグメント名が一致すると誤判定する（README記載の挙動を固定するテスト）", () => {
    // price-appはbasePath="/products"で、内部ルート"/products/{code}"を持つ。
    // withBasePath()は「もうbasePathが付いている」と誤判定し、basePathを付けない。
    // これは既知の制約であり、このテストは「直す」ものではなく現在の挙動を記録するもの。
    const { withBasePath } = createBasePathHelpers("/products");
    expect(withBasePath("/products/ABC123")).toBe("/products/ABC123"); // 期待値は "/products/products/ABC123" だが誤判定でそうならない
  });
});
