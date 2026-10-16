import { describe, it, expect } from "vitest";
import { matchesQuery, normalizeForSearch, stripForMatch } from "../src/search";

// receipt-appの lib/search.ts を挙動を変えずに移したもの。このテストは「現在の挙動」を固定する
// （receipt-appを共通版に置き換えても挙動が変わらないことの根拠）。限界も含めて明記している。

describe("normalizeForSearch", () => {
  it("ひらがな→カタカナに寄せる（ひらがな↔カタカナの表記ゆれを吸収）", () => {
    expect(normalizeForSearch("うまかれー")).toBe("ウマカレー");
    expect(normalizeForSearch("うまカレー")).toBe(normalizeForSearch("ウマカレー"));
    expect(normalizeForSearch("ぁぃぅぇぉ")).toBe("ァィゥェォ");
  });

  it("全角英数→半角、大文字→小文字（全角↔半角・大文字↔小文字を吸収）", () => {
    expect(normalizeForSearch("ＡＢｃ１２３")).toBe("abc123");
    expect(normalizeForSearch("ａ")).toBe("a");
    expect(normalizeForSearch("A")).toBe(normalizeForSearch("ａ"));
  });

  it("半角カナ→全角カナ（濁点・半濁点は合成される）", () => {
    expect(normalizeForSearch("ﾄｸﾈ")).toBe("トクネ");
    expect(normalizeForSearch("ｶﾞｷﾞｸﾞ")).toBe("ガギグ");
    expect(normalizeForSearch("ﾊﾟﾋﾟ")).toBe("パピ");
    expect(normalizeForSearch("ｶﾚｰ")).toBe("カレー");
  });

  it("長音「ー」は変わらず、半角の長音「ｰ」は「ー」になる。ひらがな側の「ー」も同じ", () => {
    expect(normalizeForSearch("カレー")).toBe("カレー");
    expect(normalizeForSearch("ｶﾚｰ")).toBe("カレー");
    expect(normalizeForSearch("かれー")).toBe("カレー");
  });

  it("「ゔ」はカタカナの「ヴ」になる（「ブ」とは同一視しない）", () => {
    expect(normalizeForSearch("ゔ")).toBe("ヴ");
    expect(normalizeForSearch("ゔぁいおりん")).toBe("ヴァイオリン");
    expect(normalizeForSearch("ヴ")).not.toBe(normalizeForSearch("ブ"));
  });

  it("小書きかな（ゃ・ゅ・ょ・っ）は小書きのままカタカナの小書きになり、「や」「つ」とは別扱い", () => {
    expect(normalizeForSearch("ゃゅょっ")).toBe("ャュョッ");
    expect(normalizeForSearch("ゃ")).not.toBe(normalizeForSearch("や"));
    expect(normalizeForSearch("ゅ")).not.toBe(normalizeForSearch("ゆ"));
    expect(normalizeForSearch("ッ")).not.toBe(normalizeForSearch("ツ"));
    expect(matchesQuery("ジャム", "じゃむ")).toBe(true);
    expect(matchesQuery("ジヤム", "じゃむ")).toBe(false);
  });

  it("NFD（結合文字の濁点・半濁点）はNFKCで合成されて、合成済みの文字と同じになる", () => {
    expect(normalizeForSearch("が")).toBe("ガ");
    expect(normalizeForSearch("ガ")).toBe("ガ");
    expect(normalizeForSearch("ぱ")).toBe("パ");
    expect(normalizeForSearch("パ")).toBe("パ");
    expect(normalizeForSearch("が")).toBe(normalizeForSearch("が"));
    expect(normalizeForSearch("ヴ")).toBe("ヴ");
    expect(matchesQuery("ガム", "がむ")).toBe(true);
  });

  it("NFKCによる統一（全角スペース→半角、丸数字、㈱ など）", () => {
    expect(normalizeForSearch("あ　い")).toBe("ア イ");
    expect(normalizeForSearch("①")).toBe("1");
    expect(normalizeForSearch("㈱")).toBe("(株)");
  });

  it("空白は除去しない（クエリ側のAND区切りに使うため）", () => {
    expect(normalizeForSearch("a b")).toBe("a b");
  });

  it("空文字・undefined・nullは空文字", () => {
    expect(normalizeForSearch("")).toBe("");
    expect(normalizeForSearch(undefined as unknown as string)).toBe("");
    expect(normalizeForSearch(null as unknown as string)).toBe("");
  });

  it("範囲外はそのまま（漢字・小書き文字・繰り返し記号「ゝ」は変換されない）", () => {
    expect(normalizeForSearch("運賃")).toBe("運賃");
    expect(normalizeForSearch("ゝ")).toBe("ゝ");
    expect(normalizeForSearch("っ")).toBe("ッ");
    expect(normalizeForSearch("ッ")).not.toBe(normalizeForSearch("ツ"));
  });
});

