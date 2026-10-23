import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { POST } from '../app/api/chat/route'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { CHINA_COMPOSERS } from './composers'
import { createLocalDatabaseClient } from './local-database'

test('chat grounds custom and builtin people by server ID and sends only music material to a local model fixture', async () => {
  const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'CODER_CODING_API_KEY', 'CODER_CODING_MODEL_API_KEY', 'CODER_CODING_BASE_URL', 'CODER_CODING_MODEL_BASE_URL'] as const
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-map-chat-'))
  const prompts: string[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { messages: Array<{ role: string; content: string }> }
    prompts.push(body.messages.find(message => message.role === 'system')?.content ?? '')
    response.setHeader('content-type', 'text/event-stream')
    response.end('data: {"choices":[{"delta":{"content":"仅依据教师资料讲解。"}}]}\n\ndata: [DONE]\n\n')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-map-chat-secret-at-least-32-characters'
  process.env.CODER_CODING_API_KEY = 'local-model-fixture'
  process.env.CODER_CODING_MODEL_API_KEY = 'local-model-fixture'
  process.env.CODER_CODING_BASE_URL = base
  process.env.CODER_CODING_MODEL_BASE_URL = base
  try {
    const teacher = 't0000000-0000-0000-0000-000000000001'
    const student = 's0000000-0000-0000-0000-000000000001'
    const db = createLocalDatabaseClient()
    await db.from('map_musicians').insert({ id: 'custom-chat-person', name: '教师登记人物', years: '', era: 'modern', region: '南京', x: 52, y: 53, map_kind: 'china', intro: '教学资料中特有的音乐贡献', works: '', note: '', sources: [{ title: '教师核对来源', url: 'https://example.org/history' }], teacher_id: teacher, avatar_file_id: 'private-avatar-must-never-be-signed-for-chat' })
    const cookie = `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId: student, role: 'student', expiresAt: Date.now() + 60_000 })}`
    const chat = async (context: Record<string, unknown>) => {
      const response = await POST(new Request('http://localhost/api/chat', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: '请介绍当前人物' }], context }) }))
      assert.equal(response.status, 200)
      return response.text()
    }
    const custom = await chat({ kind: 'composer', composerId: 'custom-chat-person', name: '伪造前端姓名', analysis: { intro: '伪造的生平' } })
    assert.match(custom, /仅依据教师资料讲解/)
    assert.equal(prompts.length, 1)
    assert.match(prompts[0], /教学资料中特有的音乐贡献/)
    assert.match(prompts[0], /教师登记人物/)
    assert.doesNotMatch(prompts[0], /伪造|teacher_id|avatar_file_id|private-avatar|api\/files|t0000000/)
    await chat({ kind: 'composer', composerId: CHINA_COMPOSERS[0].id, name: '另一个伪造姓名' })
    assert.equal(prompts.length, 2)
    assert.ok(prompts[1].includes(CHINA_COMPOSERS[0].intro))
    const byName = await chat({ kind: 'composer', name: CHINA_COMPOSERS[0].name })
    assert.match(byName, /超出已收录范围/)
    assert.equal(prompts.length, 2)
    await db.from('map_musicians').delete().eq('id', 'custom-chat-person')
    const deleted = await chat({ kind: 'composer', composerId: 'custom-chat-person', name: '教师登记人物' })
    assert.match(deleted, /超出已收录范围/)
    assert.equal(prompts.length, 2)
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
