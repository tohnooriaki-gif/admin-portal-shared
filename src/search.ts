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
 * 例: 「Ａ」「A」「ａ」「a」はすべて同じ "a" に、「か」「カ」はすべて同じ "カ" になる
 */
export function normalizeForSearch(s: string): string {
  return hiraganaToKatakana((s ?? "").normalize("NFKC").toLowerCase());
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
