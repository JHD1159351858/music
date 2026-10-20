import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const base = 'http://localhost:5001'
const temporaryRoot = path.resolve(tmpdir())
const directory = await mkdtemp(path.join(temporaryRoot, 'zhiyin-http-persistence-'))
const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const otherStudent = 's0000000-0000-0000-0000-000000000002'
// Signed identities are isolated teaching regression fixtures; this does not test SSO.
const sessionSecret = randomBytes(48).toString('base64url')
const practiceId = randomUUID()
let service
let logs = ''
let checks = 0
let restartEvidence

function checked(description, assertion) {
  assertion()
  checks++
  console.log(`PASS ${checks}: ${description}`)
}

function userUrl(route, user = student) {
  const url = new URL(route, base)
  url.searchParams.set('user_id', user)
  return url
}

function fixtureCookie(userId = teacher) {
  assert.ok([teacher, student, otherStudent].includes(userId), 'Unknown regression fixture identity')
  const payload = Buffer.from(JSON.stringify({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student', expiresAt: Date.now() + 3600000 })).toString('base64url')
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  return `zhiyin_session=${payload}.${signature}`
}

async function api(route, { method = 'GET', body, status = 200 } = {}) {
  const url = new URL(route, base)
  const user = body?.user_id ?? url.searchParams.get('user_id') ?? teacher
  const headers = { Cookie: fixtureCookie(user) }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (!['GET', 'HEAD'].includes(method)) headers.Origin = base
  const response = await fetch(url, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  })
  const text = await response.text()
  assert.equal(response.status, status, `${method} ${route}: ${text}`)
  return text ? JSON.parse(text) : null
}

async function upload(bytes, name, type, user = teacher) {
  const form = new FormData()
  form.set('user_id', user)
  form.set('file', new File([bytes], name, { type }))
  const response = await fetch(new URL('/api/upload', base), { method: 'POST', headers: { Cookie: fixtureCookie(user), Origin: base }, body: form, signal: AbortSignal.timeout(10000) })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  assert.match(result.fileId, /^local:/)
  return result
}

async function readMedia(url, bytes, range, user = teacher) {
  const headers = { Cookie: fixtureCookie(user) }
  if (range) headers.Range = range
  const response = await fetch(new URL(url, base), { headers, signal: AbortSignal.timeout(10000) })
  assert.equal(response.status, range ? 206 : 200)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), range ? bytes.subarray(0, 8) : bytes)
  if (range) assert.equal(response.headers.get('content-range'), `bytes 0-7/${bytes.length}`)
}

async function ensurePortFree() {
  const probe = createServer()
  probe.listen(5001, '::')
  await once(probe, 'listening')
  probe.close()
  await once(probe, 'close')
}

