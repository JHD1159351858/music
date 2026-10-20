import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { createSupabaseServer } from './supabase-server'
import { apiRoute } from './teaching-server'

const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'CODER_SUPABASE_URL', 'CODER_SUPABASE_ANON_KEY', 'CODER_SUPABASE_SERVICE_ROLE_KEY', 'CODER_SUPABASE_TENANT_ID'] as const
let before: Record<string, string | undefined>
let directory: string
beforeEach(() => {
  before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-supabase-config-'))
  process.env.ZHIYIN_DATA_DIR = directory
})
afterEach(() => {
  for (const key of keys) {
    if (before[key] === undefined) delete process.env[key]
    else process.env[key] = before[key]
  }
  rmSync(directory, { recursive: true, force: true })
})

function remoteSettings() {
  process.env.CODER_SUPABASE_URL = 'https://offline.invalid'
  process.env.CODER_SUPABASE_TENANT_ID = 'offline-test'
}

test('a legacy anon-only remote configuration fails closed with HTTP 503', async () => {
  remoteSettings()
  process.env.CODER_SUPABASE_ANON_KEY = 'test-only-legacy-anon'
  assert.throws(() => createSupabaseServer(), /Supabase server environment is incomplete/)
  const response = await apiRoute(async () => { createSupabaseServer(); return new Response() })
  assert.equal(response.status, 503)
})

test('explicit remote mode requires a server service key even when an anon key exists', () => {
  remoteSettings()
  process.env.ZHIYIN_STORAGE_MODE = 'supabase'
  process.env.CODER_SUPABASE_ANON_KEY = 'test-only-legacy-anon'
  assert.throws(() => createSupabaseServer(), /Supabase server environment is incomplete/)
})

test('local default and explicit local mode keep working without any cloud service key', async () => {
  const local = await createSupabaseServer().from('profiles').select('id').limit(1)
  assert.equal(local.error, null)
  assert.equal(local.data?.length, 1)
  remoteSettings()
  process.env.CODER_SUPABASE_ANON_KEY = 'test-only-legacy-anon'
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  const overridden = await createSupabaseServer().from('profiles').select('id').limit(1)
  assert.equal(overridden.error, null)
  assert.equal(overridden.data?.length, 1)
})

test('remote requests use only the server service key and preserve the tenant header', async (context) => {
  remoteSettings()
  process.env.CODER_SUPABASE_SERVICE_ROLE_KEY = 'test-only-backend-service-key'
  process.env.CODER_SUPABASE_ANON_KEY = 'test-only-legacy-anon'
  let receivedHeaders: Headers | undefined
  context.mock.method(globalThis, 'fetch', async (_input: string | URL | Request, init?: RequestInit) => {
    receivedHeaders = new Headers(init?.headers)
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const result = await createSupabaseServer().from('profiles').select('id').limit(1)
  assert.equal(result.error, null)
  assert.equal(receivedHeaders?.get('authorization'), 'Bearer test-only-backend-service-key')
  assert.equal(receivedHeaders?.get('apikey'), 'test-only-backend-service-key')
  assert.equal(receivedHeaders?.get('x-instance-id'), 'offline-test')
})
