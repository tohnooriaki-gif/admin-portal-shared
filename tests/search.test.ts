import { describe, it, expect } from "vitest";
import { buildSearchText, matchesFields, matchesQuery, normalizeForSearch, stripForMatch } from "../src/search";

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

describe("buildSearchText（v3.18）", () => {
  it("各項目をstripForMatchと同じ正規化にして、空白以外の区切りでつなぐ", () => {
    expect(buildSearchText(["ウマ カレー", "Ａ１"])).toBe("ウマカレーa1");
    expect(buildSearchText(["うまかれー"])).toBe(stripForMatch("うまかれー"));
  });

  it("null・undefined・空文字・空白だけの項目は飛ばす（区切りも残さない）", () => {
    expect(buildSearchText([null, undefined, "", "  　 ", "ウマ", null, "カレー"])).toBe("ウマカレー");
    expect(buildSearchText([])).toBe("");
    expect(buildSearchText([null, undefined, ""])).toBe("");
  });

  it("数値は文字列にする（0・負数・小数も）。NaN・Infinityは飛ばす", () => {
    expect(buildSearchText([1234567, 0, -100, 1.5])).toBe("12345670-1001.5");
    expect(buildSearchText([NaN, Infinity, -Infinity, 5])).toBe("5");
  });

  it("項目に区切りの制御文字が含まれていても、境界は増えない", () => {
    expect(buildSearchText(["ウマ", "カレー"])).toBe("ウマカレー");
  });

  it("組み立てたテキストはmatchesQueryにも渡せ、境界をまたいで一致しない", () => {
    const text = buildSearchText(["ウマ", "カレー", 1200]);
    expect(matchesQuery(text, "うまかれー")).toBe(false);
    expect(matchesQuery(text, "うま 1200")).toBe(true);
    expect(matchesQuery(text, "マカ")).toBe(false);
    expect(matchesQuery(text, "")).toBe(true);
  });
});

describe("matchesFields（v3.18）", () => {
  it("項目の境界をまたぐ偽の一致が出ない（「ウマ」「カレー」で「マカ」は不一致）", () => {
    expect(matchesFields(["ウマ", "カレー"], "マカ")).toBe(false);
    expect(matchesFields(["ウマ", "カレー"], "うまか")).toBe(false);
    expect(matchesFields(["ウマ", "カレー"], "レー")).toBe(true);
  });

  it("1つの項目の中での一致はOK（項目内の空白は無視）", () => {
    expect(matchesFields(["ウマ カレー", "中辛"], "マカ")).toBe(true);
    expect(matchesFields(["特選ウマカレー"], "カレー")).toBe(true);
  });

  it("別々の項目に語が分かれてもANDで一致する（半角・全角スペース区切り）", () => {
    expect(matchesFields(["ウマカレー", "山田商店", 1200], "カレー 山田")).toBe(true);
    expect(matchesFields(["ウマカレー", "山田商店", 1200], "カレー　1200")).toBe(true);
    expect(matchesFields(["ウマカレー", "山田商店", 1200], "カレー 鈴木")).toBe(false);
  });

  it("ひらがな↔カタカナ、全角↔半角、大文字↔小文字、半角カナを区別しない", () => {
    expect(matchesFields(["ウマカレー", "ABC"], "うまかれー")).toBe(true);
    expect(matchesFields(["うまかれー", "ａｂｃ"], "ウマカレー abc")).toBe(true);
    expect(matchesFields(["トクネ"], "ﾄｸﾈ")).toBe(true);
    expect(matchesFields(["ﾄｸﾈ"], "とくね")).toBe(true);
  });

  it("null・undefined・空文字の項目は飛ばし、数値は文字列として検索できる", () => {
    expect(matchesFields([null, undefined, "", "ウマ"], "ウマ")).toBe(true);
    expect(matchesFields([null, undefined, ""], "ウマ")).toBe(false);
    expect(matchesFields(["山田商店", 125000, 0], "125000")).toBe(true);
    expect(matchesFields(["山田商店", 125000, 0], "0")).toBe(true);
    expect(matchesFields([-3000], "-3000")).toBe(true);
    expect(matchesFields([NaN], "nan")).toBe(false);
  });

  it("空のクエリ・空白だけのクエリ・undefined/nullのクエリは常にtrue（項目が空でも）", () => {
    expect(matchesFields(["ウマ"], "")).toBe(true);
    expect(matchesFields(["ウマ"], "  　 ")).toBe(true);
    expect(matchesFields([], "")).toBe(true);
    expect(matchesFields([null], "")).toBe(true);
    expect(matchesFields(["ウマ"], undefined as unknown as string)).toBe(true);
    expect(matchesFields(["ウマ"], null as unknown as string)).toBe(true);
  });

  it("クエリに区切りの制御文字が混ざっても、境界をまたいで一致しない", () => {
    expect(matchesFields(["ウマ", "カレー"], "ウマカレー")).toBe(false);
    expect(matchesFields(["ウマ", "カレー"], "マカ")).toBe(false);
  });

  it("項目が1つだけなら、matchesQueryと同じ結果になる（クエリの扱いが食い違わない）", () => {
    const haystacks = ["ウマカレー 中辛 10個", "運 賃", "ＡＢＣ", "ﾄｸﾈ", "ヴァイオリン", ""];
    const queries = ["", " ", "うま 中辛", "うま　10", "運賃", "abc", "とくね", "ばいおりん", "ゔぁ", "zzz", "マカ"];
    for (const h of haystacks) {
      for (const q of queries) {
        expect(matchesFields([h], q), `${JSON.stringify(h)} / ${JSON.stringify(q)}`).toBe(matchesQuery(h, q));
      }
    }
  });
});
