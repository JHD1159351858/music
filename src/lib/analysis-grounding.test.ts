import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { POST } from '../app/api/analysis/route'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createLocalDatabaseClient } from './local-database'

test('analysis never attributes another work background to a work by the same composer', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-analysis-grounding-'))
  const before = process.env.ZHIYIN_DATA_DIR
  const mode = process.env.ZHIYIN_STORAGE_MODE
  process.env.ZHIYIN_DATA_DIR = directory; process.env.ZHIYIN_STORAGE_MODE = 'local'
  try {
    const teacher = 't0000000-0000-0000-0000-000000000001'
    await createLocalDatabaseClient().from('course_knowledge').insert({ title: '作品甲', content: '创作年代：1900年\n所属时期：作品甲时期\n曲调特点：作品甲曲调', keywords: ['同一作者', '作品甲'], teacher_id: teacher })
    const cookie = await signAuthToken({ kind: 'session', userId: teacher, role: 'teacher', expiresAt: Date.now() + 60000 })
    const response = await POST(new Request('http://localhost/api/analysis', { method: 'POST', headers: { cookie: `${AUTH_SESSION_COOKIE}=${cookie}`, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'text', notation: 'X:1\nT:作品乙\nC:同一作者\nK:C\nC D E' }) }))
    assert.equal(response.status, 200)
    const result = await response.json() as { creationYear: string | null; period: string | null; melody: string | null }
    assert.equal(result.creationYear, null)
    assert.equal(result.period, null)
    assert.equal(result.melody, null)
  } finally {
    if (before === undefined) delete process.env.ZHIYIN_DATA_DIR; else process.env.ZHIYIN_DATA_DIR = before
    if (mode === undefined) delete process.env.ZHIYIN_STORAGE_MODE; else process.env.ZHIYIN_STORAGE_MODE = mode
    rmSync(directory, { recursive: true, force: true })
  }
})
