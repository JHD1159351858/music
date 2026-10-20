import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// HTTP-only integration fixture. Uses the existing production build, an isolated
// database and its own port. No real SSO, user services or browser automation.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const port = Number(process.env.ZHIYIN_TEACHER_SMOKE_PORT || 5004)
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535 && ![5000, 5003].includes(port), 'Use an isolated test port, never 5000 or 5003')
const keepService = process.argv.includes('--keep-service')
const base = `http://localhost:${port}`
const directory = await mkdtemp(path.join(tmpdir(), 'zhiyin-teacher-admin-http-'))
const output = path.join(root, 'docs/verification/teacher-admin-smoke')
const secret = randomBytes(48).toString('base64url')
const teacherPassword = randomBytes(32).toString('base64url')
const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const other = 's0000000-0000-0000-0000-000000000002'
const fixtureClass = '后台验收钢琴班'
const scoreTitle = '教师后台发布验收曲'
const taskTitle = '教师后台班级验收任务'
const feedback = '已通过后台集中评阅，继续保持慢速连奏。'
const evidence = { fixture: 'production build + isolated SQLite + signed synthetic sessions; not real Chaoxing SSO', checks: [], assetsChecked: 0 }
let service
let logs = ''
let successful = false

function token(payload) {
  const value = Buffer.from(JSON.stringify({ ...payload, expiresAt: Date.now() + 3600000 })).toString('base64url')
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`
}
function session(userId) { return token({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student' }) }
function pass(description) { evidence.checks.push(description); console.log(`PASS ${evidence.checks.length}: ${description}`) }
async function api(route, { userId = teacher, method = 'GET', body, status = 200, cookie } = {}) {
  const response = await fetch(base + route, {
    method, redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { ...(cookie ? { cookie } : userId ? { cookie: `zhiyin_session=${session(userId)}` } : {}), origin: base, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  assert.equal(response.status, status, `${method} ${route}: ${await response.clone().text()}`)
  return response
}
async function json(route, options) { return (await api(route, options)).json() }
async function ensureFreePort() {
  const probe = createServer()
  probe.listen(port, '::')
  await once(probe, 'listening')
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
}
async function start() {
  service = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ZHIYIN_STORAGE_MODE: 'local', ZHIYIN_DATA_DIR: directory, ZHIYIN_SESSION_SECRET: secret, ZHIYIN_STUDENT_TEST_MODE: 'false', ZHIYIN_TEACHER_SECURITY_PASSWORD: teacherPassword, CHAOXING_SSO_BASE_URL: 'http://127.0.0.1:9', CHAOXING_SSO_SHARED_SECRET: randomBytes(32).toString('base64url') },
  })
  let startupError
  service.on('error', error => { startupError = error })
  service.stdout.on('data', chunk => { logs = (logs + String(chunk)).slice(-12000) })
  service.stderr.on('data', chunk => { logs = (logs + String(chunk)).slice(-12000) })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (startupError) throw startupError
    if (service.exitCode !== null) throw new Error(`Isolated server exited: ${logs}`)
    try { if ((await fetch(base + '/api/auth/session', { signal: AbortSignal.timeout(1000) })).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Isolated server readiness timed out: ${logs}`)
}
async function upload() {
  const form = new FormData()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2i8AAAAASUVORK5CYII=', 'base64')
  form.set('file', new File([png], '后台验收谱图.png', { type: 'image/png' }))
  form.set('user_id', teacher)
  const response = await fetch(base + '/api/upload', { method: 'POST', headers: { cookie: `zhiyin_session=${session(teacher)}`, origin: base }, body: form, signal: AbortSignal.timeout(10000) })
  assert.equal(response.status, 200)
  return response.json()
}
function chinaDate(value) { return new Date(value + 8 * 3600000).toISOString().slice(0, 10) }
async function task(scoreId, title) {
  return json('/api/tasks', { method: 'POST', status: 201, body: { user_id: teacher, title, description: '按课堂要求慢速练习，提交文字记录。', start_at: new Date(Date.now() - 3600000).toISOString(), end_at: new Date(Date.now() + 3600000).toISOString(), audience: 'classes', target_classes: [fixtureClass], target_student_ids: [], score_mode: 'fixed', score_id: scoreId, requirements: { audio: 'off', record: 'required', video: 'off' } } })
}
async function verifyAssets(route, userId = teacher) {
  const response = await api(route, { userId })
  const html = await response.text()
  const references = [...html.matchAll(/(?:src|href)="([^"<>]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
  const assets = [...new Set(references.filter(value => value.startsWith('/_next/static/') || value.startsWith('/images/') || value.startsWith('/avatars/')))]
  assert.ok(assets.some(value => /\.js(?:\?|$)/.test(value)), `${route} has no application scripts`)
  assert.ok(assets.some(value => /\.css(?:\?|$)/.test(value)), `${route} has no application styles`)
  for (const asset of assets) {
    const resource = await fetch(base + asset, { signal: AbortSignal.timeout(10000) })
    assert.equal(resource.status, 200, `Missing asset: ${asset}`)
    await resource.arrayBuffer()
    evidence.assetsChecked += 1
  }
}

try {
  await ensureFreePort()
  await mkdir(output, { recursive: true })
  await start()
  assert.equal((await json('/api/auth/session', { userId: null })).user, null)
  const anonymousTeacher = await api('/teacher', { userId: null, status: 307 })
  assert.equal(new URL(anonymousTeacher.headers.get('location'), base).searchParams.get('role'), 'teacher')
  const deniedTeacher = await api('/teacher', { userId: student, status: 307 })
  assert.equal(new URL(deniedTeacher.headers.get('location'), base).pathname, '/practice')
  for (const route of ['/api/teacher/overview', '/api/teacher/submissions']) {
    await api(route, { userId: null, status: 401 })
    await api(route, { userId: student, status: 403 })
    await api(`${route}?user_id=someone-else`, { status: 403 })
  }
  pass('anonymous, student and forged user_id requests cannot access teacher aggregation APIs')

  const startResponse = await api('/api/auth/start', { userId: null, method: 'POST', body: { role: 'teacher' } })
  const contextCookie = startResponse.headers.getSetCookie().find(value => value.startsWith('zhiyin_login=') && !value.startsWith('zhiyin_login=;'))
  assert.ok(contextCookie)
  const context = JSON.parse(Buffer.from(contextCookie.split(';')[0].slice('zhiyin_login='.length).split('.')[0], 'base64url').toString('utf8'))
  assert.equal(context.next, '/teacher')
  const pending = `zhiyin_teacher=${token({ kind: 'teacher', userId: teacher, role: 'teacher', next: '/teacher' })}`
  await api('/api/auth/teacher', { userId: null, cookie: pending, method: 'POST', body: { password: 'incorrect-fixture-password' }, status: 403 })
  const authenticated = await api('/api/auth/teacher', { userId: null, cookie: pending, method: 'POST', body: { password: teacherPassword } })
  assert.equal((await authenticated.json()).redirectTo, '/teacher')
  assert.ok(authenticated.headers.getSetCookie().some(value => value.startsWith('zhiyin_session=') && /HttpOnly/i.test(value)))
  pass('teacher login defaults to /teacher and the actual second-password endpoint creates an HttpOnly session')

  for (const [source, target] of [['/practice', '/teacher/scores'], ['/practice?tab=history', '/teacher/records'], ['/tasks', '/teacher/tasks'], ['/knowledge', '/teacher/knowledge'], ['/community', '/teacher/community'], ['/stats', '/teacher']]) {
    const response = await api(source, { status: 307 })
    assert.equal(new URL(response.headers.get('location'), base).pathname, target)
  }
  pass('legacy teacher entry links redirect into matching backend modules')

  await json('/api/profiles', { method: 'PATCH', body: { user_id: teacher, student_id: student, class_name: fixtureClass } })
  await json('/api/profiles', { method: 'PATCH', body: { user_id: teacher, student_id: other, class_name: '后台其他班' } })
  assert.equal((await json('/api/profiles')).find(profile => profile.id === student).class_name, fixtureClass)
  const genre = await json('/api/genres', { method: 'POST', body: { user_id: teacher, name: '后台验收曲风' }, status: 201 })
  const file = await upload()
  const score = await json('/api/scores', { method: 'POST', status: 201, body: { user_id: teacher, title: scoreTitle, composer: '验收作曲家', difficulty: 'beginner', category: 'domestic', genre_id: genre.id, tips: '慢练并保持连奏', published: false, target_classes: [fixtureClass], file_id: file.fileId, file_name: file.name, file_type: file.type } })
  assert.equal((await json('/api/scores', { userId: student })).length, 0)
  await json(`/api/scores/${score.id}`, { method: 'PATCH', body: { user_id: teacher, published: true } })
  assert.equal((await json('/api/scores', { userId: student })).length, 1)
  assert.equal((await json('/api/scores', { userId: other })).length, 0)
  pass('maintained class membership and score publication control the actual student library')

  const semester = await json('/api/semester-goals', { method: 'POST', status: 201, body: { user_id: teacher, name: '后台验收学期', start_date: chinaDate(Date.now() - 7 * 86400000), end_date: chinaDate(Date.now() + 30 * 86400000), target_minutes: 10 } })
  const practice = await json('/api/practice', { userId: student, method: 'POST', status: 201, body: { user_id: student, score_id: score.id, piece_title: scoreTitle, source: 'teacher', started_at: new Date(Date.now() - 3600000).toISOString(), duration_seconds: 600, pause_count: 3 } })
  const assignment = await task(score.id, taskTitle)
  assert.deepEqual(assignment.target_classes, [fixtureClass])
  assert.equal((await json('/api/tasks', { userId: student })).length, 1)
  assert.equal((await json('/api/tasks', { userId: other })).length, 0)
  const legacyDetail = await api(`/tasks/${assignment.id}`, { status: 307 })
  assert.equal(new URL(legacyDetail.headers.get('location'), base).pathname, `/teacher/tasks/${assignment.id}`)
  const submission = await json(`/api/tasks/${assignment.id}/submissions`, { userId: student, method: 'POST', body: { user_id: student, practice_record_id: practice.id, record_text: '本次慢练十分钟，注意声音连接与放松。' } })
  const summary = await json('/api/teacher/submissions')
  assert.equal(summary.total, 1)
  assert.equal(summary.items[0].has_record, true)
  for (const privateField of ['record_text', 'audio_url', 'video_url', 'audio_file_id', 'video_file_id']) assert.equal(privateField in summary.items[0], false)
  const aggregate = await json('/api/teacher/overview')
  assert.equal(aggregate.selectedSemester.id, semester.id)
  assert.equal(aggregate.overview.totalSeconds, 600)
  assert.equal(aggregate.overview.expectedCount, 1)
  assert.equal(aggregate.overview.submittedCount, 1)
  assert.equal(aggregate.overview.submissionRate, 100)
  assert.equal(aggregate.overview.pendingReviewCount, 1)
  assert.equal(aggregate.overview.achievementRate, 50)
  pass('class task assignment, student submission and practice records produce the expected overview statistics')

  await json(`/api/submissions/${submission.id}`, { method: 'PATCH', body: { user_id: teacher, grade: 0, feedback } })
  const reviewed = await json('/api/teacher/submissions?status=reviewed')
  assert.equal(reviewed.total, 1)
  assert.equal(reviewed.items[0].grade, 0)
  assert.ok(reviewed.items[0].reviewed_at)
  assert.equal((await json('/api/teacher/submissions?status=pending')).total, 0)
  assert.equal((await json('/api/teacher/overview')).overview.pendingReviewCount, 0)
  const ownDetail = await json(`/api/tasks/${assignment.id}`, { userId: student })
  assert.equal(ownDetail.submissions[0].grade, 0)
  assert.equal(ownDetail.submissions[0].feedback, feedback)
  pass('zero is a valid reviewed grade and the actual student detail receives the teacher feedback')

  const filtered = await json(`/api/teacher/overview?period=week&class_name=${encodeURIComponent(fixtureClass)}`)
  assert.equal(filtered.overview.studentCount, 1)
  assert.equal(filtered.overview.totalSeconds, 600)
  assert.equal(filtered.overview.achievementRate, 100)
  const submissionFiltered = await json(`/api/teacher/submissions?task_id=${assignment.id}&class_name=${encodeURIComponent(fixtureClass)}&q=${encodeURIComponent('抚琴')}&page=99&page_size=20`)
  assert.equal(submissionFiltered.total, 1)
  assert.equal(submissionFiltered.page, 1)
  await api('/api/teacher/overview?semester_id=nonexistent', { status: 404 })
  await api('/api/teacher/submissions?task_id=nonexistent', { status: 404 })
  await api('/api/teacher/submissions?page_size=101', { status: 400 })
  pass('class/search/status filtering, page clamping and invalid references are enforced by HTTP APIs')

  const pendingTask = await task(score.id, '后台浏览器待评阅验收任务')
  const pendingSubmission = await json(`/api/tasks/${pendingTask.id}/submissions`, { userId: student, method: 'POST', body: { user_id: student, record_text: '供浏览器实际评阅表单验收使用的独立材料。' } })
  for (const route of ['/teacher', '/teacher/scores', '/teacher/tasks', `/teacher/tasks/${assignment.id}`, '/teacher/reviews', '/teacher/students', '/teacher/semesters', '/teacher/knowledge', '/teacher/community', '/teacher/records', '/map']) await verifyAssets(route)
  await verifyAssets('/practice', student)
  pass('all management pages, the retained teaching tool and student library return loadable script/style/image resources')

  const fixtureFile = path.join(directory, 'browser-fixtures.json')
  // Deliberately never print token/password values. The parent can read this local
  // file internally for controlled CUA/CDP setup without changing product access.
  await writeFile(fixtureFile, JSON.stringify({ base, directory, pid: service.pid, teacherId: teacher, studentId: student, otherStudentId: other, fixtureClass, scoreId: score.id, taskId: assignment.id, submissionId: submission.id, pendingTaskId: pendingTask.id, pendingSubmissionId: pendingSubmission.id, teacherPassword, cookies: { teacher: [{ name: 'zhiyin_session', value: session(teacher), url: base, httpOnly: true, sameSite: 'Lax' }], student: [{ name: 'zhiyin_session', value: session(student), url: base, httpOnly: true, sameSite: 'Lax' }], teacherPending: [{ name: 'zhiyin_teacher', value: token({ kind: 'teacher', userId: teacher, role: 'teacher', next: '/teacher' }), url: base, httpOnly: true, sameSite: 'Lax' }] } }, null, 2), { mode: 0o600 })
  successful = true
  await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ passed: evidence.checks.length, assetsChecked: evidence.assetsChecked, output, realChaoxingLoginVerified: false }, null, 2))
  if (keepService) {
    console.log(`KEEP_SERVICE ${base} fixture metadata: ${fixtureFile}`)
    await Promise.race([once(service, 'exit'), new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve) })])
  }
} catch (error) {
  console.error(error)
  console.error('Owned fixture server logs:', logs)
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ ...evidence, failed: true, error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
} finally {
  if (service && service.exitCode === null) {
    const exited = once(service, 'exit')
    service.kill('SIGTERM')
    let timeout
    try { await Promise.race([exited, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Owned test server failed to stop')), 10000); timeout.unref() })]) }
    finally { clearTimeout(timeout) }
  }
  const target = path.resolve(directory)
  assert.equal(path.dirname(target), path.resolve(tmpdir()))
  assert.ok(path.basename(target).startsWith('zhiyin-teacher-admin-http-'))
  await rm(target, { recursive: true, force: true })
  if (keepService && successful) console.log('Owned fixture server stopped and temporary identities/data removed')
}
