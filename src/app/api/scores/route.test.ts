import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { AUTH_SESSION_COOKIE, signAuthToken } from '@/lib/auth-session'
import { createLocalDatabaseClient } from '@/lib/local-database'
import { deleteLocalFile, getLocalFileUrl, localFileMetadata, saveLocalFile, serveLocalFile } from '@/lib/local-files'
import { createScoreUploadReceipt } from '@/lib/score-upload-receipt'
import { GET as listScores, POST as createScore } from './route'
import { GET as readScore, PATCH as editScore, DELETE as deleteScore } from './[id]/route'
import { GET as listPractice } from '../practice-list/route'
import { POST as savePractice } from '../practice/route'
import { DELETE as deletePractice } from '../practice/[id]/route'
import { GET as renewFile } from '../upload/route'
import { GET as downloadFile } from '../files/[id]/route'
import { assignedScore } from '@/lib/teaching-server'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { PracticeTask } from '@/lib/teaching-types'
import type { ScorePage, TeachingScore } from '@/lib/teaching-types'

const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
const other = 's0000000-0000-0000-0000-000000000002'
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_STORAGE_MODE', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE', 'CODER_CODING_API_KEY', 'CODER_CODING_BASE_URL'] as const
let original: Record<string, string | undefined>
let directory: string
beforeEach(async () => {
  original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = await mkdtemp(path.join(os.tmpdir(), 'zhiyin-score-api-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_STORAGE_MODE = 'local'
  process.env.ZHIYIN_SESSION_SECRET = 'isolated-score-api-test-secret-at-least-32-characters'
  delete process.env.ZHIYIN_STUDENT_TEST_MODE
})
afterEach(async () => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep))
  await rm(directory, { recursive: true, force: true })
})
async function request(url: string, userId: string, body?: Record<string, unknown>) {
  const token = await signAuthToken({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student', expiresAt: Date.now() + 60_000 })
  return new Request(`http://localhost${url}`, { method: body ? 'POST' : 'GET', headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
}
const context = (id: string) => ({ params: Promise.resolve({ id }) })
async function ownFile(userId: string, type = 'image/png') {
  return saveLocalFile(Buffer.from('isolated-test-file'), type.startsWith('audio/') ? '练习.webm' : '琴谱.png', type, userId)
}
async function privateScore() {
  createLocalDatabaseClient()
  const file = await ownFile(student)
  const response = await createScore(await request('/api/scores', student, { user_id: student, title: '我的琴谱', composer: '自选', category: 'domestic', difficulty: 'beginner', file_id: file.fileId, file_type: file.type, published: true, target_classes: ['钢琴二班'] }))
  assert.equal(response.status, 201, await response.clone().text())
  return response.json() as Promise<{ id: string; source: string; published: boolean; target_classes: string[] }>
}
async function pageFile(userId: string, type = 'image/png'): Promise<ScorePage> {
  const file = await ownFile(userId, type)
  return { file_id: file.fileId, image_url: null, file_name: file.name, file_type: 'image/png' }
}
const scoreBody = (pages: ScorePage[]) => ({ user_id: student, title: '多页曲谱', composer: '自选', category: 'domestic', difficulty: 'beginner', pages })

const coverPng = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082', 'hex')
const coverFile = (ownerId: string) => saveLocalFile(coverPng, '曲目封面.png', 'image/png', ownerId)

test('independent score covers persist, renew in every score response and participate in retry identity', async () => {
  createLocalDatabaseClient()
  const page = await pageFile(student)
  const cover = await coverFile(student)
  const body = { ...scoreBody([page]), id: 'c0000000-0000-4000-8000-000000000001', cover_file_id: cover.fileId, cover_url: 'https://untrusted.invalid/cover.png', cover_receipt: 'not-needed-for-local-file' }
  const response = await createScore(await request('/api/scores', student, body))
  assert.equal(response.status, 201, await response.clone().text())
  const created = await response.json() as TeachingScore
  assert.equal(created.cover_file_id, cover.fileId)
  assert.match(created.cover_url ?? '', /^\/api\/files\//)
  assert.equal(created.file_id, page.file_id)
  assert.deepEqual(created.pages?.map(item => item.file_id), [page.file_id])
  for (const result of [await readScore(await request(`/api/scores/${created.id}`, student), context(created.id)), await listScores(await request('/api/scores', student)), await listPractice(await request('/api/practice-list', student))]) {
    const value = await result.json() as TeachingScore | TeachingScore[]
    const row = Array.isArray(value) ? value.find(item => item.id === created.id) : value
    assert.equal(row?.cover_file_id, cover.fileId)
    assert.match(row?.cover_url ?? '', /^\/api\/files\//)
  }
  const retried = await createScore(await request('/api/scores', student, { ...body, cover_url: '/expired-client-preview' }))
  assert.equal(retried.status, 200)
  assert.match((await retried.json() as TeachingScore).cover_url ?? '', /^\/api\/files\//)
  const changedCover = await coverFile(student)
  assert.equal((await createScore(await request('/api/scores', student, { ...body, cover_file_id: changedCover.fileId }))).status, 409)
  const stored = await createLocalDatabaseClient().from('scores').select('*').eq('id', created.id).single()
  assert.ok(stored.data && !Array.isArray(stored.data))
  assert.equal('cover_url' in stored.data, false)
  assert.equal('cover_receipt' in stored.data, false)
})

test('cover downloads obey the associated score class, publication and private-owner rules', async () => {
  const db = createLocalDatabaseClient()
  const cover = await coverFile(teacher)
  const response = await createScore(await request('/api/scores', teacher, { ...scoreBody([await pageFile(teacher)]), user_id: teacher, cover_file_id: cover.fileId, published: true, target_classes: ['钢琴二班'] }))
  assert.equal(response.status, 201)
  const created = await response.json() as TeachingScore
  const url = await getLocalFileUrl(cover.fileId)
  const download = async (userId: string) => downloadFile(await request(url.url, userId), context(cover.fileId.slice(6)))
  assert.equal((await download(student)).status, 404)
  assert.equal((await renewFile(await request(`/api/upload?file_id=${encodeURIComponent(cover.fileId)}`, student))).status, 404)
  await db.from('profiles').update({ class_name: '钢琴二班' }).eq('id', student)
  assert.equal((await download(student)).status, 200)
  await db.from('scores').update({ published: false }).eq('id', created.id)
  assert.equal((await download(student)).status, 404)
  const privateCover = await coverFile(student)
  const personalResponse = await createScore(await request('/api/scores', student, { ...scoreBody([await pageFile(student)]), cover_file_id: privateCover.fileId }))
  assert.equal(personalResponse.status, 201)
  const privateUrl = await getLocalFileUrl(privateCover.fileId)
  assert.equal((await downloadFile(await request(privateUrl.url, teacher), context(privateCover.fileId.slice(6)))).status, 404)
  assert.equal((await downloadFile(await request(privateUrl.url, other), context(privateCover.fileId.slice(6)))).status, 404)
})

test('score covers reject foreign files, private recordings, fake raster bytes and general remote receipts', async () => {
  createLocalDatabaseClient()
  const base = scoreBody([await pageFile(student)])
  const foreign = await coverFile(other)
  const audio = await ownFile(student, 'audio/webm')
  const fake = await saveLocalFile(Buffer.from('<svg/>'), 'fake.png', 'image/png', student)
  for (const file of [foreign, audio, fake]) {
    assert.ok((await createScore(await request('/api/scores', student, { ...base, cover_file_id: file.fileId }))).status >= 400)
  }
  const remote = 'remote-score-cover'
  const generalReceipt = createScoreUploadReceipt({ fileId: remote, ownerId: student, fileType: 'image/png' })
  assert.equal((await createScore(await request('/api/scores', student, { ...base, cover_file_id: remote, cover_receipt: generalReceipt }))).status, 403)
  delete process.env.CODER_CODING_API_KEY
  delete process.env.CODER_CODING_BASE_URL
  const receipt = createScoreUploadReceipt({ fileId: remote, ownerId: student, fileType: 'image/png', purpose: 'score-cover' })
  const valid = await createScore(await request('/api/scores', student, { ...base, cover_file_id: remote, cover_receipt: receipt }))
  assert.equal(valid.status, 201, await valid.clone().text())
  const saved = await valid.json() as TeachingScore
  assert.equal(saved.cover_file_id, remote)
  assert.equal(saved.cover_url, null)
})

test('cover replacement preserves shared references, omitted fields stay unchanged and missing covers never hide scores', async () => {
  createLocalDatabaseClient()
  const cover = await coverFile(student)
  const body = { ...scoreBody([await pageFile(student)]), cover_file_id: cover.fileId }
  const first = await (await createScore(await request('/api/scores', student, body))).json() as TeachingScore
  const second = await (await createScore(await request('/api/scores', student, body))).json() as TeachingScore
  const titleOnly = await editScore(await request(`/api/scores/${first.id}`, student, { user_id: student, title: '只改曲名' }), context(first.id))
  assert.equal((await titleOnly.json() as TeachingScore).cover_file_id, cover.fileId)
  const cleared = await editScore(await request(`/api/scores/${first.id}`, student, { user_id: student, cover_file_id: null }), context(first.id))
  assert.equal(cleared.status, 200)
  assert.equal((await cleared.json() as TeachingScore).cover_file_id, null)
  assert.equal((await localFileMetadata(cover.fileId)).type, 'image/png')
  assert.equal((await deleteScore(await request(`/api/scores/${second.id}`, student), context(second.id))).status, 200)
  await assert.rejects(localFileMetadata(cover.fileId))
  const missing = await coverFile(student)
  const third = await (await createScore(await request('/api/scores', student, { ...body, cover_file_id: missing.fileId }))).json() as TeachingScore
  await deleteLocalFile(missing.fileId)
  const result = await readScore(await request(`/api/scores/${third.id}`, student), context(third.id))
  assert.equal(result.status, 200)
  assert.equal((await result.json() as TeachingScore).cover_url, null)
  const edited = await editScore(await request(`/api/scores/${third.id}`, student, { user_id: student, title: '封面丢失也可改曲名' }), context(third.id))
  assert.equal(edited.status, 200)
  assert.equal((await edited.json() as TeachingScore).cover_file_id, missing.fileId)
})

test('a saved cover removal reports cleanup failure without failing or repeating the score update', async () => {
  createLocalDatabaseClient()
  const cover = await coverFile(student)
  const created = await (await createScore(await request('/api/scores', student, { ...scoreBody([await pageFile(student)]), cover_file_id: cover.fileId }))).json() as TeachingScore
  const metadata = path.join(directory, 'uploads', `${cover.fileId.slice(6)}.json`)
  await rename(metadata, `${metadata}.backup`)
  await mkdir(metadata)
  const response = await editScore(await request(`/api/scores/${created.id}`, student, { user_id: student, cover_file_id: null }), context(created.id))
  assert.equal(response.status, 200, await response.clone().text())
  const saved = await response.json() as TeachingScore & { warning?: string }
  assert.equal(saved.cover_file_id, null)
  assert.equal(saved.cover_url, null)
  assert.match(saved.warning ?? '', /已保存.*封面.*清理失败/)
  assert.deepEqual((await createLocalDatabaseClient().from('scores').select('cover_file_id').eq('id', created.id).single()).data, { cover_file_id: null })
})

test('teacher classification saves and publishes without legacy difficulty or genre and filters by type and period', async () => {
  createLocalDatabaseClient()
  const page = await pageFile(teacher)
  const body = { id: 'b0000000-0000-4000-8000-000000000001', user_id: teacher, title: '新分类琴谱', composer: '作曲家', category: 'foreign', score_type: '协奏曲', period: '18世纪', published: true, target_classes: ['钢琴一班'], pages: [page] }
  const response = await createScore(await request('/api/scores', teacher, body))
  assert.equal(response.status, 201, await response.clone().text())
  const created = await response.json() as Record<string, unknown>
  assert.equal(created.score_type, '协奏曲')
  assert.equal(created.period, '18世纪')
  assert.equal(created.published, true)
  assert.deepEqual(created.target_classes, ['钢琴一班'])
  assert.equal((await createScore(await request('/api/scores', teacher, body))).status, 200)
  for (const changed of [{ score_type: '夜曲' }, { period: '浪漫主义时期' }]) {
    assert.equal((await createScore(await request('/api/scores', teacher, { ...body, ...changed }))).status, 409)
  }
  for (const query of ['score_type=夜曲', 'period=19世纪']) {
    assert.deepEqual(await (await listScores(await request(`/api/scores?${query}`, teacher))).json(), [])
  }
  const matches = await (await listScores(await request('/api/scores?score_type=协奏曲&period=18世纪', teacher))).json() as Array<{ id: string }>
  assert.deepEqual(matches.map(score => score.id), [body.id])
  const db = createLocalDatabaseClient()
  await db.from('scores').update({ difficulty: 'advanced' }).eq('id', body.id)
  const patched = await editScore(await request(`/api/scores/${body.id}`, teacher, { user_id: teacher, title: '修改曲名', difficulty: 'beginner', genre_id: 'unused' }), context(body.id))
  assert.equal(patched.status, 200, await patched.clone().text())
  const updated = await patched.json() as Record<string, unknown>
  assert.equal(updated.score_type, '协奏曲')
  assert.equal(updated.period, '18世纪')
  assert.equal(updated.difficulty, 'advanced')
  assert.deepEqual(updated.target_classes, ['钢琴一班'])
})

test('score classification rejects unknown types and periods over the length limit', async () => {
  createLocalDatabaseClient()
  const page = await pageFile(teacher)
  const body = { user_id: teacher, title: '分类校验', composer: '作曲家', category: 'foreign', difficulty: 'beginner', pages: [page] }
  for (const fields of [{ score_type: '未定义类型' }, { period: '时'.repeat(101) }]) {
    assert.equal((await createScore(await request('/api/scores', teacher, { ...body, ...fields }))).status, 400)
  }
})

test('student personal uploads stay private, are queued, editable and deletable only by owner', async () => {
  const score = await privateScore()
  assert.equal(score.source, 'student')
  assert.equal(score.published, false)
  assert.deepEqual(score.target_classes, [])
  assert.equal((await readScore(await request(`/api/scores/${score.id}`, other), context(score.id))).status, 404)
  assert.equal((await readScore(await request(`/api/scores/${score.id}`, teacher), context(score.id))).status, 404)
  assert.equal((await listScores(await request('/api/scores?source=student', other))).status, 200)
  assert.deepEqual(await (await listScores(await request('/api/scores?source=student', other))).json(), [])
  const queue = await (await listPractice(await request('/api/practice-list', student))).json() as { id: string }[]
  assert.deepEqual(queue.map(item => item.id), [score.id])
  assert.equal((await editScore(await request(`/api/scores/${score.id}`, other, { user_id: other, title: '冒改' }), context(score.id))).status, 404)
  const edited = await editScore(await request(`/api/scores/${score.id}`, student, { user_id: student, title: '修改后的琴谱', published: true }), context(score.id))
  assert.equal(edited.status, 200)
  assert.equal((await edited.json() as { published: boolean }).published, false)
  assert.equal((await deleteScore(await request(`/api/scores/${score.id}`, other), context(score.id))).status, 404)
  assert.equal((await deleteScore(await request(`/api/scores/${score.id}`, student), context(score.id))).status, 200)
})

test('student cannot claim another persons uploaded file as their private score', async () => {
  createLocalDatabaseClient()
  const file = await ownFile(other)
  const response = await createScore(await request('/api/scores', student, { user_id: student, title: '非法引用', composer: '自选', category: 'domestic', difficulty: 'beginner', file_id: file.fileId, file_type: file.type }))
  assert.equal(response.status, 403)
})

test('real local signed URLs save successfully and deleting the record revokes its recording', async () => {
  createLocalDatabaseClient()
  const file = await ownFile(student, 'audio/webm')
  const signed = await getLocalFileUrl(file.fileId)
  const response = await savePractice(await request('/api/practice', student, { user_id: student, piece_title: '自选曲', source: 'student', started_at: new Date(Date.now() - 10_000).toISOString(), duration_seconds: 10, pause_count: 1, audio_file_id: file.fileId, audio_url: signed.url }))
  assert.equal(response.status, 201, await response.clone().text())
  const record = await response.json() as { id: string }
  assert.equal((await deletePractice(await request(`/api/practice/${record.id}`, student), context(record.id))).status, 200)
  assert.equal((await serveLocalFile(new Request(`http://localhost${signed.url}`), file.fileId.slice(6))).status, 404)
})

test('private score file URL renewal is available to its owner only', async () => {
  const score = await privateScore()
  const stored = await createLocalDatabaseClient().from('scores').select('file_id').eq('id', score.id).single()
  assert.ok(stored.data && !Array.isArray(stored.data))
  const fileId = stored.data.file_id as string
  assert.equal((await renewFile(await request(`/api/upload?file_id=${encodeURIComponent(fileId)}`, student))).status, 200)
  assert.equal((await renewFile(await request(`/api/upload?file_id=${encodeURIComponent(fileId)}`, other))).status, 404)
  assert.equal((await renewFile(await request(`/api/upload?file_id=${encodeURIComponent(fileId)}`, teacher))).status, 404)
})

test('even a valid signed private file URL requires its owner session', async () => {
  createLocalDatabaseClient()
  const file = await ownFile(student)
  const { url } = await getLocalFileUrl(file.fileId)
  assert.equal((await downloadFile(await request(url, student), context(file.fileId.slice(6)))).status, 200)
  assert.equal((await downloadFile(await request(url, other), context(file.fileId.slice(6)))).status, 404)
  assert.equal((await downloadFile(await request(url, teacher), context(file.fileId.slice(6)))).status, 404)
  assert.equal((await downloadFile(new Request(`http://localhost${url}`), context(file.fileId.slice(6)))).status, 401)
})

test('class restrictions apply equally to score list, details and the signed file route', async () => {
  const db = createLocalDatabaseClient()
  await db.from('profiles').update({ class_name: '钢琴一班' }).eq('id', student)
  const file = await ownFile(teacher)
  const score = await db.from('scores').insert({ title: '限班琴谱', composer: '作曲家', difficulty: 'beginner', category: 'domestic', file_id: file.fileId, file_type: 'image/png', published: true, target_classes: ['钢琴二班'], source: 'teacher', owner_id: teacher }).select().single()
  assert.equal(score.error, null)
  assert.ok(score.data && !Array.isArray(score.data))
  const id = score.data.id as string
  assert.deepEqual(await (await listScores(await request('/api/scores', student))).json(), [])
  assert.equal((await readScore(await request(`/api/scores/${id}`, student), context(id))).status, 404)
  const { url } = await getLocalFileUrl(file.fileId)
  assert.equal((await downloadFile(await request(url, student), context(file.fileId.slice(6)))).status, 404)
  await db.from('profiles').update({ class_name: '钢琴二班' }).eq('id', student)
  assert.equal((await readScore(await request(`/api/scores/${id}`, student), context(id))).status, 200)
  assert.equal((await downloadFile(await request(url, student), context(file.fileId.slice(6)))).status, 200)
})

test('withdrawn fixed scores and withdrawn random assignments do not remain available to students', async () => {
  const db = createLocalDatabaseClient()
  const score = await db.from('scores').insert({ title: '撤回曲目', composer: '作曲家', difficulty: 'beginner', category: 'domestic', published: false, source: 'teacher', owner_id: teacher }).select().single()
  assert.ok(score.data && !Array.isArray(score.data))
  const task = await db.from('tasks').insert({ title: '任务', description: '练习', teacher_id: teacher, start_at: '2026-01-01T00:00:00Z', end_at: '2027-01-01T00:00:00Z', audience: 'all', score_mode: 'fixed', score_id: score.data.id, requirements: { audio: 'off', record: 'required', video: 'off' } }).select().single()
  assert.ok(task.data && !Array.isArray(task.data))
  const user = { id: student, role: 'student' as const, nickname: '测试学生', class_name: null }
  assert.equal(await assignedScore(createSupabaseServer(), task.data as unknown as PracticeTask, user), null)
  await db.from('task_score_assignments').insert({ task_id: task.data.id, student_id: student, score_id: score.data.id })
  assert.equal(await assignedScore(createSupabaseServer(), { ...task.data, score_mode: 'random' } as unknown as PracticeTask, user), null)
})

test('multiple score images retain order and every page renews in details, library and practice queue', async () => {
  createLocalDatabaseClient()
  const pages = [await pageFile(student), await pageFile(student)]
  const created = await createScore(await request('/api/scores', student, scoreBody(pages)))
  assert.equal(created.status, 201, await created.clone().text())
  const score = await created.json() as TeachingScore
  assert.deepEqual(score.pages?.map(page => page.file_id), pages.map(page => page.file_id))
  assert.equal(score.file_id, pages[0].file_id)
  for (const response of [
    await readScore(await request(`/api/scores/${score.id}`, student), context(score.id)),
    await listScores(await request('/api/scores', student)),
    await listPractice(await request('/api/practice-list', student)),
  ]) {
    assert.equal(response.status, 200, await response.clone().text())
    const result = await response.json() as TeachingScore | TeachingScore[]
    const current = Array.isArray(result) ? result[0] : result
    assert.deepEqual(current.pages?.map(page => page.file_id), pages.map(page => page.file_id))
    assert.ok(current.pages?.every(page => page.image_url?.startsWith('/api/files/')))
    assert.equal(current.image_url, current.pages?.[0].image_url)
  }
  const reordered = await editScore(await request(`/api/scores/${score.id}`, student, { user_id: student, pages: [...pages].reverse() }), context(score.id))
  assert.equal(reordered.status, 200)
  const changed = await reordered.json() as TeachingScore
  assert.equal(changed.file_id, pages[1].file_id)
  assert.deepEqual(changed.pages?.map(page => page.file_id), [...pages].reverse().map(page => page.file_id))
})

test('all score pages enforce uploader ownership, actual MIME and image/PDF limits', async () => {
  createLocalDatabaseClient()
  const own = await pageFile(student)
  const foreign = await pageFile(other)
  const spoofedPdf = await pageFile(student, 'application/pdf')
  assert.equal((await createScore(await request('/api/scores', student, scoreBody([own, foreign])))).status, 403)
  assert.equal((await createScore(await request('/api/scores', student, scoreBody([own, spoofedPdf])))).status, 400)
  assert.equal((await createScore(await request('/api/scores', student, scoreBody(Array.from({ length: 51 }, () => own))))).status, 400)
  assert.equal((await createScore(await request('/api/scores', student, scoreBody([spoofedPdf])))).status, 400)
  const pdf = await pageFile(teacher, 'application/pdf')
  const teacherBody = { ...scoreBody([pdf]), user_id: teacher }
  const accepted = await createScore(await request('/api/scores', teacher, teacherBody))
  assert.equal(accepted.status, 201, await accepted.clone().text())
  const score = await accepted.json() as TeachingScore
  assert.equal(score.file_type, 'application/pdf')
  assert.equal(score.pages?.[0].file_type, 'application/pdf')
  assert.equal((await createScore(await request('/api/scores', teacher, { ...teacherBody, pages: [pdf, await pageFile(teacher)] }))).status, 400)
})

test('second page downloads and URL renewal obey score publication and class scope', async () => {
  const db = createLocalDatabaseClient()
  await db.from('profiles').update({ class_name: '钢琴一班' }).eq('id', student)
  const pages = [await pageFile(teacher), await pageFile(teacher)]
  const inserted = await db.from('scores').insert({ title: '限班多页谱', composer: '作曲家', difficulty: 'beginner', source: 'teacher', owner_id: teacher, published: true, target_classes: ['钢琴二班'], ...pages[0], pages }).select().single()
  assert.equal(inserted.error, null)
  assert.ok(inserted.data && !Array.isArray(inserted.data))
  const fileId = pages[1].file_id!
  const { url } = await getLocalFileUrl(fileId)
  assert.equal((await downloadFile(await request(url, student), context(fileId.slice(6)))).status, 404)
  assert.equal((await renewFile(await request(`/api/upload?file_id=${encodeURIComponent(fileId)}`, student))).status, 404)
  await db.from('profiles').update({ class_name: '钢琴二班' }).eq('id', student)
  assert.equal((await downloadFile(await request(url, student), context(fileId.slice(6)))).status, 200)
  assert.equal((await renewFile(await request(`/api/upload?file_id=${encodeURIComponent(fileId)}`, student))).status, 200)
  await db.from('scores').update({ published: false }).eq('id', inserted.data.id)
  assert.equal((await downloadFile(await request(url, student), context(fileId.slice(6)))).status, 404)
})

test('removed pages are cleaned only after every score reference is removed and legacy replacement clears pages', async () => {
  createLocalDatabaseClient()
  const pages = [await pageFile(student), await pageFile(student)]
  const first = await (await createScore(await request('/api/scores', student, scoreBody(pages)))).json() as TeachingScore
  const second = await (await createScore(await request('/api/scores', student, scoreBody([pages[1]])))).json() as TeachingScore
  const signed = await getLocalFileUrl(pages[1].file_id!)
  const trimmed = await editScore(await request(`/api/scores/${first.id}`, student, { user_id: student, pages: [pages[0]] }), context(first.id))
  assert.equal(trimmed.status, 200, await trimmed.clone().text())
  assert.equal((await serveLocalFile(new Request(`http://localhost${signed.url}`), pages[1].file_id!.slice(6))).status, 200)
  assert.equal((await deleteScore(await request(`/api/scores/${second.id}`, student), context(second.id))).status, 200)
  assert.equal((await serveLocalFile(new Request(`http://localhost${signed.url}`), pages[1].file_id!.slice(6))).status, 404)
  const replacement = await pageFile(student)
  const replaced = await editScore(await request(`/api/scores/${first.id}`, student, { user_id: student, ...replacement }), context(first.id))
  assert.equal(replaced.status, 200, await replaced.clone().text())
  const updated = await replaced.json() as TeachingScore
  assert.deepEqual(updated.pages?.map(page => page.file_id), [replacement.file_id])
  const originalUrl = await getLocalFileUrl(replacement.file_id!)
  assert.equal((await deleteScore(await request(`/api/scores/${first.id}`, student), context(first.id))).status, 200)
  assert.equal((await serveLocalFile(new Request(`http://localhost${originalUrl.url}`), replacement.file_id!.slice(6))).status, 404)
})

test('create retries repair the queue only for the same saved intent and reject changed pages or metadata', async () => {
  const db = createLocalDatabaseClient()
  const pages = [await pageFile(student), await pageFile(student)]
  const body = { ...scoreBody(pages), id: 'a0000000-0000-4000-8000-000000000001', tips: '慢练' }
  const created = await createScore(await request('/api/scores', student, body))
  assert.equal(created.status, 201, await created.clone().text())
  // PostgreSQL JSONB may return object keys in a different order.
  await db.from('scores').update({ pages: pages.map(page => ({ file_type: page.file_type, file_name: page.file_name, file_id: page.file_id, image_url: page.image_url })) }).eq('id', body.id)
  await db.from('practice_list').delete().eq('user_id', student).eq('score_id', body.id)
  const renewed = await Promise.all(pages.map(async page => ({ ...page, image_url: (await getLocalFileUrl(page.file_id!)).url })))
  const retried = await createScore(await request('/api/scores', student, { ...body, pages: renewed }))
  assert.equal(retried.status, 200, await retried.clone().text())
  assert.equal((await db.from('practice_list').select('id', { count: 'exact', head: true }).eq('score_id', body.id)).count, 1)
  for (const changed of [{ pages: [...pages].reverse() }, { title: '另一个标题' }, { tips: '新的提醒' }, { pages: [pages[0], await pageFile(student)] }]) {
    const conflict = await createScore(await request('/api/scores', student, { ...body, ...changed }))
    assert.equal(conflict.status, 409, await conflict.clone().text())
    assert.match((await conflict.json() as { error: string }).error, /已保存/)
  }
  const stored = await readScore(await request(`/api/scores/${body.id}`, student), context(body.id))
  const unchanged = await stored.json() as TeachingScore
  assert.equal(unchanged.title, body.title)
  assert.equal(unchanged.tips, body.tips)
  assert.deepEqual(unchanged.pages?.map(page => page.file_id), pages.map(page => page.file_id))
})
