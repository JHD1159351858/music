import assert from 'node:assert/strict'
import test from 'node:test'
import { useLocalData } from './storage-mode'

test('local persistence is default and explicitly selected local mode overrides cloud settings', () => {
  const keys = ['ZHIYIN_STORAGE_MODE', 'CODER_SUPABASE_URL', 'CODER_SUPABASE_ANON_KEY', 'CODER_SUPABASE_SERVICE_ROLE_KEY', 'CODER_SUPABASE_TENANT_ID'] as const
  const previous = keys.map(key => process.env[key])
  try {
    keys.forEach(key => { delete process.env[key] })
    assert.equal(useLocalData(), true)
    process.env.CODER_SUPABASE_URL = 'https://example.test'
    process.env.CODER_SUPABASE_ANON_KEY = 'test-only'
    process.env.CODER_SUPABASE_TENANT_ID = 'test-only'
    assert.equal(useLocalData(), false)
    delete process.env.CODER_SUPABASE_ANON_KEY
    process.env.CODER_SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key'
    assert.equal(useLocalData(), false)
    process.env.ZHIYIN_STORAGE_MODE = 'local'
    assert.equal(useLocalData(), true)
    process.env.ZHIYIN_STORAGE_MODE = 'supabase'
    delete process.env.CODER_SUPABASE_URL
    assert.equal(useLocalData(), false)
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index] })
  }
})
