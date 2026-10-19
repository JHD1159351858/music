import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from '@/lib/auth-session'
import { createLocalDatabaseClient } from '@/lib/local-database'
import { GET } from './route'
import type { SemesterGoal } from '@/lib/teaching-types'

test('teacher goals show every student progress from actual records with semester boundaries', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zhiyin-semester-'))
  const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE'] as const
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'semester-progress-test-secret-at-least-32-characters'
  delete process.env.ZHIYIN_STUDENT_TEST_MODE
  try {
    const teacher = 't0000000-0000-0000-0000-000000000001'
    const student = 's0000000-0000-0000-0000-000000000001'
    const db = createLocalDatabaseClient()
    const goal = await db.from('semester_goals').insert({ name: '秋季目标', start_date: '2026-09-01', end_date: '2027-01-31', target_minutes: 600, teacher_id: teacher })
    assert.equal(goal.error, null)
    for (const [practice_date, duration_seconds] of [['2026-09-01', 3600], ['2026-08-31', 99999]] as const) {
      const record = await db.from('practice_records').insert({ user_id: student, piece_title: '练习曲', source: 'teacher', practice_date, started_at: `${practice_date}T01:00:00Z`, duration_seconds, pause_count: 0 })
      assert.equal(record.error, null)
    }
    const token = await signAuthToken({ kind: 'session', userId: teacher, role: 'teacher', expiresAt: Date.now() + 60_000 })
    const response = await GET(new Request('http://localhost/api/semester-goals', { headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}` } }))
    assert.equal(response.status, 200)
    const [data] = await response.json() as SemesterGoal[]
    assert.equal(data.student_progress?.length, 2)
    assert.equal(data.student_progress?.find(row => row.id === student)?.completed_seconds, 3600)
    assert.equal(data.student_progress?.find(row => row.id === student)?.progress_percent, 10)
    assert.equal(data.student_progress?.filter(row => row.id !== student)[0].completed_seconds, 0)
    assert.ok(data.student_progress?.every(row => row.expected_percent >= 0 && row.expected_percent <= 100))
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep))
    await rm(directory, { recursive: true, force: true })
  }
})
