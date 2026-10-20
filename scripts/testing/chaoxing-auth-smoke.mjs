import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createPortProbe } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Integration fixture only: this broker simulates the documented protocol.
// Passing this script does not prove that the real Chaoxing service is configured.
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const origin = 'http://localhost:5002'
const temporaryRoot = path.resolve(tmpdir())
const directory = await mkdtemp(path.join(temporaryRoot, 'zhiyin-auth-http-'))
const sharedSecret = randomBytes(32).toString('base64url')
const teacherPassword = randomBytes(32).toString('base64url')
const tickets = new Map()
const serverIdentities = {
  student: { uid: 'synthetic-student', fid: 'synthetic-school', name: 'Synthetic private name', displayName: 'Synthetic private name', roles: [{ roleId: 'fixture-student', roleName: '学生' }] },
  teacher: { uid: 'synthetic-teacher', fid: 'synthetic-school', name: 'Synthetic private name', displayName: 'Synthetic private name', roles: [{ roleId: 'fixture-teacher', roleName: '教师' }] },
}
let identityToIssue = 'student'
let verifyCalls = 0
let service
let serviceError
let checks = 0
let broker
let brokerOrigin
let syntheticServiceStarted = false

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
  clone() { const clone = new CookieJar(); clone.values = new Map(this.values); return clone }
}
function passed(description) { checks++; console.log(`PASS ${checks}: ${description}`) }
async function request(route, { jar, method = 'GET', body, headers = {}, status = 200, withOrigin = true } = {}) {
  const response = await fetch(new URL(route, origin), {
    method, redirect: 'manual', signal: AbortSignal.timeout(10_000),
    headers: { ...(jar ? { cookie: jar.header() } : {}), ...(withOrigin && method !== 'GET' && method !== 'HEAD' ? { origin } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (jar) jar.update(response)
  assert.equal(response.status, status, `${method} ${new URL(route, origin).pathname}: unexpected status`)
  return response
}
async function ensurePortFree() {
  const probe = createPortProbe()
  const listening = once(probe, 'listening')
  probe.listen(5002, '::')
  await listening
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
}
async function startService(configured = true) {
  serviceError = undefined
  service = spawn(process.execPath, [path.join(workspace, 'node_modules/next/dist/bin/next'), 'start', '-p', '5002'], {
    cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ZHIYIN_STORAGE_MODE: 'local', ZHIYIN_DATA_DIR: directory,
      ZHIYIN_SESSION_SECRET: '', CHAOXING_SSO_BASE_URL: configured ? brokerOrigin : '',
      CHAOXING_SSO_SHARED_SECRET: configured ? sharedSecret : '', ZHIYIN_TEACHER_SECURITY_PASSWORD: configured ? teacherPassword : '',
    },
  })
  service.stdout.on('data', () => {})
  service.stderr.on('data', () => {})
  service.on('error', error => { serviceError = error })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (serviceError) throw new Error('Fixture Next process could not start')
    if (service.exitCode !== null) throw new Error('Fixture Next process exited before readiness')
    try {
      const response = await fetch(origin + '/api/auth/session', { signal: AbortSignal.timeout(1000) })
      if (response.status === 200) { syntheticServiceStarted = true; return }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error('Fixture Next readiness timed out')
}
async function stopService() {
  if (!service || service.exitCode !== null) { service = undefined; return }
  const target = service
  const exited = once(target, 'exit')
  target.kill('SIGTERM')
  let timer
  try {
    await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned Next process did not exit')), 10_000); timer.unref() })])
  } finally { clearTimeout(timer) }
  service = undefined
}
async function startBroker() {
  broker = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', brokerOrigin || 'http://127.0.0.1')
      if (req.method === 'GET' && url.pathname === '/api/auth/chaoxing') {
        const returnTo = new URL(url.searchParams.get('return_to') || '')
        assert.equal(returnTo.origin, origin)
        assert.equal(returnTo.pathname, '/api/auth/callback')
        assert.ok(returnTo.searchParams.get('state'))
        const ticket = randomBytes(32).toString('base64url')
        tickets.set(ticket, { identity: serverIdentities[identityToIssue], expiresAt: Date.now() + 120_000, used: false })
        returnTo.searchParams.set('ticket', ticket)
        res.writeHead(302, { location: returnTo.toString(), 'cache-control': 'no-store' }); res.end(); return
      }
      if (req.method === 'POST' && url.pathname === '/api/sso/verify') {
        verifyCalls++
        let text = ''
        for await (const chunk of req) { text += String(chunk); if (text.length > 4096) throw new Error('Oversized fixture request') }
        const body = JSON.parse(text)
        if (body.secret !== sharedSecret) { res.writeHead(401); res.end(); return }
        const ticket = tickets.get(body.ticket)
        if (!ticket) { res.writeHead(400); res.end(); return }
        if (ticket.used || ticket.expiresAt <= Date.now()) { res.writeHead(410); res.end(); return }
        ticket.used = true
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(ticket.identity)); return
      }
      res.writeHead(404); res.end()
    } catch { res.writeHead(500); res.end('Synthetic broker protocol failure') }
  })
  broker.listen(0, '127.0.0.1')
  await once(broker, 'listening')
  const address = broker.address()
  assert.ok(address && typeof address === 'object')
  brokerOrigin = `http://127.0.0.1:${address.port}`
}
async function beginLogin(jar, selectedRole, issuedRole, next = '/practice') {
  const response = await request('/api/auth/start', { jar, method: 'POST', body: { role: selectedRole, next } })
  const body = await response.json()
  const authorization = new URL(body.url)
  assert.ok(authorization.origin === brokerOrigin && authorization.pathname === '/api/auth/chaoxing', 'Start must use the documented broker endpoint')
  const contextCookie = response.headers.getSetCookie().find(cookie => cookie.startsWith('zhiyin_login=') && !cookie.startsWith('zhiyin_login=;'))
  assert.ok(contextCookie && /HttpOnly/i.test(contextCookie) && /SameSite=Lax/i.test(contextCookie), 'Login context must be an HttpOnly same-site cookie')
  assert.ok(!/Max-Age|Expires/i.test(contextCookie), 'Login cookie must not permanently remember the user')
  identityToIssue = issuedRole
  const brokerResponse = await fetch(authorization, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  assert.equal(brokerResponse.status, 302)
  const callbackUrl = brokerResponse.headers.get('location')
  assert.ok(callbackUrl && new URL(callbackUrl).origin === origin, 'Broker must return to the application callback')
  return callbackUrl
}

try {
  console.log('SYNTHETIC PROTOCOL FIXTURE: production Next + isolated SQLite + simulated broker; not a real Chaoxing login.')
  await ensurePortFree()
  await startBroker()
  await startService()
  const anonymous = new CookieJar()
  const initial = await (await request('/api/auth/session', { jar: anonymous })).json()
  assert.deepEqual(initial, { user: null, teacherPending: false })
  passed('fresh process defaults to anonymous without demo identity')
  const page = await request('/map', { jar: anonymous, status: 307 })
  const loginRedirect = new URL(page.headers.get('location'), origin)
  assert.ok(loginRedirect.pathname === '/' && loginRedirect.searchParams.get('login') === '1' && loginRedirect.searchParams.get('next') === '/map')
  passed('anonymous module access redirects to login and retains destination')
  for (const route of ['/api/profiles', '/api/stats', '/api/files/11111111-1111-4111-a111-111111111111', '/api/analysis', '/api/chat']) {
    await request(route, { jar: anonymous, method: ['/api/chat', '/api/analysis'].includes(route) ? 'POST' : 'GET', body: ['/api/chat', '/api/analysis'].includes(route) ? {} : undefined, status: 401 })
  }
  passed('all sensitive APIs, including media and AI, reject anonymous access')
  await request('/api/auth/start', { method: 'POST', body: { role: 'student' }, withOrigin: false, status: 403 })
  await request('/api/auth/start', { method: 'POST', body: { role: 'student' }, headers: { origin: 'https://cross-site.invalid' }, status: 403 })
  passed('login start rejects missing or cross-site Origin')
  const studentJar = new CookieJar()
  const studentCallback = await beginLogin(studentJar, 'student', 'student', '/map')
  const replayJar = studentJar.clone()
  const wrongState = new URL(studentCallback)
  wrongState.searchParams.set('state', randomBytes(32).toString('base64url'))
  const verifyBefore = verifyCalls
  const rejectedState = await request(wrongState, { jar: studentJar.clone(), status: 303 })
  assert.ok(new URL(rejectedState.headers.get('location')).searchParams.get('auth_error') === 'expired')
  assert.equal(verifyCalls, verifyBefore)
  passed('wrong callback state is rejected before the one-time ticket is consumed')
  const studentLogin = await request(studentCallback, { jar: studentJar, status: 303 })
  assert.equal(studentLogin.headers.get('location'), origin + '/map')
  assert.equal(verifyCalls, verifyBefore + 1)
  const sessionCookie = studentLogin.headers.getSetCookie().find(cookie => cookie.startsWith('zhiyin_session=') && !cookie.startsWith('zhiyin_session=;'))
  assert.ok(sessionCookie && /HttpOnly/i.test(sessionCookie) && /SameSite=Lax/i.test(sessionCookie) && !/Max-Age|Expires/i.test(sessionCookie))
  const studentState = await (await request('/api/auth/session', { jar: studentJar })).json()
  assert.ok(studentState.user?.role === 'student' && /^学生[0-9a-f]{8}$/.test(studentState.user.nickname))
  const students = await (await request('/api/profiles', { jar: studentJar })).json()
  assert.equal(students.length, 1)
  assert.equal(students[0].id, studentState.user.id)
  assert.ok(!JSON.stringify(students).includes('Synthetic private name'))
  passed('student callback creates a pseudonymous profile and a real server session')
  const replay = await request(studentCallback, { jar: replayJar, status: 303 })
  assert.ok(new URL(replay.headers.get('location')).searchParams.get('auth_error') === 'expired')
  assert.ok(!replayJar.values.has('zhiyin_session'))
  passed('one-time ticket replay cannot create another authenticated session')
  await request('/api/profiles?user_id=t0000000-0000-0000-0000-000000000001', { jar: studentJar, status: 403 })
  await request('/api/stats', { jar: studentJar, status: 403 })
  passed('student cannot forge teacher user_id or read teacher statistics')
  const tampered = studentJar.clone()
  const originalToken = tampered.values.get('zhiyin_session')
  tampered.values.set('zhiyin_session', originalToken.slice(0, -1) + (originalToken.endsWith('a') ? 'b' : 'a'))
  await request('/api/profiles', { jar: tampered, status: 401 })
  passed('tampered session cookie cannot authenticate an API request')
  const mismatchJar = new CookieJar()
  const mismatchCallback = await beginLogin(mismatchJar, 'teacher', 'student', '/tasks')
  const mismatch = await request(mismatchCallback, { jar: mismatchJar, status: 303 })
  assert.ok(new URL(mismatch.headers.get('location')).searchParams.get('login') === 'teacher')
  assert.ok(!mismatchJar.values.has('zhiyin_session') && mismatchJar.values.has('zhiyin_teacher'))
  await request('/api/profiles', { jar: mismatchJar, status: 401 })
  passed('verified student account selecting teacher still requires the teacher password')
  const teacherJar = new CookieJar()
  const teacherCallback = await beginLogin(teacherJar, 'teacher', 'teacher', '/tasks')
  const pending = await request(teacherCallback, { jar: teacherJar, status: 303 })
  assert.ok(new URL(pending.headers.get('location')).searchParams.get('login') === 'teacher')
  assert.ok(!teacherJar.values.has('zhiyin_session') && teacherJar.values.has('zhiyin_teacher'))
  assert.deepEqual(await (await request('/api/auth/session', { jar: teacherJar })).json(), { user: null, teacherPending: true })
  await request('/api/profiles', { jar: teacherJar, status: 401 })
  passed('verified teacher remains anonymous until the second security password succeeds')
  await request('/api/auth/teacher', { jar: teacherJar, method: 'POST', body: { password: 'synthetic-wrong-password' }, status: 403 })
  assert.ok(!teacherJar.values.has('zhiyin_session'))
  const authorizedTeacher = await request('/api/auth/teacher', { jar: teacherJar, method: 'POST', body: { password: teacherPassword } })
  const teacherBody = await authorizedTeacher.json()
  assert.ok(teacherBody.user?.role === 'teacher' && teacherBody.redirectTo === '/tasks')
  assert.ok(teacherJar.values.has('zhiyin_session') && !teacherJar.values.has('zhiyin_teacher'))
  const roster = await (await request('/api/profiles', { jar: teacherJar })).json()
  assert.ok(roster.some(profile => profile.id === studentState.user.id) && roster.some(profile => profile.id === teacherBody.user.id))
  await request('/api/stats', { jar: teacherJar })
  passed('correct teacher security password grants teacher APIs and roster access')
  await request('/api/profiles', { jar: teacherJar, method: 'PATCH', body: { user_id: teacherBody.user.id, student_id: studentState.user.id, class_name: 'Synthetic class' }, headers: { origin: 'https://cross-site.invalid' }, status: 403 })
  passed('protected business mutation rejects cross-site Origin despite a valid teacher session')
  await request('/api/auth/logout', { jar: teacherJar, method: 'POST', headers: { origin: 'https://cross-site.invalid' }, status: 403 })
  await request('/api/auth/logout', { jar: teacherJar, method: 'POST' })
  assert.ok(!teacherJar.values.has('zhiyin_session'))
  assert.deepEqual(await (await request('/api/auth/session', { jar: teacherJar })).json(), { user: null, teacherPending: false })
  await request('/api/stats', { jar: teacherJar, status: 401 })
  passed('logout clears authentication and cross-site logout is rejected')
  const teacherAsStudentJar = new CookieJar()
  const teacherAsStudent = await beginLogin(teacherAsStudentJar, 'student', 'teacher')
  const teacherMismatch = await request(teacherAsStudent, { jar: teacherAsStudentJar, status: 303 })
  assert.ok(new URL(teacherMismatch.headers.get('location')).searchParams.get('auth_error') === 'role')
  assert.ok(!teacherAsStudentJar.values.has('zhiyin_session'))
  passed('teacher selecting student entry cannot bypass the security password')
  await stopService()
  await startService(false)
  await request('/api/auth/start', { method: 'POST', body: { role: 'student' }, status: 503 })
  await request('/api/auth/start', { method: 'POST', body: { role: 'teacher' }, status: 503 })
  passed('a process without provider configuration fails closed for both roles')
  console.log(JSON.stringify({ passed: checks, productionNext: syntheticServiceStarted, isolatedDatabase: true, syntheticBrokerFixture: true, realChaoxingLoginVerified: false, primaryPort5000Untouched: true }, null, 2))
} catch (error) {
  console.error('Synthetic authentication smoke failed:', error instanceof Error ? error.message.replace(/(?:[A-Za-z0-9_-]{40,})/g, '[redacted]') : 'Unknown failure')
  process.exitCode = 1
} finally {
  await stopService()
  if (broker?.listening) await new Promise((resolve, reject) => broker.close(error => error ? reject(error) : resolve()))
  const resolved = path.resolve(directory)
  assert.ok(path.dirname(resolved) === temporaryRoot && path.basename(resolved).startsWith('zhiyin-auth-http-'), 'Refuse cleanup outside owned temporary fixture directory')
  await rm(resolved, { recursive: true, force: true })
}
