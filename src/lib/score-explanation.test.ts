import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import { POST } from '../app/api/chat/route'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { saveAnalysisHistory } from './analysis-history'
import { parseNotation } from './score-analysis'
import { baselineScoreGuide } from './score-guide'
import { createSupabaseServer } from './supabase-server'

const owner = 's0000000-0000-0000-0000-000000000001'
const other = 's0000000-0000-0000-0000-000000000002'
const opening = '请介绍这首乐曲并推荐可核验的拓展资料。'

function isolate(t: TestContext, baseUrl?: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-score-explanation-'))
  const settings = {
    ZHIYIN_DATA_DIR: directory,
    ZHIYIN_STORAGE_MODE: 'local',
    ZHIYIN_SESSION_SECRET: 'isolated-score-explanation-test-secret-at-least-32',
    ZHIYIN_STUDENT_TEST_MODE: 'false',
    CODER_CODING_API_KEY: baseUrl ? 'search-fixture' : '',
    CODER_CODING_MODEL_API_KEY: baseUrl ? 'model-fixture' : '',
    CODER_CODING_BASE_URL: baseUrl ? baseUrl + '/v1/sdk' : '',
    CODER_CODING_MODEL_BASE_URL: baseUrl ?? '',
  }
  for (const [key, value] of Object.entries(settings)) {
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

async function explain(historyId: string, userId = owner, content = opening) {
  const token = await signAuthToken({ kind: 'session', userId, role: 'student', expiresAt: Date.now() + 60000 })
  return POST(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }], context: { kind: 'score-intro', historyId } }),
  }))
}

test('opening explains the selected work without metrics and works without provider keys', async t => {
  const db = isolate(t)
  const score = parseNotation('X:1\nT:Ich liebe dich\nC:Ludwig van Beethoven (1770 - 1827)\nK:G\nG A B')
  score.scoreGuide = { ...baselineScoreGuide(score), publicStatus: 'checked' }
  const id = await saveAnalysisHistory(db, owner, score)
  const response = await explain(id)
  assert.equal(response.status, 200)
  const stream = await response.text()
  assert.match(stream, /作品背景[\s\S]*作曲家介绍[\s\S]*创作年代[\s\S]*所属时期/)
  assert.match(stream, /1795/)
  assert.match(stream, /BV1mq4y1p7wc/)
  assert.match(stream, /抖音搜索入口/)
  assert.match(stream, /Beethoven_1820.jpg/)
  assert.doesNotMatch(stream, /半音|音符数|超出已收录范围/)
  assert.match(stream, /data: \[DONE\]/)
  assert.equal((await explain(id, other)).status, 404)
})

test('configured providers use title and composer for verified video matches and mark model-only facts', async t => {
  const requests: Array<{ url?: string; body: string }> = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += String(chunk)
    requests.push({ url: request.url, body })
    response.setHeader('content-type', 'application/json')
    if (request.url === '/v1/sdk/search/query') {
      response.end(JSON.stringify({ code: 200, data: [
        { title: 'Cloud Etude · Eliza Ford 演奏', url: 'https://www.bilibili.com/video/BV1mq4y1p7wc/', thumbnail: 'https://i0.hdslb.com/fixture.jpg' },
        { title: 'Cloud Etude · Eliza Ford 乐曲导赏', url: 'https://www.douyin.com/video/7322359918626983194', thumbnail: 'https://unrelated.invalid/fixture.jpg' },
        { title: 'Cloud Etude · 其他作者演奏', url: 'https://www.bilibili.com/video/BV1Gm4y1s7ym/' },
        { title: 'Cloud Etude · Eliza Ford', url: 'https://www.bilibili.com.unrelated.invalid/video/BV1234567890/' },
      ] }))
    } else if (body.includes('missing')) {
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        workBackground: '以诗歌为题材的练习曲。',
        composerBackground: '详见 https://made-up.invalid/biography',
        creationYear: '约 1923 年',
      }) } }] }))
    } else {
      response.end(JSON.stringify({ choices: [{ message: { content: '可以留意这首练习曲的叙事感。' } }] }))
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const db = isolate(t, `http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  const score = parseNotation('X:1\nT:Cloud Etude\nC:Eliza Ford\nK:C\nC D E')
  score.workBackground = '教师课件中保留的作品背景'
  score.scoreGuide = { ...baselineScoreGuide(score), publicStatus: 'checked' }
  const id = await saveAnalysisHistory(db, owner, score)
  const response = await explain(id)
  assert.equal(response.status, 200)
  const stream = await response.text()
  assert.match(stream, /教师课件中保留的作品背景/)
  assert.doesNotMatch(stream, /以诗歌为题材|made-up\.invalid|unrelated\.invalid|BV1Gm4y1s7ym/)
  assert.match(stream, /模型补充，待核验.*1923/)
  assert.match(stream, /7322359918626983194/)
  assert.match(stream, /i0\.hdslb\.com\/fixture\.jpg/)
  assert.ok(requests.some(request => request.url === '/v1/sdk/search/query' && /Cloud Etude.*Eliza Ford/i.test(request.body)))
  assert.ok(requests.some(request => request.url === '/chat/completions'))
  assert.ok(requests.every(request => !/pitchSequence|noteCount|半音/.test(request.body)))
  const searchCount = requests.filter(request => request.url === '/v1/sdk/search/query').length
  process.env.CODER_CODING_API_KEY = ''
  const followUp = await (await explain(id, owner, '怎么欣赏这首作品？')).text()
  assert.match(followUp, /新增信息待核验.*叙事感/)
  assert.equal(requests.filter(request => request.url === '/v1/sdk/search/query').length, searchCount)
})
