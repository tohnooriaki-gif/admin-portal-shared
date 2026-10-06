import type { ReactNode } from "react";

/**
 * 長い画面（表・長いフォーム）で、保存・確定などのボタンを画面下端に固定して常に見えるようにする
 * 帯。receipt-app（取引先マスタ・PDF取込の確認画面）で直した方式（`sticky bottom-0`）と、
 * payment-app（請求一覧の「まとめて入金」の帯）の浮かぶ帯を、price-app・payment-appでも使えるよう
 * 共通化した（2026-10-06）。
 *
 * 左に`status`（「未保存の変更があります」・入金の合計・エラー表示など、画面ごとに中身が違うもの）、
 * 右に`children`（保存・キャンセル等のボタン）。狭い幅では折り返し、ボタンは右寄せのまま下の段に並ぶ。
 *
 * **`variant`（見せ方）**: `"bar"`（既定）は画面下端に密着する帯（上線のみ）。`"floating"`は下端から
 * 16px浮いた角丸のカード（枠線・影付き。行を選ぶと出る「まとめて操作」の帯向け）。
 *
 * **`accent`（色）**: 既定`"neutral"`は白背景＋グレーの線（アプリのアクセントに依存しない）。
 * `createUiKit()`と同じ名前（`"indigo"`/`"emerald"`/`"amber"`）を指定すると、線と背景がその色の
 * 薄い色になる。新しいアクセントは`createUiKit`の`ACCENT_CLASSES`と、このファイルの`COLOR_CLASSES`の
 * 両方に追加すること（Tailwindは完全なクラス名の文字列しか拾えないため、動的生成はできない）。
 *
 * **`className`は追加分だけ**: 固定表示に必要な指定（sticky・bottom・z-index・背景・線）は常に効く。
 * `className`は後ろに足されるだけで既定値を置き換えない（`mt-4`などの余白の追加用）。Tailwindは
 * 同じプロパティのクラスを2つ書いても後勝ちにならない（CSSの生成順で決まる）ため、背景色や線の
 * 色を`className`で上書きすることはできない。色は`accent`、形は`variant`で選ぶ。
 *
 * 使うときの注意:
 * - `sticky`は祖先に`overflow-hidden`/`overflow-auto`等（`overflow-x-auto`の表ラッパーなど）が
 *   あると効かない。帯はそれらの**外側**（表ラッパーの兄弟）に置くこと
 * - 帯は、固定したい対象（フォーム・表）と同じ親要素の中、その**後ろ**に置く。親の終わりに来ると
 *   通常の位置に戻る（親からはみ出して張り付き続けることはない）
 * - `<form>`の中に置ける（中の`type="submit"`ボタンはそのままフォームを送信する）。フォームの外に
 *   置く場合は、ボタンに`form="フォームのid"`を付ければ送信できる
 * - カード（`Card`等）の中に置くと、帯の幅はカードの内側の幅になる（画面幅いっぱいにはならない）。
 *   画面幅いっぱいにしたいときはカードの外に置く
 * - iPhone等のセーフエリア（ホームインジケータ）の余白は`env(safe-area-inset-bottom)`で確保しているが、
 *   アプリ側が`viewport-fit=cover`（Next.jsなら`viewport`の`viewportFit: "cover"`）を指定していない
 *   と常に0扱いになり、既定の余白だけになる（害は無い）
 * - 各アプリの`tailwind.config.js`の`content`にこのパッケージのソースを含めること
 *
 * `"use client"`は付けていない（状態・イベントを持たないため、Server Componentからも使える。
 * `children`にクライアントコンポーネントのボタンを渡すのは問題ない）。
 */

export type StickyActionBarVariant = "bar" | "floating";
export type StickyActionBarAccent = "neutral" | "indigo" | "emerald" | "amber";

interface StickyActionBarProps {
  /** ボタン類（保存・キャンセル等）。右側に並ぶ */
  children: ReactNode;
  /** 左側の状態表示（未保存の表示・合計・エラー等）。無ければボタンだけが右寄せで並ぶ */
  status?: ReactNode;
  /** `"bar"`: 画面下端に密着する帯（既定）／`"floating"`: 下端から浮いた角丸のカード */
  variant?: StickyActionBarVariant;
  /** `"neutral"`（既定）: 白背景＋グレーの線／アクセント名: その色の薄い背景と線 */
  accent?: StickyActionBarAccent;
  /** 追加のclassName（余白など）。既定の固定表示用のクラスは置き換わらない */
  className?: string;
}

const LAYOUT_CLASSES: Record<StickyActionBarVariant, string> = {
  bar: "sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur",
  floating:
    "sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur",
};

const COLOR_CLASSES: Record<StickyActionBarAccent, Record<StickyActionBarVariant, string>> = {
  neutral: { bar: "border-slate-200 bg-white/95", floating: "border-slate-200 bg-white/95" },
  indigo: { bar: "border-indigo-200 bg-indigo-50/95", floating: "border-indigo-300 bg-indigo-50/95" },
  emerald: { bar: "border-emerald-200 bg-emerald-50/95", floating: "border-emerald-300 bg-emerald-50/95" },
  amber: { bar: "border-amber-200 bg-amber-50/95", floating: "border-amber-300 bg-amber-50/95" },
};

export function StickyActionBar({
  children,
  status,
  variant = "bar",
  accent = "neutral",
  className = "",
}: StickyActionBarProps) {
  return (
    <div className={`${LAYOUT_CLASSES[variant]} ${COLOR_CLASSES[accent][variant]} ${className}`.trim()}>
      {status != null && status !== false && <div className="min-w-0 text-sm">{status}</div>}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}
