import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

export interface CreateServiceClientOptions {
  /**
   * 対象のPostgresスキーマ（未指定ならSupabaseのデフォルトである`public`）。
   * 非publicスキーマをSupabase Data API経由で使うには、Supabase側の管理画面
   * （Project Settings > API > Exposed schemas）に対象スキーマを追加する必要がある
   * （このパッケージからは設定できない。統合先プロジェクトで別途対応）。
   */
  schema?: string;
}

/**
 * サーバー専用クライアント（service_role key。RLSをバイパスするので絶対にブラウザへ渡さないこと）。
 * realtime機能は使わないが、supabase-jsはクライアント生成時に無条件でRealtimeClientを初期化し、
 * Node18未満ではグローバルWebSocketが無く例外になるため、`ws`パッケージをtransportとして明示的に渡す。
 */
export function createServiceClient(
  url: string | undefined,
  serviceRoleKey: string | undefined,
  options?: CreateServiceClientOptions
): SupabaseClient {
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が.env.localに設定されていません");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    ...(options?.schema ? { db: { schema: options.schema } } : {}),
  }) as SupabaseClient;
}
