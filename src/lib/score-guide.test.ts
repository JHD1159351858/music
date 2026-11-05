import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { saveAnalysisHistory } from './analysis-history'
import { parseNotation, type AnalysisResult } from './score-analysis'
import { verifyScoreAnalysisReceipt } from './score-analysis-receipt'
import { createSupabaseServer } from './supabase-server'

const owner = 's0000000-0000-0000-0000-000000000001'
const other = 's0000000-0000-0000-0000-000000000002'
const prelude = () => parseNotation('X:1\nT:Prelude to a Tragedy\nC:Lee Actor\nK:C\nC D E F')

async function openGuideRoute() {
  const route = 'src/app/api/analysis/history/[id]/guide/route.ts'
  const { existsSync } = await import('node:fs')
  assert.ok(existsSync(path.join(process.cwd(), route)), '缺少分析导读接口')
  return import('../app/api/analysis/history/[id]/guide/route')
}

function isolate(t: TestContext, searchUrl?: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-score-guide-'))
  for (const [key, value] of Object.entries({
    ZHIYIN_DATA_DIR: directory,
    ZHIYIN_STORAGE_MODE: 'local',
    ZHIYIN_SESSION_SECRET: 'isolated-score-guide-test-secret-at-least-32',
    ZHIYIN_STUDENT_TEST_MODE: 'false',
    CODER_CODING_API_KEY: searchUrl ? 'local-guide-fixture' : '',
    ...(searchUrl && { CODER_CODING_BASE_URL: searchUrl }),
  })) {
    const old = process.env[key]
    process.env[key] = value
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old })
  }
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
    rmSync(directory, { recursive: true, force: true })
  })
  return createSupabaseServer()
}

