import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { POST } from '../app/api/analysis/route'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { verifyScoreAnalysisReceipt } from './score-analysis-receipt'
import { createLocalDatabaseClient } from './local-database'

test('analysis authenticates file uploads, runs music21 and signs only actual complete results', async () => {
  const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE'] as const
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-music21-api-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'music21-api-isolated-test-key-at-least-32-characters'
  process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
  const owner = 's0000000-0000-0000-0000-000000000001'
  const cookie = `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId: owner, role: 'student', expiresAt: Date.now() + 60000 })}`
  try {
    const xml = '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>'
    const request = (name: string, content: string, authenticated = true) => {
      const body = new FormData()
      body.append('file', new File([content], name))
      return new Request('http://localhost/api/analysis', { method: 'POST', headers: authenticated ? { cookie } : {}, body })
    }
    assert.equal((await POST(request('piano.xml', xml, false))).status, 401)
    const response = await POST(request('piano.musicxml', xml))
    assert.equal(response.status, 200, await response.clone().text())
    const result = await response.json() as Record<string, unknown>
    assert.equal(result.noteCount, 1)
    assert.equal(result.fileName, 'piano.musicxml')
    assert.equal(typeof result.historyId, 'string')
    const saved = await createLocalDatabaseClient().from('score_analyses').select('id').eq('user_id', owner)
    assert.equal(saved.error, null)
    assert.equal(Array.isArray(saved.data) ? saved.data.length : 0, 1)
    assert.equal(verifyScoreAnalysisReceipt(result, owner)?.noteCount, 1)
    assert.equal(verifyScoreAnalysisReceipt(result, 'another-student'), null)
    assert.equal((await POST(request('fake.xml', '<not-a-score/>'))).status, 422)
    assert.equal((await POST(request('score.pdf', '%PDF-1.4'))).status, 415)
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
    rmSync(directory, { recursive: true, force: true })
  }
})
