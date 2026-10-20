import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createLocalDatabaseClient } from './local-database'
import { GET as posts, POST as createPost } from '../app/api/posts/route'
import { DELETE as deletePost, PATCH as markPost } from '../app/api/posts/[id]/route'
import { GET as comments, POST as createComment } from '../app/api/comments/route'
import { POST as likePost } from '../app/api/posts/[id]/like/route'

const teacher = 't0000000-0000-0000-0000-000000000001'
const anotherTeacher = 't0000000-0000-0000-0000-000000000002'
const student = 's0000000-0000-0000-0000-000000000001'
const anotherStudent = 's0000000-0000-0000-0000-000000000002'
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE'] as const
let directory: string
let original: Record<string, string | undefined>

beforeEach(async () => {
  original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-community-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'community-test-secret-with-at-least-32-characters'
  delete process.env.ZHIYIN_STUDENT_TEST_MODE
  const result = await createLocalDatabaseClient().from('profiles').insert({ id: anotherTeacher, nickname: '另一位老师', role: 'teacher' })
  assert.equal(result.error, null)
})
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  rmSync(directory, { recursive: true, force: true })
})

async function request(url: string, userId: string, body?: Record<string, unknown>) {
  const role = userId === teacher || userId === anotherTeacher ? 'teacher' : 'student'
  const token = await signAuthToken({ kind: 'session', userId, role, expiresAt: Date.now() + 60_000 })
  return new Request(`http://localhost${url}`, {
    method: body ? 'POST' : 'GET',
    headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}
function params(id: string) { return { params: Promise.resolve({ id }) } }
async function publish(recipient: string | null = null) {
  const response = await createPost(await request('/api/posts', student, { title: '练习问题', content: '请老师指导跳音。', category: 'method', recipient_teacher_id: recipient }))
  assert.equal(response.status, 200)
  return await response.json() as { id: string; recipient_teacher_id: string | null }
}

test('direct messages persist the chosen teacher and never appear in the public feed', async () => {
  const message = await publish(teacher)
  assert.equal(message.recipient_teacher_id, teacher)
  const publicPost = await publish()
  for (const viewer of [student, anotherStudent, teacher, anotherTeacher]) {
    const response = await posts(await request('/api/posts', viewer))
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json() as Array<{ id: string }>).map(post => post.id), [publicPost.id])
  }
  for (const viewer of [student, teacher]) {
    const response = await posts(await request('/api/posts?view=messages', viewer))
    assert.deepEqual((await response.json() as Array<{ id: string }>).map(post => post.id), [message.id])
  }
  for (const viewer of [anotherStudent, anotherTeacher]) {
    const response = await posts(await request('/api/posts?view=messages', viewer))
    assert.deepEqual(await response.json(), [])
  }
})

test('unrelated users cannot read, reply, like, mark or delete a direct message', async () => {
  const message = await publish(teacher)
  for (const viewer of [anotherStudent, anotherTeacher]) {
    assert.equal((await comments(await request(`/api/comments?post_id=${message.id}`, viewer))).status, 404)
    assert.equal((await createComment(await request('/api/comments', viewer, { post_id: message.id, content: '越权回复' }))).status, 404)
    assert.equal((await likePost(await request(`/api/posts/${message.id}/like`, viewer, {}), params(message.id))).status, 404)
    assert.equal((await deletePost(await request(`/api/posts/${message.id}`, viewer), params(message.id))).status, 404)
  }
  assert.equal((await markPost(await request(`/api/posts/${message.id}`, anotherTeacher, { marked_for_lesson: true }), params(message.id))).status, 404)
  assert.equal((await createComment(await request('/api/comments', teacher, { post_id: message.id, content: '下节课一起练。' }))).status, 200)
  const reply = await comments(await request(`/api/comments?post_id=${message.id}`, student))
  assert.equal((await reply.json() as unknown[]).length, 1)
})

test('lesson marks belong to each teacher and unmarking does not change another teacher', async () => {
  const post = await publish()
  for (const viewer of [teacher, anotherTeacher]) {
    const response = await markPost(await request(`/api/posts/${post.id}`, viewer, { marked_for_lesson: true }), params(post.id))
    assert.equal(response.status, 200)
  }
  assert.equal((await markPost(await request(`/api/posts/${post.id}`, teacher, { marked_for_lesson: false }), params(post.id))).status, 200)
  const ownList = await posts(await request('/api/posts?marked=true', teacher))
  assert.deepEqual(await ownList.json(), [])
  const otherList = await posts(await request('/api/posts?marked=true', anotherTeacher))
  assert.deepEqual((await otherList.json() as Array<{ id: string }>).map(item => item.id), [post.id])
  const marks = await createLocalDatabaseClient().from('lesson_marks').select('teacher_id')
  assert.deepEqual(marks.data, [{ teacher_id: anotherTeacher }])
})

test('only a teacher can be selected as a message recipient and categories are validated', async () => {
  const body = { title: '问题', content: '内容', category: 'method' }
  assert.equal((await createPost(await request('/api/posts', student, { ...body, recipient_teacher_id: anotherStudent }))).status, 400)
  assert.equal((await createPost(await request('/api/posts', student, { ...body, recipient_teacher_id: 'missing' }))).status, 400)
  assert.equal((await createPost(await request('/api/posts', student, { ...body, category: 'unknown' }))).status, 400)
})

test('popular sorting applies to visible public posts only', async () => {
  const quiet = await publish()
  const popular = await publish()
  const hidden = await publish(teacher)
  const client = createLocalDatabaseClient()
  await client.from('posts').update({ like_count: 3 }).eq('id', popular.id)
  await client.from('posts').update({ like_count: 50 }).eq('id', hidden.id)
  const response = await posts(await request('/api/posts?sort=popular', anotherStudent))
  assert.deepEqual((await response.json() as Array<{ id: string }>).map(post => post.id), [popular.id, quiet.id])
})