describe("stripForMatch", () => {
  it("正規化に加えて、半角・全角の空白をすべて除去する", () => {
    expect(stripForMatch("運 賃")).toBe("運賃");
    expect(stripForMatch("運　賃")).toBe("運賃");
    expect(stripForMatch(" う ま\tカ\nレー ")).toBe("ウマカレー");
  });

  it("空・undefined・nullは空文字", () => {
    expect(stripForMatch("")).toBe("");
    expect(stripForMatch("  　 ")).toBe("");
    expect(stripForMatch(undefined as unknown as string)).toBe("");
  });
});

describe("matchesQuery", () => {
  it("ひらがなで検索してカタカナの対象にマッチする（逆も同じ）", () => {
    expect(matchesQuery("ウマカレー", "うまかれー")).toBe(true);
    expect(matchesQuery("うまかれー", "ウマカレー")).toBe(true);
  });

  it("全角↔半角、大文字↔小文字、半角カナを区別しない", () => {
    expect(matchesQuery("ABC-123", "ａｂｃ")).toBe(true);
    expect(matchesQuery("ａｂｃ", "ABC")).toBe(true);
    expect(matchesQuery("トクネ", "ﾄｸﾈ")).toBe(true);
    expect(matchesQuery("ﾄｸﾈ", "とくね")).toBe(true);
  });

  it("対象側の空白の有無を区別しない（「運 賃」「運賃」）", () => {
    expect(matchesQuery("運 賃", "運賃")).toBe(true);
    expect(matchesQuery("運　賃", "運賃")).toBe(true);
    expect(matchesQuery("運賃", "運 賃")).toBe(true);
  });

  it("スペース区切りはAND（半角・全角スペース、前後・連続の空白も可）", () => {
    expect(matchesQuery("ウマカレー 中辛 10個", "うま 中辛")).toBe(true);
    expect(matchesQuery("ウマカレー 中辛 10個", "うま　中辛")).toBe(true);
    expect(matchesQuery("ウマカレー 中辛 10個", "  うま   10  ")).toBe(true);
    expect(matchesQuery("ウマカレー 中辛 10個", "うま 甘口")).toBe(false);
  });

  it("空のクエリ・空白だけのクエリは常にtrue", () => {
    expect(matchesQuery("何か", "")).toBe(true);
    expect(matchesQuery("何か", "   ")).toBe(true);
    expect(matchesQuery("何か", "　")).toBe(true);
    expect(matchesQuery("", "")).toBe(true);
  });

  it("undefined・nullのクエリは空として扱いtrue、対象が空・undefined・nullなら語があるとfalse", () => {
    expect(matchesQuery("何か", undefined as unknown as string)).toBe(true);
    expect(matchesQuery("何か", null as unknown as string)).toBe(true);
    expect(matchesQuery("", "a")).toBe(false);
    expect(matchesQuery(undefined as unknown as string, "a")).toBe(false);
    expect(matchesQuery(null as unknown as string, "a")).toBe(false);
  });

  it("対象側の空白はすべて除去されるため、複数項目を空白でつなぐと項目の境界をまたいでマッチする", () => {
    expect(matchesQuery("ウマ カレー", "マカ")).toBe(true); // 境界をまたいだ偽陽性（現状の挙動）
  });

  it("項目を空白以外の制御文字（\\u0001）でつなげば、項目の境界をまたいでマッチしない", () => {
    const joined = ["ウマ", "カレー"].join("\u0001");
    expect(matchesQuery(joined, "マカ")).toBe(false);
    expect(matchesQuery(joined, "うま かれー")).toBe(true); // 項目ごとの語のANDは使える
    expect(matchesQuery(joined, "ウマカ")).toBe(false);
  });

  it("部分一致（前方一致ではない）", () => {
    expect(matchesQuery("特選ウマカレー", "カレー")).toBe(true);
    expect(matchesQuery("特選ウマカレー", "れーカ")).toBe(false);
  });

  it("「ヴ」と「ブ」・小書き文字・漢字とかなは同一視しない（現状の限界）", () => {
    expect(matchesQuery("ヴァイオリン", "ばいおりん")).toBe(false);
    expect(matchesQuery("ヴァイオリン", "ゔぁいおりん")).toBe(true);
    expect(matchesQuery("ッ", "つ")).toBe(false);
    expect(matchesQuery("運賃", "うんちん")).toBe(false);
  });
});
