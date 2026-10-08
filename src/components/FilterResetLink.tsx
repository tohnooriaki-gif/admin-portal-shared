"use client";

/**
 * 一覧の絞り込み（検索語・ステータス・期間など）を最初の状態に戻す、小さな下線つきのテキスト
 * リンク。payment-app（請求一覧の「最初の絞り込みに戻す」）の見た目を見本に、price-app
 * （「検索条件クリア」「条件クリア」）・receipt-app（「クリア」「検索条件クリア」）の
 * リセットリンクもそろえるため共通化した（2026-10-08）。
 *
 * **表示するか（既定の絞り込み状態でないときだけ出す、など）は呼び出し側が決める**。何を
 * リセットするか（検索語・各フィルター・ページ）も`onClick`で呼び出し側が行う。
 * 見た目は文字だけ（アイコンなし）。フィルター行の中に置くか、行の下に`<div>`で包んで独立した
 * 行にするかも呼び出し側が決める。
 *
 * **`className`は追加分だけ**: 既定のクラスは常に効き、置き換わらない（`ml-auto`等の追加用）。
 *
 * 各アプリの`tailwind.config.js`の`content`にこのパッケージのソースを含めること。
 */

interface FilterResetLinkProps {
  onClick: () => void;
  /** 表示する文言。既定は「最初の絞り込みに戻す」 */
  label?: string;
  /** 追加のclassName。既定のクラスは置き換わらない */
  className?: string;
}

const BASE_CLASSNAME = "text-xs text-slate-500 underline hover:text-slate-700";

export function FilterResetLink({ onClick, label = "最初の絞り込みに戻す", className = "" }: FilterResetLinkProps) {
  return (
    <button type="button" onClick={onClick} className={`${BASE_CLASSNAME} ${className}`.trim()}>
      {label}
    </button>
  );
}
