import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from '@/lib/auth-session'
import { verifyScoreUploadReceipt } from '@/lib/score-upload-receipt'
import { POST } from './route'

test('avatar uploads require a teacher and matching raster bytes before issuing a purpose receipt; general uploads remain compatible', async () => {
  const teacher = 't0000000-0000-0000-0000-000000000001'
  const student = 's0000000-0000-0000-0000-000000000001'
  const keys = ['ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'CODER_SUPABASE_URL', 'CODER_SUPABASE_SERVICE_ROLE_KEY', 'CODER_SUPABASE_TENANT_ID', 'CODER_CODING_API_KEY', 'CODER_CODING_BASE_URL'] as const
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  let uploads = 0
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    response.setHeader('content-type', 'application/json')
    if (url.pathname === '/rest/v1/profiles') {
      const id = url.searchParams.get('id')?.slice(3) ?? teacher
      response.end(JSON.stringify([{ id, nickname: '测试', role: id === teacher ? 'teacher' : 'student', class_name: null }]))
    } else if (url.pathname === '/storage/upload') {
      for await (const chunk of request) assert.ok(chunk.length > 0)
      uploads++
      response.end(JSON.stringify({ code: 200, data: { fileId: `remote-upload-${uploads}` } }))
    } else if (url.pathname === '/storage/get') {
      response.end(JSON.stringify({ code: 200, data: { fileId: url.searchParams.get('fileId'), url: 'https://signed.invalid/uploaded-file', expiresAt: '2026-12-01T00:00:00Z' } }))
    } else { response.statusCode = 404; response.end('{}') }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.ZHIYIN_STORAGE_MODE = 'supabase'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-avatar-upload-secret-at-least-32-characters'
  process.env.CODER_SUPABASE_URL = base
  process.env.CODER_SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  process.env.CODER_SUPABASE_TENANT_ID = 'test-tenant'
  process.env.CODER_CODING_API_KEY = 'test-storage-key'
  process.env.CODER_CODING_BASE_URL = base
  const upload = async (userId: string, bytes: Buffer, type: string, purpose?: string) => {
    const form = new FormData()
    form.set('user_id', userId)
    form.set('file', new File([Uint8Array.from(bytes)], 'test-image.png', { type }))
    if (purpose) form.set('purpose', purpose)
    const token = await signAuthToken({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student', expiresAt: Date.now() + 60000 })
    return POST(new Request('http://localhost/api/upload', { method: 'POST', headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}` }, body: form }))
  }
  try {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082', 'hex')
    assert.equal((await upload(student, png, 'image/png', 'map-avatar')).status, 403)
    for (const [bytes, type] of [[Buffer.from('<svg/>'), 'image/png'], [png, 'image/jpeg'], [Buffer.from('<svg/>'), 'image/svg+xml'], [Buffer.from('%PDF-test'), 'application/pdf']] as const) {
      assert.equal((await upload(teacher, bytes, type, 'map-avatar')).status, 415)
    }
    assert.equal(uploads, 0)
    const avatarResponse = await upload(teacher, png, 'image/png', 'map-avatar')
    assert.equal(avatarResponse.status, 200, await avatarResponse.clone().text())
    const avatar = await avatarResponse.json() as { fileId: string; receipt: string }
    assert.equal(verifyScoreUploadReceipt(avatar.receipt, { fileId: avatar.fileId, ownerId: teacher, purpose: 'map-avatar' }), 'image/png')
    const generalResponse = await upload(student, Buffer.from('legacy-score-image-fixture'), 'image/png')
    assert.equal(generalResponse.status, 200, await generalResponse.clone().text())
    const general = await generalResponse.json() as { fileId: string; receipt: string }
    assert.equal(verifyScoreUploadReceipt(general.receipt, { fileId: general.fileId, ownerId: student }), 'image/png')
    assert.equal(verifyScoreUploadReceipt(general.receipt, { fileId: general.fileId, ownerId: student, purpose: 'map-avatar' }), null)
    assert.equal(uploads, 2)
    assert.equal((await upload(student, Buffer.from('<svg/>'), 'image/png', 'score-cover')).status, 415)
    const coverResponse = await upload(student, png, 'image/png', 'score-cover')
    assert.equal(coverResponse.status, 200, await coverResponse.clone().text())
    const cover = await coverResponse.json() as { fileId: string; receipt: string }
    assert.equal(verifyScoreUploadReceipt(cover.receipt, { fileId: cover.fileId, ownerId: student, purpose: 'score-cover' }), 'image/png')
    assert.equal(verifyScoreUploadReceipt(general.receipt, { fileId: general.fileId, ownerId: student, purpose: 'score-cover' }), null)
    assert.equal(verifyScoreUploadReceipt(avatar.receipt, { fileId: avatar.fileId, ownerId: teacher, purpose: 'score-cover' }), null)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
  }
})
