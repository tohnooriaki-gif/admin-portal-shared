"use client";

import { useState } from "react";
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
 */
export function UserMenu({ portalUrl, userName }: { portalUrl?: string; userName?: string }) {
  const [open, setOpen] = useState(false);
  if (!portalUrl) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 hover:bg-slate-50"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-500">
          <User size={13} />
        </span>
        <span className="text-xs font-medium text-slate-700">{userName || "ユーザー"}</span>
      </button>
      {open && (
        <>
          {/* メニュー外クリックで閉じる */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <a
              href={portalUrl}
              className="flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
            >
              <LayoutGrid size={14} />
              アプリ一覧へ戻る
            </a>
            <a
              href={buildLogoutUrl(portalUrl)}
              className="flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
            >
              <LogOut size={14} />
              ログアウト
            </a>
          </div>
        </>
      )}
    </div>
  );
}
