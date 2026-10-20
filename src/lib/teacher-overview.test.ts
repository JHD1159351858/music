import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createSupabaseServer } from './supabase-server'
import { teacherOverview, teacherSubmissions } from './teacher-overview'
import { GET as overviewRoute } from '../app/api/teacher/overview/route'
import { GET as submissionsRoute } from '../app/api/teacher/submissions/route'

const teacher = 't0000000-0000-0000-0000-000000000001'
const studentA = 's0000000-0000-0000-0000-000000000001'
const studentB = 's0000000-0000-0000-0000-000000000002'
const now = new Date('2026-10-17T04:00:00Z')
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE'] as const
let oldEnvironment: Record<string, string | undefined>
let directory: string

beforeEach(async () => {
  oldEnvironment = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-teacher-admin-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'teacher-admin-isolated-test-secret-at-least-32-characters'
  process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
  const db = createSupabaseServer()
  assert.equal((await db.from('profiles').update({ class_name: '钢琴一班' }).eq('id', studentA)).error, null)
  assert.equal((await db.from('profiles').update({ class_name: '钢琴二班' }).eq('id', studentB)).error, null)
})
afterEach(() => {
  for (const key of keys) {
    if (oldEnvironment[key] === undefined) delete process.env[key]
    else process.env[key] = oldEnvironment[key]
  }
  rmSync(directory, { recursive: true, force: true })
})
async function goal(id = 'semester', values: Record<string, unknown> = {}) {
  assert.equal((await createSupabaseServer().from('semester_goals').insert({ id, name: id, start_date: '2026-10-01', end_date: '2026-10-31', target_minutes: 10, teacher_id: teacher, ...values })).error, null)
}
async function task(id: string, values: Record<string, unknown> = {}) {
  assert.equal((await createSupabaseServer().from('tasks').insert({ id, title: `任务${id}`, description: '练习', start_at: '2026-09-01T00:00:00Z', end_at: '2026-10-17T10:00:00Z', audience: 'all', target_classes: [], target_student_ids: [], score_mode: 'random', requirements: { audio: 'optional', record: 'optional', video: 'off' }, closed: false, teacher_id: teacher, ...values })).error, null)
}
async function record(id: string, userId: string, day: string, seconds: number, pauseCount = 0) {
  assert.equal((await createSupabaseServer().from('practice_records').insert({ id, user_id: userId, piece_title: '曲目', source: 'teacher', practice_date: day, started_at: `${day}T00:00:00Z`, duration_seconds: seconds, pause_count: pauseCount })).error, null)
}
async function submitted(id: string, taskId: string, studentId: string, values: Record<string, unknown> = {}) {
  assert.equal((await createSupabaseServer().from('submissions').insert({ id, task_id: taskId, student_id: studentId, submitted_at: '2026-10-17T10:00:00Z', ...values })).error, null)
}
function overview(query = '', date = now) { return teacherOverview(createSupabaseServer(), teacher, new URLSearchParams(query), date) }
function submissions(query = '') { return teacherSubmissions(createSupabaseServer(), teacher, new URLSearchParams(query)) }
async function request(path: string, userId?: string, role: 'teacher' | 'student' = 'teacher') {
  const headers = new Headers()
  if (userId) headers.set('cookie', `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId, role, expiresAt: Date.now() + 60_000 })}`)
  return new Request(`http://localhost:5000${path}`, { headers })
}

test('current semester defaults to latest own start date using the China calendar date', async () => {
  await goal('older')
  await goal('newer', { start_date: '2026-10-17' })
  await goal('future', { start_date: '2026-10-18' })
  assert.equal((await overview('', new Date('2026-10-16T17:00:00Z'))).selectedSemester?.id, 'newer')
  assert.equal((await overview('semester_id=older')).selectedSemester?.id, 'older')
  await goal('past', { start_date: '2026-09-01', end_date: '2026-09-30' })
  assert.equal((await overview('semester_id=past')).selectedSemester?.id, 'past')
})

test('semester totals include both date boundaries and count effective duration without subtracting pauses twice', async () => {
  await goal()
  await record('first', studentA, '2026-10-01', 600, 8)
  await record('last', studentB, '2026-10-31', 300)
  await record('before', studentA, '2026-09-30', 500)
  await record('after', studentA, '2026-11-01', 500)
  await record('teacher', teacher, '2026-10-10', 900)
  const result = await overview()
  assert.deepEqual(result.range, { from: '2026-10-01', to: '2026-10-31' })
  assert.equal(result.overview.totalSeconds, 900)
  assert.equal(result.overview.achievedStudentCount, 1)
  assert.equal(result.overview.achievementRate, 50)
  assert.equal(result.trend.length, 31)
  assert.equal(result.trend[0].seconds, 600)
  assert.equal(result.trend[30].seconds, 300)
})

