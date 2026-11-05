import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from '@/lib/auth-session'
import { CHINA_COMPOSERS, EUROPE_COMPOSERS } from '@/lib/composers'
import { createLocalDatabaseClient } from '@/lib/local-database'
import { deleteLocalFile, getLocalFileUrl, localFileMetadata, saveLocalFile } from '@/lib/local-files'
import { CHINA_MAP_REVISION, type MapMusician } from '@/lib/map-musician-types'
import { validateMapAvatar } from '@/lib/map-musicians'
import { createScoreUploadReceipt } from '@/lib/score-upload-receipt'
import { createSupabaseServer } from '@/lib/supabase-server'
import { ApiError } from '@/lib/teaching-server'
import { GET as downloadFile } from '../files/[id]/route'
import { GET as renewFile } from '../upload/route'
import { DELETE, PATCH } from './[id]/route'
import { GET, POST } from './route'

const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const otherTeacher = 't0000000-0000-0000-0000-000000000002'
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'CODER_CODING_API_KEY', 'CODER_CODING_BASE_URL'] as const
let original: Record<string, string | undefined>
let directory: string
beforeEach(async () => {
  original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-map-musicians-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'map-musicians-isolated-test-secret-at-least-32-characters'
  await createLocalDatabaseClient().from('profiles').insert({ id: otherTeacher, nickname: '另一位教师', role: 'teacher' })
})
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
  rmSync(directory, { recursive: true, force: true })
})
async function request(url: string, userId?: string, body?: Record<string, unknown>, method = body ? 'POST' : 'GET') {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (userId) headers.set('cookie', `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId, role: userId.startsWith('t') ? 'teacher' : 'student', expiresAt: Date.now() + 60_000 })}`)
  return new Request(`http://localhost${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
}
const context = (id: string) => ({ params: Promise.resolve({ id }) })
const draft = () => ({ name: '教师补充音乐家', years: '', era: 'modern', region: '上海', x: 62.5, y: 50, map_kind: 'china', map_revision: CHINA_MAP_REVISION, intro: '仅用于验证的教师资料', works: '', note: '', sources: [], avatar_file_id: null })
async function create(body: Record<string, unknown> = draft()) {
  const response = await POST(await request('/api/map-musicians', teacher, body))
  assert.equal(response.status, 201, await response.clone().text())
  return response.json() as Promise<MapMusician>
}
async function download(fileId: string, userId?: string) {
  const access = await getLocalFileUrl(fileId)
  return downloadFile(await request(access.url, userId), context(fileId.slice(6)))
}

test('authenticated map list preserves full-image coordinates for builtins and persisted custom entries', async () => {
  assert.equal((await GET(await request('/api/map-musicians'))).status, 401)
  const before = CHINA_COMPOSERS.map(composer => composer.x)
  const entry = await create()
  assert.equal(entry.origin, 'custom')
  assert.equal(entry.teacher_id, teacher)
  assert.equal(entry.x, 62.5)
  assert.equal(entry.avatar, '')
  assert.equal(entry.years, '')
  const response = await GET(await request('/api/map-musicians', student))
  assert.equal(response.status, 200)
  const rows = await response.json() as MapMusician[]
  assert.equal(rows.length, CHINA_COMPOSERS.length + EUROPE_COMPOSERS.length + 1)
  for (const builtin of [...CHINA_COMPOSERS, ...EUROPE_COMPOSERS]) {
    const row = rows.find(item => item.id === builtin.id)
    assert.equal(row?.origin, 'builtin')
    assert.equal(row?.x, builtin.x)
    assert.equal(row?.y, builtin.y)
    assert.equal(row?.teacher_id, null)
  }
  assert.deepEqual({ x: rows.find(row => row.id === entry.id)?.x, y: rows.find(row => row.id === entry.id)?.y }, { x: 62.5, y: 50 })
  assert.deepEqual(CHINA_COMPOSERS.map(composer => composer.x), before)
  const europe = await (await GET(await request('/api/map-musicians?map_kind=europe', student))).json() as MapMusician[]
  assert.equal(europe.length, EUROPE_COMPOSERS.length)
  assert.ok(europe.every(row => row.map_kind === 'europe'))
  assert.equal((await GET(await request('/api/map-musicians?map_kind=other', teacher))).status, 400)
  assert.equal((await createLocalDatabaseClient().from('map_musicians').select('name').eq('id', entry.id).single()).error, null)
})

test('writes require the creating teacher, builtins remain readonly and partial changes preserve untouched fields', async () => {
  assert.equal((await POST(await request('/api/map-musicians', undefined, draft()))).status, 401)
  assert.equal((await POST(await request('/api/map-musicians', student, draft()))).status, 403)
  const entry = await create({ ...draft(), years: '1900—1980', sources: [{ title: '教师资料来源', url: 'https://example.org/music' }] })
  for (const id of [entry.id, CHINA_COMPOSERS[0].id]) {
    assert.equal((await PATCH(await request(`/api/map-musicians/${id}`, otherTeacher, { name: '冒改' }), context(id))).status, 404)
    assert.equal((await DELETE(await request(`/api/map-musicians/${id}`, otherTeacher), context(id))).status, 404)
  }
  assert.equal((await PATCH(await request(`/api/map-musicians/${entry.id}`, student, { name: '冒改' }), context(entry.id))).status, 403)
  assert.equal((await PATCH(await request(`/api/map-musicians/${CHINA_COMPOSERS[0].id}`, teacher, { name: '改内置' }), context(CHINA_COMPOSERS[0].id))).status, 404)
  const changed = await PATCH(await request(`/api/map-musicians/${entry.id}`, teacher, { name: '新名称' }), context(entry.id))
  assert.equal(changed.status, 200, await changed.clone().text())
  const saved = await changed.json() as MapMusician
  assert.equal(saved.name, '新名称')
  for (const field of ['years', 'era', 'region', 'x', 'y', 'intro', 'works', 'note', 'sources', 'avatar_file_id'] as const) assert.deepEqual(saved[field], entry[field])
  assert.equal((await PATCH(await request(`/api/map-musicians/${entry.id}`, teacher, { map_kind: 'europe' }), context(entry.id))).status, 400)
  assert.equal((await DELETE(await request(`/api/map-musicians/${entry.id}`, teacher), context(entry.id))).status, 200)
  const rows = await (await GET(await request('/api/map-musicians', student))).json() as MapMusician[]
  assert.equal(rows.some(row => row.id === entry.id), false)
})

test('legacy China points retain their data until the owning teacher selects a point on the standard map', async () => {
  const revision = CHINA_MAP_REVISION
  const inserted = await createLocalDatabaseClient().from('map_musicians')
    .insert({ ...draft(), map_revision: null, teacher_id: teacher }).select('id').single()
  assert.equal(inserted.error, null)
  assert.ok(inserted.data && !Array.isArray(inserted.data))
  const id = inserted.data.id
  assert.ok(typeof id === 'string')
  const url = `/api/map-musicians/${id}`
  const update = async (fields: Record<string, unknown>) => PATCH(await request(url, teacher, fields, 'PATCH'), context(id))
  assert.equal((await update({ map_revision: revision })).status, 400)
  const renamed = await update({ name: '保留旧底图的人物资料' })
  assert.equal((await renamed.json() as MapMusician).map_revision, null)
  const moved = await update({ x: 72, y: 63, map_revision: revision })
  assert.equal(moved.status, 200, await moved.clone().text())
  const rows = await (await GET(await request('/api/map-musicians?map_kind=china', student))).json() as MapMusician[]
  const point = rows.find(row => row.id === id)
  assert.deepEqual({ x: point?.x, y: point?.y, revision: point?.map_revision }, { x: 72, y: 63, revision })
  assert.ok(rows.filter(row => row.origin === 'builtin').every(row => row.map_revision === revision))
})

test('new Chinese locations and later coordinate changes require the current map revision', async () => {
  assert.equal((await POST(await request('/api/map-musicians', teacher, { ...draft(), map_revision: null }))).status, 400)
  const entry = await create()
  assert.equal(entry.map_revision, CHINA_MAP_REVISION)
  const url = `/api/map-musicians/${entry.id}`
  assert.equal((await PATCH(await request(url, teacher, { x: 30, y: 40, map_revision: null }, 'PATCH'), context(entry.id))).status, 400)
})

test('invalid map kind, era, required fields, point ranges and unsafe sources or avatar URLs are rejected', async () => {
  for (const fields of [{ name: ' ' }, { region: '' }, { intro: '' }, { map_kind: 'other' }, { era: 'romantic' }, { x: -1 }, { y: 101 }, { x: '30' }, { sources: [{ title: '来源', url: 'javascript:alert(1)' }] }, { sources: [{ title: '', url: 'https://example.org' }] }, { avatar: 'https://example.org/avatar.png' }]) {
    const response = await POST(await request('/api/map-musicians', teacher, { ...draft(), ...fields }))
    assert.equal(response.status, 400, JSON.stringify(fields))
  }
  const minimal = { name: '最少资料', region: '北京', intro: '只保留教师输入', era: 'modern', map_kind: 'china', map_revision: CHINA_MAP_REVISION, x: 50, y: 50 }
  const saved = await create(minimal)
  for (const field of ['years', 'works', 'note', 'avatar'] as const) assert.equal(saved[field], '')
  assert.deepEqual(saved.sources, [])
})

test('avatar ownership, trusted raster MIME and shared-reference cleanup protect private uploads', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082', 'hex')
  const avatar = await saveLocalFile(png, 'avatar.png', 'image/png', teacher)
  const privateFile = await saveLocalFile(png, 'private.png', 'image/png', otherTeacher)
  const pdf = await saveLocalFile(Buffer.from('%PDF-test'), 'spoof.png', 'application/pdf', teacher)
  const svg = await saveLocalFile(Buffer.from('<svg/>'), 'spoof.png', 'image/svg+xml', teacher)
  const fakePng = await saveLocalFile(Buffer.from('<svg/>'), 'spoof.png', 'image/png', teacher)
  for (const file of [privateFile, pdf, svg, fakePng]) assert.ok((await POST(await request('/api/map-musicians', teacher, { ...draft(), avatar_file_id: file.fileId }))).status >= 400)
  assert.equal((await download(avatar.fileId, student)).status, 404)
  const first = await create({ ...draft(), avatar_file_id: avatar.fileId })
  const second = await create({ ...draft(), avatar_file_id: avatar.fileId })
  assert.match(first.avatar, /^\/api\/files\//)
  assert.equal((await download(avatar.fileId, student)).status, 200)
  assert.equal((await download(avatar.fileId)).status, 401)
  assert.equal((await download(privateFile.fileId, student)).status, 404)
  assert.equal((await renewFile(await request(`/api/upload?file_id=${encodeURIComponent(avatar.fileId)}`, student))).status, 200)
  const changed = await PATCH(await request(`/api/map-musicians/${first.id}`, teacher, { avatar_file_id: null }), context(first.id))
  assert.equal((await changed.json() as MapMusician).avatar, '')
  assert.equal((await download(avatar.fileId, student)).status, 200)
  const access = await getLocalFileUrl(avatar.fileId)
  assert.equal((await DELETE(await request(`/api/map-musicians/${second.id}`, teacher), context(second.id))).status, 200)
  assert.equal((await downloadFile(await request(access.url, student), context(avatar.fileId.slice(6)))).status, 404)
  await assert.rejects(localFileMetadata(avatar.fileId))
  assert.equal((await download(privateFile.fileId, otherTeacher)).status, 200)
})

test('remote avatars require the actor receipt and raster MIME, while an owned existing avatar can be retained', async () => {
  const db = createSupabaseServer()
  const user = { id: teacher, nickname: '教师', role: 'teacher' as const, class_name: null }
  const target = 'remote-avatar'
  const denied = (error: unknown) => error instanceof ApiError && error.status >= 400
  await assert.rejects(validateMapAvatar(db, user, target), denied)
  await assert.rejects(validateMapAvatar(db, user, target, createScoreUploadReceipt({ fileId: target, ownerId: teacher, fileType: 'image/png' })), denied)
  await assert.rejects(validateMapAvatar(db, user, target, createScoreUploadReceipt({ fileId: target, ownerId: otherTeacher, fileType: 'image/png', purpose: 'map-avatar' })), denied)
  await assert.rejects(validateMapAvatar(db, user, target, createScoreUploadReceipt({ fileId: target, ownerId: teacher, fileType: 'image/svg+xml', purpose: 'map-avatar' })), denied)
  await validateMapAvatar(db, user, target, createScoreUploadReceipt({ fileId: target, ownerId: teacher, fileType: 'image/png', purpose: 'map-avatar' }))
  const saved = await db.from('map_musicians').insert({ ...draft(), avatar_file_id: target, teacher_id: teacher }).select().single()
  assert.equal(saved.error, null)
  await validateMapAvatar(db, user, target)
})

test('missing local avatar does not hide any musician or builtin from the map list', async () => {
  const avatar = await saveLocalFile(Buffer.from('89504e470d0a1a0a', 'hex'), 'missing.png', 'image/png', teacher)
  const db = createLocalDatabaseClient()
  for (const id of ['missing-avatar-one', 'missing-avatar-two']) {
    assert.equal((await db.from('map_musicians').insert({ ...draft(), id, avatar_file_id: avatar.fileId, teacher_id: teacher })).error, null)
  }
  await deleteLocalFile(avatar.fileId)
  const response = await GET(await request('/api/map-musicians', student))
  assert.equal(response.status, 200, await response.clone().text())
  const rows = await response.json() as MapMusician[]
  assert.equal(rows.length, CHINA_COMPOSERS.length + EUROPE_COMPOSERS.length + 2)
  assert.ok(rows.filter(row => row.origin === 'custom').every(row => row.avatar === ''))
})

test('remote signing errors are cached per file and fall back to initials while other portraits remain available', async () => {
  const calls: string[] = []
  const server = createServer((request, response) => {
    const fileId = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('fileId') ?? ''
    calls.push(fileId)
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(fileId === 'missing-remote-avatar' ? { code: 404, message: 'missing' } : { code: 200, data: { fileId, url: 'https://signed.invalid/available-avatar', expiresAt: '2026-12-01T00:00:00Z' } }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  process.env.CODER_CODING_API_KEY = 'isolated-avatar-signing-test'
  process.env.CODER_CODING_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const db = createLocalDatabaseClient()
    for (const [id, fileId] of [['remote-one', 'missing-remote-avatar'], ['remote-two', 'missing-remote-avatar'], ['remote-three', 'available-avatar']]) {
      assert.equal((await db.from('map_musicians').insert({ ...draft(), id, avatar_file_id: fileId, teacher_id: teacher })).error, null)
    }
    const response = await GET(await request('/api/map-musicians', student))
    assert.equal(response.status, 200, await response.clone().text())
    const rows = await response.json() as MapMusician[]
    assert.equal(rows.find(row => row.id === 'remote-one')?.avatar, '')
    assert.equal(rows.find(row => row.id === 'remote-two')?.avatar, '')
    assert.equal(rows.find(row => row.id === 'remote-three')?.avatar, 'https://signed.invalid/available-avatar')
    assert.equal(rows.filter(row => row.origin === 'builtin').length, CHINA_COMPOSERS.length + EUROPE_COMPOSERS.length)
    assert.equal(calls.filter(fileId => fileId === 'missing-remote-avatar').length, 1)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('a committed avatar replacement returns success with a cleanup warning instead of inviting a repeated write', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082', 'hex')
  const avatar = await saveLocalFile(png, 'avatar.png', 'image/png', teacher)
  const entry = await create({ ...draft(), avatar_file_id: avatar.fileId })
  const metadataPath = path.join(directory, 'uploads', `${avatar.fileId.slice(6)}.json`)
  renameSync(metadataPath, `${metadataPath}.backup`)
  mkdirSync(metadataPath)
  const response = await PATCH(await request(`/api/map-musicians/${entry.id}`, teacher, { avatar_file_id: null }), context(entry.id))
  assert.equal(response.status, 200)
  const saved = await response.json() as MapMusician & { warning?: string }
  assert.equal(saved.avatar_file_id, null)
  assert.match(saved.warning ?? '', /资料已保存.*清理失败/)
  assert.deepEqual((await createLocalDatabaseClient().from('map_musicians').select('avatar_file_id').eq('id', entry.id).single()).data, { avatar_file_id: null })
})
