export function useLocalData(): boolean {
  if (process.env.ZHIYIN_STORAGE_MODE === 'local') return true
  if (process.env.ZHIYIN_STORAGE_MODE === 'supabase') return false
  // Legacy cloud configuration must fail closed instead of silently creating a local database.
  return !(process.env.CODER_SUPABASE_URL && (process.env.CODER_SUPABASE_SERVICE_ROLE_KEY || process.env.CODER_SUPABASE_ANON_KEY) && process.env.CODER_SUPABASE_TENANT_ID)
}
