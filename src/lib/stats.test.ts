import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createLocalDatabaseClient } from './local-database'
import { GET as stats } from '../app/api/stats/route'

const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const otherStudent = 's0000000-0000-0000-0000-000000000002'
const environmentKeys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET'] as const
let before: Record<string, string | undefined>
let directory: string

interface StatsResponse {
  scope: 'personal' | 'class'
  dateRange: { from: string; to: string }
  classes: string[]
  overview: { totalSeconds: number; avgSeconds: number; activeStudents: number; participationRate: number; totalSessions: number; studentCount: number; practiceDays: number; avgSessionSeconds: number }
  ranking: { userId: string; nickname: string; seconds: number; count: number; days: number }[]
  trend: { date: string; seconds: number; count: number }[]
}

beforeEach(() => {
  before = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-stats-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-statistics-test-secret-at-least-32-characters'
})
afterEach(() => {
  for (const key of environmentKeys) {
    if (before[key] === undefined) delete process.env[key]
    else process.env[key] = before[key]
  }
  rmSync(directory, { recursive: true, force: true })
})

async function readStats(userId: string, query = ''): Promise<StatsResponse> {
  const role = userId === teacher ? 'teacher' : 'student'
  const token = await signAuthToken({ kind: 'session', userId, role, expiresAt: Date.now() + 60_000 })
  const response = await stats(new Request(`http://localhost:5000/api/stats?${query}`, { headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}` } }))
  assert.equal(response.status, 200, await response.clone().text())
  return await response.json() as StatsResponse
}

async function seedRecords() {
  const db = createLocalDatabaseClient()
  assert.equal((await db.from('profiles').update({ class_name: '钢琴一班' }).eq('id', student)).error, null)
  assert.equal((await db.from('profiles').update({ class_name: '钢琴二班' }).eq('id', otherStudent)).error, null)
  assert.equal((await db.from('profiles').insert({ id: 'inactive-student', nickname: '尚未练习', role: 'student', class_name: '钢琴一班' })).error, null)
  const records = [
    { id: 'current-1', user_id: student, practice_date: '2026-10-05', duration_seconds: 120 },
    { id: 'current-2', user_id: student, practice_date: '2026-10-05', duration_seconds: 180 },
    { id: 'sunday', user_id: student, practice_date: '2026-10-04', duration_seconds: 600 },
    { id: 'month', user_id: student, practice_date: '2026-10-01', duration_seconds: 900 },
    { id: 'previous-month', user_id: student, practice_date: '2026-09-30', duration_seconds: 1800 },
    { id: 'future', user_id: student, practice_date: '2026-10-06', duration_seconds: 9999 },
    { id: 'other-student', user_id: otherStudent, practice_date: '2026-10-05', duration_seconds: 60 },
    { id: 'teacher-record', user_id: teacher, practice_date: '2026-10-05', duration_seconds: 7200 },
  ]
  assert.equal((await db.from('practice_records').insert(records.map(record => ({ ...record, piece_title: '练习曲', source: 'teacher', started_at: `${record.practice_date}T08:00:00+08:00`, pause_count: 0 })))).error, null)
}

test('students receive only their own statistics and cannot use class filters to reveal peers', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-04T16:30:00Z').getTime() })
  await seedRecords()
  const data = await readStats(student, 'period=week&class_name=钢琴二班')
  assert.equal(data.scope, 'personal')
  assert.deepEqual(data.dateRange, { from: '2026-10-05', to: '2026-10-05' })
  assert.deepEqual(data.classes, [])
  assert.equal(data.overview.totalSeconds, 300)
  assert.equal(data.overview.totalSessions, 2)
  assert.equal(data.overview.practiceDays, 1)
  assert.equal(data.overview.avgSessionSeconds, 150)
  assert.deepEqual(data.ranking.map(row => row.userId), [student])
  assert.equal(data.trend.find(day => day.date === '10-04')?.seconds, 600)
  assert.equal(data.trend.find(day => day.date === '10-05')?.seconds, 300)
  assert.equal(data.trend.find(day => day.date === '10-05')?.count, 2)
})

test('teacher class statistics use the selected roster including inactive students and exclude teacher records', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T00:30:00Z').getTime() })
  await seedRecords()
  const data = await readStats(teacher, 'period=week&class_name=钢琴一班')
  assert.equal(data.scope, 'class')
  assert.deepEqual(data.classes, ['钢琴一班', '钢琴二班'])
  assert.equal(data.overview.totalSeconds, 300)
  assert.equal(data.overview.avgSeconds, 150)
  assert.equal(data.overview.studentCount, 2)
  assert.equal(data.overview.activeStudents, 1)
  assert.equal(data.overview.participationRate, 50)
  assert.deepEqual(data.ranking.map(row => [row.userId, row.seconds]), [[student, 300], ['inactive-student', 0]])
  const all = await readStats(teacher, 'period=week')
  assert.equal(all.overview.totalSeconds, 360)
  assert.equal(all.overview.activeStudents, 2)
  assert.equal(all.overview.studentCount, 3)
})

test('this month starts at the calendar month boundary in China time and excludes future records', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T00:30:00Z').getTime() })
  await seedRecords()
  const data = await readStats(student, 'period=month')
  assert.deepEqual(data.dateRange, { from: '2026-10-01', to: '2026-10-05' })
  assert.equal(data.overview.totalSeconds, 1800)
  assert.equal(data.overview.totalSessions, 4)
  assert.equal(data.overview.practiceDays, 3)
  assert.equal(data.overview.avgSessionSeconds, 450)
})

test('statistics read every record beyond the database default page size', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T00:30:00Z').getTime() })
  const db = createLocalDatabaseClient()
  const records = Array.from({ length: 1005 }, (_, index) => ({ id: `record-${String(index).padStart(4, '0')}`, user_id: student, piece_title: '练习曲', source: 'teacher', practice_date: '2026-10-05', started_at: '2026-10-05T08:00:00+08:00', duration_seconds: 10, pause_count: 0 }))
  assert.equal((await db.from('practice_records').insert(records)).error, null)
  const data = await readStats(student)
  assert.equal(data.overview.totalSessions, 1005)
  assert.equal(data.overview.totalSeconds, 10050)
})
