import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバー専用の Supabase クライアント（記録の書き込みだけに使う）。
 * SUPABASE_SERVICE_ROLE_KEY はデータベースを自由に操作できる鍵なので、
 * NEXT_PUBLIC_ を付けず、API ルート以外から import しないこと。
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (typeof window !== "undefined") throw new Error("supabaseAdmin はサーバー専用です");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}
