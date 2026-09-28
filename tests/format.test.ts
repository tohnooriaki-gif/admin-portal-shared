import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime } from "../src/format";

// 日時は UTC 正午を使う（UTC-12〜UTC+12のどのタイムゾーンでも日付がずれないため、
// 実行環境のタイムゾーンに依存しない）。
const NOON_UTC = "2026-03-05T12:00:00Z";

describe("formatDate", () => {
  it("null/undefinedは-", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
  });

  it("不正な日付文字列は元の文字列をそのまま返す", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("正常な日付をja-JP表記（YYYY/MM/DD）にする", () => {
    expect(formatDate(NOON_UTC)).toBe("2026/03/05");
  });
});

describe("formatDateTime", () => {
  it("null/undefinedは-", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
  });

  it("不正な日付文字列は元の文字列をそのまま返す", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });

  it("正常な日時をja-JP表記にする（日付部分のみ検証。時刻はタイムゾーン依存のため）", () => {
    expect(formatDateTime(NOON_UTC)).toMatch(/^2026\/03\/0[45] \d{2}:\d{2}$/);
  });
});
