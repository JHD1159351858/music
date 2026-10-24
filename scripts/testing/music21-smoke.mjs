import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { createServer as createPortProbe } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

// Run after the production build. No live model, SSO or existing SQLite data is used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const python = path.join(root, '.venv-music21', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
await Promise.all([access(path.join(root, '.next/BUILD_ID')), access(python), access(chromium.executablePath())])
const directory = await mkdtemp(path.join(tmpdir(), 'zhiyin-music21-browser-'))
const output = path.join(root, 'docs/verification/analysis-history-2026-10-25')
await mkdir(output, { recursive: true })
const secret = randomBytes(48).toString('base64url')
const student = 's0000000-0000-0000-0000-000000000001'
const other = 's0000000-0000-0000-0000-000000000002'
const checks = []
const requests = []
const errors = []
const evidence = {
  fixture: 'Existing Next production build, real .venv-music21 Python, temporary SQLite, signed synthetic students, dynamic loopback ports',
  boundaries: { existingDataModified: false, realChaoxingSSO: false, liveLLM: false, modelIntegration: 'Actual SDK HTTP requests and Next SSE against a deterministic local OpenAI-compatible fixture' },
  checks, screenshots: [], model: {},
}
let service, browser, mock, base, logs = ''
function pass(message) { checks.push(message); console.log(`PASS ${checks.length}: ${message}`) }
function redact(value) { return String(value).replaceAll(secret, '[redacted]').replace(/zhiyin_session=[^;\s"']+/g, 'zhiyin_session=[redacted]') }
function session(userId) {
  const payload = Buffer.from(JSON.stringify({ kind: 'session', userId, role: 'student', expiresAt: Date.now() + 3600000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}
async function freePort() {
  const probe = createPortProbe().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const address = probe.address()
  assert.ok(address && typeof address === 'object')
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
  return address.port
}
async function startFixtureService(modelUrl) {
  service = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', new URL(base).port], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ZHIYIN_STORAGE_MODE: 'local', ZHIYIN_DATA_DIR: directory, ZHIYIN_SESSION_SECRET: secret, ZHIYIN_STUDENT_TEST_MODE: 'false', ZHIYIN_PUBLIC_ORIGIN: base, ZHIYIN_MUSIC21_PYTHON: python, CHAOXING_SSO_BASE_URL: 'http://127.0.0.1:9', CHAOXING_SSO_SHARED_SECRET: randomBytes(32).toString('base64url'), CODER_CODING_API_KEY: 'local-fixture-only', CODER_CODING_MODEL_API_KEY: 'local-fixture-only', CODER_CODING_BASE_URL: modelUrl, CODER_CODING_MODEL_BASE_URL: modelUrl, NO_PROXY: '127.0.0.1,localhost,::1' },
  })
  let startupError
  service.on('error', error => { startupError = error })
  service.stdout.on('data', chunk => { logs = (logs + String(chunk)).slice(-16000) })
  service.stderr.on('data', chunk => { logs = (logs + String(chunk)).slice(-16000) })
  const deadline = Date.now() + 30000
  for (;;) {
    if (startupError) throw startupError
    if (service.exitCode !== null) throw new Error(`Isolated Next service exited: ${redact(logs)}`)
    try { if ((await fetch(base + '/api/auth/session', { signal: AbortSignal.timeout(1000) })).ok) return } catch {}
    assert.ok(Date.now() < deadline, 'Isolated Next service readiness timed out')
    await new Promise(resolve => setTimeout(resolve, 150))
  }
}
async function stopFixtureService() {
  if (service && service.exitCode === null) { const exited = once(service, 'exit'); service.kill(); await exited }
}
async function request(route, { userId = student, method = 'GET', body, status = 200, multipart = false } = {}) {
  const response = await fetch(base + route, {
    method, signal: AbortSignal.timeout(70000),
    headers: { origin: base, ...(userId ? { cookie: `zhiyin_session=${session(userId)}` } : {}), ...(!multipart && body ? { 'content-type': 'application/json' } : {}) },
    body: multipart ? body : body ? JSON.stringify(body) : undefined,
  })
  assert.equal(response.status, status, `${method} ${route}: ${redact(await response.clone().text())}`)
  return response
}
async function upload(name, bytes, options = {}) {
  const form = new FormData()
  form.set('file', new File([bytes], name, { type: name.endsWith('.mxl') ? 'application/vnd.recordare.musicxml' : 'application/xml' }))
  return request('/api/analysis', { method: 'POST', multipart: true, body: form, ...options })
}
function scoreContext(prompt) {
  const match = prompt.match(/<score-analysis>\n([\s\S]*?)\n<\/score-analysis>/)
  assert.ok(match, 'Verified score data must reach the actual model SDK request')
  return JSON.parse(match[1])
}
async function waitFor(predicate, description) {
  const deadline = Date.now() + 15000
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `${description} timed out`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name), fullPage: true })
  evidence.screenshots.push(name)
}
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false) }
function snapshot(analysis) {
  const result = { ...analysis }
  delete result.analysisReceipt
  delete result.historyId
  return result
}
function historySummaries(items) {
  const fields = ['id', 'title', 'composer', 'fileName', 'provenance', 'engine', 'noteCount', 'createdAt'].sort()
  for (const item of items) assert.deepEqual(Object.keys(item).sort(), fields, 'History lists must contain summaries only')
}
async function completedChat(page, copies) {
  const answer = '受控 SSE 讲解：已收到 music21 实际音符与和声。以上建议仅供练习参考，具体以任课教师指导为准。'
  await page.getByText(answer, { exact: true }).nth(copies - 1).waitFor()
  await page.waitForFunction(() => {
    const input = document.querySelector('input[placeholder="就这份乐谱继续提问…"]')
    return input instanceof HTMLInputElement && !input.disabled
  }, undefined, { timeout: 15000 })
}

