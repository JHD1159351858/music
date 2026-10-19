// 后端专用 Supabase 客户端（Node.js API Route 内使用）
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createLocalDatabaseClient } from './local-database'
import { useLocalData as localDataEnabled } from './storage-mode'

type ServerDatabaseClient = Pick<SupabaseClient, 'from'>

export function createSupabaseServer(): ServerDatabaseClient {
  // Both backends implement the query surface used by the existing API routes.
  if (localDataEnabled()) return createLocalDatabaseClient() as unknown as ServerDatabaseClient
  const url = process.env.CODER_SUPABASE_URL?.trim()
  const serviceKey = process.env.CODER_SUPABASE_SERVICE_ROLE_KEY?.trim()
  const tenantId = process.env.CODER_SUPABASE_TENANT_ID?.trim()
  if (!url || !serviceKey || !tenantId) {
    throw new Error('Supabase server environment is incomplete')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        'X-Instance-ID': tenantId,
      },
    },
  })
}
