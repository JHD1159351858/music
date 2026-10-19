import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { ApiError } from './teaching-server'
import { refreshPracticeFiles, refreshScoreFiles, refreshSubmissionFiles, teachingStorage } from './teaching-files'

test('没有 fileId 的旧文件保留 URL，缺存储配置也不实例化客户端', async () => {
  const key = process.env.CODER_CODING_API_KEY
  const base = process.env.CODER_CODING_BASE_URL
  delete process.env.CODER_CODING_API_KEY
  delete process.env.CODER_CODING_BASE_URL
  try {
    const scores = [{ image_url: '/old-score.png', file_id: null }]
    const records = [{ audio_url: '/old-audio.webm', audio_file_id: null }]
    const submissions = [{ audio_url: '/old-audio.webm', video_url: '/old-video.mp4', practice_records: records[0] }]
    assert.equal(await refreshScoreFiles(scores), scores)
    assert.equal(await refreshPracticeFiles(records), records)
    assert.equal(await refreshSubmissionFiles(submissions), submissions)
  } finally {
    if (key === undefined) delete process.env.CODER_CODING_API_KEY; else process.env.CODER_CODING_API_KEY = key
    if (base === undefined) delete process.env.CODER_CODING_BASE_URL; else process.env.CODER_CODING_BASE_URL = base
  }
})

test('已有 fileId 却缺存储配置时明确报 503，不返回过期旧链接', async () => {
  const key = process.env.CODER_CODING_API_KEY
  const base = process.env.CODER_CODING_BASE_URL
  delete process.env.CODER_CODING_API_KEY
  delete process.env.CODER_CODING_BASE_URL
  const unavailable = (error: unknown) => error instanceof ApiError && error.status === 503
  try {
    assert.throws(teachingStorage, unavailable)
    await assert.rejects(refreshScoreFiles([{ file_id: 'score-file', image_url: '/expired.png' }]), unavailable)
    await assert.rejects(refreshPracticeFiles([{ audio_file_id: 'audio-file', audio_url: '/expired.webm' }]), unavailable)
    await assert.rejects(refreshSubmissionFiles([{ practice_records: { audio_file_id: 'record-file', audio_url: '/expired.webm' } }]), unavailable)
  } finally {
    if (key === undefined) delete process.env.CODER_CODING_API_KEY; else process.env.CODER_CODING_API_KEY = key
    if (base === undefined) delete process.env.CODER_CODING_BASE_URL; else process.env.CODER_CODING_BASE_URL = base
  }
})

test('通过真实 SDK 续签提交音视频及关联记录，去重且最多四个并发请求', async () => {
  const key = process.env.CODER_CODING_API_KEY
  const base = process.env.CODER_CODING_BASE_URL
  let active = 0
  let peak = 0
  const calls: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const fileId = url.searchParams.get('fileId') ?? ''
    calls.push(fileId)
    active += 1
    peak = Math.max(peak, active)
    setTimeout(() => {
      active -= 1
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ code: 200, data: { fileId, url: `https://signed.invalid/${fileId}`, expiresAt: '2026-12-01T00:00:00Z' } }))
    }, 15)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  process.env.CODER_CODING_API_KEY = 'file-test-key'
  process.env.CODER_CODING_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const rows = [
      { audio_file_id: 'a1', audio_url: '/old-a1', video_file_id: 'v1', video_url: '/old-v1', practice_records: { audio_file_id: 'a1', audio_url: '/old-a1' } },
      { audio_file_id: 'a2', audio_url: '/old-a2', video_file_id: 'v2', video_url: '/old-v2', practice_records: { audio_file_id: 'a3', audio_url: '/old-a3' } },
      { audio_file_id: 'a4', audio_url: '/old-a4', video_file_id: null, video_url: null, practice_records: null },
    ]
    const refreshed = await refreshSubmissionFiles(rows)
    assert.equal(calls.length, 6)
    assert.equal(new Set(calls).size, 6)
    assert.ok(peak > 1 && peak <= 4)
    assert.equal(refreshed[0].audio_url, 'https://signed.invalid/a1')
    assert.equal(refreshed[0].video_url, 'https://signed.invalid/v1')
    assert.equal(refreshed[1].practice_records?.audio_url, 'https://signed.invalid/a3')
    assert.equal(rows[0].audio_url, '/old-a1')
  } finally {
    if (key === undefined) delete process.env.CODER_CODING_API_KEY; else process.env.CODER_CODING_API_KEY = key
    if (base === undefined) delete process.env.CODER_CODING_BASE_URL; else process.env.CODER_CODING_BASE_URL = base
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
