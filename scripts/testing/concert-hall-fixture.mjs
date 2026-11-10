import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { createServer as createPortProbe } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

// Start only after the production build has finished:
// pnpm exec tsx scripts/testing/concert-hall-fixture.mjs
// Open the printed student/teacher URLs with Codex's built-in IAB.
// All business data and uploads are real local API records in an owned temp
// directory. Chat is a clearly labeled visual fixture, never a live model.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ports = { student: 5011, backend: 5012, teacher: 5013 }
const backend = `http://127.0.0.1:${ports.backend}`
const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const otherStudent = 's0000000-0000-0000-0000-000000000002'
const className = '钢琴一班 · 界面验收'
const secret = randomBytes(48).toString('base64url')
const sessions = new Map()
const proxies = []
const abort = new AbortController()
const boundaries = { data: 'isolated temporary SQLite/uploads, synthetic fixture users', authentication: 'valid signed fixture sessions; real SSO not tested', chat: 'local labeled SSE example; live model not tested', scorePages: 'synthetic staff-and-note PNGs; not the original works', scoreCovers: 'all three scores have cover_file_id=null', audio: 'self-authored 2-second silent PCM WAV, synthetic sample, not a student performance; no microphone or external API', sdk: 'three iframe SDK script URLs replaced with a local inert script', sameOrigin: 'entry Host/Origin validated, then mapped together to the backend origin; forwarded host retained' }
let directory
let service
let startupError
let logs = ''
let stopping = false
let ready = false
let summary = null

