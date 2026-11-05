import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from '@/lib/auth-session'
import { createLocalDatabaseClient } from '@/lib/local-database'
import { saveLocalFile } from '@/lib/local-files'
import type { PracticeTask } from '@/lib/teaching-types'
import { GET } from './route'

const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const otherStudent = 's0000000-0000-0000-0000-000000000002'
const otherTeacher = 't0000000-0000-0000-0000-000000000002'
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET'] as const
let original: Record<string, string | undefined>
let directory: string
beforeEach(async () => {
  original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-task-score-summary-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-task-score-summary-secret-at-least-32-characters'
  const db = createLocalDatabaseClient()
  await db.from('profiles').update({ class_name: '钢琴一班' }).eq('id', student)
  await db.from('profiles').update({ class_name: '钢琴二班' }).eq('id', otherStudent)
  await db.from('profiles').insert({ id: otherTeacher, nickname: '另一位教师', role: 'teacher' })
})
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
  rmSync(directory, { recursive: true, force: true })
})
async function request(userId?: string) {
  const headers = new Headers()
  if (userId) headers.set('cookie', `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId, role: userId.startsWith('t') ? 'teacher' : 'student', expiresAt: Date.now() + 60000 })}`)
  return new Request('http://localhost/api/tasks', { headers })
}
async function list(userId: string): Promise<PracticeTask[]> {
  const response = await GET(await request(userId))
  assert.equal(response.status, 200, await response.clone().text())
  return response.json() as Promise<PracticeTask[]>
}
async function score(id: string, overrides: Record<string, unknown> = {}) {
  const result = await createLocalDatabaseClient().from('scores').insert({ id, title: `曲目${id}`, composer: '作曲家', difficulty: 'beginner', source: 'teacher', owner_id: teacher, published: true, target_classes: [], file_id: 'unavailable-score-page-not-needed-for-task-card', ...overrides })
  assert.equal(result.error, null)
}
async function task(id: string, scoreId: string | null, overrides: Record<string, unknown> = {}) {
  const result = await createLocalDatabaseClient().from('tasks').insert({ id, teacher_id: teacher, title: `任务${id}`, description: '练习要求', start_at: '2026-01-01T00:00:00Z', end_at: '2027-01-01T00:00:00Z', audience: 'all', target_classes: [], target_student_ids: [], score_mode: 'fixed', score_id: scoreId, requirements: { audio: 'optional', record: 'required', video: 'off' }, ...overrides })
  assert.equal(result.error, null)
}

test('fixed and random task cards expose the same signed cover and keep the stored random assignment after library changes', async () => {
  const db = createLocalDatabaseClient()
  const cover = await saveLocalFile(Buffer.from('89504e470d0a1a0a', 'hex'), 'cover.png', 'image/png', teacher)
  await score('original', { cover_file_id: cover.fileId })
  await task('fixed', 'original')
  await task('random', null, { score_mode: 'random' })
  const first = await list(student)
  for (const item of first) {
    assert.equal(item.assigned_score_id, 'original')
    assert.equal(item.score?.id, item.assigned_score_id)
    assert.equal(item.score?.title, '曲目original')
    assert.equal(item.score?.cover_file_id, cover.fileId)
    assert.match(item.score?.cover_url ?? '', /^\/api\/files\//)
    assert.deepEqual(Object.keys(item.score ?? {}).sort(), ['composer', 'cover_file_id', 'cover_url', 'id', 'title'])
  }
  await score('new-library-entry')
  const second = await list(student)
  assert.equal(second.find(item => item.id === 'random')?.score?.id, 'original')
  assert.equal((await db.from('task_score_assignments').select('id', { count: 'exact', head: true }).eq('student_id', student)).count, 1)
  await db.from('scores').update({ published: false }).eq('id', 'original')
  const withdrawn = await list(student)
  assert.ok(withdrawn.every(item => item.assigned_score_id === null && item.score === null))
  assert.deepEqual((await db.from('task_score_assignments').select('score_id').eq('task_id', 'random').eq('student_id', student).single()).data, { score_id: 'original' })
})

test('task summaries do not expose unpublished, other-class or student-private scores even through saved random assignments', async () => {
  await score('class-one', { target_classes: ['钢琴一班'] })
  await score('class-two', { target_classes: ['钢琴二班'] })
  await score('draft', { published: false })
  await score('own-private', { source: 'student', owner_id: student, published: true })
  await score('other-private', { source: 'student', owner_id: otherStudent, published: true })
  for (const id of ['class-one', 'class-two', 'draft', 'own-private', 'other-private']) await task(`fixed-${id}`, id)
  await task('hidden-audience', 'class-two', { audience: 'classes', target_classes: ['钢琴二班'] })
  await task('private-random', null, { score_mode: 'random' })
  await createLocalDatabaseClient().from('task_score_assignments').insert({ task_id: 'private-random', student_id: student, score_id: 'own-private' })
  const rows = await list(student)
  assert.equal(rows.find(item => item.id === 'fixed-class-one')?.score?.id, 'class-one')
  assert.equal(rows.some(item => item.id === 'hidden-audience'), false)
  for (const id of ['fixed-class-two', 'fixed-draft', 'fixed-own-private', 'fixed-other-private', 'private-random']) {
    const row = rows.find(item => item.id === id)
    assert.ok(row)
    assert.equal(row.assigned_score_id, null)
    assert.equal(row.score, null)
  }
  assert.equal((await GET(await request())).status, 401)
})

test('teacher summaries follow readable fixed teacher scores and do not create student random assignments', async () => {
  await score('own-draft', { published: false })
  await score('foreign-draft', { published: false, owner_id: otherTeacher })
  await score('foreign-published', { owner_id: otherTeacher })
  await score('student-private', { source: 'student', owner_id: student, published: true })
  for (const id of ['own-draft', 'foreign-draft', 'foreign-published', 'student-private']) await task(id, id)
  await task('random', null, { score_mode: 'random' })
  await task('foreign-task', 'foreign-published', { teacher_id: otherTeacher })
  const rows = await list(teacher)
  assert.equal(rows.find(item => item.id === 'own-draft')?.score?.id, 'own-draft')
  assert.equal(rows.find(item => item.id === 'foreign-published')?.score?.id, 'foreign-published')
  for (const id of ['foreign-draft', 'student-private', 'random']) assert.equal(rows.find(item => item.id === id)?.score, null)
  assert.equal(rows.some(item => item.id === 'foreign-task'), false)
  assert.equal((await createLocalDatabaseClient().from('task_score_assignments').select('id', { count: 'exact', head: true })).count, 0)
})
