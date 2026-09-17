/**
 * Supabaseのレスポンス({ data, error })からdataを取り出し、errorがあれば例外にする。
 * price-app/receipt-app双方で完全に同一の実装だったため共通化。
 */
export function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}
