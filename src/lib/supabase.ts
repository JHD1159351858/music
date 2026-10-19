// 前端 Supabase 客户端（懒初始化，仅用于白名单场景）
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_CODER_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_CODER_SUPABASE_ANON_KEY
  const tenantId = process.env.NEXT_PUBLIC_CODER_SUPABASE_TENANT_ID
  if (!url || !anonKey || !tenantId) {
    throw new Error('Supabase client environment is incomplete')
  }
  client = createClient(url, anonKey, {
    global: { headers: { 'X-Instance-ID': tenantId } },
  })
  return client
}
