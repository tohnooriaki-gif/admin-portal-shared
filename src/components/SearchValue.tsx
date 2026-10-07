"use client";

/**
 * 一覧の値（顧客名・コード・担当者・品名など）を押すと、その値で検索するための小さなボタン。
 * payment-app（請求一覧・操作履歴）と receipt-app（品目一覧の品名）で個別に作っていたものを
 * 共通化した（2026-10-07）。
 *
 * 行クリックで詳細へ移動する（または行が開く）表の中で使うため、既定ではクリックを行へ伝えない
 * （`stopPropagation`）。押せるのは文字の上だけで、セルの余白は今までどおり行のクリックになる。
 * `value`が空なら何も描画しない（`null`）。空のときに「-」などを出したい場合は呼び出し側で出す。
 * 検索の中身（検索欄へ入れる・ほかの絞り込みを外す・完全一致など）は共通化しない。呼び出し側が
 * `onSearch`で決める。
 *
 * **ホバーの手がかり**: 色の変化（`accent`）と**点線**の下線。詳細へ移動するリンクの
 * `hover:underline`（実線）と見分けがつくようにするため。普段は装飾なしで、一覧の見た目を
 * 変えない。キーボードのフォーカス（`focus-visible`）でも同じ手がかりが出る。
 *
 * **`className`は追加分だけ**（SelectCellのmin-wの教訓）: 既定のクラスは常に効き、`className`は
 * 後ろに足されるだけで置き換えない。receipt-appのように`truncate`・`flex-1`・`min-w-0`・
 * `font-medium`を足す用途を想定している。Tailwindは同じプロパティのクラスを2つ書いても後勝ちに
 * ならない（CSSの生成順で決まる）ため、ホバー色などの上書きはできない。色は`accent`で選ぶ。
 *
 * `accent`は`createUiKit`・`StickyActionBar`と同じ名前（新しいアクセントは`createUiKit`の
 * `ACCENT_CLASSES`・`StickyActionBar`の`COLOR_CLASSES`・このファイルの`HOVER_CLASSES`に追加する）。
 *
 * 各アプリの`tailwind.config.js`の`content`にこのパッケージのソースを含めること。
 */

export type SearchValueAccent = "neutral" | "indigo" | "emerald" | "amber";

interface SearchValueProps {
  /** 表示する値。押すとこの値で`onSearch`が呼ばれる。空なら何も描画しない */
  value: string;
  onSearch: (value: string) => void;
  /** ホバー・フォーカス時の文字色。既定`"neutral"`（濃いグレー） */
  accent?: SearchValueAccent;
  /** ボタンの`title`。既定は「『値』で検索」（例: 「『値』で再検索」にしたいときに上書き） */
  title?: string;
  /** クリックを行（親要素）へ伝えない。既定`true` */
  stopPropagation?: boolean;
  /** 追加のclassName（`truncate`・`flex-1`・`min-w-0`等）。既定のクラスは置き換わらない */
  className?: string;
}

const BASE_CLASSNAME =
  "cursor-pointer rounded text-left underline-offset-2 hover:underline hover:decoration-dotted focus-visible:underline focus-visible:decoration-dotted";

const HOVER_CLASSES: Record<SearchValueAccent, string> = {
  neutral: "hover:text-slate-900 focus-visible:text-slate-900",
  indigo: "hover:text-indigo-700 focus-visible:text-indigo-700",
  emerald: "hover:text-emerald-700 focus-visible:text-emerald-700",
  amber: "hover:text-amber-700 focus-visible:text-amber-700",
};

export function SearchValue({
  value,
  onSearch,
  accent = "neutral",
  title,
  stopPropagation = true,
  className = "",
}: SearchValueProps) {
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        onSearch(value);
      }}
      title={title ?? `「${value}」で検索`}
      className={`${BASE_CLASSNAME} ${HOVER_CLASSES[accent]} ${className}`.trim()}
    >
      {value}
    </button>
  );
}
