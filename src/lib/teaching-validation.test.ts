import assert from 'node:assert/strict'
import test from 'node:test'
import { canReadScore, validateSubmissionRequirements, semesterProgress, taskIsVisible, stableScoreId, scorePatchSchema, taskPatchSchema, scoreSchema, practiceSchema, submissionSchema } from './teaching-validation'

test('partial edits do not inject defaults into untouched score or task properties', () => {
  assert.deepEqual(scorePatchSchema.parse({ user_id: 't1', title: '新曲名' }), { user_id: 't1', title: '新曲名' })
  assert.deepEqual(taskPatchSchema.parse({ user_id: 't1', closed: true }), { user_id: 't1', closed: true })
  assert.deepEqual(taskPatchSchema.parse({ user_id: 't1', description: '新要求' }), { user_id: 't1', description: '新要求' })
})

test('private uploads are readable only by their owner while teacher drafts remain hidden', () => {
  assert.equal(canReadScore({ role: 'student', id: 's1' }, { source: 'student', published: false, owner_id: 's1' }), true)
  assert.equal(canReadScore({ role: 'student', id: 's2' }, { source: 'student', published: true, owner_id: 's1' }), false)
  assert.equal(canReadScore({ role: 'teacher', id: 't1' }, { source: 'student', published: false, owner_id: 's1' }), false)
  assert.equal(canReadScore({ role: 'student', id: 's1' }, { source: 'teacher', published: false, owner_id: 's1' }), false)
  assert.equal(canReadScore({ role: 'student', id: 's1' }, { published: true, owner_id: 't1' }), true)
  assert.equal(canReadScore({ role: 'teacher', id: 't1' }, { published: false, owner_id: 't1' }), true)
  assert.equal(canReadScore({ role: 'teacher', id: 't2' }, { published: false, owner_id: 't1' }), false)
})

test('published teacher scores follow their assigned class and empty means all classes', () => {
  const user = { role: 'student', id: 's1', class_name: '钢琴一班' }
  const score = { source: 'teacher', published: true, owner_id: 't1', target_classes: ['钢琴二班'] }
  assert.equal(canReadScore(user, score), false)
  assert.equal(canReadScore(user, { ...score, target_classes: ['钢琴一班'] }), true)
  assert.equal(canReadScore(user, { ...score, target_classes: [] }), true)
  assert.equal(canReadScore({ ...user, class_name: null }, score), false)
})

test('local upload URLs can be saved by real score, recording and submission forms', () => {
  const url = '/api/files/00000000-0000-4000-8000-000000000000?expires=1900000000&token=' + 'a'.repeat(43)
  assert.equal(scoreSchema.safeParse({ user_id: 't1', title: '练习曲', composer: '作曲家', category: 'domestic', difficulty: 'beginner', image_url: url }).success, true)
  assert.equal(practiceSchema.safeParse({ user_id: 's1', piece_title: '练习曲', started_at: '2026-10-16T00:00:00Z', duration_seconds: 10, audio_url: url }).success, true)
  assert.equal(submissionSchema.safeParse({ user_id: 's1', audio_url: url, video_url: url }).success, true)
  for (const unsafe of ['//evil.example/file', '/api/files/../auth', '/api/files/%2e%2e/auth', 'javascript:alert(1)', 'file:///tmp/file']) {
    assert.equal(submissionSchema.safeParse({ user_id: 's1', audio_url: unsafe }).success, false, unsafe)
  }
})

test('required submission items cannot be replaced by unrelated material', () => {
  const requirements = { audio: 'required', record: 'required', video: 'optional' } as const
  assert.equal(validateSubmissionRequirements(requirements, { video_url: 'https://example.org/video' }), '请提交必交的练习录音、练习记录')
  assert.equal(validateSubmissionRequirements(requirements, { audio_file_id: 'audio', record_text: '练习 C 大调 10 分钟' }), null)
})

test('semester completion counts only records within inclusive date boundaries', () => {
  const goal = { start_date: '2026-09-01', end_date: '2027-01-31', target_minutes: 600 }
  const records = [
    { practice_date: '2026-08-31', duration_seconds: 9999 },
    { practice_date: '2026-09-01', duration_seconds: 1800 },
    { practice_date: '2027-01-31', duration_seconds: 1800 },
    { practice_date: '2027-02-01', duration_seconds: 9999 },
  ]
  const progress = semesterProgress(goal, records, new Date('2026-10-15T00:00:00Z'))
  assert.equal(progress.completed_seconds, 3600)
  assert.equal(progress.progress_percent, 10)
  assert.ok(progress.expected_percent > 0 && progress.expected_percent < 100)
})

test('class and individual tasks are visible only to matching students', () => {
  const user = { id: 's1', role: 'student', class_name: '钢琴一班' }
  assert.equal(taskIsVisible({ audience: 'classes', target_classes: ['钢琴二班'], target_student_ids: [] }, user), false)
  assert.equal(taskIsVisible({ audience: 'students', target_classes: [], target_student_ids: ['s1'] }, user), true)
})

test('random score assignment is stable for a task and student', () => {
  assert.equal(stableScoreId('task1', 's1', ['c', 'a', 'b']), stableScoreId('task1', 's1', ['b', 'c', 'a']))
})
