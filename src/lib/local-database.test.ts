import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { createLocalDatabaseClient, localDatabasePath } from './local-database'

const teacher = 't0000000-0000-0000-0000-000000000001'
const student = 's0000000-0000-0000-0000-000000000001'
let directory: string
let originalDirectory: string | undefined
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-database-'))
  originalDirectory = process.env.ZHIYIN_DATA_DIR
  process.env.ZHIYIN_DATA_DIR = directory
})
afterEach(() => {
  if (originalDirectory === undefined) delete process.env.ZHIYIN_DATA_DIR
  else process.env.ZHIYIN_DATA_DIR = originalDirectory
  rmSync(directory, { recursive: true, force: true })
})

test('creates an on-disk SQLite database and retains updates when a new client opens it', async () => {
  const client = createLocalDatabaseClient()
  const updated = await client.from('profiles').update({ class_name: '钢琴一班' }).eq('id', student)
  assert.equal(updated.error, null)
  const reopened = await createLocalDatabaseClient().from('profiles').select('id,nickname,class_name').eq('id', student).single()
  assert.equal(reopened.error, null)
  assert.deepEqual(reopened.data, { id: student, nickname: '抚琴听雨', class_name: '钢琴一班' })
  assert.equal(localDatabasePath(), path.join(directory, 'zhiyin.sqlite'))
  assert.equal(readFileSync(localDatabasePath()).subarray(0, 16).toString(), 'SQLite format 3\u0000')
  const script = `const { createLocalDatabaseClient } = require(${JSON.stringify(path.join(process.cwd(), 'src/lib/local-database.ts'))}); (async () => { const result = await createLocalDatabaseClient().from('profiles').select('class_name').eq('id', ${JSON.stringify(student)}).single(); process.stdout.write(JSON.stringify(result)); })()`
  const restarted = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], { cwd: process.cwd(), env: { ...process.env }, encoding: 'utf8' })
  assert.equal(restarted.status, 0, restarted.stderr)
  assert.deepEqual(JSON.parse(restarted.stdout) as unknown, { data: { class_name: '钢琴一班' }, error: null, count: null })
})

test('initializes only nickname identities and leaves teaching content empty', async () => {
  const client = createLocalDatabaseClient()
  const profiles = await client.from('profiles').select('id', { count: 'exact', head: true })
  assert.equal(profiles.count, 3)
  for (const table of ['scores', 'score_genres', 'tasks', 'practice_records', 'submissions']) {
    const result = await client.from(table).select('*')
    assert.deepEqual(result.data, [])
  }
})

test('JSON page containment locates a file beyond the legacy first page without matching unrelated files', async () => {
  const client = createLocalDatabaseClient()
  const values = { title: '多页曲谱', composer: '作曲家', difficulty: 'beginner', source: 'teacher', owner_id: teacher }
  await client.from('scores').insert([{ ...values, id: 'with-page', file_id: 'first', pages: [{ file_id: 'first' }, { file_id: 'second' }] }, { ...values, id: 'other-page', pages: [{ file_id: 'other' }] }])
  const matches = await client.from('scores').select('id').contains('pages', [{ file_id: 'second' }])
  assert.equal(matches.error, null)
  assert.deepEqual(matches.data, [{ id: 'with-page' }])
})

test('existing single-file scores survive the additive page column migration', async () => {
  const client = createLocalDatabaseClient()
  await client.from('scores').insert({ id: 'legacy-score', title: '旧琴谱', composer: '作曲家', difficulty: 'beginner', source: 'teacher', owner_id: teacher, file_id: 'old-file', file_type: 'image/png' })
  const legacy = new DatabaseSync(localDatabasePath())
  legacy.exec('ALTER TABLE scores DROP COLUMN pages')
  legacy.close()
  const migrated = await createLocalDatabaseClient().from('scores').select('id,file_id,pages').eq('id', 'legacy-score').single()
  assert.equal(migrated.error, null)
  assert.deepEqual(migrated.data, { id: 'legacy-score', file_id: 'old-file', pages: [] })
})

test('enforces unique values and preserves identity on conflicting upsert', async () => {
  const client = createLocalDatabaseClient()
  const genre = { id: 'genre-1', name: '教师确认曲风', teacher_id: teacher }
  assert.equal((await client.from('score_genres').insert(genre)).error, null)
  assert.equal((await client.from('score_genres').insert({ ...genre, id: 'genre-2' })).error?.code, '23505')
  const score = { id: 'score-1', title: '练习曲', composer: '作曲家', difficulty: 'beginner', source: 'teacher', owner_id: teacher }
  assert.equal((await client.from('scores').insert(score)).error, null)
  assert.equal((await client.from('practice_list').upsert({ user_id: student, score_id: score.id }, { onConflict: 'user_id,score_id', ignoreDuplicates: true })).error, null)
  assert.equal((await client.from('practice_list').upsert({ user_id: student, score_id: score.id }, { onConflict: 'user_id,score_id', ignoreDuplicates: true })).error, null)
  assert.equal((await client.from('practice_list').select('*', { count: 'exact', head: true })).count, 1)
  const task = { id: 'task-1', title: '练习任务', description: '要求', start_at: '2026-10-01T00:00:00Z', end_at: '2026-11-01T00:00:00Z', audience: 'all', score_mode: 'fixed', score_id: score.id, teacher_id: teacher, requirements: { audio: 'off', record: 'required', video: 'off' } }
  assert.equal((await client.from('tasks').insert(task)).error, null)
  const first = await client.from('submissions').upsert({ task_id: task.id, student_id: student, record_text: '第一次' }, { onConflict: 'task_id,student_id' }).select('id').single()
  const second = await client.from('submissions').upsert({ task_id: task.id, student_id: student, record_text: '第二次' }, { onConflict: 'task_id,student_id' }).select('id,record_text').single()
  assert.equal(first.error, null)
  assert.equal(second.error, null)
  assert.ok(first.data && !Array.isArray(first.data))
  assert.deepEqual(second.data, { id: first.data.id, record_text: '第二次' })
})

