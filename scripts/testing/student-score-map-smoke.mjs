import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Run after a production build: pnpm exec node scripts/testing/student-score-map-smoke.mjs
// Optional: PLAYWRIGHT_MODULE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
// This owns only a temporary SQLite/upload directory and port 5007. Real SSO,
// external LLM responses and the live IMSLP site are outside this local check.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
await access(path.join(root, '.next/BUILD_ID'))
const port = 5007
const base = `http://localhost:${port}`
const directory = await mkdtemp(path.join(tmpdir(), 'zhiyin-student-score-map-'))
const output = path.join(root, 'docs/verification/student-score-map-2026-10-23')
const secret = randomBytes(48).toString('base64url')
const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const apiScoreTitle = '新分类接口验收圆舞曲'
const formScoreTitle = '新分类表单验收圆舞曲'
const materialTitle = '浏览器验收资料 ZX1023'
const unknownQuestion = '未收录术语QZX9635在火星的音律是什么？'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2i8AAAAASUVORK5CYII=', 'base64')
const evidence = {
  fixture: 'Next production start on port 5007; temporary SQLite/uploads; signed synthetic student/teacher sessions',
  boundaries: {
    realChaoxingSSO: false,
    currentDataModified: false,
    unknownQuestionSSE: 'real local /api/chat fallback, no external model',
    mapComposerChat: 'intercepted only for layout checks; external model not tested',
    imslp: 'real link/popup interaction with destination navigation intercepted; live site not tested',
    thirdPartyIframeSDK: 'inert local responses for third-party scripts',
  },
  checks: [], screenshots: [], mapMeasurements: [],
}
const errors = []
let service
let browser
let studentPage
let logs = ''

