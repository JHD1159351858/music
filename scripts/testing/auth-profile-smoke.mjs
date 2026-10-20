import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createPortProbe } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Real application HTTP handlers against an isolated database and a synthetic
// SSO protocol broker. This does not contact or verify the real Chaoxing service.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const port = Number(process.env.ZHIYIN_AUTH_PROFILE_SMOKE_PORT || 5005)
const brokerPort = Number(process.env.ZHIYIN_AUTH_PROFILE_BROKER_PORT || 5006)
for (const value of [port, brokerPort]) assert.ok(Number.isInteger(value) && value > 0 && value <= 65535 && ![5000, 5003].includes(value), 'Use isolated fixture ports')
assert.notEqual(port, brokerPort, 'Application and broker need distinct ports')
const base = `http://localhost:${port}`
const brokerBase = `http://127.0.0.1:${brokerPort}`
const keepService = process.argv.includes('--keep-service')
const sessionSecret = randomBytes(48).toString('base64url')
const brokerSecret = randomBytes(32).toString('base64url')
const teacherPassword = randomBytes(32).toString('base64url')
const identity = {
  uid: 'auth-profile-fixture-user', fid: 'auth-profile-fixture-school',
  name: '20260001', displayName: '林知音（验收）', orgName: '知音认证验收学院',
  roles: [{ roleId: 'fixture-student', roleName: '学生' }, { roleId: 'fixture-teacher', roleName: '教师' }],
  // Extra upstream fields must never appear in the application session response.
  upstream_token: 'synthetic-upstream-value', phone: 'synthetic-unlisted-field',
}
const tickets = new Map()
const evidence = { fixture: 'existing production build + isolated SQLite + local synthetic SSO broker; not real Chaoxing authentication', checks: [] }
const output = path.join(root, 'docs/verification/auth-profile-smoke')
let directory
let broker
let service
let startupError
let verifyCalls = 0
let successful = false

class CookieJar {
  values = new Map()
  update(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(';')[0]
      const separator = first.indexOf('=')
      const name = first.slice(0, separator)
      const value = first.slice(separator + 1)
      if (!value || /(?:^|;)\s*max-age=0(?:;|$)/i.test(cookie)) this.values.delete(name)
      else this.values.set(name, value)
    }
  }
  header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join('; ') }
  clone() { const result = new CookieJar(); result.values = new Map(this.values); return result }
}

