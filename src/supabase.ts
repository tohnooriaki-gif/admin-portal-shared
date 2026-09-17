import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

/**
 * サーバー専用クライアント（service_role key。RLSをバイパスするので絶対にブラウザへ渡さないこと）。
 * realtime機能は使わないが、supabase-jsはクライアント生成時に無条件でRealtimeClientを初期化し、
 * Node18未満ではグローバルWebSocketが無く例外になるため、`ws`パッケージをtransportとして明示的に渡す。
 */
export function createServiceClient(
  url: string | undefined,
  serviceRoleKey: string | undefined
): SupabaseClient {
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が.env.localに設定されていません");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}
