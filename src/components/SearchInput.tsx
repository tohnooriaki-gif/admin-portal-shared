"use client";

import { Search, X } from "lucide-react";
import { createUiKit } from "./ui";

/**
 * 一覧の検索欄。左に虫眼鏡、入力があるときだけ右端の内側に「×」（検索語を消す）を出す。
 * payment-app（請求一覧・操作履歴）の実装を見本に、price-app・receipt-appの検索欄（「×」が
 * 無かった）も同じ見た目・操作にそろえるため共通化した（2026-10-08）。
 *
 * 検索の中身（絞り込みの仕方・ページのリセットなど）は共通化しない。呼び出し側が`onChange`
 * （と、「×」で別の処理も要るなら`onClear`）で行う。
 *
 * **`accent`**: フォーカス時の枠・リングの色。`createUiKit`の`inputClass`と同じクラスを使うので、
 * 同じ画面の他の入力欄と見た目がそろう（`createUiKit("amber")`のアプリなら`accent="amber"`）。
 * 既定`"neutral"`はアプリのアクセントに依存しない中立色。
 *
 * **`className`は外側の`<div>`への追加分だけ**: 既定は`relative`のみで、幅などレイアウトは
 * 呼び出し側が足す（例: `className="min-w-[14rem] flex-1"`。横並びの行で幅を確保するときは
 * `flex-1`と`min-w-*`を忘れずに。付けないと入力欄が内容幅まで縮む）。`relative`は常に効き、
 * 置き換わらない（虫眼鏡・「×」の位置の基準のため）。
 *
 * 入力欄は`type="text"`のまま（`type="search"`にするとブラウザが独自の「×」を足し、二重になる）。
 *
 * `lucide-react`（`Search`・`X`）に依存する。`UserMenu`と同じくpeerDependency。
 * 各アプリの`tailwind.config.js`の`content`にこのパッケージのソースを含めること。
 */

export type SearchInputAccent = "neutral" | "indigo" | "emerald" | "amber";

interface SearchInputProps {
  value: string;
  /** 入力された文字列を直接渡す（イベントではない） */
  onChange: (value: string) => void;
  placeholder?: string;
  /** スクリーンリーダー向けのラベル（例: 「請求を検索」）。必須 */
  ariaLabel: string;
  /** フォーカス時の枠・リングの色。既定`"neutral"` */
  accent?: SearchInputAccent;
  /** 「×」を押したときの処理。既定は`onChange("")`。ページのリセット等も要るときに指定する */
  onClear?: () => void;
  /** 外側の`<div>`への追加のclassName（幅など）。`relative`は置き換わらない */
  className?: string;
}

// `pl-9 pr-9`は`inputClassBase`の`px-3`と同じプロパティ（padding）を上書きする。Tailwindは
// px → pr/pl の順でCSSを出すため、後ろの`pl-9 pr-9`が必ず勝つ（payment-appの既存実装と同じ指定）
const INPUT_CLASSES: Record<SearchInputAccent, string> = {
  neutral: `${createUiKit("neutral").inputClass} pl-9 pr-9`,
  indigo: `${createUiKit("indigo").inputClass} pl-9 pr-9`,
  emerald: `${createUiKit("emerald").inputClass} pl-9 pr-9`,
  amber: `${createUiKit("amber").inputClass} pl-9 pr-9`,
};

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  accent = "neutral",
  onClear,
  className = "",
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`.trim()}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        className={INPUT_CLASSES[accent]}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      />
      {value !== "" && (
        <button
          type="button"
          onClick={() => (onClear ? onClear() : onChange(""))}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="検索語を消す"
          title="検索語を消す"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
