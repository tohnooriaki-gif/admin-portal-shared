"use client";

/**
 * 行クリックで詳細へ遷移する一覧テーブルの、チェックボックス列。
 * price-app（商品一覧）・payment-app（請求一覧）で個別に直した「チェックボックスが小さく、
 * 少しずれると行の詳細遷移が発火してしまう」問題（2026-10-02）を統一した実装。
 *
 * `<label>`でセル全体をチェックボックスのクリック領域にする（ブラウザ標準のlabel→input委譲を
 * 使うため、クリック位置の判定を自前で書く必要がない）。セルの`onClick`で`stopPropagation`する
 * ことで、行側のクリックハンドラの実装方法（`closest()`で除外する方式・素の`onClick`のみの方式、
 * どちらでも）に関わらずセル内のクリックが行の遷移を発火させない。
 *
 * 行の`<tr>`自体の実装（クリックで遷移する仕組みそのもの）は含まない。各アプリ側の既存の行
 * コンポーネント（price-appの`ClickableRow`等）と組み合わせて使うこと。
 *
 * **注意（v3.9〜）**: `className`で幅を上書きする場合は`min-w`も併記すること。table auto
 * layoutでは`w-*`だけだと「希望幅」に過ぎず、他の列が広いテーブルではこの列がチェックボックス
 * 本体の幅（16px）まで縮み、クリック領域も狭くなる（price-appで実際に踏んだ不具合）。
 */

interface SelectCellProps {
  /** チェック状態 */
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  /**
   * false: チェックボックス自体は出さないが、セルを押したときの行遷移だけは止める
   * （「選べない行」でも誤って詳細へ飛ばないようにするため）
   */
  selectable?: boolean;
  /**
   * `<td>`に渡すclassName（既定: 幅12・パディング無し。幅はテーブルに応じて上書き可）。
   * `min-w`も併記すること（table auto layoutでは`w-12`だけだと希望幅に過ぎず、他の列が
   * 広いテーブルではこの列が16px＝チェックボックス幅まで縮み、クリック領域も狭くなる。
   * price-appで実際に踏んだ不具合、v3.9で既定値に追加）。
   */
  className?: string;
  /** チェックボックス本体のclassName（既定の大きさ・枠線に追加。アクセントカラー等はここで指定） */
  inputClassName?: string;
}

const DEFAULT_CELL_CLASSNAME = "w-12 min-w-[3rem] p-0";
const DEFAULT_INPUT_CLASSNAME = "h-4 w-4 cursor-pointer rounded border-slate-300";

/** 一覧テーブルの本体行にある、個別選択用チェックボックスの`<td>`。 */
export function SelectCell({
  checked,
  onChange,
  ariaLabel,
  selectable = true,
  className = DEFAULT_CELL_CLASSNAME,
  inputClassName = DEFAULT_INPUT_CLASSNAME,
}: SelectCellProps) {
  return (
    <td className={className} onClick={(e) => e.stopPropagation()}>
      {selectable && (
        <label className="flex h-full min-h-[2.75rem] cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className={inputClassName}
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={ariaLabel}
          />
        </label>
      )}
    </td>
  );
}

interface SelectAllCellProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** `<th>`に渡すclassName。`SelectCell`の`className`と同じ理由で`min-w`も併記すること。 */
  className?: string;
  inputClassName?: string;
}

/** 一覧テーブルのヘッダーにある、「このページを全選択」チェックボックスの`<th>`。 */
export function SelectAllCell({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  className = DEFAULT_CELL_CLASSNAME,
  inputClassName = DEFAULT_INPUT_CLASSNAME,
}: SelectAllCellProps) {
  return (
    <th className={className} onClick={(e) => e.stopPropagation()}>
      <label className="flex cursor-pointer items-center justify-center py-3">
        <input
          type="checkbox"
          className={inputClassName}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={ariaLabel}
        />
      </label>
    </th>
  );
}
