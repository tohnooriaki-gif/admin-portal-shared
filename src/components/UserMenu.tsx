"use client";

import { useEffect, useRef, useState } from "react";
import { LayoutGrid, LogOut, User } from "lucide-react";
import { buildLogoutUrl } from "../loginRedirect";

/**
 * ヘッダー右上のユーザーメニュー。名前クリックで「アプリ一覧へ戻る」「ログアウト」を表示する
 * （admin-portal 統合。price-app / receipt-app 双方で同一実装だったため共通化）。
 * portal_session は shell が発行・管理する HttpOnly Cookie のためこのアプリのJSからは削除できない。
 * ログアウトは shell の /logout に遷移し、そこでCookie削除とログイン画面への遷移を行う。
 *
 * Tailwind CSS のクラス名（slate系のカラーパレット等）をそのまま使っているため、
 * 導入するアプリのTailwind設定がこの配色を解決できることが前提。
 *
 * 狭い画面（320px級）でヘッダーからはみ出さないようにするには、呼び出し側でこのコンポーネントを
 * 包む要素（例: `<div className="ml-auto">`）に `min-w-0` を付けること。flex項目は既定で
 * 内容の最小幅より縮まないため、包む要素が縮められないと、こちらが縮められる作りでも
 * ボタンは内容幅（約162px）のままはみ出す。`min-w-0` があれば、ボタンが縮んで名前が省略表示される。
 */
export function UserMenu({ portalUrl, userName }: { portalUrl?: string; userName?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // メニュー外のクリック/タップ・Escapeで閉じる。以前は `fixed inset-0` の透明オーバーレイで
  // 実現していたが、ヘッダーが `backdrop-blur` を持つとfixedの基準がヘッダーになり、
  // オーバーレイがヘッダー領域しか覆わず、本文側のクリックでは閉じなかった。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!portalUrl) return null;
  const displayName = userName || "ユーザー";
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={displayName}
        className="flex max-w-full min-w-0 items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 hover:bg-slate-50"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
          <User size={13} />
        </span>
        {/* 長い名前・メールアドレス等でpillが縦長になる／ヘッダーからはみ出すのを防ぐ */}
        <span className="min-w-0 max-w-[7rem] truncate text-xs font-medium text-slate-700 sm:max-w-[10rem]">
          {displayName}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <a
            href={portalUrl}
            className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
          >
            <LayoutGrid size={14} className="shrink-0" />
            アプリ一覧へ戻る
          </a>
          <a
            href={buildLogoutUrl(portalUrl)}
            className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
          >
            <LogOut size={14} className="shrink-0" />
            ログアウト
          </a>
        </div>
      )}
    </div>
  );
}