function session(userId) {
  if (!sessions.has(userId)) {
    const payload = Buffer.from(JSON.stringify({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student', expiresAt: Date.now() + 12 * 3600000 })).toString('base64url')
    sessions.set(userId, `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`)
  }
  return sessions.get(userId)
}
function safeError(error) {
  let message = String(error instanceof Error ? error.message : error).replaceAll(secret, '[redacted]')
  for (const token of sessions.values()) message = message.replaceAll(token, '[redacted]')
  return message.replace(/([?&]token=)[^&\s"']+/g, '$1[redacted]')
}
async function ensureFreePorts() {
  for (const port of Object.values(ports)) {
    const probe = createPortProbe()
    try { probe.listen(port, '::'); await once(probe, 'listening') }
    catch { throw new Error(`Required fixture port ${port} is occupied; no existing process was stopped`) }
    finally { if (probe.listening) await new Promise(resolve => probe.close(resolve)) }
  }
}
async function api(route, userId = teacher, method = 'GET', body, status = 200) {
  const response = await fetch(backend + route, {
    method, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]),
    headers: { cookie: `zhiyin_session=${session(userId)}`, origin: backend, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ ...body, user_id: userId }) : undefined,
  })
  if (response.status !== status) throw new Error(`${method} ${route} returned ${response.status}: ${safeError(await response.text())}`)
  return response.json()
}
async function startBackend() {
  const env = { ...process.env, NODE_ENV: 'production', CODER_PROJECT_ENV: 'PROD', ZHIYIN_STORAGE_MODE: 'local', ZHIYIN_DATA_DIR: directory, ZHIYIN_SESSION_SECRET: secret, ZHIYIN_PUBLIC_ORIGIN: backend, ZHIYIN_STUDENT_TEST_MODE: 'false', ZHIYIN_TEACHER_SECURITY_PASSWORD: randomBytes(32).toString('base64url'), CHAOXING_SSO_BASE_URL: 'http://127.0.0.1:9', CHAOXING_SSO_SHARED_SECRET: randomBytes(32).toString('base64url'), CODER_CODING_API_KEY: 'local-visual-fixture-only', CODER_CODING_MODEL_API_KEY: 'local-visual-fixture-only', CODER_CODING_BASE_URL: 'http://127.0.0.1:9', CODER_CODING_MODEL_BASE_URL: 'http://127.0.0.1:9', NO_PROXY: '127.0.0.1,localhost,::1' }
  service = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(ports.backend)], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  service.on('error', error => { startupError = error })
  service.stdout.on('data', chunk => { logs = (logs + String(chunk)).slice(-12000) })
  service.stderr.on('data', chunk => { logs = (logs + String(chunk)).slice(-12000) })
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    abort.signal.throwIfAborted()
    if (startupError) throw startupError
    if (service.exitCode !== null) throw new Error(`Owned Next fixture exited: ${safeError(logs)}`)
    try { if ((await fetch(backend + '/api/auth/session', { signal: AbortSignal.timeout(1000) })).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Owned Next fixture readiness timed out: ${safeError(logs)}`)
}

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) {
    value ^= byte
    for (let bit = 0; bit < 8; bit++) value = value >>> 1 ^ (value & 1 ? 0xedb88320 : 0)
  }
  return (value ^ 0xffffffff) >>> 0
}
function pngChunk(name, data) {
  const type = Buffer.from(name)
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([type, data])))
  return Buffer.concat([length, type, data, checksum])
}
function scorePng(variant) {
  const width = 900, height = 1150
  const pixels = Buffer.alloc(width * height * 3, 248)
  function dot(x, y, color = [42, 36, 28]) {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = (y * width + x) * 3
    pixels.set(color, index)
  }
  function rectangle(x, y, w, h, color) { for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) dot(px, py, color) }
  const letters = { L: ['10000','10000','10000','10000','10000','10000','11111'], O: ['01110','10001','10001','10001','10001','10001','01110'], C: ['01111','10000','10000','10000','10000','10000','01111'], A: ['01110','10001','10001','11111','10001','10001','10001'], F: ['11111','10000','10000','11110','10000','10000','10000'], I: ['11111','00100','00100','00100','00100','00100','11111'], X: ['10001','10001','01010','00100','01010','10001','10001'], T: ['11111','00100','00100','00100','00100','00100','00100'], U: ['10001','10001','10001','10001','10001','10001','01110'], R: ['11110','10001','10001','11110','10100','10010','10001'], E: ['11111','10000','10000','11110','10000','10000','11111'] }
  for (const [index, character] of [...'LOCAL FIXTURE'].entries()) for (const [y, row] of (letters[character] ?? []).entries()) for (const [x, bit] of [...row].entries()) if (bit === '1') rectangle(115 + index * 52 + x * 7, 65 + y * 7, 7, 7)
  rectangle(80, 145, 740, 2, [160, 137, 102])
  for (let system = 0; system < 4; system++) {
    const staff = 235 + system * 210
    for (let line = 0; line < 5; line++) rectangle(85, staff + line * 13, 730, 2)
    for (let bar = 0; bar < 5; bar++) rectangle(85 + bar * 182, staff, 2, 54)
    for (let note = 0; note < 12; note++) {
      const x = 125 + note * 57, y = staff + 46 - ((note + system + variant) % 7) * 6
      for (let py = -7; py <= 7; py++) for (let px = -10; px <= 10; px++) if (px * px / 100 + py * py / 49 <= 1) dot(x + px, y + py)
      rectangle(x + 8, y - 42, 2, 43)
    }
  }
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let row = 0; row < height; row++) pixels.copy(raw, row * (width * 3 + 1) + 1, row * width * 3, (row + 1) * width * 3)
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
}
async function uploadSheet(index, title) {
  const form = new FormData()
  form.set('user_id', teacher)
  form.set('file', new File([scorePng(index)], `界面验收合成谱图-${title}.png`, { type: 'image/png' }))
  const response = await fetch(backend + '/api/upload', { method: 'POST', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]), headers: { cookie: `zhiyin_session=${session(teacher)}`, origin: backend }, body: form })
  if (!response.ok) throw new Error(`Fixture score upload failed: ${response.status}`)
  return response.json()
}
async function uploadSilentAudio() {
  const sampleRate = 16000, seconds = 2, channels = 1, bytesPerSample = 2
  const dataBytes = sampleRate * seconds * channels * bytesPerSample
  const wav = Buffer.alloc(44 + dataBytes)
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVE', 8)
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(channels, 22); wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  wav.writeUInt16LE(channels * bytesPerSample, 32); wav.writeUInt16LE(bytesPerSample * 8, 34)
  wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40)
  const form = new FormData()
  form.set('user_id', student)
  form.set('file', new File([wav], '合成静音样本-2秒-非真实演奏.wav', { type: 'audio/wav' }))
  const response = await fetch(backend + '/api/upload', { method: 'POST', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]), headers: { cookie: `zhiyin_session=${session(student)}`, origin: backend }, body: form })
  if (!response.ok) throw new Error(`Synthetic silent-audio upload failed: ${response.status}`)
  return response.json()
}
async function seedAnalysisHistory() {
  const title = '合成验收 · C大调四小节'
  const fileName = 'concert-hall-layout-fixture.musicxml'
  // Reuse the same authored, 20-note/two-part example as music21-smoke.mjs.
  // Removing its external DTD declaration keeps the input wholly local.
  const xml = (await readFile(path.join(root, 'public/examples/music21-demo.musicxml'), 'utf8'))
    .replace(/<!DOCTYPE[^>]*>\s*/, '')
    .replace(/<work-title>[^<]*<\/work-title>/, `<work-title>${title}</work-title>`)
    .replace(/<creator type="composer">[^<]*<\/creator>/, '<creator type="composer">界面验收合成资料（非真实作品）</creator>')
  const form = new FormData()
  form.set('file', new File([xml], fileName, { type: 'application/xml' }))
  const response = await fetch(backend + '/api/analysis', { method: 'POST', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(70000)]), headers: { cookie: `zhiyin_session=${session(student)}`, origin: backend }, body: form })
  let result
  if (response.ok) {
    result = await response.json()
    assert.ok(result.music21)
    assert.equal(result.noteCount, 20)
    assert.equal(result.music21.partCount, 2)
    assert.equal(result.music21.restCount, 3)
    boundaries.analysis = 'synthetic authored MusicXML; real local music21 parsing and owner-only persisted history; no external LLM'
  } else if (response.status === 503) {
    // A missing local Python/music21 runtime still permits an honest, measured
    // basic result through the existing local text parser and save helper.
    result = await api('/api/analysis', student, 'POST', { mode: 'text', notation: `X:1\nT:${title}\nC:界面验收合成资料（非真实作品）\nM:4/4\nL:1/4\nK:C\nC D E G | F A G E | D F A c | G B d c |` })
    assert.equal(result.provenance, 'abc')
    boundaries.analysis = 'music21 runtime unavailable; synthetic ABC measured by the real local basic parser and saved to owner-only history; no external LLM'
  } else throw new Error(`Local fixture analysis returned ${response.status}: ${safeError(await response.text())}`)
  assert.equal(result.title, title)
  assert.ok(result.historyId)
  const history = await api('/api/analysis/history', student)
  assert.ok(history.items.some(item => item.id === result.historyId))
  const restored = await api(`/api/analysis/history/${result.historyId}`, student)
  assert.equal(restored.noteCount, result.noteCount)
  await api(`/api/analysis/history/${result.historyId}`, otherStudent, 'GET', undefined, 404)
  const displayFileName = result.fileName ?? null
  return { id: result.historyId, title, fileName: displayFileName, engine: result.music21 ? 'music21' : 'basic', noteCount: result.noteCount, source: 'synthetic fixture, real local parsing', page: '/analysis', openAction: `打开分析：${title}（${displayFileName ?? '记谱文本'}）` }
}
async function seed() {
  await api('/api/profiles')
  const db = new DatabaseSync(path.join(directory, 'zhiyin.sqlite'))
  try {
    const rename = db.prepare('UPDATE profiles SET nickname=? WHERE id=?')
    rename.run('验收教师', teacher); rename.run('验收同学', student); rename.run('验收同学乙', otherStudent)
  } finally { db.close() }
  const classroom = await api('/api/classes', teacher, 'POST', { name: className }, 201)
  for (const id of [student, otherStudent]) await api('/api/profiles', teacher, 'PATCH', { student_id: id, class_name: className })
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const year = Number(today.slice(0, 4))
  const semester = await api('/api/semester-goals', teacher, 'POST', { name: `${year} 秋季钢琴课堂 · 验收示例`, start_date: `${year}-09-01`, end_date: `${year + 1}-01-31`, target_minutes: 900 }, 201)
  const scores = []
  for (const [index, piece] of [
    { title: '月光奏鸣曲', composer: '贝多芬', category: 'foreign', score_type: '奏鸣曲', period: '19世纪', score_style: '古典' },
    { title: '降E大调夜曲', composer: '肖邦', category: 'foreign', score_type: '乐曲', period: '19世纪', score_style: '浪漫' },
    { title: '牧童短笛', composer: '贺绿汀', category: 'domestic', score_type: '乐曲', period: '20世纪', score_style: '中国' },
  ].entries()) {
    const file = await uploadSheet(index, piece.title)
    const score = await api('/api/scores', teacher, 'POST', { ...piece, tips: '界面验收示例：附带自制合成谱图，并非作品原谱；本数据不代表真实教学成果。', published: true, target_classes: [className], cover_file_id: null, pages: [{ file_id: file.fileId, file_name: file.name, file_type: file.type, upload_receipt: file.receipt }] }, 201)
    assert.equal(score.cover_file_id, null)
    scores.push(score)
  }
  for (const score of scores.slice(0, 2)) await api('/api/practice-list', student, 'POST', { score_id: score.id })
  const silentAudio = await uploadSilentAudio()
  const records = []
  for (let index = 0; index < 7; index++) records.push(await api('/api/practice', student, 'POST', { score_id: scores[index % 3].id, piece_title: scores[index % 3].title, source: 'teacher', started_at: new Date(Date.now() - index * 86400000 - 3600000).toISOString(), duration_seconds: [1680, 2100, 1500, 2400, 1800, 1320, 1920][index], pause_count: index % 3, ...(index === 0 ? { audio_file_id: silentAudio.fileId } : {}) }, 201))
  await api('/api/practice', otherStudent, 'POST', { score_id: scores[0].id, piece_title: scores[0].title, source: 'teacher', started_at: new Date(Date.now() - 7200000).toISOString(), duration_seconds: 1500, pause_count: 1 }, 201)
  const tasks = []
  for (const [index, title] of ['月光奏鸣曲 · 乐句与呼吸', '夜曲 · 旋律声部练习', '牧童短笛 · 节奏与弹性'].entries()) tasks.push(await api('/api/tasks', teacher, 'POST', { title, description: '本地界面验收任务：先慢练，再提交练习记录。材料和评语均为隔离测试数据。', start_at: new Date(Date.now() - 7 * 86400000).toISOString(), end_at: new Date(Date.now() + (index + 3) * 86400000).toISOString(), audience: 'classes', target_classes: [className], score_mode: 'fixed', score_id: scores[index].id, requirements: { audio: 'optional', record: 'required', video: 'off' } }, 201))
  const firstSubmission = await api(`/api/tasks/${tasks[0].id}/submissions`, student, 'POST', { practice_record_id: records[0].id, record_text: '验收示例：本次先慢练主旋律，再注意乐句呼吸，待教师指导。' })
  const reviewed = await api(`/api/tasks/${tasks[1].id}/submissions`, student, 'POST', { practice_record_id: records[1].id, record_text: '验收示例：已完成分手慢练，尝试让旋律声部更加清晰。' })
  await api(`/api/submissions/${reviewed.id}`, teacher, 'PATCH', { grade: 88, feedback: '验收示例评语：旋律方向清晰，下一次注意伴奏的均匀与层次。' })
  await api(`/api/tasks/${tasks[0].id}/submissions`, otherStudent, 'POST', { record_text: '验收示例：先读谱再分段练习，请老师帮助检查节奏。' })
  for (const entry of [
    { title: '连奏与乐句呼吸', keywords: ['连奏', '乐句'], content: '【本地验收课程资料】可先缩短乐句、降低速度，注意音与音的连接。每次练习记录一个清晰问题，下次课交由教师复核。' },
    { title: '夜曲的旋律声部', keywords: ['夜曲', '旋律声部'], content: '【本地验收课程资料】本条仅用于课程资料展示与搜索。演奏处理请以任课教师指导为准，不将这些合成资料作为作品史实。' },
    { title: '慢练与练习记录方法', keywords: ['慢练', '练习记录'], content: '【本地验收课程资料】记录曲目、有效时长、遇到的困难以及下次目标；暂停时间与有效练习时间分开记录。' },
  ]) await api('/api/knowledge', teacher, 'POST', { ...entry, source_url: null }, 201)
  const post = await api('/api/posts', student, 'POST', { title: '今天把乐句分成了四个小段', content: '【界面验收示例】先用慢速练清每个小段，再尝试连接。把最难的一处记在练习档案里，下次课请老师帮助检查。', category: 'method', ask_teacher: false })
  await api('/api/comments', teacher, 'POST', { post_id: post.id, content: '【验收示例回复】可以保留这样的分段记录，课堂上一起检查连接与呼吸。' })
  await api(`/api/posts/${post.id}/like`, otherStudent, 'POST', {})
  await api('/api/posts', otherStudent, 'POST', { title: '怎样让夜曲旋律更连贯？', content: '【界面验收示例】右手旋律连接还有些生硬，想听听大家怎样安排慢练。', category: 'repertoire', ask_teacher: true })
  await api('/api/posts', teacher, 'POST', { title: '本周课堂练习提醒', content: '【界面验收示例】请在本周任务中提交一段文字记录。材料完整后会在课堂上集中讨论。', category: 'other', ask_teacher: false })
  const message = await api('/api/posts', student, 'POST', { title: '下次课请指导踏板与声部', content: '【界面验收私密留言】希望老师下次课帮助检查旋律声部与踏板的衔接。', category: 'performance', recipient_teacher_id: teacher })
  await api('/api/comments', teacher, 'POST', { post_id: message.id, content: '【验收示例回复】下次课先检查分手练习，再讨论踏板。' })
  const analysisHistory = await seedAnalysisHistory()
  summary = { className, semester: semester.name, scores: scores.map(score => ({ id: score.id, title: score.title, cover_file_id: score.cover_file_id })), practiceRecords: 8, audioSample: { practiceRecordId: records[0].id, seconds: 2, format: '16 kHz mono 16-bit PCM WAV', synthetic: true, performance: false }, queuedScores: 2, tasks: tasks.map(task => ({ id: task.id, title: task.title })), submissions: 3, courseMaterials: 3, publicPosts: 3, privateMessages: 1, pendingReview: { taskId: tasks[0].id, submissionId: firstSubmission.id }, reviewedTaskId: tasks[1].id, classroomId: classroom.id, analysisHistory }
}

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])
function publicOrigin(request, port) {
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(request.headers.host ?? '')) return null
  return `http://${request.headers.host}`
}
function sendJson(response, status, value) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-zhiyin-fixture': 'concert-hall-local-only' }); response.end(JSON.stringify(value)) }
function localChat(request, response) {
  request.resume()
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-store', 'x-accel-buffering': 'no', 'x-zhiyin-fixture': 'chat-example-not-live' })
  response.write('data: {"sources":[{"title":"本地界面验收示例（非真实模型）","url":null}]}\n\n')
  const chunks = ['【界面验收示例，非真实模型回答】\n', '当前对话仅用于检查悬浮助手、流式文字与版式。', '\n可以在“课程资料”页签查看三条本地验收资料，', '再带着问题记录回到课堂。', '\n具体演奏处理请以任课教师指导为准。']
  let index = 0
  const timer = setInterval(() => {
    if (index < chunks.length) response.write(`data: ${JSON.stringify({ content: chunks[index++] })}\n\n`)
    else { clearInterval(timer); response.end('data: [DONE]\n\n') }
  }, 220)
  response.once('close', () => clearInterval(timer))
}
function replaceSdkUrls(text) {
  return text.replace(/https:\/\/robot\.chaoxing\.com\/coder-sdk\/iframe-(?:route-sync|error-sync|element-picker)\/child\.umd\.js(?:\?[^"'<\s\\]*)?/g, '/__fixture/empty-sdk.js')
}
function proxyFor(role, port) {
  const userId = role === 'teacher' ? teacher : student
  return createServer((request, response) => {
    const origin = publicOrigin(request, port)
    if (!origin) return sendJson(response, 403, { error: 'This fixture accepts only its localhost entry Host' })
    const incomingOrigin = request.headers.origin
    if (incomingOrigin && incomingOrigin !== origin || !['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? 'GET') && incomingOrigin !== origin) return sendJson(response, 403, { error: 'Fixture request origin must match this entry' })
    const url = new URL(request.url ?? '/', origin)
    if (url.origin !== origin) return sendJson(response, 400, { error: 'Absolute external proxy targets are not supported' })
    if (url.pathname === '/__fixture/ready') return sendJson(response, ready ? 200 : 503, { ready, role, nickname: role === 'teacher' ? '验收教师' : '验收同学', seed: summary, boundaries })
    if (url.pathname === '/__fixture/empty-sdk.js') { response.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' }); return response.end('/* Inert iframe SDK response for the isolated local visual fixture. */') }
    if (url.pathname.startsWith('/__fixture/')) return sendJson(response, 404, { error: 'Unknown local fixture resource' })
    if (url.pathname === '/api/chat' && request.method === 'POST') return localChat(request, response)
    if (/^\/api\/auth\/(?:start|callback|teacher|test-student)(?:\/|$)/.test(url.pathname)) return sendJson(response, 503, { error: 'Real authentication is outside this isolated signed-session fixture' })
    if (url.pathname === '/api/analysis' && request.method === 'POST') return sendJson(response, 503, { error: '本地界面验收未启用远程谱面分析；本接口未请求真实模型。' })
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) => !hopHeaders.has(key) && key !== 'cookie'))
    headers.host = new URL(backend).host
    headers.cookie = `zhiyin_session=${session(userId)}`
    headers['accept-encoding'] = 'identity'
    headers['x-forwarded-host'] = request.headers.host
    headers['x-forwarded-proto'] = 'http'
    headers['x-forwarded-port'] = String(port)
    if (incomingOrigin) headers.origin = backend
    if (typeof headers.referer === 'string' && headers.referer.startsWith(origin + '/')) headers.referer = backend + headers.referer.slice(origin.length)
    const upstream = httpRequest(backend + url.pathname + url.search, { method: request.method, headers }, upstreamResponse => {
      const outgoing = Object.fromEntries(Object.entries(upstreamResponse.headers).filter(([key]) => !hopHeaders.has(key) && key !== 'set-cookie'))
      // Cookies are injected upstream only: fixture ports must never overwrite
      // an existing localhost:5000 browser session (cookies are shared by port).
      for (const key of ['location', 'x-nextjs-redirect']) if (typeof outgoing[key] === 'string') outgoing[key] = outgoing[key].replace(backend, origin).replace(`http://localhost:${ports.backend}`, origin)
      outgoing['x-zhiyin-fixture'] = 'concert-hall-local-only'
      outgoing['cache-control'] = 'no-store'
      const contentType = String(outgoing['content-type'] ?? '')
      if (/text\/(?:html|x-component)/.test(contentType)) {
        const chunks = []
        upstreamResponse.on('data', chunk => chunks.push(chunk))
        upstreamResponse.on('end', () => {
          const body = Buffer.from(replaceSdkUrls(Buffer.concat(chunks).toString('utf8')))
          delete outgoing['content-encoding']; delete outgoing.etag
          outgoing['content-length'] = String(body.length)
          outgoing['content-security-policy'] = "script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' blob:; worker-src 'self' blob:"
          response.writeHead(upstreamResponse.statusCode ?? 502, outgoing); response.end(body)
        })
      } else { response.writeHead(upstreamResponse.statusCode ?? 502, outgoing); upstreamResponse.pipe(response) }
    })
    upstream.on('error', () => { if (!response.headersSent) sendJson(response, 502, { error: 'Owned local fixture backend is unavailable' }); else response.destroy() })
    request.on('aborted', () => upstream.destroy())
    response.on('close', () => { if (!response.writableEnded) upstream.destroy() })
    request.pipe(upstream)
  })
}
async function verifyEntries() {
  for (const role of ['student', 'teacher']) {
    const port = ports[role], origin = `http://localhost:${port}`, userId = role === 'teacher' ? teacher : student
    const response = await fetch(`${origin}/api/auth/session`, { signal: AbortSignal.timeout(10000) })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.user?.id, userId); assert.equal(body.user?.role, role)
    const route = role === 'student' ? '/api/practice-list' : `/api/scores/${summary.scores[0].id}`
    const bodyToSave = role === 'student' ? { user_id: userId, score_id: summary.scores[0].id } : { user_id: userId, tips: '界面验收示例：附带自制合成谱图，并非作品原谱；本数据不代表真实教学成果。' }
    const write = await fetch(`${origin}${route}`, { method: role === 'student' ? 'POST' : 'PATCH', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(bodyToSave), signal: AbortSignal.timeout(10000) })
    assert.equal(write.status, 200, `Same-origin ${role} proxy write must pass the real production CSRF and actor checks: ${safeError(await write.text())}`)
  }
  const denied = await fetch(`http://localhost:${ports.student}/api/teacher/overview`, { signal: AbortSignal.timeout(10000) })
  assert.equal(denied.status, 403, 'The student entry must retain real teacher API restrictions')
}
async function cleanup() {
  if (stopping) return
  stopping = true; ready = false; abort.abort()
  await Promise.all(proxies.map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections() })))
  if (service && service.exitCode === null && service.pid) {
    const exited = once(service, 'exit')
    service.kill()
    await exited
  }
  if (directory) {
    const resolved = path.resolve(directory)
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()))
    assert.ok(path.basename(resolved).startsWith('zhiyin-concert-hall-'))
    await rm(resolved, { recursive: true, force: true })
  }
}
process.once('SIGINT', () => abort.abort(new Error('Fixture interrupted')))
process.once('SIGTERM', () => abort.abort(new Error('Fixture terminated')))

