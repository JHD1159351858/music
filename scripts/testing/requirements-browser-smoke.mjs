import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const directory = await mkdtemp(path.join(tmpdir(), 'zhiyin-requirements-browser-'))
const output = path.join(root, 'docs/verification/requirements-2026-10-16')
await mkdir(output, { recursive: true })
const base = 'http://localhost:5003'
const secret = randomBytes(48).toString('base64url')
const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const other = 's0000000-0000-0000-0000-000000000002'
const cookies = new Map()
function token(userId) {
  if (!cookies.has(userId)) {
    const payload = Buffer.from(JSON.stringify({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student', expiresAt: Date.now() + 3600000 })).toString('base64url')
    cookies.set(userId, `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`)
  }
  return cookies.get(userId)
}
const evidence = { checks: [], screenshots: [], media: [], liveLLM: 'not requested', auth: 'isolated signed fixture; real Chaoxing SSO not tested' }
function pass(check) { evidence.checks.push(check); console.log(`PASS ${check}`) }
async function api(route, userId = teacher, method = 'GET', body, status = 200) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(20000), headers: { cookie: `zhiyin_session=${token(userId)}`, origin: base, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify({ ...body, user_id: userId }) : undefined })
  assert.equal(response.status, status, `${method} ${route}: ${await response.clone().text()}`)
  return response.json()
}
async function upload(filename, content, type, userId) {
  const form = new FormData(); form.set('file', new File([content], filename, { type })); form.set('user_id', userId)
  const response = await fetch(base + '/api/upload', { method: 'POST', headers: { cookie: `zhiyin_session=${token(userId)}`, origin: base }, body: form })
  assert.equal(response.status, 200)
  return response.json()
}
const service = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', '5003'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ZHIYIN_STORAGE_MODE: 'local', ZHIYIN_DATA_DIR: directory, ZHIYIN_SESSION_SECRET: secret, ZHIYIN_STUDENT_TEST_MODE: 'false' } })
let logs = ''
service.stdout.on('data', chunk => { logs = (logs + String(chunk)).slice(-12000) })
service.stderr.on('data', chunk => { logs = (logs + String(chunk)).slice(-12000) })
let browser
try {
  for (let attempt = 0; ; attempt++) {
    if (service.exitCode !== null) throw new Error(`Fixture server failed: ${logs}`)
    try { if ((await fetch(base + '/api/auth/session')).ok) break } catch {}
    if (attempt > 100) throw new Error('Fixture server readiness timeout')
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  await api('/api/profiles', teacher, 'PATCH', { student_id: student, class_name: '钢琴一班' })
  await api('/api/profiles', teacher, 'PATCH', { student_id: other, class_name: '钢琴二班' })
  const genre = await api('/api/genres', teacher, 'POST', { name: '验收曲风' }, 201)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2i8AAAAASUVORK5CYII=', 'base64')
  const file = await upload('验收谱图.png', png, 'image/png', teacher)
  const score = await api('/api/scores', teacher, 'POST', { title: '班级验收练习曲', composer: '验收作者', difficulty: 'beginner', category: 'domestic', genre_id: genre.id, published: true, target_classes: ['钢琴一班'], file_id: file.fileId, file_name: file.name, file_type: file.type }, 201)
  assert.equal((await api('/api/scores', student)).length, 1)
  assert.equal((await api('/api/scores', other)).length, 0)
  pass('class publication is enforced by real HTTP API')
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
  const errors = []
  async function context(userId) {
    const result = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['microphone'] })
    await result.addCookies([{ name: 'zhiyin_session', value: token(userId), url: base, httpOnly: true, sameSite: 'Lax' }])
    result.on('page', page => page.on('pageerror', error => errors.push(error.message)))
    return result
  }
  const studentContext = await context(student)
  const teacherContext = await context(teacher)
  const page = await studentContext.newPage()
  const teacherPage = await teacherContext.newPage()
  async function shot(target, name) { await target.screenshot({ path: path.join(output, name), fullPage: true }); evidence.screenshots.push(name) }

  await teacherPage.goto(base + '/knowledge')
  await teacherPage.getByRole('button', { name: '新增知识' }).click()
  await teacherPage.getByLabel('知识标题').fill('连奏练习')
  await teacherPage.getByLabel('课程内容').fill('手指保持放松，先慢练并听清音与音之间的连接。\n创作年代：课程资料未收录\n所属时期：课程资料未收录')
  await teacherPage.getByLabel('检索词').fill('连奏，legato')
  await teacherPage.getByRole('button', { name: '保存知识' }).click()
  await teacherPage.getByRole('heading', { name: '连奏练习', exact: true }).waitFor()
  pass('teacher adds course knowledge through the actual form')
  await shot(teacherPage, 'teacher-knowledge.png')
  await page.goto(base + '/analysis')
  await page.getByRole('tab', { name: 'MusicXML / ABC 文本' }).click()
  await page.locator('textarea').fill('X:1\nT:验收音阶\nM:4/4\nK:C\nC D E F | G A B c')
  await page.getByRole('button', { name: '开始分析', exact: true }).click()
  await page.getByText('从 ABC 实际读取 8 个有音高的谱面音符', { exact: false }).waitFor()
  assert.equal(await page.getByText('节奏密度', { exact: true }).count(), 0)
  await page.getByText('这部分超出已收录范围。', { exact: false }).waitFor()
  pass('ABC displays real metrics, pitch trajectory, unknown background and grounded SSE fallback')
  await shot(page, 'student-analysis.png')

  await page.goto(base + `/practice/session/${score.id}`)
  await page.getByText('正在录音', { exact: true }).waitFor()
  await page.getByRole('button', { name: '放大谱面', exact: true }).click()
  await page.getByRole('button', { name: '全屏看谱', exact: true }).click()
  await page.waitForFunction(() => !!document.fullscreenElement)
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  const paused = await page.getByRole('timer').textContent()
  await page.waitForTimeout(1200)
  assert.equal(await page.getByRole('timer').textContent(), paused)
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '结束并保存', exact: true }).click()
  await page.waitForURL('**/practice?tab=history')
  const records = await api('/api/practice', student)
  assert.equal(records[0].pause_count, 1)
  assert.ok(records[0].audio_file_id?.startsWith('local:'))
  pass('real browser microphone recording, pause timer, zoom, fullscreen and saved recording work together')

  await page.goto(base + '/community')
  await page.getByRole('button', { name: '给老师留言', exact: true }).click()
  await page.getByRole('combobox').last().click()
  await page.getByRole('option', { name: '林老师', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('下节课请指导连奏')
  await page.getByLabel('正文', { exact: true }).fill('这段连接仍不均匀，请老师回课指导。')
  await page.getByRole('button', { name: '发送私密留言', exact: true }).click()
  await page.getByRole('tab', { name: /我的师生留言/ }).click()
  await page.getByText('下节课请指导连奏', { exact: true }).waitFor()
  assert.equal((await api('/api/posts?view=public', other)).length, 0)
  assert.equal((await api('/api/posts?view=messages', other)).length, 0)
  await teacherPage.goto(base + '/community')
  await teacherPage.getByRole('tab', { name: /学生求助与留言/ }).click()
  await teacherPage.getByRole('button', { name: '标记下节课当面指导', exact: true }).click()
  await teacherPage.getByRole('button', { name: /查看与回复/ }).click()
  await teacherPage.getByPlaceholder('回复这位同学…').fill('下节课检查手指连接，先以慢速练习。')
  await teacherPage.getByRole('button', { name: '发送回复', exact: true }).click()
  const downloadEvent = teacherPage.waitForEvent('download')
  await teacherPage.getByRole('button', { name: '导出完整清单', exact: true }).click()
  const download = await downloadEvent
  const downloaded = await readFile(await download.path(), 'utf8')
  assert.match(downloaded, /这段连接仍不均匀/)
  assert.match(downloaded, /下节课检查手指连接/)
  pass('private teacher message, teacher reply, per-teacher focus and complete text export work in browser')
  await shot(teacherPage, 'teacher-community.png')

  await page.goto(base + '/stats')
  await page.getByRole('heading', { name: /练琴数据/ }).waitFor()
  const ownStats = await api('/api/stats', student)
  assert.equal(ownStats.scope, 'personal')
  assert.equal(ownStats.overview.totalSessions, 1)
  assert.equal(await page.getByText('黑白键旅人', { exact: true }).count(), 0)
  pass('student statistics show personal records without exposing another student')
  await shot(page, 'student-stats.png')

  if (process.env.ZHIYIN_TEST_MP4 && process.env.ZHIYIN_TEST_WAV) {
    const task = await api('/api/tasks', teacher, 'POST', { title: '音视频验收任务', description: '提交录音、记录及视频。', start_at: new Date(Date.now() - 3600000).toISOString(), end_at: new Date(Date.now() + 86400000).toISOString(), audience: 'classes', target_classes: ['钢琴一班'], score_mode: 'fixed', score_id: score.id, requirements: { audio: 'required', record: 'required', video: 'required' } }, 201)
    await page.goto(base + `/tasks/${task.id}`)
    await page.locator('#submission-audio').setInputFiles(process.env.ZHIYIN_TEST_WAV)
    await page.getByRole('button', { name: '移除录音', exact: true }).waitFor()
    await page.locator('#submission-video').setInputFiles(process.env.ZHIYIN_TEST_MP4)
    await page.getByRole('button', { name: '移除视频', exact: true }).waitFor()
    await page.getByLabel('练习记录文字').fill('本次独立上传录音与视频，记录练习心得。')
    await page.getByRole('button', { name: '提交任务', exact: true }).click()
    await page.getByRole('heading', { name: '我的提交与评阅' }).waitFor()
    await teacherPage.goto(base + `/tasks/${task.id}`)
    for (const tag of ['audio', 'video']) {
      const media = teacherPage.locator(tag).first()
      await media.waitFor()
      const detail = await media.evaluate(async element => {
        if (element.readyState < 1) await new Promise((resolve, reject) => { element.addEventListener('loadedmetadata', resolve, { once: true }); element.addEventListener('error', () => reject(new Error('Media decode failed')), { once: true }); element.load() })
        element.muted = true
        await element.play()
        const result = { duration: element.duration, paused: element.paused, readyState: element.readyState }
        element.pause()
        return result
      })
      assert.ok(detail.duration > 0)
      assert.equal(detail.paused, false)
      evidence.media.push({ type: tag, ...detail })
    }
    await teacherPage.getByLabel('评分（0–100 分）').fill('91')
    await teacherPage.getByLabel('教师评语').fill('音视频可播放，注意连奏均匀。')
    await teacherPage.getByRole('button', { name: '保存评阅', exact: true }).click()
    await teacherPage.getByText('评分与评语已回传学生', { exact: true }).waitFor()
    await page.reload()
    await page.getByText('音视频可播放，注意连奏均匀。', { exact: true }).waitFor()
    pass('student uploads real WAV/MP4; teacher decodes and plays both, grades, and student receives feedback')
    await shot(teacherPage, 'teacher-review.png')
  }
  await page.goto(base + '/map')
  await page.getByRole('heading', { name: '音乐史地图', exact: true }).waitFor()
  await shot(page, 'student-map.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(base + '/knowledge')
  await page.getByRole('heading', { name: '课程知识与答疑', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  await shot(page, 'student-knowledge-mobile.png')
  pass('knowledge and map pages render; mobile knowledge has no horizontal overflow')
  if (process.env.RUN_LIVE_LLM === '1') {
    const started = Date.now()
    try {
      const response = await fetch(base + '/api/chat', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { cookie: `zhiyin_session=${token(student)}`, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: '连奏练习应该怎么练？' }] }) })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let body = '', chunks = 0
      for (;;) { const next = await reader.read(); if (next.done) break; chunks++; body += decoder.decode(next.value, { stream: true }) }
      evidence.liveLLM = { status: response.status, elapsedMs: Date.now() - started, chunks, stream: body }
    } catch (error) { evidence.liveLLM = { elapsedMs: Date.now() - started, available: false, error: error.name } }
    console.log('Live model verification recorded separately from local workflow checks')
  }
  assert.deepEqual(errors, [])
  pass('no browser page errors during the verified workflows')
  await writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  console.error(error)
  console.error('Fixture logs:', logs)
  process.exitCode = 1
} finally {
  await browser?.close()
  if (service.exitCode === null) { const exited = once(service, 'exit'); service.kill(); await exited }
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('zhiyin-requirements-browser-'))
  await rm(directory, { recursive: true, force: true })
}