async function request(id: string, method = 'GET', userId = owner) {
  const token = await signAuthToken({ kind: 'session', userId, role: 'student', expiresAt: Date.now() + 60000 })
  return new Request(`http://localhost/api/analysis/history/${id}${method === 'POST' ? '/guide' : ''}`, { method, headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}` } })
}

test('a prior analysis gains grounded guide fields and saves them in the same owner-only history', async t => {
  const client = isolate(t)
  const { POST } = await openGuideRoute()
  const { GET } = await import('../app/api/analysis/history/[id]/route')
  const analysis = {
    ...prelude(),
    provenance: 'musicxml',
    music21: { version: '10.5.1', partCount: 1, measureCount: 1, restCount: 0, timeSignatures: ['4/4'],
      tempos: [], declaredKeys: ['C大调'], estimatedKey: null, notes: [], chords: [] },
    workBackground: '教师课程资料确认的背景',
    sources: [{ title: 'Prelude to a Tragedy', url: null }],
  } satisfies AnalysisResult
  const id = await saveAnalysisHistory(client, owner, analysis)
  const context = { params: Promise.resolve({ id }) }

  const response = await POST(await request(id, 'POST'), context)
  assert.equal(response.status, 200)
  const enriched = await response.json() as AnalysisResult
  assert.equal(enriched.scoreGuide?.fields.workBackground?.kind, 'course')
  assert.equal(enriched.scoreGuide?.fields.workBackground?.text, analysis.workBackground)
  assert.equal(enriched.scoreGuide?.fields.creationYear?.text, '2003 年')
  assert.equal(enriched.scoreGuide?.fields.creationYear?.source.url, 'https://www.leeactor.com/works.htm')
  assert.equal(enriched.scoreGuide?.fields.melody?.kind, 'score')
  assert.match(enriched.scoreGuide?.fields.melody?.text ?? '', /4\/4/)
  assert.equal((await POST(await request(id, 'POST', other), context)).status, 404)

  const reopened = await (await GET(await request(id), context)).json() as AnalysisResult
  assert.deepEqual(reopened.scoreGuide, enriched.scoreGuide)
  assert.equal(reopened.historyId, id)
  assert.ok(verifyScoreAnalysisReceipt({ ...reopened }, owner))
  const { count } = await client.from('score_analyses').select('id', { count: 'exact', head: true }).eq('user_id', owner)
  assert.equal(count, 1)
})

test('a similar title by another creator stays unverified when search is unavailable', async t => {
  const client = isolate(t)
  const { POST } = await openGuideRoute()
  const id = await saveAnalysisHistory(client, owner, { ...prelude(), composer: '另一位作曲家' })
  const response = await POST(await request(id, 'POST'), { params: Promise.resolve({ id }) })
  assert.equal(response.status, 200)
  const enriched = await response.json() as AnalysisResult
  assert.equal(enriched.scoreGuide?.publicStatus, 'unavailable')
  assert.equal(enriched.scoreGuide?.fields.creationYear, null)
  assert.equal(enriched.scoreGuide?.fields.workBackground, null)
  assert.equal(enriched.scoreGuide?.fields.melody?.kind, 'score')
})

test('new analysis publishes course fields with the source each field came from', async t => {
  const client = isolate(t)
  const { POST } = await import('../app/api/analysis/route')
  const teacher = 't0000000-0000-0000-0000-000000000001'
  const { error } = await client.from('course_knowledge').insert([
    { title: '教学版曲目档案', keywords: ['练习曲甲'], content: '创作年代：1991 年', teacher_id: teacher, source_url: 'https://example.org/year' },
    { title: '练习曲甲', keywords: ['练习曲甲'], content: '曲目背景材料', teacher_id: teacher, source_url: 'https://example.org/work' },
    { title: '作曲家生平导读', keywords: ['测试作曲家'], content: '作曲家背景课程材料', teacher_id: teacher, source_url: 'https://example.org/composer' },
  ])
  assert.equal(error, null)
  const token = await signAuthToken({ kind: 'session', userId: owner, role: 'student', expiresAt: Date.now() + 60000 })
  const response = await POST(new Request('http://localhost/api/analysis', {
    method: 'POST',
    headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'text', notation: 'X:1\nT:练习曲甲\nC:测试作曲家\nK:C\nC D E F' }),
  }))
  assert.equal(response.status, 200)
  const parsed = await response.json() as AnalysisResult
  assert.equal(parsed.scoreGuide?.publicStatus, 'pending')
  assert.equal(parsed.scoreGuide?.fields.workBackground?.source.url, 'https://example.org/work')
  assert.equal(parsed.scoreGuide?.fields.creationYear?.source.url, 'https://example.org/year')
  assert.equal(parsed.scoreGuide?.fields.creationYear?.text, '1991 年')
  assert.equal(parsed.scoreGuide?.fields.composerBackground?.source.url, 'https://example.org/composer')
})

test('configured public search requires the work and composer to match the same published evidence', async t => {
  const { POST } = await openGuideRoute()
  let searches = 0
  const server = createServer((request, response) => {
    assert.equal(request.url, '/v1/sdk/search/query')
    searches += 1
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ code: 200, data: [
      { title: 'Archive program notes', url: 'https://music.university.edu/other', snippet: 'Cloud Etude (2025) was written by another composer. Eliza Ford is featured in a later concert.' },
      { title: 'Cloud Etude by Eliza Ford', url: 'https://music.university.edu/cloud', snippet: 'Cloud Etude (1997) by Eliza Ford premiered on the university recital series.' },
      { title: 'Composer biography: Eliza Ford', url: 'https://music.university.edu/ford', snippet: 'Eliza Ford is a composer and conductor.' },
      { title: 'Cloud Etude (2030) by Eliza Ford', url: 'https://unverified.invalid/cloud', snippet: 'Cloud Etude (2030) by Eliza Ford.' },
    ] }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const client = isolate(t, `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/sdk`)
  const id = await saveAnalysisHistory(client, owner, parseNotation('X:1\nT:Cloud Etude\nC:Eliza Ford\nK:C\nC D E F'))
  const context = { params: Promise.resolve({ id }) }
  const response = await POST(await request(id, 'POST'), context)
  assert.equal(response.status, 200)
  const enriched = await response.json() as AnalysisResult
  assert.equal(enriched.scoreGuide?.publicStatus, 'checked')
  assert.equal(enriched.scoreGuide?.fields.creationYear?.text, '1997 年')
  assert.equal(enriched.scoreGuide?.fields.workBackground?.source.url, 'https://music.university.edu/cloud')
  assert.equal(enriched.scoreGuide?.fields.composerBackground?.source.url, 'https://music.university.edu/ford')
  assert.equal((await POST(await request(id, 'POST'), context)).status, 200)
  assert.equal(searches, 2)
})