try {
  const source = await readFile(path.join(root, 'public/examples/music21-demo.musicxml'))
  const xml = source.toString('utf8')
  assert.equal((xml.match(/<pitch>/g) || []).length, 20)
  assert.equal((xml.match(/<rest\s*\//g) || []).length, 3)
  assert.equal((xml.match(/<part id=/g) || []).length, 2)
  const mxl = path.join(directory, 'music21-demo.mxl')
  await promisify(execFile)(python, ['-c', 'import pathlib,sys,zipfile\nwith zipfile.ZipFile(sys.argv[2],"w",compression=zipfile.ZIP_DEFLATED) as z:\n z.writestr("META-INF/container.xml",\'<container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>\')\n z.writestr("score.musicxml",pathlib.Path(sys.argv[1]).read_bytes())', path.join(root, 'public/examples/music21-demo.musicxml'), mxl], { windowsHide: true })

  mock = createServer(async (incoming, response) => {
    try {
      assert.equal(incoming.method, 'POST')
      assert.equal(incoming.url, '/chat/completions')
      const chunks = []
      for await (const chunk of incoming) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      assert.equal(body.stream, true)
      assert.ok(Array.isArray(body.messages))
      requests.push(body)
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
      response.write('data: {"choices":[{"delta":{"content":"受控 SSE 讲解："}}]}\n\n')
      await new Promise(resolve => setTimeout(resolve, 30))
      response.end('data: {"choices":[{"delta":{"content":"已收到 music21 实际音符与和声。以上建议仅供练习参考，具体以任课教师指导为准。"}}]}\n\ndata: [DONE]\n\n')
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end('{"error":{"message":"Invalid local model fixture request"}}')
    }
  }).listen(0, '127.0.0.1')
  await once(mock, 'listening')
  const modelAddress = mock.address()
  assert.ok(modelAddress && typeof modelAddress === 'object')
  const modelUrl = `http://127.0.0.1:${modelAddress.port}`
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  await startFixtureService(modelUrl)
  evidence.port = port
  await upload('music21-demo.musicxml', source, { userId: null, status: 401 })
  await upload('score.pdf', source, { status: 415 })
  await upload('empty.musicxml', Buffer.alloc(0), { status: 400 })
  await upload('oversize.musicxml', Buffer.alloc(8 * 1024 * 1024 + 1), { status: 413 })
  pass('Actual upload API rejects unauthenticated, wrong extension, empty and oversized files')

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addCookies([{ name: 'zhiyin_session', value: session(student), url: base, httpOnly: true, sameSite: 'Lax' }])
  await context.route('https://robot.chaoxing.com/coder-sdk/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  const page = await context.newPage()
  let analysisPosts = 0
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', incoming => { if (incoming.method() === 'POST' && incoming.url() === base + '/api/analysis') analysisPosts++ })
  await page.goto(base + '/analysis')
  await page.waitForLoadState('networkidle')
  assert.equal(new URL(page.url()).pathname, '/analysis', 'The real Next route must expose the analysis page')
  assert.equal(await page.getByRole('tab', { name: 'MusicXML 文件', exact: true }).getAttribute('aria-selected'), 'true')
  assert.equal(await page.getByRole('button', { name: '开始解析', exact: true }).isDisabled(), true)
  assert.equal(await page.getByLabel('选择 MusicXML 乐谱文件', { exact: true }).getAttribute('accept'), '.musicxml,.mxl,.xml')
  const downloadedEvent = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载 MusicXML 示例乐谱', exact: true }).click()
  const downloaded = await downloadedEvent
  const downloadPath = path.join(directory, downloaded.suggestedFilename())
  await downloaded.saveAs(downloadPath)
  assert.deepEqual(await readFile(downloadPath), source)
  pass('MusicXML is the default tab; labelled file input and real authored example download are available')

  const fileInput = page.getByLabel('选择 MusicXML 乐谱文件', { exact: true })
  await fileInput.setInputFiles(downloadPath)
  const analysisEvent = page.waitForResponse(response => response.url() === base + '/api/analysis' && response.request().method() === 'POST')
  const chatEvent = page.waitForResponse(response => response.url() === base + '/api/chat')
  await page.getByRole('button', { name: '开始解析', exact: true }).click()
  const analysisResponse = await analysisEvent
  assert.equal(analysisResponse.status(), 200)
  const analysis = await analysisResponse.json()
  assert.equal(analysis.provenance, 'musicxml')
  assert.equal(analysis.title, 'C大调四小节教学示例')
  assert.equal(analysis.noteCount, 20)
  assert.equal(analysis.music21.notes.length, 20)
  assert.equal(analysis.music21.partCount, 2)
  assert.equal(analysis.music21.measureCount, 4)
  assert.equal(analysis.music21.restCount, 3)
  assert.deepEqual(analysis.music21.timeSignatures, ['4/4'])
  assert.deepEqual(analysis.music21.tempos, [96])
  assert.deepEqual(analysis.music21.declaredKeys, ['C大调'])
  assert.equal(analysis.music21.chords.length, 11)
  assert.equal(analysis.music21.notes.filter(note => note.offset === 0).length, 4)
  assert.equal(typeof analysis.analysisReceipt, 'string')
  assert.match(analysis.historyId, /^[0-9a-f-]{36}$/i)
  assert.equal(analysis.fileName, downloaded.suggestedFilename())
  assert.deepEqual(analysis.sources, [])
  evidence.analysis = { version: analysis.music21.version, noteCount: analysis.noteCount, partCount: analysis.music21.partCount, measureCount: analysis.music21.measureCount, restCount: analysis.music21.restCount, chordSlices: analysis.music21.chords.length, range: analysis.range, receiptPresent: true, courseSources: analysis.sources }
  await page.getByRole('heading', { name: analysis.title, exact: true }).waitFor()
  const notesSection = page.locator('section').filter({ has: page.getByRole('heading', { name: '音符解析预览', exact: true }) })
  const harmonySection = page.locator('section').filter({ has: page.getByRole('heading', { name: '和声解析预览', exact: true }) })
  assert.equal(await notesSection.locator('tbody tr').count(), 20)
  assert.equal(await harmonySection.locator('tbody tr').count(), 11)
  await notesSection.getByRole('cell', { name: 'C4', exact: true }).first().waitFor()
  await page.getByText(`指标来源：music21 ${analysis.music21.version} · MusicXML 实际解析`, { exact: true }).waitFor()
  assert.equal(await page.getByText('未识别（课程资料未收录）', { exact: true }).count(), 5)
  pass('Real music21 returns the authored 20 notes, 3 rests, 2 parts, 4 measures and 11 harmonic slices; UI tables and provenance agree')
  const initialHistory = await (await request('/api/analysis/history?page=1')).json()
  historySummaries(initialHistory.items)
  assert.equal(initialHistory.items.length, 1)
  assert.equal(initialHistory.items[0].id, analysis.historyId)
  assert.equal(initialHistory.items[0].engine, 'music21')
  assert.equal(initialHistory.items[0].fileName, analysis.fileName)
  assert.equal(initialHistory.hasMore, false)
  await page.getByRole('region', { name: '分析历史', exact: true }).getByRole('button', { name: `打开分析：${analysis.title}（${analysis.fileName}）`, exact: true }).waitFor()
  pass('Successful XML analysis automatically saves one owner history summary and refreshes the visible history panel')

  const chatResponse = await chatEvent
  assert.equal(chatResponse.status(), 200)
  assert.match(chatResponse.headers()['content-type'], /text\/event-stream/)
  await completedChat(page, 1)
  await waitFor(() => requests.length === 1, 'Initial model call')
  const systemPrompt = requests[0].messages[0].content
  const initialContext = scoreContext(systemPrompt)
  assert.equal(initialContext.noteCount, 20)
  assert.equal(initialContext.notes.length, 20)
  assert.equal(initialContext.chords.length, 11)
  assert.equal(initialContext.requestedMeasures, null)
  assert.ok(!systemPrompt.includes('<course-material'))
  for (const sensitive of [secret, student, other, 'analysisReceipt', 'ownerId', 'local-fixture-only']) assert.ok(!systemPrompt.includes(sensitive))
  pass('Verified score receipt drives real browser-to-Next-to-SDK SSE without course knowledge; model prompt contains music data and no identity or secrets')

  const followupEvent = page.waitForResponse(response => response.url() === base + '/api/chat')
  await page.getByPlaceholder('就这份乐谱继续提问…', { exact: true }).fill('请说明第2小节有哪些音符？')
  await page.getByPlaceholder('就这份乐谱继续提问…', { exact: true }).press('Enter')
  const followupResponse = await followupEvent
  assert.equal(followupResponse.status(), 200)
  await completedChat(page, 2)
  await waitFor(() => requests.length === 2, 'Measure follow-up model call')
  const followupContext = scoreContext(requests[1].messages[0].content)
  assert.deepEqual(followupContext.requestedMeasures, [2, 2])
  assert.equal(followupContext.notes.length, 5)
  assert.ok(followupContext.notes.every(note => note.measure === 2))
  assert.ok(requests[1].messages.some(message => message.role === 'assistant' && message.content.includes('受控 SSE 讲解')))
  evidence.model = { requests: requests.length, initialSSEComplete: true, followupSSEComplete: true, initialNoteCount: initialContext.notes.length, followupMeasures: followupContext.requestedMeasures, followupNoteCount: followupContext.notes.length, courseKnowledgeRequired: false, identityOrSecretInSystemPrompt: false }
  pass('Next user follow-up preserves conversation and supplies verified notes scoped to measure 2')
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow(page)
  pass('390px results page has no horizontal page overflow')

  const chatBody = { messages: [{ role: 'user', content: '第2小节' }], context: { kind: 'score', name: analysis.title, analysis } }
  await request('/api/chat', { method: 'POST', userId: other, body: chatBody, status: 422 })
  await request('/api/chat', { method: 'POST', body: { ...chatBody, context: { ...chatBody.context, analysis: { ...analysis, noteCount: 999 } } }, status: 422 })
  const unsignedAnalysis = { ...analysis }
  delete unsignedAnalysis.analysisReceipt
  await request('/api/chat', { method: 'POST', body: { ...chatBody, context: { ...chatBody.context, analysis: unsignedAnalysis } }, status: 422 })
  assert.equal(requests.length, 2)
  pass('Real chat API rejects another user\'s receipt, modified analysis and stripped receipt before any model call')

  await page.getByRole('button', { name: '分析新乐谱', exact: true }).click()
  assert.equal(await page.getByRole('tab', { name: 'MusicXML 文件', exact: true }).getAttribute('aria-selected'), 'true')
  assert.equal(await page.getByRole('button', { name: '开始解析', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '点击选择 MusicXML 乐谱', exact: true }).focus()
  assert.equal(await page.getByRole('button', { name: '点击选择 MusicXML 乐谱', exact: true }).evaluate(element => element === document.activeElement), true)
  await noOverflow(page)
  await screenshot(page, 'mobile-history-upload.png')
  pass('Analyze new score resets to default upload; mobile input has an accessible name and keyboard-operable picker without overflow')

  for (const [name, buffer, expected] of [
    ['wrong.pdf', source, /请选择 \.musicxml/],
    ['empty.musicxml', Buffer.alloc(0), /所选文件为空/],
    ['oversize.musicxml', Buffer.alloc(8 * 1024 * 1024 + 1), /不能超过 8 MiB/],
  ]) {
    await fileInput.setInputFiles({ name, mimeType: 'application/octet-stream', buffer })
    await page.getByRole('alert').filter({ hasText: expected }).waitFor()
    assert.equal(await page.getByRole('button', { name: '开始解析', exact: true }).isDisabled(), true)
  }
  pass('Browser feedback rejects wrong extension, empty and oversized files before analysis')
  await fileInput.setInputFiles({ name: 'broken.musicxml', mimeType: 'application/xml', buffer: Buffer.from('<score-partwise><part>') })
  const corruptEvent = page.waitForResponse(response => response.url() === base + '/api/analysis')
  await page.getByRole('button', { name: '开始解析', exact: true }).click()
  assert.equal((await corruptEvent).status(), 422)
  await page.getByRole('alert').filter({ hasText: /XML 无效/ }).waitFor()
  await page.getByText('broken.musicxml', { exact: false }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: '开始解析', exact: true }).isEnabled(), true)
  assert.equal(await page.getByRole('tab', { name: 'MusicXML 文件', exact: true }).getAttribute('aria-selected'), 'true')
  pass('Corrupt MusicXML returns actual parser error, retains the selected file and allows retry')
  await fileInput.setInputFiles(mxl)
  const compressedEvent = page.waitForResponse(response => response.url() === base + '/api/analysis')
  const compressedChatEvent = page.waitForResponse(response => response.url() === base + '/api/chat')
  await page.getByRole('button', { name: '开始解析', exact: true }).click()
  const compressedResponse = await compressedEvent
  assert.equal(compressedResponse.status(), 200)
  const compressed = await compressedResponse.json()
  assert.equal(compressed.noteCount, analysis.noteCount)
  assert.deepEqual(compressed.music21.notes, analysis.music21.notes)
  assert.deepEqual(compressed.music21.chords, analysis.music21.chords)
  await page.getByRole('heading', { name: analysis.title, exact: true }).waitFor()
  assert.equal((await compressedChatEvent).status(), 200)
  await completedChat(page, 1)
  await waitFor(() => requests.length === 3, 'Replacement MXL model call')
  await noOverflow(page)
  evidence.model.requests = requests.length
  pass('Browser recovers with real Python zipfile MXL upload; actual music21 notes and harmony match XML and mobile results do not overflow')

  const historyBeforeOpen = await (await request('/api/analysis/history?page=1')).json()
  assert.equal(historyBeforeOpen.items.length, 2)
  const otherHistory = await (await request('/api/analysis/history?page=1', { userId: other })).json()
  assert.deepEqual(otherHistory.items, [])
  await request(`/api/analysis/history/${analysis.historyId}`, { userId: other, status: 404 })
  pass('History list and detail enforce owner privacy: another student sees an empty list and receives 404 for the saved result')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await page.waitForLoadState('networkidle')
  const historyPanel = page.getByRole('region', { name: '分析历史', exact: true })
  const openOriginal = historyPanel.getByRole('button', { name: `打开分析：${analysis.title}（${analysis.fileName}）`, exact: true })
  await openOriginal.waitFor()
  const postsBeforeOpen = analysisPosts
  const detailEvent = page.waitForResponse(response => response.url() === base + `/api/analysis/history/${analysis.historyId}`)
  const restoredChatEvent = page.waitForResponse(response => response.url() === base + '/api/chat')
  await openOriginal.click()
  const detailResponse = await detailEvent
  assert.equal(detailResponse.status(), 200)
  assert.match(detailResponse.headers()['cache-control'], /no-store/)
  const restored = await detailResponse.json()
  assert.equal(restored.historyId, analysis.historyId)
  assert.notEqual(restored.analysisReceipt, analysis.analysisReceipt)
  assert.deepEqual(snapshot(restored), snapshot(analysis))
  await page.getByRole('heading', { name: analysis.title, exact: true }).waitFor()
  assert.equal(await notesSection.locator('tbody tr').count(), 20)
  assert.equal(await harmonySection.locator('tbody tr').count(), 11)
  assert.equal((await restoredChatEvent).status(), 200)
  await completedChat(page, 1)
  await waitFor(() => requests.length === 4, 'Restored score model call')
  const restoredContext = scoreContext(requests[3].messages[0].content)
  assert.deepEqual(restoredContext, initialContext)
  assert.equal(requests[3].messages.length, 2, 'Opening a saved result starts a fresh grounded chat')
  assert.equal(analysisPosts, postsBeforeOpen, 'Opening history must not submit another analysis')
  const historyAfterOpen = await (await request('/api/analysis/history?page=1')).json()
  assert.deepEqual(historyAfterOpen.items.map(item => item.id), historyBeforeOpen.items.map(item => item.id))
  await noOverflow(page)
  await screenshot(page, 'desktop-restored-history.png')
  evidence.model.requests = requests.length
  evidence.history = { automaticSave: true, restoredSnapshotEqual: true, receiptRenewed: true, getOnlyRestore: true, noDuplicateAfterOpen: true, restoredChatNotes: restoredContext.notes.length, ownerPrivacy: true }
  pass('Reload and open uses GET only, restores the exact saved charts with a fresh receipt and fresh working SSE chat, and creates no duplicate record')

  const abcIds = []
  for (let index = 1; index <= 21; index++) {
    const result = await (await request('/api/analysis', { method: 'POST', body: { mode: 'text', notation: `X:1\nT:历史分页示例 ${String(index).padStart(2, '0')}\nM:4/4\nK:C\nC D E F |` } })).json()
    assert.equal(result.provenance, 'abc')
    assert.equal(result.noteCount, 4)
    assert.equal(result.fileName ?? null, null)
    assert.match(result.historyId, /^[0-9a-f-]{36}$/i)
    abcIds.push(result.historyId)
  }
  const firstPage = await (await request('/api/analysis/history?page=1')).json()
  const secondPage = await (await request('/api/analysis/history?page=2')).json()
  historySummaries(firstPage.items)
  historySummaries(secondPage.items)
  assert.equal(firstPage.page, 1)
  assert.equal(firstPage.items.length, 20)
  assert.equal(firstPage.hasMore, true)
  assert.equal(secondPage.page, 2)
  assert.equal(secondPage.items.length, 3)
  assert.equal(secondPage.hasMore, false)
  const savedIds = new Set([...firstPage.items, ...secondPage.items].map(item => item.id))
  assert.equal(savedIds.size, 23)
  assert.ok(abcIds.every(id => savedIds.has(id)))
  assert.ok([...firstPage.items, ...secondPage.items].filter(item => abcIds.includes(item.id)).every(item => item.engine === 'basic' && item.fileName === null))
  evidence.history.pagination = { total: savedIds.size, firstPage: firstPage.items.length, secondPage: secondPage.items.length, abcAutomaticSaves: abcIds.length, summaryOnly: true }
  pass('ABC text analysis also saves automatically; 23 saved results paginate as 20 plus 3 with summary-only fields and no duplicates')

  await page.reload()
  await page.waitForLoadState('networkidle')
  await historyPanel.getByRole('button', { name: '加载更多', exact: true }).waitFor()
  assert.equal(await historyPanel.getByRole('button', { name: /^打开分析：/ }).count(), 20)
  const moreEvent = page.waitForResponse(response => response.url() === base + '/api/analysis/history?page=2')
  await historyPanel.getByRole('button', { name: '加载更多', exact: true }).click()
  assert.equal((await moreEvent).status(), 200)
  await historyPanel.getByRole('button', { name: `打开分析：${analysis.title}（${analysis.fileName}）`, exact: true }).waitFor()
  assert.equal(await historyPanel.getByRole('button', { name: /^打开分析：/ }).count(), 23)
  assert.equal(await historyPanel.getByRole('button', { name: '加载更多', exact: true }).count(), 0)
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow(page)
  pass('Visible history panel loads the second page once, retains all 23 unique open actions and fits the mobile viewport')

  await stopFixtureService()
  await startFixtureService(modelUrl)
  const persistedFirst = await (await request('/api/analysis/history?page=1')).json()
  const persistedSecond = await (await request('/api/analysis/history?page=2')).json()
  assert.deepEqual(persistedFirst, firstPage)
  assert.deepEqual(persistedSecond, secondPage)
  const persistedResponse = await request(`/api/analysis/history/${analysis.historyId}`)
  assert.match(persistedResponse.headers.get('cache-control'), /no-store/)
  assert.deepEqual(snapshot(await persistedResponse.json()), snapshot(analysis))
  await page.reload()
  await historyPanel.getByRole('button', { name: '加载更多', exact: true }).waitFor()
  evidence.history.survivesServerRestart = true
  pass('All history summaries and the complete original analysis survive a real isolated Next server stop/start using the same temporary SQLite directory')
  assert.deepEqual(errors, [])
  pass('No browser page errors or local model fixture errors')
  evidence.passed = true
} catch (error) {
  evidence.passed = false
  evidence.failure = redact(error instanceof Error ? error.stack : error)
  evidence.serverLog = redact(logs)
  console.error(evidence.failure)
  process.exitCode = 1
} finally {
  await browser?.close()
  await stopFixtureService()
  if (mock) { mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve)) }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2))
  await writeFile(path.join(output, 'checks.log'), checks.map((check, index) => `PASS ${index + 1}: ${check}`).join('\n') + `\nRESULT: ${evidence.passed ? 'PASS' : 'FAIL'}\n`)
  await writeFile(path.join(output, 'model-prompts.json'), JSON.stringify(requests.map(request => ({ system: request.messages.find(message => message.role === 'system')?.content, latestQuestion: [...request.messages].reverse().find(message => message.role === 'user')?.content })), null, 2))
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('zhiyin-music21-browser-'))
  await rm(directory, { recursive: true, force: true })
  console.log(`RESULT ${evidence.passed ? 'PASS' : 'FAIL'}: ${checks.length} checks; ${output}`)
}
