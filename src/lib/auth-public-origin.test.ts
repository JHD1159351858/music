import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'
import { AUTH_LOGIN_COOKIE, AUTH_SESSION_COOKIE, clearAuthCookie, requestOrigin, setAuthCookie, signAuthToken, validRequestOrigin } from './auth-session'
import { POST as start } from '../app/api/auth/start/route'
import { GET as callback } from '../app/api/auth/callback/route'
import { POST as logout } from '../app/api/auth/logout/route'
import { proxy } from '../proxy'

const publicOrigin = 'https://piano.example.invalid'
const internalOrigin = 'http://localhost:5000'
const keys = ['ZHIYIN_PUBLIC_ORIGIN', 'ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE', 'CHAOXING_SSO_BASE_URL', 'CHAOXING_SSO_SHARED_SECRET', 'ZHIYIN_TEACHER_SECURITY_PASSWORD'] as const
let previous: Record<string, string | undefined>
let directory: string
beforeEach(() => {
  previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-public-origin-'))
  process.env.ZHIYIN_PUBLIC_ORIGIN = publicOrigin
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'public-origin-isolated-test-secret-at-least-32-characters'
  process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
})
afterEach(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key]
    else process.env[key] = previous[key]
  }
  rmSync(directory, { recursive: true, force: true })
})
function internalRequest(endpoint: string, origin = publicOrigin, body?: object) {
  return new Request(internalOrigin + endpoint, {
    method: 'POST', headers: { origin, host: 'piano.example.invalid', 'x-forwarded-proto': 'https', 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}
function cookie(response: Response, name: string): string {
  return response.headers.getSetCookie().find(value => value.startsWith(`${name}=`) && !value.startsWith(`${name}=;`))?.split(';')[0] ?? ''
}

test('configured HTTPS origin permits the proxy request and rejects wrong, absent, or spoofed origins', async () => {
  assert.equal(requestOrigin(internalRequest('/api/auth/logout')), publicOrigin)
  assert.equal(validRequestOrigin(internalRequest('/api/auth/logout')), true)
  assert.equal((await logout(internalRequest('/api/auth/logout'))).status, 200)
  assert.equal((await logout(internalRequest('/api/auth/logout', 'https://evil.invalid'))).status, 403)
  const spoofed = internalRequest('/api/auth/logout', 'https://evil.invalid')
  spoofed.headers.set('host', 'evil.invalid')
  spoofed.headers.set('x-forwarded-host', 'evil.invalid')
  spoofed.headers.set('x-forwarded-proto', 'https')
  assert.equal(validRequestOrigin(spoofed), false)
  assert.equal(validRequestOrigin(new Request(internalOrigin + '/api/auth/logout')), false)
})

test('cookie setting and clearing use the trusted origin rather than proxy headers', () => {
  const request = internalRequest('/api/auth/start')
  const response = NextResponse.json({})
  setAuthCookie(response, request, AUTH_SESSION_COOKIE, 'example')
  assert.match(response.headers.get('set-cookie') ?? '', /; Secure/i)
  clearAuthCookie(response, request, AUTH_SESSION_COOKIE)
  assert.match(response.headers.get('set-cookie') ?? '', /; Secure/i)
  process.env.ZHIYIN_PUBLIC_ORIGIN = 'http://192.0.2.10:5000'
  const httpResponse = NextResponse.json({})
  setAuthCookie(httpResponse, request, AUTH_SESSION_COOKIE, 'example')
  assert.doesNotMatch(httpResponse.headers.get('set-cookie') ?? '', /; Secure/i)
})

test('unset public origin preserves local behavior and never authorizes forwarded hosts', () => {
  delete process.env.ZHIYIN_PUBLIC_ORIGIN
  assert.equal(requestOrigin(internalRequest('/api/auth/start')), internalOrigin)
  assert.equal(validRequestOrigin(internalRequest('/api/auth/start', internalOrigin)), true)
  assert.equal(validRequestOrigin(internalRequest('/api/auth/start')), false)
  const response = NextResponse.json({})
  setAuthCookie(response, internalRequest('/api/auth/start'), AUTH_SESSION_COOKIE, 'example')
  assert.doesNotMatch(response.headers.get('set-cookie') ?? '', /; Secure/i)
})

test('invalid or explicitly empty public origin fails closed with a clear configuration error', () => {
  for (const configured of ['', ' ', 'ftp://piano.example.invalid', 'https://user:password@piano.example.invalid', 'https://piano.example.invalid/path', 'https://piano.example.invalid/a/..', 'https://piano.example.invalid?x=1', 'https://piano.example.invalid#fragment', 'not-a-url', 'https://piano.example.invalid\n']) {
    process.env.ZHIYIN_PUBLIC_ORIGIN = configured
    assert.throws(() => requestOrigin(internalRequest('/api/auth/start')), /ZHIYIN_PUBLIC_ORIGIN/)
    assert.throws(() => validRequestOrigin(internalRequest('/api/auth/start', internalOrigin)), /ZHIYIN_PUBLIC_ORIGIN/)
  }
})

test('proxy login and role redirects use the configured external origin', async () => {
  const response = await proxy(new NextRequest(internalOrigin + '/teacher?tab=overview', { headers: { host: 'untrusted.invalid', 'x-forwarded-host': 'untrusted.invalid' } }))
  const target = new URL(response.headers.get('location') ?? '')
  assert.equal(target.origin, publicOrigin)
  assert.equal(target.searchParams.get('next'), '/teacher?tab=overview')
  assert.equal(target.searchParams.get('role'), 'teacher')
  const practice = new URL((await proxy(new NextRequest(internalOrigin + '/practice/session/example'))).headers.get('location') ?? '')
  assert.equal(practice.origin, publicOrigin)
  assert.equal(practice.pathname, '/')
  assert.equal(practice.searchParams.get('login'), '1')
  assert.equal(practice.searchParams.get('next'), '/practice/session/example')
  const token = await signAuthToken({ kind: 'session', userId: 'teacher', role: 'teacher', expiresAt: Date.now() + 60_000 })
  const teacherRedirect = await proxy(new NextRequest(internalOrigin + '/tasks?create=1', { headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}` } }))
  assert.equal(teacherRedirect.headers.get('location'), publicOrigin + '/teacher/tasks?create=1')
})

test('SSO callback, success, and failure redirects remain on the configured public origin', async () => {
  const broker = createServer(async (request, response) => {
    assert.equal(request.url, '/api/sso/verify')
    for await (const chunk of request) assert.ok(chunk)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ uid: 'origin-student', fid: 'origin-school', name: '20260001', displayName: '验收样例', roles: [{ roleId: 'student', roleName: '学生' }] }))
  })
  await new Promise<void>(resolve => broker.listen(0, '127.0.0.1', resolve))
  const address = broker.address()
  assert.ok(address && typeof address === 'object')
  process.env.CHAOXING_SSO_BASE_URL = `http://127.0.0.1:${address.port}`
  process.env.CHAOXING_SSO_SHARED_SECRET = 'test-broker-secret'
  try {
    const started = await start(internalRequest('/api/auth/start', publicOrigin, { role: 'student', next: '/practice?tab=queue' }))
    assert.equal(started.status, 200)
    assert.match(started.headers.get('set-cookie') ?? '', /; Secure/i)
    const authorization = new URL((await started.json() as { url: string }).url)
    const returnTo = new URL(authorization.searchParams.get('return_to') ?? '')
    assert.equal(returnTo.origin, publicOrigin)
    assert.equal(returnTo.pathname, '/api/auth/callback')
    const internalCallback = new URL(returnTo.pathname + returnTo.search, internalOrigin)
    internalCallback.searchParams.set('ticket', 'verified-ticket')
    const success = await callback(new Request(internalCallback, { headers: { cookie: cookie(started, AUTH_LOGIN_COOKIE) } }))
    assert.equal(success.headers.get('location'), publicOrigin + '/practice?tab=queue')
    assert.match(success.headers.get('set-cookie') ?? '', /; Secure/i)
    const failure = await callback(new Request(internalOrigin + '/api/auth/callback?state=wrong'))
    const failureTarget = new URL(failure.headers.get('location') ?? '')
    assert.equal(failureTarget.origin, publicOrigin)
    assert.equal(failureTarget.searchParams.get('auth_error'), 'expired')
    process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD = 'public-origin-test-teacher-password'
    const teacherStart = await start(internalRequest('/api/auth/start', publicOrigin, { role: 'teacher' }))
    const teacherReturnTo = new URL(new URL((await teacherStart.json() as { url: string }).url).searchParams.get('return_to') ?? '')
    const teacherCallback = new URL(teacherReturnTo.pathname + teacherReturnTo.search, internalOrigin)
    teacherCallback.searchParams.set('ticket', 'teacher-ticket')
    const pending = await callback(new Request(teacherCallback, { headers: { cookie: cookie(teacherStart, AUTH_LOGIN_COOKIE) } }))
    const pendingTarget = new URL(pending.headers.get('location') ?? '')
    assert.equal(pendingTarget.origin, publicOrigin)
    assert.equal(pendingTarget.searchParams.get('login'), 'teacher')
  } finally {
    await new Promise<void>((resolve, reject) => broker.close(error => error ? reject(error) : resolve()))
  }
})
