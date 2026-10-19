import assert from 'node:assert/strict'
import test from 'node:test'
import { createHmac } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getLocalFileUrl, saveLocalFile, serveLocalFile } from './local-files'
import { getTeachingFileUrl, refreshPracticeFiles, refreshScoreFiles, refreshSubmissionFiles } from './teaching-files'

async function withDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zhiyin-files-'))
  const previous = process.env.ZHIYIN_DATA_DIR
  process.env.ZHIYIN_DATA_DIR = directory
  try { await run(directory) }
  finally {
    if (previous === undefined) delete process.env.ZHIYIN_DATA_DIR; else process.env.ZHIYIN_DATA_DIR = previous
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep))
    await rm(directory, { recursive: true, force: true })
  }
}

test('真实文件和签名密钥持久化，另一个进程能够续签并读取同一份琴谱', async () => {
  await withDirectory(async () => {
    const content = Buffer.from('%PDF-1.4\n完整琴谱')
    const uploaded = await saveLocalFile(content, '../练习曲.pdf', 'application/pdf')
    assert.match(uploaded.fileId, /^local:[0-9a-f-]{36}$/)
    const signed = await getLocalFileUrl(uploaded.fileId)
    const request = new Request(`http://localhost${signed.url}`)
    const response = await serveLocalFile(request, uploaded.fileId.slice(6))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/pdf')
    assert.equal(response.headers.get('content-length'), String(content.length))
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), content)
    const modulePath = path.resolve('src/lib/local-files.ts').replace(/\\/g, '/')
    const script = `import { getLocalFileUrl } from ${JSON.stringify(modulePath)}; getLocalFileUrl(${JSON.stringify(uploaded.fileId)}).then(value => console.log(JSON.stringify(value)))`
    const { stdout } = await promisify(execFile)(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), '--eval', script], { env: process.env })
    const reopened = JSON.parse(stdout.trim()) as { fileId: string; url: string }
    assert.equal(reopened.fileId, uploaded.fileId)
    assert.equal((await serveLocalFile(new Request(`http://localhost${reopened.url}`), uploaded.fileId.slice(6))).status, 200)
    assert.equal((await serveLocalFile(request, uploaded.fileId.slice(6))).status, 200)
  })
})

test('媒体 GET 和 HEAD 支持单段、后缀和开放结尾 Range，损坏或多段范围返回 416', async () => {
  await withDirectory(async () => {
    const uploaded = await saveLocalFile(Buffer.from('0123456789'), '练习录音.webm', 'audio/webm;codecs=opus')
    const { url } = await getLocalFileUrl(uploaded.fileId)
    const id = uploaded.fileId.slice(6)
    const makeRequest = (range?: string, method = 'GET') => new Request(`http://localhost${url}`, { method, headers: range ? { range } : {} })
    for (const [range, expected, contentRange] of [
      ['bytes=2-5', '2345', 'bytes 2-5/10'],
      ['bytes=-3', '789', 'bytes 7-9/10'],
      ['bytes=7-', '789', 'bytes 7-9/10'],
      ['bytes=8-99', '89', 'bytes 8-9/10'],
    ]) {
      const response = await serveLocalFile(makeRequest(range), id)
      assert.equal(response.status, 206)
      assert.equal(response.headers.get('content-range'), contentRange)
      assert.equal(response.headers.get('content-length'), String(expected.length))
      assert.equal(await response.text(), expected)
    }
    const head = await serveLocalFile(makeRequest(undefined, 'HEAD'), id)
    assert.equal(head.status, 200)
    assert.equal(head.headers.get('content-type'), 'audio/webm')
    assert.equal(head.headers.get('content-length'), '10')
    assert.equal(await head.text(), '')
    for (const range of ['bytes=0-1,3-4', 'bytes=nope', 'bytes=-0', 'bytes=10-', 'bytes=5-3', 'other=1-3']) {
      const response = await serveLocalFile(makeRequest(range), id)
      assert.equal(response.status, 416, range)
      assert.equal(response.headers.get('content-range'), 'bytes */10')
    }
  })
})

test('拒绝缺失、篡改、过期签名和路径穿越，未上传的文件不能续签', async () => {
  await withDirectory(async (directory) => {
    const uploaded = await saveLocalFile(Buffer.from('video-content'), '演奏.mp4', 'video/mp4')
    const signed = await getLocalFileUrl(uploaded.fileId)
    const id = uploaded.fileId.slice(6)
    const url = new URL(signed.url, 'http://localhost')
    assert.equal((await serveLocalFile(new Request(`http://localhost/api/files/${id}`), id)).status, 403)
    url.searchParams.set('token', 'x'.repeat(43))
    assert.equal((await serveLocalFile(new Request(url), id)).status, 403)
    const secret = await readFile(path.join(directory, '.file-url-secret'), 'utf8')
    const expires = String(Math.floor(Date.now() / 1000) - 1)
    url.searchParams.set('expires', expires)
    url.searchParams.set('token', createHmac('sha256', secret).update(`${id}.${expires}`).digest('base64url'))
    assert.equal((await serveLocalFile(new Request(url), id)).status, 403)
    assert.equal((await serveLocalFile(new Request(`http://localhost${signed.url}`), '../.file-url-secret')).status, 404)
    await assert.rejects(getLocalFileUrl('local:00000000-0000-4000-8000-000000000000'))
    await assert.rejects(saveLocalFile(Buffer.from('x'), 'payload.html', 'text/html'))
  })
})

test('没有云密钥时，琴谱、录音和提交材料均可续签本地文件链接', async () => {
  await withDirectory(async () => {
    const key = process.env.CODER_CODING_API_KEY
    const base = process.env.CODER_CODING_BASE_URL
    delete process.env.CODER_CODING_API_KEY
    delete process.env.CODER_CODING_BASE_URL
    try {
      const { fileId } = await saveLocalFile(Buffer.from('saved-content'), '练习录音.webm', 'audio/webm')
      assert.match((await getTeachingFileUrl(fileId)).url, /^\/api\/files\//)
      assert.match((await refreshScoreFiles([{ file_id: fileId, image_url: '/expired' }]))[0].image_url!, /^\/api\/files\//)
      assert.match((await refreshPracticeFiles([{ audio_file_id: fileId, audio_url: null }]))[0].audio_url!, /^\/api\/files\//)
      const [submission] = await refreshSubmissionFiles([{ audio_file_id: fileId, audio_url: null, video_file_id: fileId, video_url: null, practice_records: { audio_file_id: fileId, audio_url: null } }])
      assert.match(submission.audio_url!, /^\/api\/files\//)
      assert.match(submission.video_url!, /^\/api\/files\//)
      assert.match(submission.practice_records!.audio_url!, /^\/api\/files\//)
    } finally {
      if (key === undefined) delete process.env.CODER_CODING_API_KEY; else process.env.CODER_CODING_API_KEY = key
      if (base === undefined) delete process.env.CODER_CODING_BASE_URL; else process.env.CODER_CODING_BASE_URL = base
    }
  })
})

test('首次并发续签使用同一持久密钥，所有签名均可读取文件', async () => {
  await withDirectory(async () => {
    const { fileId } = await saveLocalFile(Buffer.from('concurrent-content'), '琴谱.png', 'image/png')
    const urls = await Promise.all(Array.from({ length: 20 }, () => getLocalFileUrl(fileId)))
    for (const { url } of urls) assert.equal((await serveLocalFile(new Request(`http://localhost${url}`), fileId.slice(6))).status, 200)
  })
})
