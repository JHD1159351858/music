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

// Requires an existing production build. Run with pnpm exec node, supplying
// PLAYWRIGHT_MODULE_PATH when Playwright comes from the bundled runtime.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
await access(path.join(root, '.next/BUILD_ID'))
const port = 5008
const base = `http://localhost:${port}`
const directory = await mkdtemp(path.join(tmpdir(), 'zhiyin-map-viewport-'))
const output = path.join(root, 'docs/verification/map-position-2026-10-23')
const secret = randomBytes(48).toString('base64url')
const student = 's0000000-0000-0000-0000-000000000001'
const payload = Buffer.from(JSON.stringify({ kind: 'session', userId: student, role: 'student', expiresAt: Date.now() + 3600000 })).toString('base64url')
const cookie = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
const evidence = {
  fixture: 'Next production start on port 5008; temporary SQLite; signed synthetic student session',
  boundaries: { realChaoxingSSO: false, liveLLM: false, currentDataModified: false, thirdPartyIframeSDK: 'inert local script responses' },
  checks: [], screenshots: [], measurements: [], positionChecks: [],
}
const errors = []
let service
let browser
let page
let logs = ''
let apiMusicians = []

function redact(value) { return String(value).replaceAll(secret, '[redacted]').replaceAll(cookie, '[redacted]') }
function pass(description) { evidence.checks.push(description); console.log(`PASS ${evidence.checks.length}: ${description}`) }
async function shot(target, name) {
  await target.screenshot({ path: path.join(output, name) })
  evidence.screenshots.push(name)
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
  service.stdout.on('data', chunk => { logs = (logs + String(chunk)).slice(-12000) })
  service.stderr.on('data', chunk => { logs = (logs + String(chunk)).slice(-12000) })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (startupError) throw startupError
    if (service.exitCode !== null) throw new Error(`Isolated server exited: ${redact(logs)}`)
    try { if ((await fetch(base + '/api/auth/session', { signal: AbortSignal.timeout(1000) })).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Isolated server readiness timed out: ${redact(logs)}`)
}
async function context(viewport, mobile = false) {
  const result = await browser.newContext({ viewport, reducedMotion: 'reduce', ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) })
  await result.addCookies([{ name: 'zhiyin_session', value: cookie, url: base, httpOnly: true, sameSite: 'Lax' }])
  result.on('page', target => target.on('pageerror', error => errors.push(error.message)))
  await result.route('https://robot.chaoxing.com/coder-sdk/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  // This test never opens composer chat; fail immediately if a layout action
  // accidentally requests external-model work.
  await result.route('**/api/chat', route => {
    errors.push('Unexpected chat request during map viewport checks')
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Model requests are outside this viewport fixture"}' })
  })
  return result
}
function map(target, kind = '中国') { return target.getByRole('region', { name: `${kind}音乐史地图`, exact: true }) }
function canvas(target) { return target.getByLabel('音乐史地图画布', { exact: true }) }
function scaleOutput(target) { return target.getByLabel('地图缩放比例', { exact: true }) }
async function scale(target) { return Number.parseFloat(await scaleOutput(target).textContent()) }
async function waitScale(target, expected) {
  await target.waitForFunction(value => Number.parseFloat(document.querySelector('[aria-label="地图缩放比例"]')?.textContent ?? '') === value, expected)
}
async function reset(target) {
  await target.getByRole('button', { name: '显示完整地图', exact: true }).click()
  await waitScale(target, 100)
}
async function fullImage(target, kind, viewport) {
  const image = map(target, kind).getByRole('img', { name: `${kind}地图`, exact: true })
  await image.evaluate(element => element.decode())
  const imageBox = await image.boundingBox()
  const canvasBox = await canvas(target).boundingBox()
  assert.ok(imageBox && canvasBox)
  assert.ok(Math.abs(imageBox.width / imageBox.height - 2) < 0.01, `${viewport}px ${kind}: image must preserve the original 2:1 ratio`)
  assert.ok(imageBox.x >= canvasBox.x - 1 && imageBox.y >= canvasBox.y - 1 && imageBox.x + imageBox.width <= canvasBox.x + canvasBox.width + 1 && imageBox.y + imageBox.height <= canvasBox.y + canvasBox.height + 1, `${viewport}px ${kind}: all image boundaries must fit in the canvas`)
  assert.equal(await scale(target), 100)
  evidence.measurements.push({ viewport, kind, scale: 100, image: imageBox, canvas: canvasBox })
}
async function noOverflow(target) {
  const dimensions = await target.evaluate(() => ({ width: window.innerWidth, content: document.documentElement.scrollWidth }))
  assert.ok(dimensions.content <= dimensions.width, `Horizontal overflow: ${JSON.stringify(dimensions)}`)
}
async function positions(target, name, kind = '中国') {
  const image = await map(target, kind).getByRole('img', { name: `${kind}地图`, exact: true }).boundingBox()
  const button = map(target, kind).getByRole('button', { name: `选择${name}`, exact: true })
  const avatar = button.locator('img').first()
  if (await avatar.count()) await avatar.evaluate(element => element.decode())
  const marker = await (await avatar.count() ? avatar : button.locator('span').first()).boundingBox()
  assert.ok(image && marker)
  return { image, marker, normalizedX: (marker.x + marker.width / 2 - image.x) / image.width, normalizedY: (marker.y + marker.height / 2 - image.y) / image.height }
}
async function matchesApiPosition(target, name, kind, stage, measured) {
  const expected = apiMusicians.find(musician => musician.name === name && musician.map_kind === (kind === '中国' ? 'china' : 'europe'))
  assert.ok(expected, `Missing API musician ${name}`)
  const actual = measured ?? await positions(target, name, kind)
  const point = { x: actual.normalizedX * 100, y: actual.normalizedY * 100 }
  assert.ok(Math.abs(point.x - expected.x) < 0.1 && Math.abs(point.y - expected.y) < 0.1, `${stage}: ${name} avatar center ${JSON.stringify(point)} must match full-image API point ${JSON.stringify({ x: expected.x, y: expected.y })}`)
  evidence.positionChecks.push({ stage, name, kind, viewport: target.viewportSize().width, scale: await scale(target), expected: { x: expected.x, y: expected.y }, actual: point })
  return actual
}
function synchronized(before, after, description) {
  assert.ok(Math.abs(before.normalizedX - after.normalizedX) < 0.005 && Math.abs(before.normalizedY - after.normalizedY) < 0.005, `${description}: marker must keep its relative location on the map`)
}
async function drag(target, start, dx, dy) {
  await target.mouse.move(start.x, start.y)
  await target.mouse.down()
  await target.mouse.move(start.x + dx, start.y + dy, { steps: 8 })
  await target.mouse.up()
}

try {
  await mkdir(output, { recursive: true })
  await start()
  const musicianResponse = await fetch(base + '/api/map-musicians', { headers: { cookie: `zhiyin_session=${cookie}` }, signal: AbortSignal.timeout(10000) })
  assert.equal(musicianResponse.status, 200)
  apiMusicians = await musicianResponse.json()
  assert.ok(Array.isArray(apiMusicians))
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  const desktop = await context({ width: 1440, height: 1000 })
  page = await desktop.newPage()
  page.setDefaultTimeout(12000)
  await page.goto(base + '/map')
  await canvas(page).waitFor()
  await fullImage(page, '中国', 1440)
  await noOverflow(page)
  await shot(page, 'china-complete-desktop.png')
  pass('desktop China initially shows the complete original 2:1 image within the canvas')

  const initialPositions = await matchesApiPosition(page, '刘天华', '中国', 'desktop initial')
  await page.getByRole('button', { name: '放大地图', exact: true }).click()
  await waitScale(page, 125)
  const enlargedPositions = await positions(page, '刘天华')
  synchronized(initialPositions, enlargedPositions, 'Button zoom')
  await matchesApiPosition(page, '刘天华', '中国', 'desktop button zoom', enlargedPositions)
  assert.ok(enlargedPositions.image.width > initialPositions.image.width)
  await page.getByRole('button', { name: '缩小地图', exact: true }).click()
  await waitScale(page, 100)
  pass('zoom buttons change 100% to 125% and back, keeping map and person markers synchronized')

  const viewportBox = await canvas(page).boundingBox()
  assert.ok(viewportBox)
  await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2)
  await page.mouse.wheel(0, -400)
  await page.waitForFunction(() => Number.parseFloat(document.querySelector('[aria-label="地图缩放比例"]')?.textContent ?? '') > 100)
  const wheelScale = await scale(page)
  assert.ok(wheelScale > 100)
  await reset(page)
  await fullImage(page, '中国', 1440)
  pass('mouse wheel zooms the map and the complete-map action restores the full image')

  for (let count = 0; count < 4; count++) await page.getByRole('button', { name: '放大地图', exact: true }).click()
  await waitScale(page, 244)
  const beforeDrag = await positions(page, '刘天华')
  const markerCenter = { x: beforeDrag.marker.x + beforeDrag.marker.width / 2, y: beforeDrag.marker.y + beforeDrag.marker.height / 2 }
  await canvas(page).evaluate(element => {
    window.__mapViewportGesture = []
    for (const type of ['pointerdown', 'pointermove', 'pointercancel', 'pointerup', 'dragstart', 'lostpointercapture']) element.addEventListener(type, event => {
      window.__mapViewportGesture.push({ type, target: event.target?.tagName, draggable: event.target?.draggable, x: event.clientX, y: event.clientY })
    }, { capture: true })
  })
  await drag(page, markerCenter, -70, -30)
  const afterDrag = await positions(page, '刘天华')
  const dragEvents = await page.evaluate(() => window.__mapViewportGesture)
  evidence.measurements.push({ action: 'drag', scale: await scale(page), before: beforeDrag, after: afterDrag, events: dragEvents })
  synchronized(beforeDrag, afterDrag, 'Pointer drag')
  await matchesApiPosition(page, '刘天华', '中国', 'desktop drag', afterDrag)
  assert.ok(!dragEvents.some(event => event.type === 'pointercancel'), 'Avatar native dragging must not cancel the map pointer gesture')
  assert.ok(Math.abs(afterDrag.image.x - beforeDrag.image.x + 70) < 2 && Math.abs(afterDrag.image.y - beforeDrag.image.y + 30) < 2, 'Image must follow the complete drag distance')
  await page.getByRole('region', { name: '人物资料', exact: true }).getByRole('heading', { name: '从一位音乐家开始', exact: true }).waitFor()
  assert.equal(await map(page).getByRole('button', { name: '选择刘天华', exact: true }).getAttribute('aria-pressed'), 'false')
  await map(page).getByRole('button', { name: '选择刘天华', exact: true }).click()
  await page.getByRole('region', { name: '人物资料', exact: true }).getByRole('heading', { name: '刘天华', exact: true }).waitFor()
  await shot(page, 'china-zoomed-dragged-desktop.png')
  pass('drag moves map and markers together without selecting a person; a subsequent click still opens the embedded person card')

  const beforeEra = await positions(page, '刘天华')
  await page.getByRole('navigation', { name: '音乐史时代', exact: true }).getByRole('button', { name: /明清/ }).click()
  await waitScale(page, 244)
  const afterEraImage = await map(page).getByRole('img', { name: '中国地图', exact: true }).boundingBox()
  assert.ok(afterEraImage)
  assert.ok(Math.abs(beforeEra.image.x - afterEraImage.x) < 1 && Math.abs(beforeEra.image.y - afterEraImage.y) < 1 && Math.abs(beforeEra.image.width - afterEraImage.width) < 1, 'Era changes must preserve zoom and pan')
  await matchesApiPosition(page, '朱载堉', '中国', 'desktop initial-letter marker after era switch')
  await page.getByRole('button', { name: '欧洲音乐史', exact: true }).click()
  await fullImage(page, '欧洲', 1440)
  await matchesApiPosition(page, '肖邦', '欧洲', 'desktop Europe initial')
  await shot(page, 'europe-complete-desktop.png')
  await page.getByRole('button', { name: '放大地图', exact: true }).click()
  await waitScale(page, 125)
  await matchesApiPosition(page, '肖邦', '欧洲', 'desktop Europe button zoom')
  await page.getByRole('button', { name: '中国音乐史', exact: true }).click()
  await fullImage(page, '中国', 1440)
  await page.getByRole('button', { name: '放大地图', exact: true }).click()
  await waitScale(page, 125)
  await page.setViewportSize({ width: 390, height: 844 })
  await waitScale(page, 100)
  await fullImage(page, '中国', 390)
  await matchesApiPosition(page, '刘天华', '中国', 'resize 1440 to 390 resets without anchor drift')
  await noOverflow(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await waitScale(page, 100)
  await fullImage(page, '中国', 1440)
  await matchesApiPosition(page, '刘天华', '中国', 'resize 390 to 1440 resets without anchor drift')
  pass('era switching preserves the view; region switches and 1440/390 resizing reset the complete map without avatar-center drift from API coordinates')

  const mobileContext = await context({ width: 390, height: 844 }, true)
  const mobile = await mobileContext.newPage()
  mobile.setDefaultTimeout(12000)
  await mobile.goto(base + '/map')
  await canvas(mobile).waitFor()
  await fullImage(mobile, '中国', 390)
  await matchesApiPosition(mobile, '刘天华', '中国', 'mobile China initial')
  await noOverflow(mobile)
  await shot(mobile, 'china-complete-mobile.png')
  const mobileBox = await canvas(mobile).boundingBox()
  assert.ok(mobileBox)
  const cx = mobileBox.x + mobileBox.width / 2
  const cy = mobileBox.y + mobileBox.height / 2
  const touch = await mobileContext.newCDPSession(mobile)
  const points = distance => [{ x: cx - distance, y: cy, id: 1 }, { x: cx + distance, y: cy, id: 2 }]
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(25) })
  for (const distance of [30, 35, 40, 45]) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await mobile.waitForFunction(() => Number.parseFloat(document.querySelector('[aria-label="地图缩放比例"]')?.textContent ?? '') > 100)
  evidence.measurements.push({ action: 'mobile-two-finger-pinch', scale: await scale(mobile) })
  await matchesApiPosition(mobile, '刘天华', '中国', 'mobile two-finger pinch')
  await noOverflow(mobile)
  await reset(mobile)
  await fullImage(mobile, '中国', 390)
  await matchesApiPosition(mobile, '刘天华', '中国', 'mobile complete-map reset')
  await mobile.getByRole('button', { name: '欧洲音乐史', exact: true }).click()
  await fullImage(mobile, '欧洲', 390)
  await matchesApiPosition(mobile, '肖邦', '欧洲', 'mobile Europe initial')
  await mobile.getByRole('button', { name: '放大地图', exact: true }).click()
  await waitScale(mobile, 125)
  await matchesApiPosition(mobile, '肖邦', '欧洲', 'mobile Europe button zoom')
  const beforeMobileDrag = await positions(mobile, '肖邦', '欧洲')
  const dragCanvas = await canvas(mobile).boundingBox()
  assert.ok(dragCanvas)
  const startTouch = { x: dragCanvas.x + dragCanvas.width / 2, y: dragCanvas.y + dragCanvas.height / 2, id: 1 }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [startTouch] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...startTouch, x: startTouch.x - 20 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const afterMobileDrag = await matchesApiPosition(mobile, '肖邦', '欧洲', 'mobile touch drag')
  synchronized(beforeMobileDrag, afterMobileDrag, 'Mobile touch drag')
  assert.ok(Math.abs(afterMobileDrag.image.x - beforeMobileDrag.image.x) > 5, 'Mobile touch drag must move the enlarged map')
  await reset(mobile)
  await fullImage(mobile, '欧洲', 390)
  await matchesApiPosition(mobile, '肖邦', '欧洲', 'mobile Europe reset after drag')
  await noOverflow(mobile)
  await shot(mobile, 'europe-complete-mobile.png')
  pass('390px fits both complete maps, supports button zoom/touch drag/pinch/reset, and keeps avatar centers on their API coordinates without horizontal overflow')

  assert.deepEqual(errors, [], 'Unexpected browser errors or model requests')
  pass('no browser page errors or chat/model requests occur during map interactions')
  await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ passed: evidence.checks.length, output, boundaries: evidence.boundaries }, null, 2))
} catch (error) {
  const message = redact(error instanceof Error ? error.message : String(error))
  console.error(message)
  console.error('Owned fixture logs:', redact(logs))
  await mkdir(output, { recursive: true })
  if (page && !page.isClosed()) await shot(page, 'failure-desktop.png').catch(() => {})
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
  assert.ok(path.basename(directory).startsWith('zhiyin-map-viewport-'))
  await rm(directory, { recursive: true, force: true })
}
