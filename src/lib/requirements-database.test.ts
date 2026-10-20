import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createLocalDatabaseClient } from './local-database'

test('persists class-scoped scores, private teacher messages, individual lesson marks and course knowledge', async () => {
  const before = process.env.ZHIYIN_DATA_DIR
  const directory = mkdtempSync(path.join(tmpdir(), 'zhiyin-requirements-'))
  process.env.ZHIYIN_DATA_DIR = directory
  const teacher = 't0000000-0000-0000-0000-000000000001'
  const student = 's0000000-0000-0000-0000-000000000001'
  try {
    const db = createLocalDatabaseClient()
    const score = await db.from('scores').insert({ id: 'class-score', title: '练习曲', composer: '作者', difficulty: 'beginner', source: 'teacher', owner_id: teacher, target_classes: ['钢琴一班'] }).select('target_classes').single()
    assert.equal(score.error, null)
    assert.deepEqual(score.data, { target_classes: ['钢琴一班'] })
    const post = await db.from('posts').insert({ id: 'private-message', user_id: student, title: '请教', content: '练习问题', category: 'method', recipient_teacher_id: teacher })
    assert.equal(post.error, null)
    assert.equal((await db.from('lesson_marks').insert({ post_id: 'private-message', teacher_id: teacher })).error, null)
    const marks = await db.from('posts').select('recipient_teacher_id,lesson_marks(teacher_id)').eq('id', 'private-message').single()
    assert.deepEqual(marks.data, { recipient_teacher_id: teacher, lesson_marks: [{ teacher_id: teacher }] })
    const knowledge = await db.from('course_knowledge').insert({ title: '连奏', content: '教师确认的教学内容', keywords: ['连奏', 'legato'], source_url: 'https://example.org/course', teacher_id: teacher }).select('title,keywords').single()
    assert.equal(knowledge.error, null)
    assert.deepEqual(knowledge.data, { title: '连奏', keywords: ['连奏', 'legato'] })
  } finally {
    if (before === undefined) delete process.env.ZHIYIN_DATA_DIR
    else process.env.ZHIYIN_DATA_DIR = before
    rmSync(directory, { recursive: true, force: true })
  }
})
