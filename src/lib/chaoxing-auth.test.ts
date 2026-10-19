import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AUTH_LOGIN_COOKIE, AUTH_SESSION_COOKIE, AUTH_TEACHER_COOKIE, readAuthSession, signAuthToken } from './auth-session'
import { createSupabaseServer } from './supabase-server'
import { GET as callback } from '../app/api/auth/callback/route'
import { GET as session } from '../app/api/auth/session/route'
import { POST as start } from '../app/api/auth/start/route'
import { POST as teacher } from '../app/api/auth/teacher/route'
import { GET as roster } from '../app/api/profiles/route'
import type { SessionUser } from './auth-profile-types'

const origin = 'http://localhost:5000'
const jsonRequest = (endpoint: string, body: object, cookie = '') => new Request(origin + endpoint, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
function cookieValue(response: Response, name: string): string {
  const value = response.headers.getSetCookie().find(cookie => cookie.startsWith(`${name}=`) && !cookie.startsWith(`${name}=;`))
  return value?.split(';')[0] || ''
}

test('verified accounts use the selected classroom role and require the teacher password before granting teacher access', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'zhiyin-auth-routes-'))
  const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'CHAOXING_SSO_BASE_URL', 'CHAOXING_SSO_SHARED_SECRET', 'ZHIYIN_TEACHER_SECURITY_PASSWORD'] as const
  const before = keys.map(key => process.env[key])
  let verified = 0
  const broker = createServer(async (request, response) => {
    assert.equal(request.url, '/api/sso/verify')
    let body = ''
    for await (const chunk of request) body += String(chunk)
    const value: unknown = JSON.parse(body)
    assert.ok(value && typeof value === 'object' && 'ticket' in value && 'secret' in value)
    assert.equal(value.secret, 'test-broker-secret')
    verified++
    response.writeHead(200, { 'content-type': 'application/json' })
    const incomplete = value.ticket === 'number-fallback-ticket' || value.ticket === 'missing-info-ticket'
    response.end(JSON.stringify({ uid: incomplete ? 'incomplete-id' : value.ticket === 'teacher-ticket' ? 'teacher-id' : 'student-id', fid: 'institution', name: '20260001', displayName: value.ticket === 'number-fallback-ticket' ? '20260001' : value.ticket === 'missing-info-ticket' ? undefined : '认证姓名样例', orgName: incomplete ? undefined : '认证学校样例', phone: 'not-requested', accessToken: 'never-return-or-store', roles: [{ roleId: 'unknown', roleName: value.ticket === 'teacher-ticket' ? '教师' : '学生' }] }))
  })
  await new Promise<void>(resolve => broker.listen(0, '127.0.0.1', resolve))
  const address = broker.address()
  assert.ok(address && typeof address === 'object')
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.CHAOXING_SSO_BASE_URL = `http://127.0.0.1:${address.port}`
  process.env.CHAOXING_SSO_SHARED_SECRET = 'test-broker-secret'
  process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD = '123456'
  try {
    assert.deepEqual(await (await session(new Request(origin + '/api/auth/session'))).json(), { user: null, teacherPending: false })
    assert.equal((await teacher(jsonRequest('/api/auth/teacher', { password: '123456' }))).status, 401)
    const begin = await start(jsonRequest('/api/auth/start', { role: 'student', next: '/map' }))
    assert.equal(begin.status, 200)
    const data = await begin.json() as { url: string }
    const authorization = new URL(data.url)
    assert.equal(authorization.pathname, '/api/auth/chaoxing')
    const returnTo = new URL(authorization.searchParams.get('return_to') || '')
    returnTo.searchParams.set('ticket', 'student-ticket')
    const cookie = cookieValue(begin, AUTH_LOGIN_COOKIE)
    assert.match(cookie, /^zhiyin_login=.+/)
    const loginCookie = begin.headers.getSetCookie().find(value => value.startsWith(cookie)) || ''
    assert.match(loginCookie, /HttpOnly/i)
    assert.match(loginCookie, /SameSite=lax/i)
    assert.doesNotMatch(loginCookie, /Max-Age|Expires/i)
    const wrongState = new URL(returnTo)
    wrongState.searchParams.set('state', 'wrong')
    const rejected = await callback(new Request(wrongState, { headers: { cookie } }))
    assert.match(rejected.headers.get('location') || '', /auth_error=expired/)
    assert.equal(verified, 0)
    const success = await callback(new Request(returnTo, { headers: { cookie } }))
    assert.equal(success.headers.get('location'), origin + '/map')
    const studentCookie = cookieValue(success, AUTH_SESSION_COOKIE)
    const studentSession = await readAuthSession(new Request(origin, { headers: { cookie: studentCookie } }))
    assert.ok(studentSession)
    assert.equal(studentSession?.role, 'student')
    const visible = await (await session(new Request(origin, { headers: { cookie: studentCookie } }))).json() as { user: SessionUser }
    assert.match(visible.user.nickname, /^学生[0-9a-f]{8}$/)
    assert.equal(visible.user.display_name, '认证姓名样例')
    assert.equal(visible.user.auth_profile?.real_name, '认证姓名样例')
    assert.equal(visible.user.auth_profile?.account_number, '20260001')
    assert.equal(visible.user.auth_profile?.school_name, '认证学校样例')
    assert.equal(visible.user.auth_profile?.provider_uid, 'student-id')
    assert.equal(visible.user.auth_profile?.provider_fid, 'institution')
    assert.deepEqual(visible.user.auth_profile?.roles, [{ roleId: 'unknown', roleName: '学生' }])
    assert.ok(visible.user.auth_profile?.verified_at)
    assert.doesNotMatch(JSON.stringify(visible), /not-requested|never-return-or-store/)
    const publicRoster = await roster(new Request(origin + '/api/profiles', { headers: { cookie: studentCookie } }))
    assert.doesNotMatch(await publicRoster.text(), /认证姓名样例|20260001|认证学校样例|auth_profile/)
    const database = createSupabaseServer()
    const profileUpdate = await database.from('profiles').update({ class_name: '钢琴一班' }).eq('id', studentSession.userId)
    assert.equal(profileUpdate.error, null)
    const teacherBegin = await start(jsonRequest('/api/auth/start', { role: 'teacher', next: '/tasks' }))
    const teacherUrl = new URL(new URL((await teacherBegin.json() as { url: string }).url).searchParams.get('return_to') || '')
    teacherUrl.searchParams.set('ticket', 'student-ticket')
    const pendingResponse = await callback(new Request(teacherUrl, { headers: { cookie: cookieValue(teacherBegin, AUTH_LOGIN_COOKIE) } }))
    assert.match(pendingResponse.headers.get('location') || '', /login=teacher/)
    assert.equal(cookieValue(pendingResponse, AUTH_SESSION_COOKIE), '')
    const pending = cookieValue(pendingResponse, AUTH_TEACHER_COOKIE)
    assert.ok(pending)
    const pendingPayload = Buffer.from(pending.split('=')[1].split('.')[0], 'base64url').toString('utf8')
    assert.doesNotMatch(pendingPayload, /认证姓名样例|20260001|认证学校样例|student-id/)
    const pendingVisible = await (await session(new Request(origin, { headers: { cookie: pending } }))).json() as { user: unknown; teacherPending: boolean }
    assert.equal(pendingVisible.user, null)
    assert.equal(pendingVisible.teacherPending, true)
    assert.equal(await readAuthSession(new Request(origin, { headers: { cookie: pending } })), null)
    const expiredPending = await signAuthToken({ kind: 'teacher', userId: studentSession.userId, role: 'teacher', next: '/tasks', expiresAt: Date.now() - 1 })
    assert.equal((await teacher(jsonRequest('/api/auth/teacher', { password: '123456' }, `${AUTH_TEACHER_COOKIE}=${expiredPending}`))).status, 401)
    assert.equal((await teacher(jsonRequest('/api/auth/teacher', { password: 'wrong' }, pending))).status, 403)
    const beforeApproval = await (await session(new Request(origin, { headers: { cookie: studentCookie } }))).json() as { user: { role: string } | null }
    assert.equal(beforeApproval.user?.role, 'student')
    const teacherSuccess = await teacher(jsonRequest('/api/auth/teacher', { password: '123456' }, pending))
    assert.equal(teacherSuccess.status, 200)
    const approved = await teacherSuccess.clone().json() as { user: SessionUser }
    assert.equal(approved.user.display_name, '认证姓名样例')
    assert.equal(approved.user.auth_profile?.account_number, '20260001')
    const teacherCookie = cookieValue(teacherSuccess, AUTH_SESSION_COOKIE)
    const teacherSession = await readAuthSession(new Request(origin, { headers: { cookie: teacherCookie } }))
    assert.equal(teacherSession?.role, 'teacher')
    assert.equal(teacherSession?.userId, studentSession.userId)
    const preserved = await database.from('profiles').select('nickname,class_name').eq('id', studentSession.userId).single()
    assert.equal(preserved.data?.nickname, visible.user.nickname)
    assert.equal(preserved.data?.class_name, '钢琴一班')
    const persisted = await database.from('auth_identities').select('details').eq('id', studentSession.userId).single()
    assert.equal(persisted.error, null)
    assert.doesNotMatch(JSON.stringify(persisted.data), /not-requested|never-return-or-store/)
    const savedDetails = persisted.data?.details as Record<string, unknown>
    await database.from('auth_identities').update({ details: { ...savedDetails, internal_note: 'private-future-extension' } }).eq('id', studentSession.userId)
    const reloaded = await (await session(new Request(origin, { headers: { cookie: teacherCookie } }))).json() as { user: SessionUser }
    assert.equal(reloaded.user.display_name, '认证姓名样例')
    assert.equal(reloaded.user.class_name, '钢琴一班')
    assert.doesNotMatch(JSON.stringify(reloaded), /private-future-extension|internal_note/)
    assert.equal((await (await session(new Request(origin, { headers: { cookie: studentCookie } }))).json() as { user: unknown }).user, null)
    const switchBegin = await start(jsonRequest('/api/auth/start', { role: 'student', next: '/practice' }))
    const switchUrl = new URL(new URL((await switchBegin.json() as { url: string }).url).searchParams.get('return_to') || '')
    switchUrl.searchParams.set('ticket', 'student-ticket')
    const switched = await callback(new Request(switchUrl, { headers: { cookie: cookieValue(switchBegin, AUTH_LOGIN_COOKIE) } }))
    const switchedSession = await readAuthSession(new Request(origin, { headers: { cookie: cookieValue(switched, AUTH_SESSION_COOKIE) } }))
    assert.equal(switchedSession?.role, 'student')
    assert.equal(switchedSession?.userId, studentSession.userId)
    assert.equal((await (await session(new Request(origin, { headers: { cookie: teacherCookie } }))).json() as { user: unknown }).user, null)
    const studentClaim = await start(jsonRequest('/api/auth/start', { role: 'student' }))
    const studentEntryUrl = new URL(new URL((await studentClaim.json() as { url: string }).url).searchParams.get('return_to') || '')
    studentEntryUrl.searchParams.set('ticket', 'teacher-ticket')
    const studentEntry = await callback(new Request(studentEntryUrl, { headers: { cookie: cookieValue(studentClaim, AUTH_LOGIN_COOKIE) } }))
    assert.equal((await readAuthSession(new Request(origin, { headers: { cookie: cookieValue(studentEntry, AUTH_SESSION_COOKIE) } })))?.role, 'student')
    const teacherOwn = await (await session(new Request(origin + `/?user_id=${studentSession.userId}`, { headers: { cookie: cookieValue(studentEntry, AUTH_SESSION_COOKIE) } }))).json() as { user: SessionUser }
    assert.equal(teacherOwn.user.auth_profile?.provider_uid, 'teacher-id')
    assert.notEqual(teacherOwn.user.id, studentSession.userId)
    for (const ticket of ['number-fallback-ticket', 'missing-info-ticket']) {
      const incompleteStart = await start(jsonRequest('/api/auth/start', { role: 'student' }))
      const incompleteUrl = new URL(new URL((await incompleteStart.json() as { url: string }).url).searchParams.get('return_to') || '')
      incompleteUrl.searchParams.set('ticket', ticket)
      const incompleteResponse = await callback(new Request(incompleteUrl, { headers: { cookie: cookieValue(incompleteStart, AUTH_LOGIN_COOKIE) } }))
      const incompleteUser = await (await session(new Request(origin, { headers: { cookie: cookieValue(incompleteResponse, AUTH_SESSION_COOKIE) } }))).json() as { user: SessionUser }
      assert.equal(incompleteUser.user.auth_profile?.real_name, null)
      assert.equal(incompleteUser.user.auth_profile?.school_name, null)
      assert.equal(incompleteUser.user.auth_profile?.account_number, '20260001')
      assert.equal(incompleteUser.user.display_name, incompleteUser.user.nickname)
    }
    const seedToken = await signAuthToken({ kind: 'session', userId: 's0000000-0000-0000-0000-000000000001', role: 'student', expiresAt: Date.now() + 60_000 })
    const legacy = await (await session(new Request(origin, { headers: { cookie: `${AUTH_SESSION_COOKIE}=${seedToken}` } }))).json() as { user: SessionUser }
    assert.equal(legacy.user.auth_profile, null)
    assert.equal(legacy.user.display_name, legacy.user.nickname)
  } finally {
    await new Promise<void>((resolve, reject) => broker.close(error => error ? reject(error) : resolve()))
    keys.forEach((key, index) => { const value = before[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value })
    rmSync(directory, { recursive: true, force: true })
  }
})

test('missing provider configuration fails closed and cross-origin auth start is rejected', async () => {
  const previous = process.env.CHAOXING_SSO_BASE_URL
  delete process.env.CHAOXING_SSO_BASE_URL
  try {
    const missing = await start(jsonRequest('/api/auth/start', { role: 'student' }))
    assert.equal(missing.status, 503)
    assert.equal(cookieValue(missing, AUTH_SESSION_COOKIE), '')
    const crossSite = await start(new Request(origin + '/api/auth/start', { method: 'POST', headers: { origin: 'https://evil.test' }, body: JSON.stringify({ role: 'student' }) }))
    assert.equal(crossSite.status, 403)
  } finally { if (previous !== undefined) process.env.CHAOXING_SSO_BASE_URL = previous }
})
