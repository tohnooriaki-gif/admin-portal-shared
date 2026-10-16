/**
 * 検索語・検索対象の正規化と、スペース区切りAND検索のマッチング（半角/全角・大文字/小文字・
 * ひらがな/カタカナ・空白の違いを吸収する）。DOM・Next.jsに依存しない純粋関数で、サーバー側
 * （API Route・Server Component）でもクライアント側でも使える。
 *
 * receipt-appの`lib/search.ts`を、挙動を変えずにそのまま移したもの（2026-10-16、全アプリの検索の
 * ひらがな・カタカナ対応の共通化）。**挙動を変える修正は、receipt-appの置き換え後の動作も変わるので
 * 慎重に行うこと**（`tests/search.test.ts`が現在の挙動を固定している）。
 *
 * 吸収しないもの（既知の限界。現状の挙動）: 「ヴ」と「ブ」・小書き文字（「ッ」と「ツ」）・漢字と
 * かな・繰り返し記号（「ゝ」「ゞ」。ひらがな→カタカナ寄せの範囲外）。DB側の検索（ILIKE）は
 * ひらがな・カタカナを吸収できないため、DBに渡す検索語を表記違いに展開する処理は別途検討する。
 */

/** ひらがな（U+3041-3096）をカタカナへ寄せる（コードポイントを+0x60するだけ。範囲外はそのまま） */
function hiraganaToKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

/**
 * 検索用の正規化。半角/全角・大文字/小文字・ひらがな/カタカナの違いを吸収する。
 *  - NFKC で 全角英数「Ａ１」→「A1」、半角カナ「ﾄｸﾈ」→「トクネ」、全角スペース→半角 などに統一
 *  - toLowerCase で大文字小文字を無視
 *  - ひらがな→カタカナ寄せで「うまカレー」「ウマカレー」のような表記ゆれを無視
 *  - バックスラッシュ（U+005C）を「¥」（U+00A5）にそろえる（v3.19〜）。日本語キーボードの「¥」キーは
 *    多くの環境でバックスラッシュを入力するため。全角「￥」（U+FFE5）はNFKCで「¥」に、全角「＼」
 *    （U+FF3C）はNFKCでバックスラッシュになってから「¥」にそろうので、「¥」「￥」「\」「＼」はすべて同じになる
 * 例: 「Ａ」「A」「ａ」「a」はすべて同じ "a" に、「か」「カ」はすべて同じ "カ" になる
 */
export function normalizeForSearch(s: string): string {
  return hiraganaToKatakana((s ?? "").normalize("NFKC").toLowerCase()).replace(/\\/g, "¥");
}

/**
 * マッチング対象のテキスト（品名など）用に、正規化に加えて空白も除去する。
 * 大黒工業パーサーはトークンを空白でつないで品名を組み立てるため「運 賃」「運賃」のような
 * 表記ゆれが生まれる。これは同じ品名として検索・前回比の集計で同一視したい。
 * クエリ側の空白は「AND区切り」として使うので、こちらは適用しない（対象文字列側だけに使う）。
 */
export function stripForMatch(s: string): string {
  return normalizeForSearch(s).replace(/[\s　]+/g, "");
}

/**
 * スペース区切りのキーワードをAND条件として扱う検索マッチング。
 * 半角/全角・大文字/小文字・（対象テキスト側の）空白の有無は区別しない。
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = normalizeForSearch(query)
    .trim()
    .split(/[\s　]+/)
    .filter(Boolean);
  if (terms.length === 0) return true;
  const target = stripForMatch(haystack);
  return terms.every((t) => target.includes(t));
}

// ---- 複数項目を対象にする検索（v3.18〜） ----
// 上の3関数（v3.17、receipt-appから移したもの）は変えない。ここから下は共通化のための追加。

/** 項目の境界を表す区切り。空白ではない制御文字なので、`stripForMatch`の空白除去で消えず、クエリの語にも現れない */
const FIELD_SEPARATOR = "\u0001";

/** 検索対象の項目。`null`・`undefined`・空文字は飛ばし、数値は文字列にする（金額・残金の検索用） */
export type SearchField = string | number | null | undefined;

/**
 * 複数の項目から、検索対象のテキスト（正規化済み）を組み立てる。
 * 各項目に`stripForMatch`と同じ正規化（NFKC・小文字化・ひらがな→カタカナ・空白除去）をして、
 * 空白以外の区切りでつなぐ。`null`・`undefined`・空文字（正規化後に空になるもの）の項目は飛ばす。
 * 数値は文字列にする（有限でない数値（NaN・Infinity）は飛ばす）。
 *
 * 組み立てたテキストは、`matchesQuery(text, query)`にも渡せる（正規化は冪等で、区切りは
 * 空白除去で消えないため、境界をまたぐ偽の一致は起きない）。事前に組み立てておきたいときに使う。
 */
export function buildSearchText(fields: ReadonlyArray<SearchField>): string {
  const parts: string[] = [];
  for (const f of fields) {
    if (f === null || f === undefined) continue;
    if (typeof f === "number" && !Number.isFinite(f)) continue;
    const text = stripForMatch(String(f)).replace(/\u0001/g, "");
    if (text !== "") parts.push(text);
  }
  return parts.join(FIELD_SEPARATOR);
}

/**
 * 複数項目を対象にしたスペース区切りのAND検索。**複数項目を対象にするときは、この関数を使うこと
 * （文字列を自前で空白連結して`matchesQuery`に渡さない: 項目の境界をまたいで偽の一致が出る）**。
 *
 * - 語は、**1つの項目の中**で一致したときだけ一致とする（「ウマ」「カレー」の項目に「マカ」は不一致）
 * - 複数の語が**別々の項目**に一致するのはOK（ANDは項目をまたいで成り立つ）
 * - クエリの扱い（スペース区切り・半角全角・ひらがなカタカナ・大文字小文字）は`matchesQuery`と同じ。
 *   空・空白だけのクエリは常にtrue
 */
export function matchesFields(fields: ReadonlyArray<SearchField>, query: string): boolean {
  const terms = normalizeForSearch(query)
    .replace(/\u0001/g, "")
    .trim()
    .split(/[\s　]+/)
    .filter(Boolean);
  if (terms.length === 0) return true;
  const target = buildSearchText(fields);
  return terms.every((t) => target.includes(t));
}