async function startService() {
  logs = ''
  service = spawn(process.execPath, [path.join(workspace, 'node_modules/next/dist/bin/next'), 'start', '-p', '5001'], {
    cwd: workspace, env: { ...process.env, ZHIYIN_STORAGE_MODE: 'local', ZHIYIN_DATA_DIR: directory, ZHIYIN_SESSION_SECRET: sessionSecret, ZHIYIN_STUDENT_TEST_MODE: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  service.stdout.on('data', chunk => { logs = (logs + chunk.toString()).slice(-20000) })
  service.stderr.on('data', chunk => { logs = (logs + chunk.toString()).slice(-20000) })
  let spawnError
  service.on('error', error => { spawnError = error })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError
    if (service.exitCode !== null) throw new Error(`Next exited before readiness: ${logs}`)
    try {
      const response = await fetch(new URL('/api/auth/session', base), { signal: AbortSignal.timeout(2000) })
      if (response.status === 200) return service.pid
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Next readiness timed out: ${logs}`)
}

async function stopService() {
  if (!service || service.exitCode !== null) { service = undefined; return }
  const processToStop = service
  const exited = once(processToStop, 'exit')
  processToStop.kill('SIGTERM')
  await Promise.race([exited, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Next did not exit after SIGTERM')), 10000)
    timer.unref()
  })])
  service = undefined
}

function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length 63 >>\nstream\nBT /F1 16 Tf 20 120 Td (Local persistence score fixture) Tj ET\nendstream',
  ]
  let output = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output))
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, '0')} 00000 n \n`
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(output)
}

function wavFixture() {
  const bytes = Buffer.alloc(44 + 800)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(800, 40)
  return bytes
}

try {
  await ensurePortFree()
  const initialPid = await startService()
  console.log(`Started production Next PID ${initialPid}; isolated storage ${directory}`)
  const profiles = await api('/api/profiles')
  checked('persistent nickname identities initialize', () => {
    assert.equal(profiles.length, 3)
    assert.equal(profiles.find(profile => profile.id === teacher)?.role, 'teacher')
    assert.equal(profiles.filter(profile => profile.role === 'student').length, 2)
  })

  const classResult = await api('/api/profiles', { method: 'PATCH', body: { user_id: teacher, student_id: student, class_name: '本地联调班' } })
  checked('teacher maintains student class', () => assert.equal(classResult.class_name, '本地联调班'))
  const genre = await api('/api/genres', { method: 'POST', status: 201, body: { user_id: teacher, name: '教师确认联调曲风' } })
  checked('teacher records confirmed genre', () => assert.equal(genre.name, '教师确认联调曲风'))

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2i8AAAAASUVORK5CYII=', 'base64')
  const pdf = pdfFixture()
  const audio = wavFixture()
  const imageFile = await upload(png, '琴谱图.png', 'image/png')
  await readMedia(imageFile.url, png)
  checked('real PNG uploads and reads through signed URL', () => assert.ok(imageFile.url.includes('token=')))
  const pdfFile = await upload(pdf, '完整琴谱.pdf', 'application/pdf')
  await readMedia(pdfFile.url, pdf, 'bytes=0-7')
  checked('real PDF signed endpoint supports Range 206', () => assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4'))
  const audioFile = await upload(audio, '练习录音.wav', 'audio/wav', student)
  await readMedia(audioFile.url, audio, 'bytes=0-7', student)
  checked('WAV recording uploads and streams byte ranges', () => assert.equal(audioFile.type, 'audio/wav'))

  const scoreBody = { user_id: teacher, title: '持久化联调练习曲', composer: '联调作曲家', category: 'domestic', difficulty: 'beginner', genre_id: genre.id, tips: '放松手腕，保持节奏', file_id: pdfFile.fileId, image_url: pdfFile.url, file_name: pdfFile.name, file_type: pdfFile.type, published: true }
  const published = await api('/api/scores', { method: 'POST', status: 201, body: scoreBody })
  const draft = await api('/api/scores', { method: 'POST', status: 201, body: { ...scoreBody, title: '未发布联调琴谱', file_id: imageFile.fileId, image_url: imageFile.url, file_name: imageFile.name, file_type: imageFile.type, published: false } })
  checked('published and draft scores retain complete attributes', () => {
    assert.equal(published.published, true); assert.equal(draft.published, false); assert.equal(published.genre.name, genre.name)
  })
  const studentScores = await api(userUrl('/api/scores'))
  checked('student library filters unpublished scores', () => assert.deepEqual(studentScores.map(score => score.id), [published.id]))
  const teacherScores = await api(userUrl('/api/scores', teacher))
  checked('teacher library includes own draft', () => assert.equal(teacherScores.length, 2))
  await api(userUrl(`/api/scores/${draft.id}`), { status: 404 })
  checked('student cannot open draft by direct URL', () => assert.ok(true))
  const access = await api(userUrl(`/api/upload?file_id=${encodeURIComponent(pdfFile.fileId)}`))
  await readMedia(access.url, pdf)
  checked('published score can renew its signed file URL', () => assert.equal(access.fileId, pdfFile.fileId))

  await api('/api/practice-list', { method: 'POST', body: { user_id: student, score_id: published.id } })
  await api('/api/practice-list', { method: 'POST', body: { user_id: student, score_id: published.id } })
  const practiceList = await api(userUrl('/api/practice-list'))
  checked('practice list is idempotent and joins score plus genre', () => { assert.equal(practiceList.length, 1); assert.equal(practiceList[0].genre.id, genre.id) })

  const practiceBody = { id: practiceId, user_id: student, score_id: published.id, piece_title: published.title, source: 'teacher', started_at: new Date(Date.now() - 120000).toISOString(), duration_seconds: 120, pause_count: 1, audio_file_id: audioFile.fileId, audio_url: audioFile.url }
  await api('/api/practice', { method: 'POST', status: 201, body: practiceBody })
  await api('/api/practice', { method: 'POST', body: practiceBody })
  const records = await api(userUrl('/api/practice'))
  checked('recording practice persists once under fixed UUID', () => { assert.equal(records.length, 1); assert.equal(records[0].duration_seconds, 120); assert.equal(records[0].profiles.nickname, '抚琴听雨') })

  const goal = await api('/api/semester-goals', { method: 'POST', status: 201, body: { user_id: teacher, name: '联调学期', start_date: new Date(Date.now() - 86400000 * 7).toISOString().slice(0, 10), end_date: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10), target_minutes: 600 } })
  const progress = await api(userUrl('/api/semester-goals'))
  checked('semester target aggregates real persisted practice seconds', () => { assert.equal(progress[0].id, goal.id); assert.equal(progress[0].completed_seconds, 120) })
  const teacherProgress = await api(userUrl('/api/semester-goals', teacher))
  checked('teacher sees real progress and students with no practice', () => { assert.equal(teacherProgress[0].student_progress.length, 2); assert.equal(teacherProgress[0].student_progress.find(row => row.id === student).completed_seconds, 120); assert.equal(teacherProgress[0].student_progress.find(row => row.id === otherStudent).completed_seconds, 0) })

  const taskBody = { user_id: teacher, title: '指定曲目联调任务', description: '请练习并提交录音与记录', start_at: new Date(Date.now() - 3600000).toISOString(), end_at: new Date(Date.now() + 86400000).toISOString(), audience: 'classes', target_classes: ['本地联调班'], target_student_ids: [], score_mode: 'fixed', score_id: published.id, requirements: { audio: 'required', record: 'required', video: 'optional' } }
  const fixedTask = await api('/api/tasks', { method: 'POST', status: 201, body: taskBody })
  const randomTask = await api('/api/tasks', { method: 'POST', status: 201, body: { ...taskBody, title: '随机曲目联调任务', audience: 'all', target_classes: [], score_mode: 'random', score_id: null } })
  checked('teacher publishes fixed and random practice tasks', () => { assert.equal(fixedTask.score_mode, 'fixed'); assert.equal(randomTask.score_mode, 'random') })
  const tasks = await api(userUrl('/api/tasks'))
  const randomFirst = tasks.find(task => task.id === randomTask.id).assigned_score_id
  const tasksAgain = await api(userUrl('/api/tasks'))
  checked('random assignment remains stable between reads', () => { assert.equal(randomFirst, published.id); assert.equal(tasksAgain.find(task => task.id === randomTask.id).assigned_score_id, randomFirst) })
  const otherTasks = await api(userUrl('/api/tasks', otherStudent))
  checked('class task visibility respects maintained student class', () => assert.deepEqual(otherTasks.map(task => task.id), [randomTask.id]))

  await api(`/api/tasks/${fixedTask.id}/submissions`, { method: 'POST', status: 400, body: { user_id: student, record_text: '缺少必交录音' } })
  checked('submission checks required materials', () => assert.ok(true))
  await api(`/api/tasks/${randomTask.id}/submissions`, { method: 'POST', status: 403, body: { user_id: otherStudent, audio_file_id: audioFile.fileId, practice_record_id: practiceId } })
  checked('students cannot submit another student practice record', () => assert.ok(true))
  const submitted = await api(`/api/tasks/${fixedTask.id}/submissions`, { method: 'POST', body: { user_id: student, audio_file_id: audioFile.fileId, practice_record_id: practiceId, record_text: '已完成两分钟练习' } })
  const teacherTask = await api(userUrl(`/api/tasks/${fixedTask.id}`, teacher))
  checked('teacher receives submission roster and joined recording record', () => { assert.equal(teacherTask.students.length, 1); assert.equal(teacherTask.submissions[0].profiles.class_name, '本地联调班'); assert.equal(teacherTask.submissions[0].practice_records.duration_seconds, 120) })
  await api(userUrl(`/api/tasks/${fixedTask.id}`, otherStudent), { status: 403 })
  const otherTask = await api(userUrl(`/api/tasks/${randomTask.id}`, otherStudent))
  checked('student task detail isolates personal submitted content', () => assert.deepEqual(otherTask.submissions, []))

  const graded = await api(`/api/submissions/${submitted.id}`, { method: 'PATCH', body: { user_id: teacher, grade: 92, feedback: '节奏稳定，继续放松手腕' } })
  const studentTask = await api(userUrl(`/api/tasks/${fixedTask.id}`))
  checked('teacher grade and feedback return to the student', () => { assert.equal(graded.grade, 92); assert.equal(studentTask.submissions[0].feedback, graded.feedback) })
  const teacherAudioAccess = await api(userUrl(`/api/upload?file_id=${encodeURIComponent(audioFile.fileId)}`, teacher))
  await readMedia(teacherAudioAccess.url, audio)
  checked('teacher can play a task submission recording', () => assert.equal(teacherAudioAccess.fileId, audioFile.fileId))

  const post = await api('/api/posts', { method: 'POST', body: { user_id: student, title: '持久化练习提问', content: '如何保持节奏？', category: 'method', ask_teacher: true } })
  await api('/api/comments', { method: 'POST', body: { post_id: post.id, user_id: teacher, content: '可先使用慢速节拍器。' } })
  const liked = await api(`/api/posts/${post.id}/like`, { method: 'POST', body: { user_id: otherStudent } })
  const posts = await api('/api/posts?ask_teacher=true')
  const comments = await api(`/api/comments?post_id=${post.id}`)
  checked('community posts join profiles, comments and likes', () => { assert.equal(posts[0].profiles.nickname, '抚琴听雨'); assert.equal(posts[0].comments.length, 1); assert.equal(posts[0].post_likes[0].user_id, otherStudent); assert.equal(liked.like_count, 1); assert.equal(comments[0].profiles.role, 'teacher') })
  const stats = await api('/api/stats?period=week')
  checked('statistics aggregate persistent records and profile relations', () => { assert.equal(stats.overview.totalSeconds, 120); assert.equal(stats.overview.studentCount, 2); assert.equal(stats.ranking[0].nickname, '抚琴听雨') })
  const dbHeader = await readFile(path.join(directory, 'zhiyin.sqlite'))
  checked('HTTP data is backed by real SQLite on disk', () => assert.equal(dbHeader.subarray(0, 16).toString(), 'SQLite format 3\u0000'))

  const personalFile = await upload(png, '个人上传谱图.png', 'image/png', student)
  const personal = await api('/api/scores', { method: 'POST', status: 201, body: { user_id: student, title: '个人联调琴谱', composer: '自选作曲家', category: 'domestic', difficulty: 'beginner', file_id: personalFile.fileId, image_url: personalFile.url, file_type: 'image/png', published: true, target_classes: ['无权发布的班级'] } })
  const personalQueue = await api(userUrl('/api/practice-list'))
  checked('student score remains private and automatically enters the practice list', () => { assert.equal(personal.source, 'student'); assert.equal(personal.published, false); assert.deepEqual(personal.target_classes, []); assert.ok(personalQueue.some(score => score.id === personal.id)) })
  await api(userUrl(`/api/scores/${personal.id}`, teacher), { status: 404 })
  await api(userUrl(`/api/scores/${personal.id}`, otherStudent), { status: 404 })
  const privateRead = await fetch(new URL(personalFile.url, base), { headers: { Cookie: fixtureCookie(otherStudent) } })
  checked('personal score and even its signed file URL reject other users', () => assert.equal(privateRead.status, 404))
  await api(userUrl(`/api/practice/${practiceId}`), { method: 'DELETE', status: 409 })
  checked('submitted practice records are protected from deletion', () => assert.ok(true))
  const disposableFile = await upload(audio, '待删除录音.wav', 'audio/wav', student)
  const disposable = await api('/api/practice', { method: 'POST', status: 201, body: { user_id: student, piece_title: '临时练习', source: 'student', started_at: new Date(Date.now() - 10000).toISOString(), duration_seconds: 10, audio_file_id: disposableFile.fileId, audio_url: disposableFile.url } })
  await api(userUrl(`/api/practice/${disposable.id}`), { method: 'DELETE' })
  const removedAudio = await fetch(new URL(disposableFile.url, base), { headers: { Cookie: fixtureCookie(student) } })
  checked('deleting an unsubmitted practice also revokes its recording file', () => assert.equal(removedAudio.status, 404))
  await api(userUrl(`/api/scores/${personal.id}`), { method: 'DELETE' })

  const restrictedFile = await upload(png, '指定班级琴谱.png', 'image/png')
  const restricted = await api('/api/scores', { method: 'POST', status: 201, body: { ...scoreBody, title: '指定班级联调琴谱', file_id: restrictedFile.fileId, image_url: restrictedFile.url, file_type: 'image/png', target_classes: ['本地联调班'] } })
  await api(userUrl(`/api/scores/${restricted.id}`, student))
  await api(userUrl(`/api/scores/${restricted.id}`, otherStudent), { status: 404 })
  const restrictedRead = await fetch(new URL(restrictedFile.url, base), { headers: { Cookie: fixtureCookie(otherStudent) } })
  checked('class publication scope protects score details and signed media', () => assert.equal(restrictedRead.status, 404))
  await api(userUrl(`/api/scores/${restricted.id}`, teacher), { method: 'DELETE' })

  await stopService()
  await ensurePortFree()
  const restartedPid = await startService()
  checked('production Next fully restarts using a different process', () => assert.notEqual(restartedPid, initialPid))
  const reopenedProfiles = await api('/api/profiles')
  const reopenedTask = await api(userUrl(`/api/tasks/${fixedTask.id}`))
  const reopenedPractice = await api(userUrl('/api/practice'))
  checked('class, task, grade and recording record survive service restart', () => { assert.equal(reopenedProfiles.find(profile => profile.id === student).class_name, '本地联调班'); assert.equal(reopenedTask.submissions[0].id, submitted.id); assert.equal(reopenedTask.submissions[0].grade, 92); assert.equal(reopenedPractice[0].id, practiceId) })
  await readMedia(pdfFile.url, pdf, 'bytes=0-7')
  await readMedia(imageFile.url, png)
  await readMedia(audioFile.url, audio, 'bytes=0-7')
  checked('all pre-restart media signatures survive service restart', () => assert.ok(true))
  restartEvidence = { initialPid, restartedPid, taskId: fixedTask.id, submissionId: submitted.id, practiceId, gradeAfterRestart: reopenedTask.submissions[0].grade, previousSignedUrlsReadable: ['image/png', 'application/pdf', 'audio/wav'] }
  console.log(JSON.stringify({ passed: checks, production: true, database: 'SQLite', authentication: 'signed teaching regression fixtures; SSO not tested', serviceRestartVerified: true, restartEvidence }, null, 2))
} catch (error) {
  console.error(error)
  console.error('Production Next logs:', logs)
  process.exitCode = 1
} finally {
  await stopService()
  const resolved = path.resolve(directory)
  assert.equal(path.dirname(resolved), temporaryRoot, 'Refusing cleanup outside the system temporary directory')
  assert.ok(path.basename(resolved).startsWith('zhiyin-http-persistence-'), 'Refusing cleanup of an unrelated directory')
  await rm(resolved, { recursive: true, force: true })
}
