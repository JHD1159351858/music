import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createLocalDatabaseClient } from './local-database'
import { saveLocalFile } from './local-files'
import { POST as createTask } from '../app/api/tasks/route'
import { PATCH as updateTask, GET as taskDetail } from '../app/api/tasks/[id]/route'
import { POST as submitTask } from '../app/api/tasks/[id]/submissions/route'
import { PATCH as reviewSubmission } from '../app/api/submissions/[id]/route'

const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const otherStudent = 's0000000-0000-0000-0000-000000000002'
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET'] as const
let before: Record<string, string | undefined>
let directory: string

beforeEach(() => {
  before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-task-materials-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-task-materials-test-secret-at-least-32-characters'
})
afterEach(() => {
  for (const key of keys) {
    if (before[key] === undefined) delete process.env[key]
    else process.env[key] = before[key]
  }
  rmSync(directory, { recursive: true, force: true })
})

async function request(url: string, userId: string, body?: Record<string, unknown>): Promise<Request> {
  const token = await signAuthToken({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student', expiresAt: Date.now() + 60_000 })
  return new Request(`http://localhost:5000${url}`, { method: body ? 'POST' : 'GET', headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify({ user_id: userId, ...body }) : undefined })
}
const params = (id = 'task') => ({ params: Promise.resolve({ id }) })
const taskValues = (overrides: Record<string, unknown> = {}) => ({ title: '本周练习', description: '练习连奏', start_at: new Date(Date.now() - 60_000).toISOString(), end_at: new Date(Date.now() + 3600_000).toISOString(), audience: 'classes', target_classes: ['钢琴一班'], target_student_ids: [], score_mode: 'fixed', score_id: 'score', requirements: { audio: 'optional', record: 'required', video: 'optional' }, ...overrides })

async function seed() {
  const db = createLocalDatabaseClient()
  assert.equal((await db.from('profiles').update({ class_name: '钢琴一班' }).eq('id', student)).error, null)
  assert.equal((await db.from('profiles').update({ class_name: '钢琴二班' }).eq('id', otherStudent)).error, null)
  assert.equal((await db.from('scores').insert({ id: 'score', title: '练习曲', composer: '作者', difficulty: 'beginner', source: 'teacher', owner_id: teacher, published: true, target_classes: ['钢琴一班'] })).error, null)
  assert.equal((await db.from('tasks').insert({ id: 'task', teacher_id: teacher, ...taskValues() })).error, null)
}

test('fixed and random tasks cannot assign class-restricted scores outside the task audience', async () => {
  await seed()
  const all = await createTask(await request('/api/tasks', teacher, taskValues({ audience: 'all', target_classes: [] })))
  assert.equal(all.status, 400)
  const wrongClass = await createTask(await request('/api/tasks', teacher, taskValues({ target_classes: ['钢琴二班'] })))
  assert.equal(wrongClass.status, 400)
  const wrongStudent = await createTask(await request('/api/tasks', teacher, taskValues({ audience: 'students', target_classes: [], target_student_ids: [otherStudent] })))
  assert.equal(wrongStudent.status, 400)
  const random = await createTask(await request('/api/tasks', teacher, taskValues({ score_mode: 'random', score_id: null, target_classes: ['钢琴二班'] })))
  assert.equal(random.status, 400)
  const allowed = await createTask(await request('/api/tasks', teacher, taskValues()))
  assert.equal(allowed.status, 201)
})

test('editing a task audience validates score visibility, while closing still works after a score is unpublished', async () => {
  await seed()
  assert.equal((await updateTask(await request('/api/tasks/task', teacher, { target_classes: ['钢琴二班'] }), params())).status, 400)
  assert.equal((await createLocalDatabaseClient().from('scores').update({ published: false }).eq('id', 'score')).error, null)
  const closed = await updateTask(await request('/api/tasks/task', teacher, { closed: true }), params())
  assert.equal(closed.status, 200)
  assert.equal((await closed.json() as { closed: boolean }).closed, true)
})

test('submissions reject materials that the task explicitly does not request', async () => {
  await seed()
  await createLocalDatabaseClient().from('tasks').update({ requirements: { audio: 'off', record: 'required', video: 'off' } }).eq('id', 'task')
  const result = await submitTask(await request('/api/tasks/task/submissions', student, { record_text: '已完成', video_url: 'https://example.org/unrequested.mp4' }), params())
  assert.equal(result.status, 400)
  assert.equal((await createLocalDatabaseClient().from('submissions').select('id')).data?.length, 0)
})

test('submissions enforce uploaded file ownership and audio/video media types', async () => {
  await seed()
  const otherAudio = await saveLocalFile(Buffer.from('audio'), 'other.webm', 'audio/webm', otherStudent)
  const stolen = await submitTask(await request('/api/tasks/task/submissions', student, { record_text: '已完成', audio_file_id: otherAudio.fileId }), params())
  assert.equal(stolen.status, 403)
  const image = await saveLocalFile(Buffer.from('image'), 'image.png', 'image/png', student)
  const invalid = await submitTask(await request('/api/tasks/task/submissions', student, { record_text: '已完成', video_file_id: image.fileId }), params())
  assert.equal(invalid.status, 400)
})

test('standalone audio, video and text records are reviewable and scores return only to the submitting student', async () => {
  await seed()
  const audio = await saveLocalFile(Buffer.from('audio'), 'practice.webm', 'audio/webm', student)
  const video = await saveLocalFile(Buffer.from('video'), 'performance.mp4', 'video/mp4', student)
  const submitted = await submitTask(await request('/api/tasks/task/submissions', student, { record_text: '本次重点练习连奏', audio_file_id: audio.fileId, video_file_id: video.fileId }), params())
  assert.equal(submitted.status, 200)
  const submission = await submitted.json() as { id: string }
  const reviewed = await reviewSubmission(await request(`/api/submissions/${submission.id}`, teacher, { grade: 92, feedback: '旋律连贯，继续改善呼吸。' }), params(submission.id))
  assert.equal(reviewed.status, 200)
  const detail = await taskDetail(await request('/api/tasks/task', student), params())
  assert.equal(detail.status, 200)
  const data = await detail.json() as { submissions: { grade: number; feedback: string; audio_url: string; video_url: string; record_text: string }[] }
  assert.equal(data.submissions.length, 1)
  assert.equal(data.submissions[0].grade, 92)
  assert.equal(data.submissions[0].feedback, '旋律连贯，继续改善呼吸。')
  assert.ok(data.submissions[0].audio_url.startsWith('/api/files/'))
  assert.ok(data.submissions[0].video_url.startsWith('/api/files/'))
  assert.equal(data.submissions[0].record_text, '本次重点练习连奏')
  assert.equal((await taskDetail(await request('/api/tasks/task', otherStudent), params())).status, 403)
})
