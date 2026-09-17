"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * price-app/receipt-app双方のUI基本部品のうち、アクセントカラーに依存しない
 * （完全に同一の実装だった）部分。
 *
 * 重要: 各アプリの tailwind.config.js の `content` に、このパッケージのソースを
 * 含めること（例: "./node_modules/admin-portal-shared/src/**\/*.{ts,tsx}"）。
 * 含めないと、アプリ側のコードに同じクラス名が偶然残っていない限りTailwindが
 * これらのクラスを生成せず、見た目が崩れる（ビルドエラーにはならないため気づきにくい）。
 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SecondaryButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${
        props.className ?? ""
      }`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

type Accent = "indigo" | "emerald";

const ACCENT_CLASSES: Record<Accent, { button: string; buttonHover: string; focusBorder: string; focusRing: string }> = {
  indigo: {
    button: "bg-indigo-600",
    buttonHover: "hover:bg-indigo-700",
    focusBorder: "focus:border-indigo-400",
    focusRing: "focus:ring-indigo-100",
  },
  emerald: {
    button: "bg-emerald-600",
    buttonHover: "hover:bg-emerald-700",
    focusBorder: "focus:border-emerald-400",
    focusRing: "focus:ring-emerald-100",
  },
};

/**
 * アクセントカラー依存のUI部品（`PrimaryButton`・`inputClass`・`selectClass`）をまとめて
 * 生成する。price-app(indigo)/receipt-app(emerald)で構造は完全に同一で、Tailwindの
 * クラス名に直書きされたアクセントカラーだけが違ったため、ファクトリ関数として共通化した。
 * 新しいアクセントカラーが必要になったら ACCENT_CLASSES に追加すること
 * （動的な `bg-${accent}-600` のようなクラス名生成はTailwindの静的解析に認識されず
 * クラスが生成されないため使えない）。
 */
export function createUiKit(accent: Accent) {
  const c = ACCENT_CLASSES[accent];

  function PrimaryButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
      <button
        {...props}
        className={`inline-flex items-center gap-1.5 rounded-lg ${c.button} px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors ${c.buttonHover} disabled:cursor-not-allowed disabled:opacity-50 ${
          props.className ?? ""
        }`}
      >
        {children}
      </button>
    );
  }

  const inputClass = `w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors placeholder:text-slate-400 ${c.focusBorder} focus:outline-none focus:ring-2 ${c.focusRing}`;
  const selectClass = inputClass;

  return { PrimaryButton, inputClass, selectClass };
}
