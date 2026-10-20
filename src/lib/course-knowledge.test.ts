import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { GET, POST } from '../app/api/knowledge/route'
import { PATCH, DELETE } from '../app/api/knowledge/[id]/route'
import { retrieveKnowledge } from './course-knowledge'

test('teachers maintain their own knowledge, students only read, retrieval does not invent matches', async () => {
  const before = process.env.ZHIYIN_DATA_DIR
  const beforeMode = process.env.ZHIYIN_STORAGE_MODE
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-knowledge-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  const teacher = 't0000000-0000-0000-0000-000000000001'
  const student = 's0000000-0000-0000-0000-000000000001'
  const request = async (userId: string, method = 'GET', body?: object) => new Request('http://localhost/api/knowledge', {
    method, headers: { cookie: `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student', expiresAt: Date.now() + 60000 })}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  try {
    assert.equal((await GET(new Request('http://localhost/api/knowledge'))).status, 401)
    const content = { title: '连奏练习', content: '先慢练，注意音与音之间的连接。', keywords: ['连奏', 'legato'], source_url: null }
    assert.equal((await POST(await request(student, 'POST', content))).status, 403)
    const created = await POST(await request(teacher, 'POST', content))
    assert.equal(created.status, 201)
    const entry = await created.json() as { id: string; title: string }
    const list = await GET(await request(student))
    assert.equal((await list.json() as unknown[]).length, 1)
    const matches = await retrieveKnowledge('如何练习legato？')
    assert.equal(matches[0]?.id, entry.id)
    assert.deepEqual(await retrieveKnowledge('天文学的黑洞'), [])
    const params = { params: Promise.resolve({ id: entry.id }) }
    assert.equal((await PATCH(await request(student, 'PATCH', content), params)).status, 403)
    assert.equal((await PATCH(await request(teacher, 'PATCH', { ...content, title: '连奏方法' }), params)).status, 200)
    assert.equal((await DELETE(await request(teacher, 'DELETE'), params)).status, 200)
    assert.deepEqual(await retrieveKnowledge('连奏'), [])
  } finally {
    if (before === undefined) delete process.env.ZHIYIN_DATA_DIR
    else process.env.ZHIYIN_DATA_DIR = before
    if (beforeMode === undefined) delete process.env.ZHIYIN_STORAGE_MODE
    else process.env.ZHIYIN_STORAGE_MODE = beforeMode
    rmSync(directory, { recursive: true, force: true })
  }
})
