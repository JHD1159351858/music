import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AUTH_SESSION_COOKIE, readAuthSession, readAuthToken, safeNextPath, signAuthToken, validRequestOrigin } from './auth-session'
import { teacherPasswordAllowed, verifyTeacherPassword } from './chaoxing-auth'

process.env.ZHIYIN_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'zhiyin-auth-'))
const directory = process.env.ZHIYIN_DATA_DIR
process.on('exit', () => rmSync(directory, { recursive: true, force: true }))

test('session rejects tampering, expiry, and tokens for another purpose', async () => {
  const payload = { kind: 'session' as const, userId: 'u1', role: 'student' as const, expiresAt: Date.now() + 60_000 }
  const token = await signAuthToken(payload)
  const request = (value: string) => new Request('http://localhost:5000/api/scores', { headers: { cookie: `${AUTH_SESSION_COOKIE}=${value}` } })
  assert.deepEqual(await readAuthSession(request(token)), { userId: 'u1', role: 'student', expiresAt: payload.expiresAt })
  assert.equal(await readAuthSession(request(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'))), null)
  assert.equal(await readAuthSession(request(await signAuthToken({ ...payload, expiresAt: Date.now() - 1 }))), null)
  assert.equal(await readAuthSession(request(await signAuthToken({ kind: 'teacher', userId: 'u1', role: 'teacher', next: '/tasks', expiresAt: payload.expiresAt }))), null)
  assert.equal(await readAuthToken(token, 'login'), null)
})

test('safe redirect allows internal pages and rejects external or encoded bypasses', () => {
  assert.equal(safeNextPath('/practice?view=queue'), '/practice?view=queue')
  for (const next of ['//evil.test', '/\\evil.test', '/%2f%2fevil.test', '/api/auth/logout', '/practice/../api/auth/logout', '/./api/test', '/%61pi/test', '/tasks\n', 'https://evil.test']) assert.equal(safeNextPath(next), '/practice')
})

test('temporary local testing uses only the student account and can be disabled', async () => {
  const beforeMode = process.env.ZHIYIN_STUDENT_TEST_MODE
  const beforeStorage = process.env.ZHIYIN_STORAGE_MODE
  const request = new Request('http://localhost:5000/api/scores')
  try {
    process.env.ZHIYIN_STUDENT_TEST_MODE = 'true'
    process.env.ZHIYIN_STORAGE_MODE = 'local'
    const teacherToken = await signAuthToken({ kind: 'session', userId: 'teacher', role: 'teacher', expiresAt: Date.now() + 60_000 })
    const session = await readAuthSession(new Request(request, { headers: { cookie: `${AUTH_SESSION_COOKIE}=${teacherToken}` } }))
    assert.equal(session?.userId, 's0000000-0000-0000-0000-000000000001')
    assert.equal(session?.role, 'student')
    process.env.ZHIYIN_STORAGE_MODE = 'supabase'
    assert.equal(await readAuthSession(request), null)
    process.env.ZHIYIN_STORAGE_MODE = 'local'
    process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
    assert.equal(await readAuthSession(request), null)
  } finally {
    if (beforeMode === undefined) delete process.env.ZHIYIN_STUDENT_TEST_MODE; else process.env.ZHIYIN_STUDENT_TEST_MODE = beforeMode
    if (beforeStorage === undefined) delete process.env.ZHIYIN_STORAGE_MODE; else process.env.ZHIYIN_STORAGE_MODE = beforeStorage
  }
})

test('an empty optional secret uses the persistent local signing key', async () => {
  const before = process.env.ZHIYIN_SESSION_SECRET
  process.env.ZHIYIN_SESSION_SECRET = ''
  try {
    const token = await signAuthToken({ kind: 'session', userId: 'empty-config', role: 'student', expiresAt: Date.now() + 60_000 })
    assert.equal((await readAuthToken(token, 'session'))?.userId, 'empty-config')
  } finally { if (before === undefined) delete process.env.ZHIYIN_SESSION_SECRET; else process.env.ZHIYIN_SESSION_SECRET = before }
})

test('cross-site and absent Origin fail state-changing requests', () => {
  assert.equal(validRequestOrigin(new Request('http://localhost:5000/api/auth/start', { headers: { origin: 'http://localhost:5000' } })), true)
  assert.equal(validRequestOrigin(new Request('http://localhost:5000/api/auth/start', { headers: { origin: 'https://evil.test' } })), false)
  assert.equal(validRequestOrigin(new Request('http://localhost:5000/api/auth/start')), false)
})

test('teacher security password has no default and rate-limits failed verified identities', () => {
  const before = process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD
  delete process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD
  assert.equal(verifyTeacherPassword('anything'), false)
  process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD = 'test-teacher-password-only'
  try {
    assert.equal(verifyTeacherPassword('wrong'), false)
    assert.equal(verifyTeacherPassword('test-teacher-password-only'), true)
    for (let attempt = 0; attempt < 5; attempt++) assert.equal(teacherPasswordAllowed('unique-test-user', 'wrong'), false)
    assert.equal(teacherPasswordAllowed('unique-test-user', 'test-teacher-password-only'), false)
    assert.equal(teacherPasswordAllowed('other-test-user', 'test-teacher-password-only'), true)
  } finally { if (before === undefined) delete process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD; else process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD = before }
})

