import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { POST } from '../app/api/chat/route'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createScoreAnalysisReceipt } from './score-analysis-receipt'
import { createLocalDatabaseClient } from './local-database'

test('verified music21 results unlock grounded chat without course entries; forged results do not', async () => {
  const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE', 'CODER_CODING_API_KEY', 'CODER_CODING_MODEL_API_KEY', 'CODER_CODING_BASE_URL', 'CODER_CODING_MODEL_BASE_URL'] as const
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-music21-chat-'))
  const prompts: string[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { messages: Array<{ role: string; content: string }> }
    prompts.push(body.messages.find(message => message.role === 'system')?.content ?? '')
    response.setHeader('content-type', 'text/event-stream')
    response.end('data: {"choices":[{"delta":{"content":"第2小节读取到 G4，这是谱面数据。"}}]}\n\ndata: [DONE]\n\n')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-music21-chat-test-secret-at-least-32'
  process.env.CODER_CODING_API_KEY = 'local-fixture'
  process.env.CODER_CODING_MODEL_API_KEY = 'local-fixture'
  process.env.CODER_CODING_BASE_URL = base
  process.env.CODER_CODING_MODEL_BASE_URL = base
  const owner = 's0000000-0000-0000-0000-000000000001'
  try {
    const analysis = {
      title: null, composer: null, key: null, range: 'C4 — G4（7半音）', noteCount: 2, chordColor: null,
      pitchHistogram: { C: 1, G: 1 }, pitchSequence: [{ index: 1, midi: 60, note: 'C4' }, { index: 2, midi: 67, note: 'G4' }],
      summary: '实际音符', background: null, workBackground: null, composerBackground: null, creationYear: null, period: null, melody: null, provenance: 'musicxml', warnings: [],
      music21: { version: '10.5.1', partCount: 1, measureCount: 2, restCount: 0, timeSignatures: ['4/4'], tempos: [], declaredKeys: [], estimatedKey: null,
        notes: [{ index: 1, midi: 60, note: 'C4', part: '钢琴', measure: 1, beat: 1, offset: 0, duration: 1, voice: null }, { index: 2, midi: 67, note: 'G4', part: '钢琴', measure: 2, beat: 1, offset: 4, duration: 1, voice: null }], chords: [] },
    }
    const signed = { ...analysis, analysisReceipt: createScoreAnalysisReceipt(analysis, owner) }
    const cookie = `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId: owner, role: 'student', expiresAt: Date.now() + 60000 })}`
    const chat = (value: Record<string, unknown>) => POST(new Request('http://localhost/api/chat', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: '第2小节有什么音符？' }], context: { kind: 'score', analysis: value } }) }))
    const response = await chat(signed)
    const content = await response.text()
    assert.equal(response.status, 200)
    assert.match(content, /第2小节读取到 G4/)
    assert.match(content, /music21/)
    assert.equal(prompts.length, 1)
    assert.match(prompts[0], /music21|谱面/)
    assert.match(prompts[0], /G4/)
    assert.match(prompts[0], /史实|背景/)
    assert.doesNotMatch(prompts[0], /analysisReceipt|ownerId|s0000000|ZHIYIN/)
    const unsigned = await chat({ title: '未收录', noteCount: 999, provenance: 'image-model' })
    assert.match(await unsigned.text(), /超出已收录范围/)
    assert.equal(prompts.length, 1)
    await createLocalDatabaseClient().from('course_knowledge').insert({ title: '第2小节', content: '教师收录的节拍说明。', keywords: ['第2小节'], teacher_id: 't0000000-0000-0000-0000-000000000001' })
    const stripped = await chat(analysis)
    assert.equal(stripped.status, 422)
    assert.equal(prompts.length, 1)
    const forged = await chat({ ...signed, noteCount: 999 })
    assert.equal(forged.status, 422)
    assert.equal(prompts.length, 1)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
    rmSync(directory, { recursive: true, force: true })
  }
})
