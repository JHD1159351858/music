import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from '@/lib/auth-session'
import { createLocalDatabaseClient } from '@/lib/local-database'
import { localFileMetadata, saveLocalFile } from '@/lib/local-files'
import { createScoreUploadReceipt } from '@/lib/score-upload-receipt'
import * as uploadApi from './route'

const student = 's0000000-0000-0000-0000-000000000001'
const other = 's0000000-0000-0000-0000-000000000002'
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET'] as const
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082', 'hex')
let original: Record<string, string | undefined>
let directory: string

beforeEach(async () => {
  original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = await mkdtemp(path.join(os.tmpdir(), 'zhiyin-cover-cleanup-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-cover-cleanup-secret-at-least-32-characters'
  createLocalDatabaseClient()
})
afterEach(async () => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep))
  await rm(directory, { recursive: true, force: true })
})
async function headers(userId?: string) {
  const token = userId ? await signAuthToken({ kind: 'session', userId, role: 'student', expiresAt: Date.now() + 60_000 }) : null
  return { ...(token ? { cookie: `${AUTH_SESSION_COOKIE}=${token}` } : {}) }
}
async function upload(purpose?: string, bytes = png) {
  const form = new FormData()
  form.set('user_id', student)
  form.set('file', new File([Uint8Array.from(bytes)], 'cover.png', { type: 'image/png' }))
  if (purpose) form.set('purpose', purpose)
  const response = await uploadApi.POST(new Request('http://localhost/api/upload', { method: 'POST', headers: await headers(student), body: form }))
  assert.equal(response.status, 200, await response.clone().text())
  return response.json() as Promise<{ fileId: string; receipt?: string }>
}
async function discard(userId: string | undefined, file: { fileId: string; receipt?: string }) {
  assert.equal(typeof uploadApi.DELETE, 'function', 'upload cleanup must expose DELETE')
  return uploadApi.DELETE(new Request('http://localhost/api/upload', { method: 'DELETE', headers: { ...await headers(userId), 'content-type': 'application/json' }, body: JSON.stringify({ file_id: file.fileId, receipt: file.receipt }) }))
}

test('only the signed owner can discard an unassociated score-cover upload', async () => {
  const cover = await upload('score-cover')
  assert.ok(cover.receipt, 'local cover uploads need a cleanup receipt')
  assert.equal((await discard(undefined, cover)).status, 401)
  assert.equal((await discard(other, cover)).status, 403)
  await localFileMetadata(cover.fileId)
  const response = await discard(student, cover)
  assert.equal(response.status, 200, await response.clone().text())
  assert.deepEqual(await response.json(), { removed: true })
  await assert.rejects(localFileMetadata(cover.fileId))
})

test('cover cleanup rejects missing, other-purpose and file-swapped receipts without deleting private files', async () => {
  const cover = await upload('score-cover')
  const page = await upload()
  const recording = await saveLocalFile(Buffer.from('private-recording'), 'practice.webm', 'audio/webm', student)
  const avatarReceipt = createScoreUploadReceipt({ fileId: page.fileId, ownerId: student, fileType: 'image/png', purpose: 'map-avatar' })
  const generalReceipt = createScoreUploadReceipt({ fileId: page.fileId, ownerId: student, fileType: 'image/png' })
  for (const file of [page, { ...page, receipt: avatarReceipt }, { ...page, receipt: generalReceipt }, { ...page, receipt: cover.receipt }, { fileId: recording.fileId, receipt: cover.receipt }]) {
    assert.equal((await discard(student, file)).status, 403)
    await localFileMetadata(file.fileId)
  }
  const wrongOwnerReceipt = createScoreUploadReceipt({ fileId: page.fileId, ownerId: other, fileType: 'image/png', purpose: 'score-cover' })
  assert.equal((await discard(student, { ...page, receipt: wrongOwnerReceipt })).status, 403)
})

test('a cover already associated by a successful but uncertain score save cannot be discarded', async () => {
  const cover = await upload('score-cover')
  const saved = await createLocalDatabaseClient().from('scores').insert({ id: 'associated-cover', title: '已保存曲目', composer: '作者', category: 'domestic', difficulty: 'beginner', source: 'student', owner_id: student, cover_file_id: cover.fileId })
  assert.equal(saved.error, null)
  assert.equal((await discard(student, cover)).status, 409)
  await localFileMetadata(cover.fileId)
})

test('cleanup also preserves a cover upload reused as a spectrum page', async () => {
  const cover = await upload('score-cover')
  const saved = await createLocalDatabaseClient().from('scores').insert({ id: 'associated-page', title: '已保存谱面', composer: '作者', category: 'domestic', difficulty: 'beginner', source: 'student', owner_id: student, pages: [{ file_id: cover.fileId, file_type: 'image/png' }] })
  assert.equal(saved.error, null)
  const response = await discard(student, cover)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { removed: false })
  await localFileMetadata(cover.fileId)
})

test('score covers have a 10MB upload limit while spectrum uploads retain their existing limit', async () => {
  const content = Buffer.alloc(10 * 1024 * 1024 + 1)
  png.copy(content)
  const form = new FormData()
  form.set('user_id', student)
  form.set('file', new File([Uint8Array.from(content)], 'large-cover.png', { type: 'image/png' }))
  form.set('purpose', 'score-cover')
  const response = await uploadApi.POST(new Request('http://localhost/api/upload', { method: 'POST', headers: await headers(student), body: form }))
  assert.equal(response.status, 413)
  assert.equal(typeof (await upload(undefined, content)).fileId, 'string')
})