test('projects nested score, genre, profile and reverse comment relations', async () => {
  const client = createLocalDatabaseClient()
  await client.from('score_genres').insert({ id: 'genre', name: '教师确认曲风', teacher_id: teacher })
  await client.from('scores').insert({ id: 'score', title: '练习曲', composer: '作曲家', difficulty: 'beginner', source: 'teacher', owner_id: teacher, genre_id: 'genre', published: true })
  await client.from('practice_list').insert({ user_id: student, score_id: 'score' })
  const scores = await client.from('practice_list').select('score:scores(id,title,published,genre:score_genres(id,name))')
  assert.deepEqual(scores.data, [{ score: { id: 'score', title: '练习曲', published: true, genre: { id: 'genre', name: '教师确认曲风' } } }])
  await client.from('posts').insert({ id: 'post', title: '问题', content: '练习问题', category: 'method', user_id: student })
  await client.from('comments').insert({ id: 'comment', content: '老师回复', user_id: teacher, post_id: 'post' })
  const posts = await client.from('posts').select('id,profiles(nickname),comments(id),post_likes(user_id)').single()
  assert.deepEqual(posts.data, { id: 'post', profiles: { nickname: '抚琴听雨' }, comments: [{ id: 'comment' }], post_likes: [] })
})

test('filters published rows, search patterns, date ranges and inclusive ordered pagination', async () => {
  const client = createLocalDatabaseClient()
  await client.from('scores').insert([0, 1, 2, 3].map(index => ({ id: `score-${index}`, title: `练习曲 ${index}`, composer: '作曲家', difficulty: 'beginner', source: 'teacher', owner_id: teacher, published: index !== 3, created_at: `2026-10-${10 + index}T00:00:00Z` })))
  const result = await client.from('scores').select('id', { count: 'exact' }).eq('published', true).ilike('title', '%练习曲%').gte('created_at', '2026-10-10').lte('created_at', '2026-10-12T23:59:59Z').in('id', ['score-0', 'score-1', 'score-2']).order('created_at', { ascending: false }).range(1, 2)
  assert.equal(result.count, 3)
  assert.deepEqual(result.data, [{ id: 'score-1' }, { id: 'score-0' }])
  const or = await client.from('scores').select('id').or(`published.eq.true,owner_id.eq.${teacher}`).order('id').limit(1)
  assert.deepEqual(or.data, [{ id: 'score-0' }])
  const empty = await client.from('scores').select('id').in('id', [])
  assert.deepEqual(empty.data, [])
})

test('rejects dangling references and protects a referenced genre from deletion', async () => {
  const client = createLocalDatabaseClient()
  const invalid = await client.from('practice_list').insert({ user_id: student, score_id: 'missing-score' })
  assert.equal(invalid.error?.code, '23503')
  await client.from('score_genres').insert({ id: 'genre', name: '教师确认曲风', teacher_id: teacher })
  await client.from('scores').insert({ id: 'score', title: '练习曲', composer: '作曲家', difficulty: 'beginner', source: 'teacher', owner_id: teacher, genre_id: 'genre' })
  assert.equal((await client.from('score_genres').delete().eq('id', 'genre')).error?.code, '23503')
  assert.equal((await client.from('scores').select('genre_id').eq('id', 'score').single()).error, null)
})

test('rolls back the entire bulk insert when any row violates a constraint', async () => {
  const client = createLocalDatabaseClient()
  const inserted = await client.from('score_genres').insert([{ name: '同名曲风', teacher_id: teacher }, { name: '同名曲风', teacher_id: teacher }])
  assert.equal(inserted.error?.code, '23505')
  assert.deepEqual((await client.from('score_genres').select('*')).data, [])
})

test('returns a meaningful single-row error instead of losing cardinality', async () => {
  const client = createLocalDatabaseClient()
  assert.equal((await client.from('profiles').select('id').eq('id', 'missing').maybeSingle()).data, null)
  assert.equal((await client.from('profiles').select('id').single()).error?.code, 'PGRST116')
  assert.equal((await client.from('profiles').select('id').eq('id', 'missing').single()).error?.code, 'PGRST116')
})