try {
  await access(path.join(root, '.next/BUILD_ID'))
  await ensureFreePorts()
  directory = await mkdtemp(path.join(tmpdir(), 'zhiyin-concert-hall-'))
  await startBackend()
  await seed()
  for (const role of ['student', 'teacher']) {
    const server = proxyFor(role, ports[role]); proxies.push(server)
    server.listen(ports[role], '127.0.0.1'); await once(server, 'listening')
  }
  await verifyEntries()
  ready = true
  console.log(JSON.stringify({ ready, student: `http://localhost:${ports.student}/`, teacher: `http://localhost:${ports.teacher}/teacher`, readiness: { student: `http://localhost:${ports.student}/__fixture/ready`, teacher: `http://localhost:${ports.teacher}/__fixture/ready` }, seed: summary, boundaries, cleanup: 'Ctrl+C stops only this owned Next child/proxies and removes the verified temporary data directory' }, null, 2))
  await Promise.race([once(service, 'exit').then(([code]) => { if (!abort.signal.aborted) throw new Error(`Owned Next fixture stopped unexpectedly (${code})`) }), new Promise(resolve => { if (abort.signal.aborted) resolve(); else abort.signal.addEventListener('abort', resolve, { once: true }) })])
} catch (error) {
  if (!abort.signal.aborted) { console.error(safeError(error)); console.error('Owned Next fixture logs:', safeError(logs)); process.exitCode = 1 }
} finally {
  await cleanup()
  console.log('Owned concert-hall fixture stopped; isolated temporary data cleaned.')
}
