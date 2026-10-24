import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test, type TestContext } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createLocalDatabaseClient, localDatabasePath } from './local-database'
import { createSupabaseServer } from './supabase-server'
import { createScoreAnalysisReceipt, verifyScoreAnalysisReceipt } from './score-analysis-receipt'
import type { AnalysisResult } from './score-analysis'
import type { AnalysisHistoryPage } from './analysis-history-types'

const owner = 's0000000-0000-0000-0000-000000000001'
const other = 's0000000-0000-0000-0000-000000000002'

function isolate(t: TestContext) {
  const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE'] as const
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-analysis-history-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-analysis-history-secret-at-least-32'
  t.after(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
    rmSync(directory, { recursive: true, force: true })
  })
  return createSupabaseServer()
}

function analysis(provenance: AnalysisResult['provenance'] = 'musicxml', withMusic21 = false): AnalysisResult {
  return {
    title: '练习曲', composer: '测试作曲者', key: 'C大调', range: 'C4 — C4（0半音）', noteCount: 1,
    chordColor: null, pitchHistogram: { C: 1 }, pitchSequence: [{ index: 1, midi: 60, note: 'C4' }],
    summary: '实际谱面数据', background: null, workBackground: null, composerBackground: null,
    creationYear: null, period: null, melody: null, provenance, warnings: [],
    sources: [{ title: '教师资料', url: null }],
    ...(withMusic21 ? { fileName: 'example.musicxml', music21: {
      version: '10.5.1', partCount: 1, measureCount: 1, restCount: 0, timeSignatures: ['4/4'], tempos: [96], declaredKeys: ['C大调'], estimatedKey: null,
      notes: [{ index: 1, midi: 60, note: 'C4', part: '钢琴', measure: 1, beat: 1, offset: 0, duration: 1, voice: null }], chords: [],
    } } : {}),
  }
}

async function loadHistory() {
  assert.ok(existsSync(path.join(process.cwd(), 'src/lib/analysis-history.ts')), 'analysis history persistence is not implemented')
  return import('./analysis-history')
}