test('submission rate counts task-student pairs for current audiences and treats grade zero as reviewed', async () => {
  await goal()
  await task('all')
  await task('class', { audience: 'classes', target_classes: ['钢琴一班'] })
  await task('specific', { audience: 'students', target_student_ids: [studentB] })
  await submitted('all-a', 'all', studentA)
  await submitted('class-a', 'class', studentA, { grade: 0, reviewed_at: '2026-10-17T11:00:00Z' })
  await submitted('class-former-b', 'class', studentB)
  await submitted('specific-b', 'specific', studentB)
  const result = await overview()
  assert.equal(result.overview.expectedCount, 4)
  assert.equal(result.overview.submittedCount, 3)
  assert.equal(result.overview.submissionRate, 75)
  assert.equal(result.overview.pendingReviewCount, 2)
  const filtered = await overview('class_name=钢琴一班')
  assert.equal(filtered.overview.expectedCount, 2)
  assert.equal(filtered.overview.submittedCount, 2)
  assert.equal(filtered.overview.submissionRate, 100)
  assert.equal(filtered.overview.pendingReviewCount, 1)
})

test('weekly and monthly totals change while achievement always uses the full selected semester', async () => {
  await goal('semester', { target_minutes: 25 })
  await record('earlier', studentA, '2026-10-01', 600)
  await record('week', studentA, '2026-10-16', 1200)
  const weekly = await overview('period=week')
  assert.deepEqual(weekly.range, { from: '2026-10-12', to: '2026-10-17' })
  assert.equal(weekly.overview.totalSeconds, 1200)
  assert.equal(weekly.studentProgress[0].completed_seconds, 1800)
  assert.equal(weekly.overview.achievementRate, 50)
  const monthly = await overview('period=month')
  assert.deepEqual(monthly.range, { from: '2026-10-01', to: '2026-10-17' })
  assert.equal(monthly.overview.totalSeconds, 1800)
})

test('task deadlines are grouped by China date rather than UTC or submission time', async () => {
  await goal()
  await task('first', { end_at: '2026-09-30T16:00:00Z' })
  await task('last', { end_at: '2026-10-31T15:59:59Z' })
  await task('next', { end_at: '2026-10-31T16:00:00Z' })
  await submitted('early-submission', 'next', studentA, { submitted_at: '2026-10-01T00:00:00Z' })
  const result = await overview()
  assert.deepEqual(result.taskProgress.map(value => value.id), ['first', 'last'])
  assert.equal(result.overview.expectedCount, 4)
  assert.equal(result.overview.submittedCount, 0)
})

test('class filter applies to global roster and records without narrowing class options', async () => {
  await goal()
  await record('a', studentA, '2026-10-16', 500)
  await record('b', studentB, '2026-10-16', 900)
  const result = await overview('class_name=钢琴二班')
  assert.equal(result.overview.studentCount, 1)
  assert.equal(result.overview.totalSeconds, 900)
  assert.deepEqual(new Set(result.classes), new Set(['钢琴一班', '钢琴二班']))
  assert.deepEqual(result.studentProgress.map(value => value.id), [studentB])
  assert.equal(result.classComparison.length, 1)
})

test('missing current semester returns a real empty state and zero students never produce invalid percentages', async () => {
  await goal('past', { end_date: '2026-10-10' })
  const result = await overview()
  assert.equal(result.selectedSemester, null)
  assert.deepEqual(result.range, { from: null, to: null })
  assert.equal(result.overview.studentCount, 2)
  assert.equal(result.overview.totalSeconds, 0)
  assert.deepEqual(result.trend, [])
  assert.deepEqual(result.studentProgress, [])
  const empty = await overview('semester_id=past&class_name=没有学生的班级')
  assert.equal(empty.overview.studentCount, 0)
  assert.equal(empty.overview.submissionRate, 0)
  assert.equal(empty.overview.achievementRate, 0)
})

test('foreign teacher goals, tasks and submissions stay outside responses', async () => {
  assert.equal((await createSupabaseServer().from('profiles').insert({ id: 'other-teacher', nickname: '另一个老师', role: 'teacher' })).error, null)
  await goal('foreign-goal', { teacher_id: 'other-teacher' })
  await task('foreign-task', { teacher_id: 'other-teacher' })
  await submitted('foreign-submission', 'foreign-task', studentA)
  assert.equal((await overview()).semesters.length, 0)
  assert.equal((await submissions()).total, 0)
  await assert.rejects(() => overview('semester_id=foreign-goal'), error => error instanceof Error && 'status' in error && error.status === 404)
  await assert.rejects(() => submissions('task_id=foreign-task'), error => error instanceof Error && 'status' in error && error.status === 404)
})

