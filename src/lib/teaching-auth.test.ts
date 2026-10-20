import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createLocalDatabaseClient } from './local-database'
import { actor, apiRoute } from './teaching-server'
import { GET as profiles, PATCH as updateClass } from '../app/api/profiles/route'
import { GET as posts, POST as createPost } from '../app/api/posts/route'
import { DELETE as deletePost, PATCH as markPost } from '../app/api/posts/[id]/route'
import { POST as likePost } from '../app/api/posts/[id]/like/route'
import { GET as comments, POST as createComment } from '../app/api/comments/route'
import { GET as stats } from '../app/api/stats/route'

const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const otherStudent = 's0000000-0000-0000-0000-000000000002'
const environmentKeys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET'] as const
let originalEnvironment: Record<string, string | undefined>
let directory: string

beforeEach(() => {
  originalEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-api-auth-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-teaching-api-test-secret-at-least-32-characters'
})
afterEach(() => {
  for (const key of environmentKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnvironment[key]
  }
  rmSync(directory, { recursive: true, force: true })
})

async function request(url: string, userId?: string, body?: Record<string, unknown>, role: 'student' | 'teacher' = userId === teacher ? 'teacher' : 'student'): Promise<Request> {
  const headers = new Headers()
  if (userId) headers.set('cookie', `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId, role, expiresAt: Date.now() + 60_000 })}`)
  if (body) headers.set('content-type', 'application/json')
  return new Request(`http://localhost:5000${url}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined })
}
function postParams(id = 'post-1') { return { params: Promise.resolve({ id }) } }
async function seedPost(userId = student, id = 'post-1') {
  const result = await createLocalDatabaseClient().from('posts').insert({ id, title: '练琴问题', content: '如何练习？', category: 'method', user_id: userId })
  assert.equal(result.error, null)
}
async function assertStatus(response: Response, status: number) {
  assert.equal(response.status, status)
  const body: unknown = await response.json()
  if (status >= 400) assert.ok(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string')
  return body
}

test('anonymous API reads and writes return JSON 401 instead of using supplied user identity', async () => {
  await assertStatus(await profiles(await request('/api/profiles')), 401)
  await assertStatus(await posts(await request('/api/posts')), 401)
  await assertStatus(await comments(await request('/api/comments?post_id=post-1')), 401)
  await assertStatus(await stats(await request(`/api/stats?user_id=${teacher}`)), 401)
  await assertStatus(await createPost(await request('/api/posts', undefined, { user_id: teacher, title: '问题', content: '内容', category: 'method' })), 401)
  await assertStatus(await createComment(await request('/api/comments', undefined, { user_id: teacher, post_id: 'post-1', content: '内容' })), 401)
  await assertStatus(await likePost(await request('/api/posts/post-1/like', undefined, { user_id: teacher }), postParams()), 401)
  await assertStatus(await deletePost(await request('/api/posts/post-1'), postParams()), 401)
})

test('actor rejects forged query/body identities, unsigned cookies, and expired or stale sessions', async () => {
  for (const query of [`user_id=${teacher}`, `user_id=${student}&user_id=${teacher}`]) {
    await assertStatus(await profiles(await request(`/api/profiles?${query}`, student)), 403)
  }
  await assertStatus(await createPost(await request('/api/posts', student, { user_id: teacher, title: '问题', content: '内容', category: 'method' })), 403)
  const wrongBody = await request('/api/posts', student, { user_id: [student], title: '问题', content: '内容', category: 'method' })
  await assertStatus(await createPost(wrongBody), 403)
  const unsigned = new Request('http://localhost:5000/api/profiles', { headers: { cookie: `${AUTH_SESSION_COOKIE}=${student}` } })
  await assertStatus(await profiles(unsigned), 401)
  const expired = await signAuthToken({ kind: 'session', userId: student, role: 'student', expiresAt: Date.now() - 1 })
  await assertStatus(await profiles(new Request('http://localhost:5000/api/profiles', { headers: { cookie: `${AUTH_SESSION_COOKIE}=${expired}` } })), 401)
  await assertStatus(await profiles(await request('/api/profiles', student, undefined, 'teacher')), 401)
  await assertStatus(await profiles(await request('/api/profiles', 'nonexistent-profile')), 401)
  await assertStatus(await apiRoute(async () => { await actor(await request('/api/profiles', student), { user_id: null }); return new Response() }), 403)
})

test('roster is scoped to the student and only teachers can maintain class membership', async () => {
  const own = await profiles(await request('/api/profiles', student))
  assert.equal(own.status, 200)
  const ownProfiles = await own.json() as Array<{ id: string }>
  assert.deepEqual(ownProfiles.map(profile => profile.id), [student])
  const roster = await profiles(await request('/api/profiles', teacher))
  assert.equal(roster.status, 200)
  assert.equal((await roster.json() as unknown[]).length, 3)
  await assertStatus(await updateClass(await request('/api/profiles', student, { user_id: student, student_id: otherStudent, class_name: '钢琴一班' })), 403)
  const updated = await updateClass(await request('/api/profiles', teacher, { user_id: teacher, student_id: student, class_name: '钢琴一班' }))
  assert.equal(updated.status, 200)
  assert.equal((await updated.json() as { class_name: string }).class_name, '钢琴一班')
})

test('post ownership is session-bound and deletion permits the author or a teacher', async () => {
  const created = await createPost(await request('/api/posts', student, { title: '问题', content: '内容', category: 'method' }))
  assert.equal(created.status, 200)
  const createdPost = await created.json() as { id: string; user_id: string }
  assert.equal(createdPost.user_id, student)
  await assertStatus(await deletePost(await request(`/api/posts/${createdPost.id}`, otherStudent), postParams(createdPost.id)), 403)
  assert.equal((await createLocalDatabaseClient().from('posts').select('id').eq('id', createdPost.id).single()).error, null)
  await assertStatus(await deletePost(await request(`/api/posts/${createdPost.id}`, student), postParams(createdPost.id)), 200)
  await seedPost()
  await assertStatus(await deletePost(await request('/api/posts/post-1', teacher), postParams()), 200)
})

test('only teachers may mark community posts for lessons', async () => {
  await seedPost()
  await assertStatus(await markPost(await request('/api/posts/post-1', student, { user_id: student, marked_for_lesson: true }), postParams()), 403)
  await assertStatus(await markPost(await request('/api/posts/post-1', student, { user_id: teacher, marked_for_lesson: true }), postParams()), 403)
  const marked = await markPost(await request('/api/posts/post-1', teacher, { user_id: teacher, marked_for_lesson: true }), postParams())
  assert.equal(marked.status, 200)
  assert.equal((await marked.json() as { marked_for_lesson: boolean }).marked_for_lesson, true)
})

test('comments and likes use the signed-in author and reject a supplied different identity', async () => {
  await seedPost()
  await assertStatus(await createComment(await request('/api/comments', student, { user_id: teacher, post_id: 'post-1', content: '冒充教师' })), 403)
  const comment = await createComment(await request('/api/comments', student, { post_id: 'post-1', content: '我的问题' }))
  assert.equal(comment.status, 200)
  assert.equal((await comment.json() as { user_id: string }).user_id, student)
  await assertStatus(await comments(await request('/api/comments?post_id=post-1', otherStudent)), 200)
  await assertStatus(await likePost(await request('/api/posts/post-1/like', student, { user_id: teacher }), postParams()), 403)
  await assertStatus(await likePost(await request('/api/posts/post-1/like', student, {}), postParams()), 200)
  const likes = await createLocalDatabaseClient().from('post_likes').select('user_id')
  assert.deepEqual(likes.data, [{ user_id: student }])
})

test('statistics allow a student own data while preventing forged access to teacher data', async () => {
  const own = await stats(await request('/api/stats', student))
  assert.equal(own.status, 200)
  assert.equal((await own.json() as { overview: { studentCount: number } }).overview.studentCount, 1)
  await assertStatus(await stats(await request(`/api/stats?user_id=${teacher}`, student)), 403)
  const result = await stats(await request('/api/stats', teacher))
  assert.equal(result.status, 200)
  const data = await result.json() as { overview: { studentCount: number } }
  assert.equal(data.overview.studentCount, 2)
})
