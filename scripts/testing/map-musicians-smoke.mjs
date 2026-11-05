import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createRequire } from 'node:module'
import { createServer as createPortProbe } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

// Existing production build + isolated SQLite/uploads + signed synthetic users.
// PLAYWRIGHT_MODULE_PATH may point at the bundled runtime's Playwright package.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
await access(path.join(root, '.next/BUILD_ID'))
const port = 5009
const base = `http://localhost:${port}`
const directory = await mkdtemp(path.join(tmpdir(), 'zhiyin-map-musicians-'))
const output = path.join(root, 'docs/verification/map-musicians-2026-10-23')
const secret = randomBytes(48).toString('base64url')
const teacher = 't0000000-0000-0000-0000-000000000001'
const otherTeacher = 't0000000-0000-0000-0000-000000000002'
const student = 's0000000-0000-0000-0000-000000000001'
const name = '隔离验收音乐家 ZX1023'
const intro = '仅用于隔离浏览器验收的教师录入资料。唯一史料标记 MATERIAL_ZX1023_INITIAL。'
const changedIntro = '教师已更新本地人物资料。唯一史料标记 MATERIAL_ZX1023_UPDATED。'
const sourceTitle = '隔离验收来源'
const sourceUrl = 'https://example.com/music-fixture-zx1023'
const evidence = {
  fixture: 'Next production start on port 5009; temporary SQLite/uploads; signed synthetic teacher, second teacher and student sessions',
  boundaries: { realChaoxingSSO: false, currentDataModified: false, externalLLM: false, modelIntegration: 'actual SDK HTTP requests against a controlled loopback OpenAI-compatible SSE mock', thirdPartyIframeSDK: 'inert local script responses' },
  checks: [], screenshots: [], coordinates: [], model: {},
}
const errors = []
const requests = []
let mock
let service
let browser
let teacherPage
let logs = ''