test('submission summaries support reviewed status, name/task search, class filters and stable pagination', async () => {
  await task('one')
  await task('two')
  await submitted('older', 'one', studentA, { submitted_at: '2026-10-15T01:00:00Z', audio_file_id: 'local:secret-audio', audio_url: 'https://example.invalid/private', record_text: '私有练习内容' })
  await submitted('zero-reviewed', 'one', studentB, { submitted_at: '2026-10-17T01:00:00Z', grade: 0, reviewed_at: '2026-10-17T02:00:00Z', video_file_id: 'private-video' })
  await submitted('newer', 'two', studentA, { submitted_at: '2026-10-16T01:00:00Z', grade: 50 })
  const result = await submissions('page=2&page_size=1')
  assert.equal(result.total, 3)
  assert.equal(result.page, 2)
  assert.equal(result.pageSize, 1)
  assert.equal(result.items[0].id, 'newer')
  assert.equal((await submissions('status=pending')).total, 2)
  const reviewed = await submissions('status=reviewed')
  assert.equal(reviewed.total, 1)
  assert.equal(reviewed.items[0].grade, 0)
  assert.equal(reviewed.items[0].has_video, true)
  assert.equal((await submissions('task_id=two')).total, 1)
  assert.equal((await submissions('q=任务one&class_name=钢琴一班')).total, 1)
  assert.equal((await submissions('q=抚琴')).total, 2)
  const privateSummary = (await submissions('page=3&page_size=1')).items[0]
  assert.equal(privateSummary.has_audio, true)
  assert.equal(privateSummary.has_record, true)
  assert.equal('audio_url' in privateSummary, false)
  assert.equal('record_text' in privateSummary, false)
  assert.equal('audio_file_id' in privateSummary, false)
  const clamped = await submissions('page=10')
  assert.equal(clamped.page, 1)
  assert.equal(clamped.items.length, 3)
})

test('pending review pagination clamps after the final second-page submission is reviewed', async () => {
  await task('pending')
  const db = createSupabaseServer()
  const students = Array.from({ length: 19 }, (_, index) => ({ id: `pending-student-${index}`, nickname: `学生${index}`, role: 'student' }))
  assert.equal((await db.from('profiles').insert(students)).error, null)
  const studentIds = [studentA, studentB, ...students.map(student => student.id)]
  assert.equal((await db.from('submissions').insert(studentIds.map((id, index) => ({ id: `pending-${index}`, task_id: 'pending', student_id: id, submitted_at: `2026-10-17T10:00:${String(index).padStart(2, '0')}Z` })))).error, null)
  const before = await submissions('status=pending&page=2')
  assert.equal(before.total, 21)
  assert.equal(before.page, 2)
  assert.equal(before.items.length, 1)
  assert.equal((await db.from('submissions').update({ grade: 0, reviewed_at: '2026-10-17T11:00:00Z' }).eq('id', before.items[0].id)).error, null)
  const after = await submissions('status=pending&page=2')
  assert.equal(after.total, 20)
  assert.equal(after.page, 1)
  assert.equal(after.items.length, 20)
})

test('all aggregate sources read past 1000 metadata rows', async () => {
  await goal()
  await task('bulk')
  const db = createSupabaseServer()
  const students = Array.from({ length: 1001 }, (_, index) => ({ id: `bulk-${String(index).padStart(4, '0')}`, nickname: `同学${index}`, role: 'student', class_name: '大班' }))
  assert.equal((await db.from('profiles').insert(students)).error, null)
  const records = students.map((student, index) => ({ id: `record-${index}`, user_id: student.id, piece_title: '曲目', source: 'teacher', practice_date: '2026-10-17', started_at: '2026-10-17T00:00:00Z', duration_seconds: 60, pause_count: 0 }))
  assert.equal((await db.from('practice_records').insert(records)).error, null)
  assert.equal((await db.from('submissions').insert(students.map((student, index) => ({ id: `submitted-${index}`, task_id: 'bulk', student_id: student.id })))).error, null)
  const result = await overview()
  assert.equal(result.overview.studentCount, 1003)
  assert.equal(result.overview.totalSeconds, 60060)
  assert.equal(result.overview.expectedCount, 1003)
  assert.equal(result.overview.submittedCount, 1001)
  const summaries = await submissions('page=51')
  assert.equal(summaries.total, 1001)
  assert.equal(summaries.items.length, 1)
})

test('teacher API routes enforce anonymous/student denial and validate query parameters', async () => {
  for (const [route, url] of [[overviewRoute, '/api/teacher/overview'], [submissionsRoute, '/api/teacher/submissions']] as const) {
    assert.equal((await route(await request(url))).status, 401)
    assert.equal((await route(await request(url, studentA, 'student'))).status, 403)
    assert.equal((await route(await request(url, teacher))).status, 200)
    assert.equal((await route(await request(`${url}?user_id=someone-else`, teacher))).status, 403)
  }
  for (const query of ['period=unknown', 'semester_id=one&semester_id=two']) assert.equal((await overviewRoute(await request(`/api/teacher/overview?${query}`, teacher))).status, 400)
  for (const query of ['page=0', 'page=1.5', 'page_size=101', 'status=wrong', 'page=1&page=2']) assert.equal((await submissionsRoute(await request(`/api/teacher/submissions?${query}`, teacher))).status, 400)
})
