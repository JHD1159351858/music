import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { POST } from '../app/api/chat/route'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'

test('chat requires a session and gives an explicit range response when no knowledge is collected', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-chat-'))
  const before = process.env.ZHIYIN_DATA_DIR
  const mode = process.env.ZHIYIN_STORAGE_MODE
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  try {
    const body = JSON.stringify({ messages: [{ role: 'user', content: '未收录的宇宙问题' }] })
    const request = (cookie = '') => new Request('http://localhost/api/chat', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body })
    assert.equal((await POST(request())).status, 401)
    const token = await signAuthToken({ kind: 'session', userId: 's0000000-0000-0000-0000-000000000001', role: 'student', expiresAt: Date.now() + 60000 })
    const response = await POST(request(`${AUTH_SESSION_COOKIE}=${token}`))
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/)
    const stream = await response.text()
    assert.match(stream, /这部分超出已收录范围/)
    assert.match(stream, /data: \[DONE\]/)
  } finally {
    if (before === undefined) delete process.env.ZHIYIN_DATA_DIR
    else process.env.ZHIYIN_DATA_DIR = before
    if (mode === undefined) delete process.env.ZHIYIN_STORAGE_MODE
    else process.env.ZHIYIN_STORAGE_MODE = mode
    rmSync(directory, { recursive: true, force: true })
  }
})