function session(userId) {
  const payload = Buffer.from(JSON.stringify({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student', expiresAt: Date.now() + 3600000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}
function pass(description) { evidence.checks.push(description); console.log(`PASS ${evidence.checks.length}: ${description}`) }
function redact(value) {
  return String(value).replaceAll(secret, '[redacted]').replace(/zhiyin_session=[^;\s"']+/g, 'zhiyin_session=[redacted]')
}
async function api(route, { userId = teacher, method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(base + route, {
    method, signal: AbortSignal.timeout(20000),
    headers: { cookie: `zhiyin_session=${session(userId)}`, origin: base, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ ...body, user_id: userId }) : undefined,
  })
  assert.equal(response.status, status, `${method} ${route}: ${redact(await response.clone().text())}`)
  return response
}
async function json(route, options) { return (await api(route, options)).json() }
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name), fullPage: true })
  evidence.screenshots.push(name)
}
async function noHorizontalOverflow(page, description) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }))
  assert.ok(dimensions.document <= dimensions.viewport, `${description}: ${JSON.stringify(dimensions)}`)
}
async function start() {
  const probe = createServer()
  probe.listen(port, '::')
  await once(probe, 'listening')
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
  service = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ZHIYIN_STORAGE_MODE: 'local', ZHIYIN_DATA_DIR: directory, ZHIYIN_SESSION_SECRET: secret, ZHIYIN_STUDENT_TEST_MODE: 'false', CHAOXING_SSO_BASE_URL: 'http://127.0.0.1:9', CHAOXING_SSO_SHARED_SECRET: randomBytes(32).toString('base64url') },
  })
  let startupError
  service.on('error', error => { startupError = error })
  service.stdout.on('data', chunk => { logs = (logs + String(chunk)).slice(-16000) })
  service.stderr.on('data', chunk => { logs = (logs + String(chunk)).slice(-16000) })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (startupError) throw startupError
    if (service.exitCode !== null) throw new Error(`Isolated server exited: ${redact(logs)}`)
    try { if ((await fetch(base + '/api/auth/session', { signal: AbortSignal.timeout(1000) })).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Isolated server readiness timed out: ${redact(logs)}`)
}
async function upload() {
  const form = new FormData()
  form.set('file', new File([png], '新分类验收谱图.png', { type: 'image/png' }))
  form.set('user_id', teacher)
  const response = await fetch(base + '/api/upload', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { cookie: `zhiyin_session=${session(teacher)}`, origin: base }, body: form })
  assert.equal(response.status, 200, redact(await response.clone().text()))
  return response.json()
}
async function context(userId, viewport = { width: 1440, height: 1000 }) {
  const result = await browser.newContext({ viewport, reducedMotion: 'reduce' })
  await result.addCookies([{ name: 'zhiyin_session', value: session(userId), url: base, httpOnly: true, sameSite: 'Lax' }])
  result.on('page', page => page.on('pageerror', error => errors.push(error.message)))
  await result.route('https://robot.chaoxing.com/coder-sdk/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await result.route('https://imslp.org/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>IMSLP link destination fixture</title>' }))
  await result.route('**/api/chat', async route => {
    const body = route.request().postDataJSON()
    if (body?.context?.kind !== 'composer') return route.continue()
    return route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: 'data: {"content":"地图资料对话布局验收。"}\n\ndata: [DONE]\n\n' })
  })
  return result
}
function assistant(page) { return page.getByRole('dialog', { name: '知音课程助手', exact: true }) }
async function closeAssistant(page) {
  await page.getByRole('button', { name: '收起知音课程助手', exact: true }).click()
  await assistant(page).waitFor({ state: 'hidden' })
}

try {
  await mkdir(output, { recursive: true })
  await start()
  const file = await upload()
  const score = await json('/api/scores', { method: 'POST', status: 201, body: {
    title: apiScoreTitle, composer: '验收作曲家', category: 'foreign', score_type: '圆舞曲', period: '19世纪', published: true,
    pages: [{ file_id: file.fileId, file_name: file.name, file_type: file.type, upload_receipt: file.receipt }],
  } })
  assert.equal(score.score_type, '圆舞曲')
  assert.equal(score.period, '19世纪')
  assert.equal(score.published, true)
  const matching = await json('/api/scores?score_type=%E5%9C%86%E8%88%9E%E6%9B%B2&period=19%E4%B8%96%E7%BA%AA', { userId: student })
  assert.ok(matching.some(item => item.id === score.id))
  for (const query of ['score_type=夜曲', 'period=18世纪']) {
    assert.ok(!(await json(`/api/scores?${new URLSearchParams(query)}`, { userId: student })).some(item => item.id === score.id))
  }
  await json(`/api/scores/${score.id}`, { method: 'PATCH', body: { tips: '只修改教学提醒，不清空分类。' } })
  const retained = await json(`/api/scores/${score.id}`)
  assert.equal(retained.score_type, '圆舞曲')
  assert.equal(retained.period, '19世纪')
  assert.equal(retained.published, true)
  pass('real upload/API publishes type and period without difficulty or genre_id; filters and unrelated PATCH retain classification')
  await json('/api/knowledge', { method: 'POST', status: 201, body: { title: materialTitle, content: '这是仅用于本地界面检索验收的课程资料。', keywords: ['验收资料关键词'] } })

  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  const studentContext = await context(student)
  const teacherContext = await context(teacher)
  studentPage = await studentContext.newPage()
  const teacherPage = await teacherContext.newPage()
  studentPage.setDefaultTimeout(15000)
  teacherPage.setDefaultTimeout(15000)
  await studentPage.goto(base + '/practice')
  await studentPage.getByRole('button', { name: '上传个人琴谱', exact: true }).waitFor()
  const libraryLink = studentPage.getByRole('link', { name: '查询曲库', exact: true })
  assert.equal(await libraryLink.getAttribute('href'), 'https://imslp.org')
  assert.equal(await libraryLink.getAttribute('target'), '_blank')
  assert.match(await libraryLink.getAttribute('rel') ?? '', /noopener/)
  const popupPromise = studentPage.waitForEvent('popup')
  await libraryLink.click()
  const popup = await popupPromise
  await popup.waitForURL('https://imslp.org/**')
  await popup.close()
  assert.equal(await studentPage.getByRole('navigation', { name: '课堂导航' }).getByRole('link', { name: '课程知识与答疑', exact: true }).count(), 0)
  await studentPage.getByText(apiScoreTitle, { exact: true }).waitFor()
  await studentPage.getByText('圆舞曲', { exact: true }).waitFor()
  await studentPage.getByText('19世纪', { exact: true }).waitFor()
  pass('student library displays type/period, removes the independent knowledge navigation and opens IMSLP in a new window')
  await screenshot(studentPage, 'student-practice-desktop.png')

  const trigger = studentPage.getByRole('button', { name: '打开知音课程助手', exact: true })
  assert.equal(await trigger.evaluate(element => getComputedStyle(element).position), 'fixed')
  await trigger.click()
  await assistant(studentPage).waitFor()
  await assistant(studentPage).getByRole('tab', { name: '课程答疑', exact: true }).waitFor()
  await assistant(studentPage).getByRole('tab', { name: '课程资料', exact: true }).click()
  await assistant(studentPage).getByLabel('搜索课程资料', { exact: true }).fill('ZX1023')
  await assistant(studentPage).getByRole('heading', { name: materialTitle, exact: true }).waitFor()
  await assistant(studentPage).getByLabel('搜索课程资料', { exact: true }).fill('不存在的课程资料QZX9635')
  await assistant(studentPage).getByText('未找到匹配的课程资料。', { exact: true }).waitFor()
  await assistant(studentPage).getByRole('tab', { name: '课程答疑', exact: true }).click()
  await assistant(studentPage).getByText('知音 · 智能讲解', { exact: true }).waitFor()
  const responsePromise = studentPage.waitForResponse(response => response.url() === base + '/api/chat' && response.request().method() === 'POST')
  const chatInput = assistant(studentPage).getByPlaceholder('围绕课程内容向知音提问…', { exact: true })
  await chatInput.fill(unknownQuestion)
  await chatInput.press('Enter')
  const chatResponse = await responsePromise
  assert.equal(chatResponse.status(), 200)
  assert.match(chatResponse.headers()['content-type'], /text\/event-stream/)
  const stream = await chatResponse.text()
  assert.match(stream, /这部分超出已收录范围/)
  assert.match(stream, /data: \[DONE\]/)
  await assistant(studentPage).getByText('这部分超出已收录范围。', { exact: false }).waitFor()
  await closeAssistant(studentPage)
  await trigger.click()
  await assistant(studentPage).getByText(unknownQuestion, { exact: true }).waitFor()
  await assistant(studentPage).getByRole('tab', { name: '课程资料', exact: true }).click()
  await assistant(studentPage).getByRole('tab', { name: '课程答疑', exact: true }).click()
  await assistant(studentPage).getByText(unknownQuestion, { exact: true }).waitFor()
  await closeAssistant(studentPage)
  await studentPage.getByRole('navigation', { name: '课堂导航' }).getByRole('link', { name: '音乐史地图', exact: true }).click()
  await studentPage.waitForURL('**/map')
  await trigger.click()
  await assistant(studentPage).getByText(unknownQuestion, { exact: true }).waitFor()
  await assistant(studentPage).getByText('这部分超出已收录范围。', { exact: false }).waitFor()
  await screenshot(studentPage, 'student-assistant-persistent.png')
  await closeAssistant(studentPage)
  pass('floating assistant searches materials and renders real fallback SSE; close/reopen, tab switches and client navigation preserve conversation')

  await teacherPage.goto(base + '/teacher/scores')
  await teacherPage.getByRole('heading', { name: '琴谱管理', exact: true }).waitFor()
  assert.equal(await teacherPage.getByRole('button', { name: '打开知音课程助手', exact: true }).count(), 0)
  const row = teacherPage.getByRole('row').filter({ hasText: apiScoreTitle })
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const editDialog = teacherPage.getByRole('dialog', { name: '编辑琴谱属性与文件', exact: true })
  await editDialog.waitFor()
  assert.equal(await editDialog.getByLabel('类型（选填）', { exact: true }).textContent(), '圆舞曲')
  assert.equal(await editDialog.getByLabel('时期（选填）', { exact: true }).inputValue(), '19世纪')
  assert.equal(await editDialog.getByText(/难度|曲风/).count(), 0)
  await screenshot(teacherPage, 'teacher-score-editor.png')
  await teacherPage.keyboard.press('Escape')
  await editDialog.waitFor({ state: 'hidden' })
  await teacherPage.getByRole('button', { name: '上传 / 批量上传', exact: true }).click()
  const createDialog = teacherPage.getByRole('dialog', { name: '上传琴谱', exact: true })
  await createDialog.getByLabel('选择琴谱文件', { exact: true }).setInputFiles({ name: '新分类表单验收.png', mimeType: 'image/png', buffer: png })
  await createDialog.getByLabel('曲名 *', { exact: true }).fill(formScoreTitle)
  await createDialog.getByLabel('作曲家 *', { exact: true }).fill('表单验收作曲家')
  await createDialog.getByRole('combobox').filter({ hasText: '选择国内 / 国外' }).click()
  await teacherPage.getByRole('option', { name: '国外', exact: true }).click()
  await createDialog.getByLabel('类型（选填）', { exact: true }).click()
  await teacherPage.getByRole('option', { name: '圆舞曲', exact: true }).click()
  await createDialog.getByLabel('时期（选填）', { exact: true }).fill('19世纪')
  await createDialog.getByRole('checkbox', { name: '发布琴谱，学生可见', exact: true }).check()
  const savePromise = teacherPage.waitForResponse(response => response.url() === base + '/api/scores' && response.request().method() === 'POST')
  await createDialog.getByRole('button', { name: '保存 1 份琴谱', exact: true }).click()
  const saveResponse = await savePromise
  assert.equal(saveResponse.status(), 201, await saveResponse.text())
  const formScore = await saveResponse.json()
  assert.equal(formScore.score_type, '圆舞曲')
  assert.equal(formScore.period, '19世纪')
  assert.equal(formScore.published, true)
  await createDialog.waitFor({ state: 'hidden' })
  await teacherPage.getByRole('row').filter({ hasText: formScoreTitle }).waitFor()
  assert.ok((await json('/api/scores', { userId: student })).some(item => item.id === formScore.id))
  await screenshot(teacherPage, 'teacher-scores-desktop.png')
  pass('teacher sees type/period without difficulty/style and publishes a real uploaded score through the form; student API receives it')

  // Map selectors follow the page's accessible regions, labels and real composers.
  await studentPage.getByRole('heading', { name: '音乐史地图', exact: true }).waitFor()
  await noHorizontalOverflow(studentPage, 'desktop map')
  const mapSection = studentPage.getByRole('region', { name: '音乐史地图与人物资料', exact: true })
  const personCard = mapSection.getByRole('region', { name: '人物资料', exact: true })
  await studentPage.evaluate(() => window.scrollTo(0, 0))
  const scrollBefore = await studentPage.evaluate(() => window.scrollY)
  await mapSection.getByRole('button', { name: '选择刘天华', exact: true }).click()
  await personCard.getByRole('heading', { name: '刘天华', exact: true }).waitFor()
  assert.equal(await mapSection.getByRole('button', { name: '选择刘天华', exact: true }).getAttribute('aria-pressed'), 'true')
  await personCard.getByRole('heading', { name: '代表作与音乐贡献', exact: true }).waitFor()
  await personCard.getByRole('heading', { name: '资料来源', exact: true }).waitFor()
  const mapBox = await mapSection.getByRole('region', { name: '中国音乐史地图', exact: true }).boundingBox()
  const cardBox = await personCard.boundingBox()
  assert.ok(mapBox && cardBox)
  assert.ok(cardBox.x >= mapBox.x + mapBox.width - 1, 'Desktop person card must sit beside the map')
  assert.ok(Math.abs(cardBox.y - mapBox.y) <= 2, 'Desktop map and person card must share the same top edge')
  assert.ok(mapBox.width >= 500, `Expected enlarged desktop map; got ${mapBox.width}px`)
  assert.equal(await studentPage.evaluate(() => window.scrollY), scrollBefore, 'Selecting a person must not scroll the document')
  evidence.mapMeasurements.push({ viewport: 1440, map: mapBox, person: cardBox, scrollBefore, scrollAfter: await studentPage.evaluate(() => window.scrollY) })
  await screenshot(studentPage, 'student-map-desktop.png')
  await studentPage.getByRole('navigation', { name: '音乐史时代', exact: true }).getByRole('button', { name: /明清/ }).click()
  await personCard.getByRole('heading', { name: '从一位音乐家开始', exact: true }).waitFor()
  await mapSection.getByRole('button', { name: '选择朱载堉', exact: true }).click()
  await personCard.getByRole('heading', { name: '朱载堉', exact: true }).waitFor()
  await studentPage.getByRole('button', { name: '欧洲音乐史', exact: true }).click()
  await mapSection.getByRole('region', { name: '欧洲音乐史地图', exact: true }).waitFor()
  await personCard.getByRole('heading', { name: '从一位音乐家开始', exact: true }).waitFor()
  await studentPage.getByRole('navigation', { name: '音乐史时代', exact: true }).getByRole('button', { name: /巴洛克时期/ }).click()
  await mapSection.getByRole('button', { name: '选择巴赫', exact: true }).click()
  await personCard.getByRole('heading', { name: '巴赫', exact: true }).waitFor()
  await mapSection.getByRole('heading', { name: '巴洛克时期 · 同期中国音乐', exact: true }).waitFor()
  await personCard.getByRole('button', { name: '与知音聊聊巴赫', exact: true }).click()
  await personCard.getByText('地图资料对话布局验收。', { exact: true }).waitFor()
  await personCard.getByRole('button', { name: '返回人物资料', exact: true }).click()
  await personCard.getByRole('heading', { name: '资料来源', exact: true }).waitFor()
  await studentPage.setViewportSize({ width: 1024, height: 900 })
  await noHorizontalOverflow(studentPage, '1024px landscape map')
  const tabletMap = await mapSection.getByRole('region', { name: '欧洲音乐史地图', exact: true }).boundingBox()
  const tabletCard = await personCard.boundingBox()
  assert.ok(tabletMap && tabletCard && tabletCard.x >= tabletMap.x + tabletMap.width - 1, '1024px landscape keeps the person card beside the map')
  assert.ok(Math.abs(tabletCard.y - tabletMap.y) <= 2)
  evidence.mapMeasurements.push({ viewport: 1024, map: tabletMap, person: tabletCard })
  await screenshot(studentPage, 'student-map-tablet.png')
  await studentPage.setViewportSize({ width: 1440, height: 1000 })
  pass('enlarged map and embedded person card align at desktop/1024px; person selection keeps scroll position; era/region and inline chat switching work')

  await studentPage.goto(base + '/knowledge')
  await studentPage.waitForURL(url => url.pathname === '/' && url.searchParams.get('assistant') === '1')
  await assistant(studentPage).waitFor()
  await assistant(studentPage).getByRole('tab', { name: '课程答疑', exact: true }).waitFor()
  pass('legacy student /knowledge redirects to /?assistant=1 with the course assistant open')
  await screenshot(studentPage, 'student-legacy-knowledge.png')
  await studentPage.setViewportSize({ width: 390, height: 844 })
  await noHorizontalOverflow(studentPage, 'mobile course assistant')
  await screenshot(studentPage, 'student-assistant-mobile.png')
  await closeAssistant(studentPage)
  await studentPage.getByRole('button', { name: /^音乐史地图区/ }).click()
  await studentPage.waitForURL('**/map')
  await studentPage.getByRole('heading', { name: '音乐史地图', exact: true }).waitFor()
  await noHorizontalOverflow(studentPage, 'mobile map')
  await studentPage.getByRole('region', { name: '中国音乐史地图', exact: true }).getByRole('button', { name: '选择刘天华', exact: true }).click()
  await studentPage.getByRole('region', { name: '人物资料', exact: true }).getByRole('heading', { name: '刘天华', exact: true }).waitFor()
  await noHorizontalOverflow(studentPage, 'mobile selected person card')
  await screenshot(studentPage, 'student-map-mobile.png')
  pass('390px mobile course assistant and map have no horizontal document overflow')
  assert.deepEqual(errors, [], 'Unexpected browser page errors')
  pass('no browser page errors during all checked workflows')
  await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ passed: evidence.checks.length, output, boundaries: evidence.boundaries }, null, 2))
} catch (error) {
  const message = redact(error instanceof Error ? error.message : String(error))
  console.error(message)
  console.error('Owned fixture server logs:', redact(logs))
  await mkdir(output, { recursive: true })
  if (studentPage && !studentPage.isClosed()) await screenshot(studentPage, 'failure-student.png').catch(() => {})
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ ...evidence, failed: true, error: message, browserErrors: errors }, null, 2))
  process.exitCode = 1
} finally {
  await browser?.close()
  if (service && service.exitCode === null) {
    const exited = once(service, 'exit')
    service.kill()
    await exited
  }
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('zhiyin-student-score-map-'))
  await rm(directory, { recursive: true, force: true })
}
