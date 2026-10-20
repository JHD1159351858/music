import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'
import { createSupabaseServer } from './supabase-server'
import { canReadScore, taskIsVisible } from './teaching-validation'
import { GET as listClasses, POST as createClass } from '../app/api/classes/route'
import { POST as joinClass } from '../app/api/classes/join/route'
import type { Classroom } from './class-types'

const teacherId = 't0000000-0000-0000-0000-000000000001'
const otherTeacher = '10000000-0000-0000-0000-000000000001'
const studentId = 's0000000-0000-0000-0000-000000000001'
const otherStudent = 's0000000-0000-0000-0000-000000000002'
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE'] as const
let oldEnvironment: Record<string, string | undefined>
let directory: string

beforeEach(async () => {
  oldEnvironment = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-classes-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'class-isolated-test-secret-at-least-32-characters'
  process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
  assert.equal((await createSupabaseServer().from('profiles').insert({ id: otherTeacher, nickname: '另一教师', role: 'teacher' })).error, null)
})
afterEach(() => {
  for (const key of keys) {
    if (oldEnvironment[key] === undefined) delete process.env[key]
    else process.env[key] = oldEnvironment[key]
  }
  rmSync(directory, { recursive: true, force: true })
})
async function request(route: string, body?: Record<string, unknown>, id?: string, role: 'teacher' | 'student' = 'teacher') {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (id) headers.set('cookie', `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId: id, role, expiresAt: Date.now() + 60_000 })}`)
  return new Request(`http://localhost:5000${route}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined })
}
async function classroom(name = '钢琴一班', id = teacherId): Promise<Classroom> {
  const response = await createClass(await request('/api/classes', { name }, id))
  assert.equal(response.status, 201)
  return await response.json() as Classroom
}
async function join(code: string, id = studentId, extra: Record<string, unknown> = {}) {
  return joinClass(await request('/api/classes/join', { code, ...extra }, id, 'student'))
}

test('classes APIs reject anonymous, student creation/list, and teacher joining', async () => {
  assert.equal((await listClasses(await request('/api/classes'))).status, 401)
  assert.equal((await createClass(await request('/api/classes', { name: '一班' }))).status, 401)
  assert.equal((await joinClass(await request('/api/classes/join', { code: 'ABCDEFGH' }))).status, 401)
  assert.equal((await createClass(await request('/api/classes', { name: '一班' }, studentId, 'student'))).status, 403)
  assert.equal((await listClasses(await request('/api/classes', undefined, studentId, 'student'))).status, 403)
  assert.equal((await joinClass(await request('/api/classes/join', { code: 'ABCDEFGH' }, teacherId))).status, 403)
})

test('created classes have persistent identifiers and teacher-owned lists without leaking another teacher code', async () => {
  const created = await classroom('  钢琴一班  ')
  assert.match(created.id, /^[0-9a-f-]{36}$/)
  assert.match(created.join_code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  assert.equal(created.name, '钢琴一班')
  assert.equal(created.teacher_id, teacherId)
  assert.equal(created.student_count, 0)
  await classroom('钢琴二班', otherTeacher)
  const response = await listClasses(await request('/api/classes', undefined, teacherId))
  const rows = await response.json() as Classroom[]
  assert.deepEqual(rows.map(row => row.id), [created.id])
  const persisted = await createSupabaseServer().from('classes').select('*').eq('id', created.id).single()
  assert.equal(persisted.error, null)
  assert.equal(persisted.data?.join_code, created.join_code)
})

test('name validation and database uniqueness prevent duplicate names and codes', async () => {
  const created = await classroom()
  for (const name of ['', '   ', 'a'.repeat(101)]) assert.equal((await createClass(await request('/api/classes', { name }, teacherId))).status, 400)
  assert.equal((await createClass(await request('/api/classes', { name: created.name }, otherTeacher))).status, 409)
  assert.equal((await createSupabaseServer().from('classes').insert({ name: '新班', join_code: created.join_code, teacher_id: teacherId })).error?.code, '23505')
  assert.equal((await createSupabaseServer().from('classes').insert({ name: created.name, join_code: 'ABCDEFGH', teacher_id: otherTeacher })).error?.code, '23505')
})

test('forged body/query identity is refused and ownership only comes from the signed session', async () => {
  const created = await classroom()
  assert.equal((await createClass(await request('/api/classes', { name: '伪造', user_id: otherTeacher }, teacherId))).status, 403)
  assert.equal((await listClasses(await request(`/api/classes?user_id=${otherTeacher}`, undefined, teacherId))).status, 403)
  assert.equal((await join(created.join_code, studentId, { user_id: otherStudent })).status, 403)
  const response = await createClass(await request('/api/classes', { name: '本人归属', teacher_id: otherTeacher, id: 'fake', join_code: 'ZZZZZZZZ' }, teacherId))
  assert.equal(response.status, 201)
  const row = await response.json() as Classroom
  assert.equal(row.teacher_id, teacherId)
  assert.notEqual(row.id, 'fake')
  assert.notEqual(row.join_code, 'ZZZZZZZZ')
})

test('invalid code does not change student and normalized codes join idempotently or switch class', async () => {
  const first = await classroom()
  const second = await classroom('钢琴二班')
  const identity = { real_name: '认证姓名', class_name: '认证来源班级' }
  assert.equal((await createSupabaseServer().from('auth_identities').insert({ id: studentId, details: identity })).error, null)
  assert.equal((await join('ZZZZZZZZ')).status, 404)
  for (const code of ['', 'bad-code', 'AAAA']) assert.equal((await join(code)).status, 400)
  let profile = await createSupabaseServer().from('profiles').select('class_name,role,nickname').eq('id', studentId).single()
  assert.equal(profile.data?.class_name, null)
  const before = profile.data
  const joined = await join(`  ${first.join_code.toLowerCase()}  `)
  assert.equal(joined.status, 200)
  assert.deepEqual(await joined.json(), { class: { id: first.id, name: first.name } })
  assert.equal((await join(first.join_code)).status, 200)
  let listed = await listClasses(await request('/api/classes', undefined, teacherId))
  assert.equal((await listed.json() as Classroom[]).find(row => row.id === first.id)?.student_count, 1)
  assert.equal((await join(second.join_code)).status, 200)
  profile = await createSupabaseServer().from('profiles').select('class_name,role,nickname').eq('id', studentId).single()
  assert.equal(profile.data?.class_name, second.name)
  assert.equal(profile.data?.role, before?.role)
  assert.equal(profile.data?.nickname, before?.nickname)
  listed = await listClasses(await request('/api/classes', undefined, teacherId))
  const rows = await listed.json() as Classroom[]
  assert.equal(rows.find(row => row.id === first.id)?.student_count, 0)
  assert.equal(rows.find(row => row.id === second.id)?.student_count, 1)
  assert.equal((await createSupabaseServer().from('profiles').select('class_name').eq('id', otherStudent).single()).data?.class_name, null)
  assert.deepEqual((await createSupabaseServer().from('auth_identities').select('details').eq('id', studentId).single()).data?.details, identity)
})

test('legacy class_name memberships are counted and joining still matches existing tasks and published scores', async () => {
  assert.equal((await createSupabaseServer().from('profiles').update({ class_name: '既有班级' }).eq('id', otherStudent)).error, null)
  const created = await classroom('既有班级')
  assert.equal(created.student_count, 1)
  assert.equal((await join(created.join_code)).status, 200)
  const student = { id: studentId, role: 'student', class_name: created.name }
  assert.equal(taskIsVisible({ audience: 'classes', target_classes: [created.name], target_student_ids: [] }, student), true)
  assert.equal(canReadScore(student, { owner_id: teacherId, published: true, source: 'teacher', target_classes: [created.name] }), true)
  const response = await listClasses(await request('/api/classes', undefined, teacherId))
  assert.equal((await response.json() as Classroom[])[0].student_count, 2)
})

test('student counts include all rows beyond the remote default page size and exclude teachers', async () => {
  const created = await classroom()
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `page-student-${index}`, nickname: `学生${index}`, role: 'student', class_name: created.name }))
  assert.equal((await createSupabaseServer().from('profiles').insert(rows)).error, null)
  assert.equal((await createSupabaseServer().from('profiles').update({ class_name: created.name }).eq('id', teacherId)).error, null)
  const response = await listClasses(await request('/api/classes', undefined, teacherId))
  assert.equal((await response.json() as Classroom[])[0].student_count, 1001)
})
