import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { createScoreUploadReceipt } from './score-upload-receipt'
import type { ScoreFiles } from './score-pages'
import { ApiError, validateScoreFiles } from './teaching-server'
import type { TeachingProfile } from './teaching-types'
import { createSupabaseServer } from './supabase-server'

const student: TeachingProfile = { id: 's0000000-0000-0000-0000-000000000001', nickname: '抚琴听雨', role: 'student', class_name: null }
const other: TeachingProfile = { id: 's0000000-0000-0000-0000-000000000002', nickname: '黑白键旅人', role: 'student', class_name: null }
const keys = ['ZHIYIN_DATA_DIR', 'ZHIYIN_SESSION_SECRET', 'ZHIYIN_STORAGE_MODE'] as const
let original: Record<string, string | undefined>
let directory: string

beforeEach(() => {
  original = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  directory = mkdtempSync(path.join(os.tmpdir(), 'zhiyin-score-remote-'))
  process.env.ZHIYIN_DATA_DIR = directory
  process.env.ZHIYIN_SESSION_SECRET = 'remote-score-upload-test-secret-at-least-32-characters'
  process.env.ZHIYIN_STORAGE_MODE = 'local'
})

afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  rmSync(directory, { recursive: true, force: true })
})

const input = (page: Record<string, unknown>) => ({ pages: [{ image_url: null, file_id: 'remote-page-1', file_name: '第一页.png', file_type: 'application/pdf', ...page }] }) as unknown as ScoreFiles

test('valid remote receipt supplies MIME and is stripped before score persistence', async () => {
  const db = createSupabaseServer()
  const receipt = createScoreUploadReceipt({ fileId: 'remote-page-1', ownerId: student.id, fileType: 'image/png' })
  const files = await validateScoreFiles(db, student, input({ upload_receipt: receipt }))
  assert.equal(files.pages[0].file_type, 'image/png')
  assert.equal('upload_receipt' in files.pages[0], false)
  const saved = await db.from('scores').insert({ id: crypto.randomUUID(), title: '远端多页谱', composer: '自选', difficulty: 'beginner', category: 'domestic', source: 'student', owner_id: student.id, published: false, ...files }).select('pages').single()
  assert.equal(saved.error, null)
  assert.equal(JSON.stringify(saved.data).includes(receipt), false)
})

test('remote receipt cannot be used by another score owner', async () => {
  const db = createSupabaseServer()
  const receipt = createScoreUploadReceipt({ fileId: 'remote-page-1', ownerId: other.id, fileType: 'image/png' })
  await assert.rejects(validateScoreFiles(db, student, input({ upload_receipt: receipt })), error => error instanceof ApiError && error.status === 403)
})

test('legacy remote file without receipt is accepted only from an existing score owned by the actor', async () => {
  const db = createSupabaseServer()
  const page = { image_url: null, file_id: 'remote-legacy-page', file_name: '旧谱.png', file_type: 'image/png' }
  const inserted = await db.from('scores').insert({ title: '旧远端谱', composer: '自选', difficulty: 'beginner', category: 'domestic', source: 'student', owner_id: student.id, published: false, pages: [page] }).select().single()
  assert.equal(inserted.error, null)
  const own = await validateScoreFiles(db, student, { pages: [{ ...page, file_type: 'application/pdf' }] })
  assert.equal(own.pages[0].file_type, 'image/png')
  await assert.rejects(validateScoreFiles(db, other, { pages: [page] }), error => error instanceof ApiError && error.status === 403)
})
