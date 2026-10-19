import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createSupabaseServer } from './supabase-server'
import type { PracticeTask } from './teaching-types'
import { GET as tasks } from '../app/api/tasks/route'

const teacher = 't0000000-0000-0000-0000-000000000001'
const studentA = 's0000000-0000-0000-0000-000000000001'
const studentB = 's0000000-0000-0000-0000-000000000002'
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE'] as const
let original: Record<string, string | undefined>
let directory: string

beforeEach(async () => {
  original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-task-count-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-task-count-test-secret-at-least-32-characters'
  process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
  const db = createSupabaseServer()
  assert.equal((await db.from('profiles').update({ class_name: '钢琴一班' }).eq('id', studentA)).error, null)
  assert.equal((await db.from('profiles').update({ class_name: '钢琴二班' }).eq('id', studentB)).error, null)
  assert.equal((await db.from('tasks').insert({ id: 'count-task', title: '练习任务', description: '练习', start_at: '2026-10-01T00:00:00Z', end_at: '2026-10-31T00:00:00Z', audience: 'all', target_classes: [], target_student_ids: [], score_mode: 'random', requirements: { audio: 'off', record: 'required', video: 'off' }, closed: false, teacher_id: teacher })).error, null)
  for (const id of [studentA, studentB]) assert.equal((await db.from('submissions').insert({ id: `submission-${id}`, task_id: 'count-task', student_id: id, record_text: '已练习' })).error, null)
})
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  rmSync(directory, { recursive: true, force: true })
})
async function ownTasks(): Promise<PracticeTask[]> {
  const token = await signAuthToken({ kind: 'session', userId: teacher, role: 'teacher', expiresAt: Date.now() + 60_000 })
  const response = await tasks(new Request('http://localhost:5000/api/tasks', { headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}` } }))
  assert.equal(response.status, 200)
  return await response.json() as PracticeTask[]
}

test('task list counts only current class audience while preserving historical submissions', async () => {
  assert.deepEqual((await ownTasks()).map(task => [task.submitted_count, task.student_count]), [[2, 2]])
  const db = createSupabaseServer()
  assert.equal((await db.from('tasks').update({ audience: 'classes', target_classes: ['钢琴一班'] }).eq('id', 'count-task')).error, null)
  assert.deepEqual((await ownTasks()).map(task => [task.submitted_count, task.student_count]), [[1, 1]])
  const history = await db.from('submissions').select('id').eq('task_id', 'count-task')
  assert.equal(history.data?.length, 2)
})

test('task list honors specified students and excludes a student moved out of class scope', async () => {
  const db = createSupabaseServer()
  assert.equal((await db.from('tasks').update({ audience: 'students', target_student_ids: [studentB] }).eq('id', 'count-task')).error, null)
  assert.deepEqual((await ownTasks()).map(task => [task.submitted_count, task.student_count]), [[1, 1]])
  assert.equal((await db.from('tasks').update({ audience: 'classes', target_classes: ['钢琴一班'], target_student_ids: [] }).eq('id', 'count-task')).error, null)
  assert.equal((await db.from('profiles').update({ class_name: '钢琴二班' }).eq('id', studentA)).error, null)
  assert.deepEqual((await ownTasks()).map(task => [task.submitted_count, task.student_count]), [[0, 0]])
})