function pass(description) { evidence.checks.push(description); console.log(`PASS ${evidence.checks.length}: ${description}`) }
async function ensureFreePort(value) {
  const probe = createPortProbe()
  const listening = once(probe, 'listening')
  probe.listen(value, '::')
  await listening
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
}
async function request(route, { jar, method = 'GET', body, status = 200 } = {}) {
  const url = new URL(route, base)
  assert.equal(url.origin, base, 'Application requests stay on the isolated fixture')
  const response = await fetch(url, {
    method, redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { ...(jar ? { cookie: jar.header() } : {}), ...(method !== 'GET' ? { origin: base } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  jar?.update(response)
  assert.equal(response.status, status, `${method} ${url.pathname}: unexpected HTTP status`)
  return response
}
async function session(jar) { return (await request('/api/auth/session', { jar })).json() }
async function startBroker() {
  broker = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', brokerBase)
      if (req.method === 'GET' && url.pathname === '/api/auth/chaoxing') {
        const returnTo = new URL(url.searchParams.get('return_to') || '')
        if (returnTo.origin !== base || returnTo.pathname !== '/api/auth/callback' || !returnTo.searchParams.get('state')) { res.writeHead(400); res.end(); return }
        const ticket = randomBytes(32).toString('base64url')
        tickets.set(ticket, { expiresAt: Date.now() + 120000, used: false })
        returnTo.searchParams.set('ticket', ticket)
        res.writeHead(302, { location: returnTo.toString(), 'cache-control': 'no-store' }); res.end(); return
      }
      if (req.method === 'POST' && url.pathname === '/api/sso/verify') {
        verifyCalls++
        let text = ''
        for await (const chunk of req) { text += String(chunk); if (text.length > 4096) throw new Error('Oversized fixture request') }
        const body = JSON.parse(text)
        if (body.secret !== brokerSecret) { res.writeHead(401); res.end(); return }
        const ticket = tickets.get(body.ticket)
        if (!ticket) { res.writeHead(400); res.end(); return }
        if (ticket.used || ticket.expiresAt <= Date.now()) { res.writeHead(410); res.end(); return }
        ticket.used = true
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(identity)); return
      }
      res.writeHead(404); res.end()
    } catch { res.writeHead(400); res.end('Synthetic broker request rejected') }
  })
  const listening = once(broker, 'listening')
  broker.listen(brokerPort, '127.0.0.1')
  await listening
}
async function startService() {
  startupError = undefined
  service = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ZHIYIN_STORAGE_MODE: 'local', ZHIYIN_DATA_DIR: directory, ZHIYIN_SESSION_SECRET: sessionSecret, ZHIYIN_STUDENT_TEST_MODE: 'false', ZHIYIN_TEACHER_SECURITY_PASSWORD: teacherPassword, CHAOXING_SSO_BASE_URL: brokerBase, CHAOXING_SSO_SHARED_SECRET: brokerSecret },
  })
  service.on('error', error => { startupError = error })
  // Drain output without exposing request URLs, tickets or cookies in evidence.
  service.stdout.on('data', () => {})
  service.stderr.on('data', () => {})
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (startupError || service.exitCode !== null) throw new Error('Owned fixture server failed to start')
    try { if ((await fetch(base + '/api/auth/session', { signal: AbortSignal.timeout(1000) })).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error('Owned fixture server readiness timed out')
}
async function stopService() {
  if (!service || service.exitCode !== null) { service = undefined; return }
  const owned = service
  const exited = once(owned, 'exit')
  owned.kill('SIGTERM')
  let timer
  try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned fixture server did not stop')), 10000); timer.unref() })]) }
  finally { clearTimeout(timer) }
  service = undefined
}
async function beginLogin(jar, role) {
  const response = await request('/api/auth/start', { jar, method: 'POST', body: { role } })
  const { url } = await response.json()
  const authorization = new URL(url)
  assert.ok(authorization.origin === brokerBase && authorization.pathname === '/api/auth/chaoxing', 'Application must use the documented broker entry')
  assert.ok(response.headers.getSetCookie().some(cookie => cookie.startsWith('zhiyin_login=') && !cookie.startsWith('zhiyin_login=;') && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie)), 'Login context needs an HttpOnly same-site cookie')
  const issued = await fetch(authorization, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  assert.equal(issued.status, 302)
  const callback = new URL(issued.headers.get('location'))
  assert.equal(callback.origin, base)
  assert.equal(callback.pathname, '/api/auth/callback')
  return callback
}
function assertProfile(user, role) {
  assert.ok(user && typeof user === 'object', 'A signed-in user must be returned')
  assert.deepEqual(Object.keys(user).sort(), ['auth_profile', 'class_name', 'display_name', 'id', 'nickname', 'role'])
  assert.equal(user.role, role)
  assert.equal(user.display_name, identity.displayName)
  assert.notEqual(user.nickname, user.display_name, 'Community nickname stays separate from the real name')
  assert.deepEqual(Object.keys(user.auth_profile).sort(), ['account_number', 'provider_fid', 'provider_uid', 'real_name', 'roles', 'school_name', 'verified_at'])
  const details = user.auth_profile
  assert.equal(details.real_name, identity.displayName)
  assert.equal(details.account_number, identity.name)
  assert.equal(details.school_name, identity.orgName)
  assert.equal(details.provider_uid, identity.uid)
  assert.equal(details.provider_fid, identity.fid)
  assert.deepEqual(details.roles, identity.roles)
  assert.ok(Number.isFinite(Date.parse(details.verified_at)), 'Verified-at should be a valid timestamp')
  assert.equal(user.class_name, null)
}
function assertSessionCookie(response, jar, role) {
  assert.ok(response.headers.getSetCookie().some(cookie => cookie.startsWith('zhiyin_session=') && !cookie.startsWith('zhiyin_session=;') && /HttpOnly/i.test(cookie)), 'Successful authentication creates an HttpOnly session')
  const value = jar.values.get('zhiyin_session')
  assert.ok(typeof value === 'string' && value.includes('.'))
  const payload = JSON.parse(Buffer.from(value.split('.')[0], 'base64url').toString('utf8'))
  assert.deepEqual(Object.keys(payload).sort(), ['expiresAt', 'kind', 'role', 'userId'])
  assert.equal(payload.kind, 'session')
  assert.equal(payload.role, role)
}

try {
  await ensureFreePort(port)
  await ensureFreePort(brokerPort)
  directory = await mkdtemp(path.join(tmpdir(), 'zhiyin-auth-profile-http-'))
  await mkdir(output, { recursive: true })
  await startBroker()
  await startService()
  assert.deepEqual(await session(), { user: null, teacherPending: false })
  await request('/api/auth/teacher', { method: 'POST', body: { password: teacherPassword }, status: 401 })
  await request('/api/teacher/overview', { status: 401 })
  pass('anonymous sessions expose no identity and cannot skip teacher authentication')

  const studentJar = new CookieJar()
  const studentCallback = await beginLogin(studentJar, 'student')
  const originalLogin = studentJar.clone()
  const invalidState = new URL(studentCallback)
  invalidState.searchParams.set('state', 'incorrect-fixture-state')
  const beforeInvalid = verifyCalls
  const invalid = await request(invalidState, { jar: studentJar.clone(), status: 303 })
  assert.equal(new URL(invalid.headers.get('location'), base).searchParams.get('auth_error'), 'expired')
  assert.equal(verifyCalls, beforeInvalid, 'State mismatch must be rejected before ticket verification')
  const studentResponse = await request(studentCallback, { jar: studentJar, status: 303 })
  assert.equal(new URL(studentResponse.headers.get('location'), base).pathname, '/practice')
  assertSessionCookie(studentResponse, studentJar, 'student')
  const studentSession = await session(studentJar)
  assertProfile(studentSession.user, 'student')
  assert.equal(studentSession.teacherPending, false)
  pass('real callback maps synthetic provider name, school and account fields into a whitelisted own-user session')

  const replay = await request(studentCallback, { jar: originalLogin, status: 303 })
  assert.equal(new URL(replay.headers.get('location'), base).searchParams.get('auth_error'), 'expired')
  assert.equal((await session(originalLogin)).user, null)
  await request('/api/teacher/overview', { jar: studentJar, status: 403 })
  const studentTeacherPage = await request('/teacher', { jar: studentJar, status: 307 })
  assert.equal(new URL(studentTeacherPage.headers.get('location'), base).pathname, '/practice')
  pass('one-use broker tickets cannot be replayed and student sessions cannot enter teacher management')

  const refreshed = await request('/api/auth/session', { jar: studentJar })
  assert.match(refreshed.headers.get('cache-control') || '', /private/)
  assert.match(refreshed.headers.get('cache-control') || '', /no-store/)
  assert.deepEqual((await refreshed.json()).user, studentSession.user)
  await stopService()
  await startService()
  assert.deepEqual((await session(studentJar)).user, studentSession.user)
  pass('verified identity survives refresh and process restart in the isolated persistent database')

  const teacherJar = new CookieJar()
  const teacherCallback = await beginLogin(teacherJar, 'teacher')
  const pendingResponse = await request(teacherCallback, { jar: teacherJar, status: 303 })
  const pendingLocation = new URL(pendingResponse.headers.get('location'), base)
  assert.equal(pendingLocation.pathname, '/')
  assert.equal(pendingLocation.searchParams.get('login'), 'teacher')
  assert.equal(pendingLocation.searchParams.get('next'), '/teacher')
  assert.ok(!teacherJar.values.has('zhiyin_session'), 'Teacher callback must not issue a full session before PIN verification')
  assert.deepEqual(await session(teacherJar), { user: null, teacherPending: true })
  await request('/api/teacher/overview', { jar: teacherJar, status: 401 })
  await request('/api/auth/teacher', { jar: teacherJar, method: 'POST', body: { password: 'incorrect-fixture-password', role: 'teacher', display_name: 'forged-name' }, status: 403 })
  assert.deepEqual(await session(teacherJar), { user: null, teacherPending: true })
  pass('teacher SSO remains pending and reveals no profile until the separate security password succeeds')

  const authorized = await request('/api/auth/teacher', { jar: teacherJar, method: 'POST', body: { password: teacherPassword, display_name: 'forged-name', auth_profile: { real_name: 'forged-name' } } })
  const authorization = await authorized.json()
  assert.equal(authorization.redirectTo, '/teacher')
  assertProfile(authorization.user, 'teacher')
  assertSessionCookie(authorized, teacherJar, 'teacher')
  assert.ok(!teacherJar.values.has('zhiyin_teacher'), 'Pending credential is cleared after successful PIN verification')
  assertProfile((await session(teacherJar)).user, 'teacher')
  await request('/api/teacher/overview', { jar: teacherJar })
  pass('teacher password creates the correct role session and client-supplied identity fields cannot replace verified data')

  await request('/api/auth/logout', { jar: teacherJar, method: 'POST' })
  assert.deepEqual(await session(teacherJar), { user: null, teacherPending: false })
  pass('logout clears the authenticated account and subsequent session responses contain no profile')

  const fixtureFile = path.join(directory, 'browser-fixtures.json')
  // Only synthetic fixture credentials live in this private temporary metadata.
  // No broker/session secret, cookie or real account data is written or printed.
  await writeFile(fixtureFile, JSON.stringify({ base, brokerBase, directory, pid: service.pid, teacherPassword, identity: { uid: identity.uid, fid: identity.fid, name: identity.name, displayName: identity.displayName, orgName: identity.orgName, roles: identity.roles }, realChaoxingLoginVerified: false }, null, 2), { mode: 0o600 })
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ ...evidence, realChaoxingLoginVerified: false }, null, 2))
  successful = true
  console.log(JSON.stringify({ passed: evidence.checks.length, output, realChaoxingLoginVerified: false }))
  if (keepService) {
    console.log(`KEEP_SERVICE ${base} fixture metadata: ${fixtureFile}`)
    await Promise.race([once(service, 'exit'), new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve) })])
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown fixture failure'
  console.error(message)
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ ...evidence, failed: true, error: message, realChaoxingLoginVerified: false }, null, 2))
  process.exitCode = 1
} finally {
  await stopService()
  if (broker?.listening) await new Promise((resolve, reject) => broker.close(error => error ? reject(error) : resolve()))
  if (directory) {
    const target = path.resolve(directory)
    assert.equal(path.dirname(target), path.resolve(tmpdir()))
    assert.ok(path.basename(target).startsWith('zhiyin-auth-profile-http-'))
    await rm(target, { recursive: true, force: true })
  }
  if (successful && keepService) console.log('Owned authentication fixture services stopped and temporary data removed')
}