function session(userId) {
  const payload = Buffer.from(JSON.stringify({ kind: 'session', userId, role: userId === student ? 'student' : 'teacher', expiresAt: Date.now() + 3600000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}
function redact(value) {
  return String(value).replaceAll(secret, '[redacted]').replace(/zhiyin_session=[^;\s"']+/g, 'zhiyin_session=[redacted]').replace(/([?&]token=)[^&\s"']+/g, '$1[redacted]')
}
function pass(description) { evidence.checks.push(description); console.log(`PASS ${evidence.checks.length}: ${description}`) }
async function api(route, { userId = teacher, method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(new URL(route, base), {
    method, signal: AbortSignal.timeout(20000),
    headers: { cookie: `zhiyin_session=${session(userId)}`, origin: base, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ ...body, user_id: userId }) : undefined,
  })
  if (response.status !== status) {
    const detail = response.headers.get('content-type')?.includes('application/json') ? await response.clone().text() : '(non-JSON response)'
    assert.fail(`${method} ${redact(route)} expected ${status}, got ${response.status}: ${redact(detail)}`)
  }
  return response
}
async function json(route, options) { return (await api(route, options)).json() }
async function list(userId = teacher) { return json('/api/map-musicians', { userId }) }
async function shot(page, filename) {
  // Full-page capture can temporarily resize the viewport and reset map zoom.
  await page.screenshot({ path: path.join(output, filename) })
  evidence.screenshots.push(filename)
}
async function startMock() {
  mock = createHttpServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST')
      assert.equal(request.url, '/chat/completions')
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      assert.equal(body.stream, true)
      assert.ok(Array.isArray(body.messages))
      requests.push(body)
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
      response.end('data: {"choices":[{"delta":{"content":"受控模型验收回复：仅引用已保存的人物资料。"}}]}\n\ndata: [DONE]\n\n')
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end('{"error":{"message":"Invalid controlled model request"}}')
    }
  })
  mock.listen(0, '127.0.0.1')
  await once(mock, 'listening')
  const address = mock.address()
  assert.ok(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}
async function start(modelUrl) {
  const probe = createPortProbe()
  probe.listen(port, '::')
  await once(probe, 'listening')
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
  service = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ZHIYIN_STORAGE_MODE: 'local', ZHIYIN_DATA_DIR: directory, ZHIYIN_SESSION_SECRET: secret, ZHIYIN_STUDENT_TEST_MODE: 'false', CHAOXING_SSO_BASE_URL: 'http://127.0.0.1:9', CHAOXING_SSO_SHARED_SECRET: randomBytes(32).toString('base64url'), CODER_CODING_API_KEY: 'local-fixture-only', CODER_CODING_MODEL_API_KEY: 'local-fixture-only', CODER_CODING_BASE_URL: modelUrl, CODER_CODING_MODEL_BASE_URL: modelUrl, NO_PROXY: '127.0.0.1,localhost,::1' },
  })
  let startupError
  service.on('error', error => { startupError = error })
  service.stdout.on('data', chunk => { logs = (logs + String(chunk)).slice(-14000) })
  service.stderr.on('data', chunk => { logs = (logs + String(chunk)).slice(-14000) })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (startupError) throw startupError
    if (service.exitCode !== null) throw new Error(`Isolated service exited: ${redact(logs)}`)
    try { if ((await fetch(base + '/api/auth/session', { signal: AbortSignal.timeout(1000) })).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Fixture readiness timed out: ${redact(logs)}`)
}
async function context(userId, mobile = false) {
  const result = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) })
  await result.addCookies([{ name: 'zhiyin_session', value: session(userId), url: base, httpOnly: true, sameSite: 'Lax' }])
  result.on('page', page => page.on('pageerror', error => errors.push(error.message)))
  await result.route('https://robot.chaoxing.com/coder-sdk/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  return result
}
function canvas(page) { return page.getByRole('group', { name: '音乐史地图画布', exact: true }) }
function picture(page, kind = '中国') { return page.getByRole('region', { name: `${kind}音乐史地图`, exact: true }).getByRole('img', { name: kind === '中国' ? '中国标准地图' : '欧洲地图', exact: true }) }
function card(page) { return page.getByRole('region', { name: '人物资料', exact: true }) }
async function drag(page, point, dx, dy) {
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 })
  await page.mouse.up()
}
async function fullImage(page, kind = '中国') {
  const image = picture(page, kind)
  await image.evaluate(element => element.decode())
  const imageBox = await image.boundingBox()
  const canvasBox = await canvas(page).boundingBox()
  assert.ok(imageBox && canvasBox)
  assert.ok(Math.abs(imageBox.width / imageBox.height - (kind === '中国' ? 1256 / 885 : 2)) < 0.01)
  assert.ok(imageBox.x >= canvasBox.x - 1 && imageBox.y >= canvasBox.y - 1 && imageBox.x + imageBox.width <= canvasBox.x + canvasBox.width + 1 && imageBox.y + imageBox.height <= canvasBox.y + canvasBox.height + 1)
  assert.equal(await page.getByLabel('地图缩放比例', { exact: true }).textContent(), '100%')
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
}
async function choosePoint(page, fraction) {
  const bounds = await canvas(page).boundingBox()
  const image = await picture(page).boundingBox()
  assert.ok(bounds && image)
  const point = { x: bounds.x + bounds.width * fraction.x, y: bounds.y + bounds.height * fraction.y }
  const expected = { x: (point.x - image.x) / image.width * 100, y: (point.y - image.y) / image.height * 100 }
  assert.ok(expected.x >= 0 && expected.x <= 100 && expected.y >= 0 && expected.y <= 100)
  await page.mouse.click(point.x, point.y)
  return expected
}
function matchingCoordinates(actual, expected, step) {
  assert.ok(Math.abs(actual.x - expected.x) < 0.1 && Math.abs(actual.y - expected.y) < 0.1, `${step}: selected point ${JSON.stringify(actual)} differs from transformed full-image coordinates ${JSON.stringify(expected)}`)
  evidence.coordinates.push({ step, expected: { x: expected.x, y: expected.y }, saved: { x: actual.x, y: actual.y } })
}
async function studentAvatarStatus(fileId, status, userId = student) {
  await api(`/api/upload?file_id=${encodeURIComponent(fileId)}`, { userId, status })
}
async function uploadMapAvatar(filename) {
  const form = new FormData()
  form.set('file', new File([await readFile(path.join(root, 'public/avatars', filename))], filename, { type: 'image/png' }))
  form.set('user_id', teacher)
  form.set('purpose', 'map-avatar')
  const response = await fetch(base + '/api/upload', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { cookie: `zhiyin_session=${session(teacher)}`, origin: base }, body: form })
  assert.equal(response.status, 200, redact(await response.clone().text()))
  return response.json()
}

async function verifyApiBasics() {
  const initial = await list()
  assert.ok(Array.isArray(initial) && initial.some(row => row.origin === 'builtin' && row.id === 'bach'))
  const db = new DatabaseSync(path.join(directory, 'zhiyin.sqlite'))
  try { db.prepare('INSERT INTO profiles(id,nickname,role) VALUES(?,?,?)').run(otherTeacher, '隔离验收第二位教师', 'teacher') }
  finally { db.close() }
  assert.ok((await list(otherTeacher)).some(row => row.id === 'bach'))
  const valid = { name: '不应保存的越权人物', years: '1900—2000', era: 'modern', map_kind: 'china', region: '验收地区', x: 50, y: 50, intro: '权限验收资料', works: '', note: '', sources: [], avatar_file_id: null }
  await api('/api/map-musicians', { userId: student, method: 'POST', body: valid, status: 403 })
  for (const method of ['PATCH', 'DELETE']) await api('/api/map-musicians/bach', { method, body: method === 'PATCH' ? { name: '不应改名' } : undefined, status: 404 })
  pass('student cannot create musicians; builtin musicians remain read-only; second signed teacher is a separate real profile')
  return initial
}
async function verifyOwner(record) {
  for (const method of ['PATCH', 'DELETE']) {
    await api(`/api/map-musicians/${record.id}`, { userId: student, method, body: method === 'PATCH' ? { intro: '不应保存的学生改动' } : undefined, status: 403 })
    await api(`/api/map-musicians/${record.id}`, { userId: otherTeacher, method, body: method === 'PATCH' ? { intro: '不应保存的其他教师改动' } : undefined, status: 404 })
  }
  assert.equal((await list()).find(row => row.id === record.id)?.intro, record.intro)
  pass('student writes and another teacher edits/deletes are rejected without changing the saved custom musician')
}
async function assertAvatarRevoked(fileId, oldUrl, stage) {
  await studentAvatarStatus(fileId, 404)
  await api(oldUrl, { userId: student, status: 404 })
  const ownerResponse = await fetch(new URL(oldUrl, base), { signal: AbortSignal.timeout(10000), headers: { cookie: `zhiyin_session=${session(teacher)}` } })
  assert.ok([200, 404].includes(ownerResponse.status), 'Original uploader may retain private access only while the unreferenced upload exists')
  evidence.assetAccess ??= []
  evidence.assetAccess.push({ stage, studentRenewalStatus: 404, studentOldUrlStatus: 404, originalUploaderStatus: ownerResponse.status })
}
async function verifyModel(page, record) {
  const count = requests.length
  await card(page).getByRole('button', { name: `与知音聊聊${record.name}`, exact: true }).click()
  await card(page).getByText('受控模型验收回复：仅引用已保存的人物资料。', { exact: true }).waitFor()
  assert.equal(requests.length, count + 1)
  const prompt = requests.at(-1).messages.find(message => message.role === 'system')?.content
  assert.equal(typeof prompt, 'string')
  const serialized = /<map-material>\s*([\s\S]*?)\s*<\/map-material>/.exec(prompt)?.[1]
  assert.ok(serialized, 'SDK system message must contain map-material from the actual saved row')
  const supplied = JSON.parse(serialized)
  for (const key of ['name', 'years', 'era', 'region', 'intro', 'works', 'note']) assert.equal(supplied[key], record[key], `Model context must use saved ${key}`)
  assert.ok(supplied.sources.some(source => source.title === sourceTitle && source.url === sourceUrl))
  for (const privateField of ['teacher_id', 'avatar', 'avatar_file_id', 'avatar_receipt']) assert.equal(privateField in supplied, false)
  evidence.model = { ...evidence.model, transport: 'real SDK HTTP + loopback SSE', requestCountBeforeDelete: requests.length, systemPromptMatchesSavedRow: true, sourcesMatchSavedRow: true, noOwnerOrSignedAvatarInModelContext: true }
  await card(page).getByRole('button', { name: '返回人物资料', exact: true }).click()
  pass('actual backend SDK request sends the saved custom musician and sources in its system message to a controlled local model')
}

function editor(page, editing = false) { return page.getByRole('dialog', { name: editing ? '编辑音乐家' : '添加音乐家', exact: true }) }
async function coordinatesFromForm(dialog) {
  return { x: Number(await dialog.getByLabel('横向位置（%）', { exact: true }).inputValue()), y: Number(await dialog.getByLabel('纵向位置（%）', { exact: true }).inputValue()) }
}
async function saveEditor(page, dialog, method, id) {
  const pending = page.waitForResponse(response => response.url() === base + '/api/map-musicians' + (id ? `/${id}` : '') && response.request().method() === method)
  await dialog.getByRole('button', { name: '保存音乐家', exact: true }).click()
  const response = await pending
  assert.equal(response.status(), method === 'POST' ? 201 : 200, redact(await response.text()))
  const record = await response.json()
  await dialog.waitFor({ state: 'hidden' })
  return record
}
async function selectMusician(page, record) {
  await page.getByRole('button', { name: `选择${record.name}`, exact: true }).click()
  await card(page).getByRole('heading', { name: record.name, exact: true }).waitFor()
}
async function verifyAvatar(record, userId = student, filename = 'bach.png') {
  assert.ok(record.avatar_file_id?.startsWith('local:'))
  const response = await api(record.avatar, { userId })
  assert.match(response.headers.get('content-type'), /^image\//)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path.join(root, 'public/avatars', filename)))
}

try {
  await mkdir(output, { recursive: true })
  const modelUrl = await startMock()
  await start(modelUrl)
  const initial = await verifyApiBasics()
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  const teacherContext = await context(teacher)
  const studentContext = await context(student)
  const otherContext = await context(otherTeacher)
  teacherPage = await teacherContext.newPage()
  const studentPage = await studentContext.newPage()
  const otherPage = await otherContext.newPage()
  for (const page of [teacherPage, studentPage, otherPage]) page.setDefaultTimeout(15000)
  await teacherPage.goto(base + '/map')
  await canvas(teacherPage).waitFor()
  await fullImage(teacherPage)

  await teacherPage.getByRole('button', { name: '添加音乐家', exact: true }).click()
  await teacherPage.getByRole('status').filter({ hasText: '在地图上选择位置' }).waitFor()
  await teacherPage.getByRole('button', { name: '取消选点', exact: true }).click()
  assert.equal(await editor(teacherPage).count(), 0)
  await teacherPage.getByRole('button', { name: '添加音乐家', exact: true }).click()
  await choosePoint(teacherPage, { x: 0.35, y: 0.4 })
  await editor(teacherPage).getByLabel('姓名', { exact: true }).fill('取消的临时人物不应保存')
  await editor(teacherPage).getByRole('button', { name: '取消', exact: true }).click()
  await editor(teacherPage).waitFor({ state: 'hidden' })
  assert.equal((await list()).length, initial.length)
  pass('canceling either point selection or the populated editor creates no musician')

  for (let count = 0; count < 4; count++) await teacherPage.getByRole('button', { name: '放大地图', exact: true }).click()
  await teacherPage.waitForFunction(() => document.querySelector('[aria-label="地图缩放比例"]')?.textContent === '244%')
  const zoomedCanvas = await canvas(teacherPage).boundingBox()
  assert.ok(zoomedCanvas)
  await drag(teacherPage, { x: zoomedCanvas.x + zoomedCanvas.width * 0.25, y: zoomedCanvas.y + zoomedCanvas.height * 0.25 }, 50, 20)
  await teacherPage.getByRole('button', { name: '添加音乐家', exact: true }).click()
  const beforePickDrag = await picture(teacherPage).boundingBox()
  await drag(teacherPage, { x: zoomedCanvas.x + zoomedCanvas.width * 0.25, y: zoomedCanvas.y + zoomedCanvas.height * 0.25 }, 30, 15)
  const afterPickDrag = await picture(teacherPage).boundingBox()
  assert.ok(beforePickDrag && afterPickDrag && Math.abs(afterPickDrag.x - beforePickDrag.x) > 10)
  assert.equal(await editor(teacherPage).count(), 0, 'Dragging in selection mode must not open an add editor')
  assert.equal((await list()).length, initial.length)
  const firstExpected = await choosePoint(teacherPage, { x: 0.4, y: 0.35 })
  const createDialog = editor(teacherPage)
  await createDialog.waitFor()
  matchingCoordinates(await coordinatesFromForm(createDialog), firstExpected, 'create form after zoom and pan')
  await createDialog.getByLabel('姓名', { exact: true }).fill(name)
  await createDialog.getByLabel('生卒年代', { exact: true }).fill('1900—2000（验收数据）')
  await createDialog.getByLabel('地区', { exact: true }).fill('仅用于验收的示意地区')
  await createDialog.getByLabel('简介', { exact: true }).fill(intro)
  await createDialog.getByLabel('代表作', { exact: true }).fill('《隔离验收作品》')
  await createDialog.getByLabel('学习提示', { exact: true }).fill('此记录是本地自动化验收数据。')
  await createDialog.getByLabel('来源标题 1', { exact: true }).fill(sourceTitle)
  await createDialog.getByLabel('来源链接 1', { exact: true }).fill(sourceUrl)
  await createDialog.getByLabel('头像图片', { exact: true }).setInputFiles(path.join(root, 'public/avatars/bach.png'))
  const created = await saveEditor(teacherPage, createDialog, 'POST')
  matchingCoordinates(created, firstExpected, 'persisted new musician after zoom and pan')
  assert.equal(created.origin, 'custom')
  assert.equal(created.teacher_id, teacher)
  assert.equal(created.map_kind, 'china')
  assert.equal(created.era, 'modern')
  assert.equal(created.intro, intro)
  await verifyAvatar(created)
  await selectMusician(teacherPage, created)
  await shot(teacherPage, 'teacher-created-after-zoom-pan.png')
  await verifyOwner(created)
  pass('teacher uploads an avatar and sources, picks transformed full-image coordinates accurately, and saves a visible custom musician; dragging does not add one')

  await studentPage.goto(base + '/map')
  await selectMusician(studentPage, created)
  await card(studentPage).getByText(intro, { exact: true }).waitFor()
  await card(studentPage).getByRole('link', { name: sourceTitle, exact: true }).waitFor()
  assert.equal(await studentPage.getByRole('button', { name: '添加音乐家', exact: true }).count(), 0)
  assert.equal(await card(studentPage).getByRole('button', { name: '编辑音乐家', exact: true }).count(), 0)
  assert.equal(await card(studentPage).getByRole('button', { name: '删除音乐家', exact: true }).count(), 0)
  const studentAvatar = card(studentPage).locator('img').first()
  await studentAvatar.evaluate(image => image.decode())
  assert.equal(new URL(await studentAvatar.getAttribute('src'), base).pathname, new URL(created.avatar, base).pathname)
  const markerBox = await studentPage.getByRole('button', { name: `选择${created.name}`, exact: true }).boundingBox()
  const imageBox = await picture(studentPage).boundingBox()
  assert.ok(markerBox && imageBox)
  matchingCoordinates({ x: (markerBox.x + markerBox.width / 2 - imageBox.x) / imageBox.width * 100, y: (markerBox.y + markerBox.height / 2 - imageBox.y) / imageBox.height * 100 }, created, 'student custom marker uses direct whole-image coordinates')
  await shot(studentPage, 'student-custom-musician.png')
  await studentPage.reload()
  await selectMusician(studentPage, created)
  assert.equal((await list(student)).find(row => row.id === created.id)?.intro, intro)
  await otherPage.goto(base + '/map')
  await selectMusician(otherPage, created)
  assert.equal(await card(otherPage).getByRole('button', { name: '编辑音乐家', exact: true }).count(), 0)
  assert.equal(await card(otherPage).getByRole('button', { name: '删除音乐家', exact: true }).count(), 0)
  pass('student sees the uploaded avatar, sources and person card after reload; student and another teacher have no ownership controls')

  await card(teacherPage).getByRole('button', { name: '编辑音乐家', exact: true }).click()
  const editDialog = editor(teacherPage, true)
  await editDialog.getByLabel('简介', { exact: true }).fill(changedIntro)
  await editDialog.getByLabel('头像图片', { exact: true }).setInputFiles(path.join(root, 'public/avatars/liutianhua.png'))
  await editDialog.getByRole('button', { name: '重新选点', exact: true }).click()
  await teacherPage.getByRole('status').filter({ hasText: '在地图上选择位置' }).waitFor()
  for (const kind of ['中国音乐史', '欧洲音乐史']) assert.equal(await teacherPage.getByRole('button', { name: kind, exact: true }).isDisabled(), true, 'Map switching is locked while an unsaved draft is being repositioned')
  const eraButtons = teacherPage.getByRole('navigation', { name: '音乐史时代', exact: true }).getByRole('button')
  for (const button of await eraButtons.all()) assert.equal(await button.isDisabled(), true, 'Era switching is locked while an unsaved draft is being repositioned')
  for (const action of ['编辑音乐家', '删除音乐家']) assert.equal(await card(teacherPage).getByRole('button', { name: action, exact: true }).isDisabled(), true, 'Ownership actions must not overwrite the draft being repositioned')
  assert.equal(await teacherPage.getByRole('button', { name: '取消选点', exact: true }).isEnabled(), true)
  const secondExpected = await choosePoint(teacherPage, { x: 0.2, y: 0.6 })
  const reopenedEditor = editor(teacherPage, true)
  matchingCoordinates(await coordinatesFromForm(reopenedEditor), secondExpected, 'edit form after selecting a new point')
  assert.equal(await reopenedEditor.getByLabel('简介', { exact: true }).inputValue(), changedIntro, 'Repicking must retain unsaved text')
  const updated = await saveEditor(teacherPage, reopenedEditor, 'PATCH', created.id)
  assert.equal(updated.id, created.id)
  assert.equal(updated.intro, changedIntro)
  assert.notEqual(updated.avatar_file_id, created.avatar_file_id)
  matchingCoordinates(updated, secondExpected, 'persisted edited musician')
  await verifyAvatar(updated, student, 'liutianhua.png')
  await assertAvatarRevoked(created.avatar_file_id, created.avatar, 'replaced-avatar')
  await teacherPage.reload()
  await selectMusician(teacherPage, updated)
  await card(teacherPage).getByText(changedIntro, { exact: true }).waitFor()
  await shot(teacherPage, 'teacher-updated-musician.png')
  await studentPage.reload()
  await selectMusician(studentPage, updated)
  await card(studentPage).getByText(changedIntro, { exact: true }).waitFor()
  await verifyModel(studentPage, updated)
  pass('repicking locks map/era switches and preserves unsaved text/avatar; edits persist after reload and the replaced avatar is inaccessible to students')

  const mobileContext = await context(student, true)
  const mobile = await mobileContext.newPage()
  mobile.setDefaultTimeout(15000)
  await mobile.goto(base + '/map')
  await selectMusician(mobile, updated)
  await fullImage(mobile)
  await noOverflow(mobile)
  await mobile.getByRole('button', { name: '放大地图', exact: true }).click()
  await mobile.waitForFunction(() => document.querySelector('[aria-label="地图缩放比例"]')?.textContent === '125%')
  await mobile.getByRole('button', { name: '显示完整地图', exact: true }).click()
  await fullImage(mobile)
  await shot(mobile, 'student-custom-mobile.png')
  await mobile.getByRole('button', { name: '欧洲音乐史', exact: true }).click()
  await fullImage(mobile, '欧洲')
  await noOverflow(mobile)
  pass('390px mobile custom markers/person cards keep both maps complete, button zoom/reset and no horizontal overflow')

  await card(teacherPage).getByRole('button', { name: '删除音乐家', exact: true }).click()
  const confirmation = teacherPage.getByRole('alertdialog', { name: '删除音乐家', exact: true })
  await confirmation.waitFor()
  assert.ok((await list()).some(row => row.id === updated.id), 'Opening deletion confirmation must not delete the musician')
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  assert.ok((await list()).some(row => row.id === updated.id))
  await card(teacherPage).getByRole('button', { name: '删除音乐家', exact: true }).click()
  const deleting = teacherPage.waitForResponse(response => response.url() === base + `/api/map-musicians/${updated.id}` && response.request().method() === 'DELETE')
  await confirmation.getByRole('button', { name: '确认删除', exact: true }).click()
  assert.equal((await deleting).status(), 200)
  await confirmation.waitFor({ state: 'hidden' })
  assert.ok(!(await list(student)).some(row => row.id === updated.id))
  await studentPage.reload()
  await canvas(studentPage).waitFor()
  assert.equal(await studentPage.getByRole('button', { name: `选择${updated.name}`, exact: true }).count(), 0)
  await assertAvatarRevoked(updated.avatar_file_id, updated.avatar, 'deleted-musician-avatar')
  const beforeDeletedChat = requests.length
  const deletedChat = await api('/api/chat', { userId: student, method: 'POST', body: { messages: [{ role: 'user', content: '请介绍这位音乐家。' }], context: { kind: 'composer', composerId: updated.id, name: updated.name } } })
  const deletedStream = await deletedChat.text()
  assert.match(deletedStream, /这部分超出已收录范围/)
  assert.equal(requests.length, beforeDeletedChat, 'Deleted musician must not be supplied to the model')
  evidence.model = { ...evidence.model, requestCountAfterDelete: requests.length, deletedIdTriggersGroundedFallback: true, deletedIdNotSentToModel: true }
  await shot(studentPage, 'student-after-delete.png')
  pass('confirmed deletion removes the student marker and avatar access; canceled deletion preserves it; the deleted ID is never sent to the model')

  const damagedAvatar = await uploadMapAvatar('bach.png')
  const healthyAvatar = await uploadMapAvatar('liutianhua.png')
  const avatarRecord = (label, file, x) => ({ name: label, years: '', era: 'modern', map_kind: 'china', map_revision: 'china-gs2023-2767', region: '隔离头像降级验收地区', x, y: 35, intro: '仅用于验证单个头像文件失效时的人物资料降级。', works: '', note: '', sources: [], avatar_file_id: file.fileId, avatar_receipt: file.receipt })
  const damaged = await json('/api/map-musicians', { method: 'POST', status: 201, body: avatarRecord('缺失头像验收音乐家 ZX1023', damagedAvatar, 38) })
  const healthy = await json('/api/map-musicians', { method: 'POST', status: 201, body: avatarRecord('可用头像验收音乐家 ZX1023', healthyAvatar, 65) })
  assert.match(damaged.avatar_file_id, /^local:[0-9a-f-]{36}$/)
  const uploadsDirectory = path.resolve(directory, 'uploads')
  const damagedContent = path.resolve(uploadsDirectory, `${damaged.avatar_file_id.slice(6)}.bin`)
  assert.equal(path.dirname(damagedContent), uploadsDirectory)
  assert.equal(path.dirname(uploadsDirectory), path.resolve(directory))
  await rm(damagedContent)
  const degradedList = await list(student)
  const degraded = degradedList.find(row => row.id === damaged.id)
  assert.ok(degraded && degraded.avatar === '', 'An unreadable avatar must fall back to the name initial')
  assert.ok(degradedList.some(row => row.id === 'bach') && degradedList.some(row => row.id === healthy.id && row.avatar), 'A single failed avatar must not hide builtin musicians or another custom avatar')
  await verifyAvatar(degradedList.find(row => row.id === healthy.id), student, 'liutianhua.png')
  await studentPage.reload()
  await selectMusician(studentPage, degraded)
  assert.equal(await card(studentPage).locator('img').count(), 0)
  await card(studentPage).getByText(degraded.name.slice(0, 1), { exact: true }).waitFor()
  await card(studentPage).getByText(degraded.intro, { exact: true }).waitFor()
  await shot(studentPage, 'student-missing-avatar-fallback.png')
  await api(`/api/map-musicians/${damaged.id}`, { method: 'DELETE' })
  await api(`/api/map-musicians/${healthy.id}`, { method: 'DELETE' })
  pass('one deliberately missing avatar in the owned temporary fixture falls back to a name initial while builtin and other custom musicians remain readable')

  assert.deepEqual(errors, [], 'Unexpected browser or controlled-model errors')
  pass('all checked workflows complete without browser page errors')
  await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ passed: evidence.checks.length, screenshots: evidence.screenshots.length, modelRequests: requests.length, output, boundaries: evidence.boundaries }, null, 2))
} catch (error) {
  const message = redact(error instanceof Error ? error.message : String(error))
  console.error(message)
  console.error('Owned fixture logs:', redact(logs))
  await mkdir(output, { recursive: true })
  if (teacherPage && !teacherPage.isClosed()) await shot(teacherPage, 'failure-teacher.png').catch(() => {})
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ ...evidence, failed: true, error: message, browserErrors: errors }, null, 2))
  process.exitCode = 1
} finally {
  await browser?.close()
  if (service && service.exitCode === null) {
    const exited = once(service, 'exit')
    service.kill()
    await exited
  }
  if (mock) await new Promise((resolve, reject) => mock.close(error => error ? reject(error) : resolve()))
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('zhiyin-map-musicians-'))
  await rm(directory, { recursive: true, force: true })
}