async function request(url: string, userId = owner) {
  const token = await signAuthToken({ kind: 'session', userId, role: 'student', expiresAt: Date.now() + 60000 })
  return new Request(`http://localhost${url}`, { headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}` } })
}

test('history saves every analysis engine and persists snapshots through reopened clients and old databases', async t => {
  const { saveAnalysisHistory } = await loadHistory()
  const client = isolate(t)
  await client.from('profiles').select('id').eq('id', owner)
  const oldDatabase = new DatabaseSync(localDatabasePath())
  oldDatabase.exec('DROP TABLE IF EXISTS score_analyses')
  oldDatabase.close()
  const samples = [analysis('musicxml', true), analysis('musicxml'), analysis('abc'), analysis('image-model')]
  for (const sample of samples) {
    const signed = { ...sample, analysisReceipt: 'expired-old-receipt', historyId: 'old-id' }
    const id = await saveAnalysisHistory(client, owner, signed)
    assert.match(id, /^[0-9a-f-]{36}$/)
    const reopened = await createLocalDatabaseClient().from('score_analyses').select('*').eq('id', id).single()
    assert.equal(reopened.error, null)
    const row = reopened.data
    assert.ok(row && !Array.isArray(row))
    assert.deepEqual(row.result, sample)
    assert.equal(row.engine, sample.music21 ? 'music21' : sample.provenance === 'image-model' ? 'image-model' : 'basic')
    assert.equal(row.file_name, sample.fileName ?? null)
    assert.equal(row.user_id, owner)
    assert.equal(row.note_count, 1)
    assert.equal('analysisReceipt' in row.result, false)
    assert.equal('historyId' in row.result, false)
  }
  const profile = await client.from('profiles').select('nickname').eq('id', owner).single()
  assert.equal(profile.data?.nickname, '抚琴听雨')
})

test('history list pages are owner-scoped summaries with stable created_at/id ordering', async t => {
  const { saveAnalysisHistory } = await loadHistory()
  const client = isolate(t)
  const { GET } = await import('../app/api/analysis/history/route')
  const ids: string[] = []
  for (let index = 0; index < 23; index++) ids.push(await saveAnalysisHistory(client, owner, analysis('abc')))
  await saveAnalysisHistory(client, other, analysis('image-model'))
  const updated = await client.from('score_analyses').update({ created_at: '2026-10-25T00:00:00.000Z' }).eq('user_id', owner)
  assert.equal(updated.error, null)
  const firstResponse = await GET(await request('/api/analysis/history?page=1'))
  assert.equal(firstResponse.status, 200)
  assert.match(firstResponse.headers.get('cache-control') ?? '', /no-store/)
  const first = await firstResponse.json() as AnalysisHistoryPage
  assert.equal(first.page, 1)
  assert.equal(first.hasMore, true)
  assert.equal(first.items.length, 20)
  const ordered = ids.sort().reverse()
  assert.deepEqual(first.items.map(item => item.id), ordered.slice(0, 20))
  for (const item of first.items) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'title', 'composer', 'fileName', 'provenance', 'engine', 'noteCount', 'createdAt'].sort())
    assert.equal(item.provenance, 'abc')
    assert.equal(item.engine, 'basic')
    assert.equal(item.fileName, null)
  }
  const second = await (await GET(await request('/api/analysis/history?page=2'))).json() as AnalysisHistoryPage
  assert.equal(second.hasMore, false)
  assert.deepEqual(second.items.map(item => item.id), ordered.slice(20))
  const another = await (await GET(await request('/api/analysis/history', other))).json() as AnalysisHistoryPage
  assert.equal(another.items.length, 1)
  assert.equal(another.items[0].engine, 'image-model')
  const spoofed = await GET(await request(`/api/analysis/history?user_id=${other}`))
  assert.equal(spoofed.status, 403)
})

test('summary queries avoid loading or decoding the full result JSON', async t => {
  const { saveAnalysisHistory } = await loadHistory()
  const client = isolate(t)
  const id = await saveAnalysisHistory(client, owner, analysis('abc'))
  const database = new DatabaseSync(localDatabasePath())
  database.exec('PRAGMA ignore_check_constraints = ON')
  database.prepare('UPDATE score_analyses SET result = ? WHERE id = ?').run('deliberately invalid JSON', id)
  database.close()
  const { GET } = await import('../app/api/analysis/history/route')
  const response = await GET(await request('/api/analysis/history'))
  assert.equal(response.status, 200)
  const value = await response.json() as AnalysisHistoryPage
  assert.equal(value.items[0].id, id)
  assert.equal('result' in value.items[0], false)
})

test('history detail is owner-only, renews expired music21 receipts, and never duplicates history', async t => {
  const { saveAnalysisHistory } = await loadHistory()
  const client = isolate(t)
  const { GET } = await import('../app/api/analysis/history/[id]/route')
  const original = analysis('musicxml', true)
  const expired = { ...original, analysisReceipt: createScoreAnalysisReceipt({ ...original }, owner, 1000) }
  assert.equal(verifyScoreAnalysisReceipt(expired, owner), null)
  const id = await saveAnalysisHistory(client, owner, expired)
  const response = await GET(await request('/api/analysis/history/' + id), { params: Promise.resolve({ id }) })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  const reopened = await response.json() as AnalysisResult & { historyId: string }
  assert.equal(reopened.historyId, id)
  assert.notEqual(reopened.analysisReceipt, expired.analysisReceipt)
  assert.equal(verifyScoreAnalysisReceipt({ ...reopened }, owner)?.noteCount, 1)
  assert.equal(verifyScoreAnalysisReceipt({ ...reopened }, other), null)
  const denied = await GET(await request('/api/analysis/history/' + id, other), { params: Promise.resolve({ id }) })
  assert.equal(denied.status, 404)
  const missing = await GET(await request('/api/analysis/history/missing'), { params: Promise.resolve({ id: 'missing' }) })
  assert.equal(missing.status, 404)
  await GET(await request('/api/analysis/history/' + id), { params: Promise.resolve({ id }) })
  const count = await client.from('score_analyses').select('id', { count: 'exact', head: true }).eq('user_id', owner)
  assert.equal(count.count, 1)
})

test('basic and image histories reopen without receipts and history endpoints require login', async t => {
  const { saveAnalysisHistory } = await loadHistory()
  const client = isolate(t)
  const detail = await import('../app/api/analysis/history/[id]/route')
  const list = await import('../app/api/analysis/history/route')
  for (const provenance of ['musicxml', 'abc', 'image-model'] as const) {
    const original = analysis(provenance)
    const id = await saveAnalysisHistory(client, owner, original)
    const response = await detail.GET(await request('/api/analysis/history/' + id), { params: Promise.resolve({ id }) })
    const value = await response.json() as AnalysisResult & { historyId: string }
    assert.deepEqual(value, { ...original, historyId: id })
    assert.equal('analysisReceipt' in value, false)
  }
  const unauthenticated = await list.GET(new Request('http://localhost/api/analysis/history'))
  assert.equal(unauthenticated.status, 401)
  assert.match(unauthenticated.headers.get('cache-control') ?? '', /no-store/)
  const invalidPage = await list.GET(await request('/api/analysis/history?page=0'))
  assert.equal(invalidPage.status, 400)
})
