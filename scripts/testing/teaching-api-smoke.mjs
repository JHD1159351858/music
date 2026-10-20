/** Exercises real Next route handlers against the isolated in-memory PostgREST fixture. */
import assert from 'node:assert/strict'
import { FIXTURE_IDS as ids } from './mock-teaching-service.mjs'

const base = process.env.TEACHING_TEST_URL ?? 'http://localhost:5001'
const fixture = process.env.TEACHING_FIXTURE_URL ?? 'http://127.0.0.1:54329'
const teacher = ids.teacher, student = ids.student1, other = ids.student2
let checks = 0

async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(`${base}/api${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`${method} ${path}: expected JSON, got ${response.status} ${text.slice(0, 160)}`) }
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}
const health = await (await fetch(`${fixture}/health`)).json()
assert.equal(health.test_fixture, true, 'Refuse to reset an unrecognized service')
await fetch(`${fixture}/reset`, { method: 'POST' })

assert.equal((await request('/profiles')).length, 3)
assert.equal((await request(`/scores?user_id=${student}`)).length, 2)
assert.equal((await request(`/scores?user_id=${teacher}`)).length, 3)
await request(`/scores/${ids.draft}?user_id=${student}`, 'GET', undefined, 404)
await request('/scores', 'POST', { user_id: student, title: '不允许', composer: '测试', difficulty: 'beginner', category: 'domestic' }, 403)
await request('/scores', 'POST', { user_id: teacher, title: '缺少曲风', composer: '测试', difficulty: 'beginner', category: 'domestic', published: true, image_url: 'http://localhost:5001/home/music-journey.png' }, 400)
await request('/scores', 'POST', { user_id: teacher, title: '', composer: '测试', difficulty: 'beginner', category: 'domestic' }, 400)
const draft = await request('/scores', 'POST', { user_id: teacher, title: '接口测试草稿', composer: '测试作曲家', difficulty: 'beginner', category: 'domestic', genre_id: ids.genre, tips: '注意乐句' }, 201)
assert.equal(draft.published, false)
await request(`/scores/${draft.id}`, 'PATCH', { user_id: teacher, published: true }, 400)
const published = await request(`/scores/${draft.id}`, 'PATCH', { user_id: teacher, image_url: 'http://localhost:5001/home/music-journey.png', file_type: 'image/png', published: true })
assert.equal(published.published, true)
assert.equal((await request(`/scores/${draft.id}`, 'PATCH', { user_id: teacher, title: '接口测试已发布琴谱' })).published, true)
await request(`/scores/${draft.id}`, 'PATCH', { user_id: student, title: '越权编辑' }, 403)
await request('/genres', 'POST', { user_id: student, name: '不允许' }, 403)
const genre = await request('/genres', 'POST', { user_id: teacher, name: '教师确认测试曲风' }, 201)
assert.ok(genre.id)

await request('/practice-list', 'POST', { user_id: student, score_id: ids.score1 })
await request('/practice-list', 'POST', { user_id: student, score_id: ids.score1 })
assert.equal((await request(`/practice-list?user_id=${student}`)).length, 1)
assert.equal((await request(`/practice-list?user_id=${other}`)).length, 0)
await request('/practice-list', 'POST', { user_id: student, score_id: ids.draft }, 404)
await request('/practice-list', 'DELETE', { user_id: student, score_id: ids.score1 })
assert.equal((await request(`/practice-list?user_id=${student}`)).length, 0)

await request('/profiles', 'PATCH', { user_id: teacher, student_id: other, class_name: '钢琴二班' })
await request('/profiles', 'PATCH', { user_id: student, student_id: other, class_name: '越权班级' }, 403)
await request('/semester-goals', 'POST', { user_id: teacher, name: '非法学期', start_date: '2027-01-31', end_date: '2026-09-01', target_minutes: 600 }, 400)
const goal = await request('/semester-goals', 'POST', { user_id: teacher, name: '2026 秋季测试学期', start_date: '2026-09-01', end_date: '2027-01-31', target_minutes: 600 }, 201)
const record = await request('/practice', 'POST', { user_id: student, score_id: ids.score1, piece_title: '测试小奏鸣曲', source: 'teacher', started_at: '2026-10-15T03:00:00Z', duration_seconds: 3600, pause_count: 1 }, 201)
const retryId = '55555555-5555-4555-8555-555555555555'
const retryRecord = { id: retryId, user_id: student, score_id: ids.score1, piece_title: '测试小奏鸣曲', source: 'teacher', started_at: '2026-08-01T03:00:00Z', duration_seconds: 600 }
await request('/practice', 'POST', retryRecord, 201)
assert.equal((await request('/practice', 'POST', retryRecord)).id, retryId)
assert.equal((await request(`/practice?user_id=${student}`)).filter(item => item.id === retryId).length, 1)
const goals = await request(`/semester-goals?user_id=${student}`)
assert.equal(goals.find(item => item.id === goal.id).completed_seconds, 3600)
assert.equal(goals.find(item => item.id === goal.id).progress_percent, 10)
assert.equal((await request(`/semester-goals?user_id=${other}`))[0].completed_seconds, 0)

const taskBody = { user_id: teacher, title: '班级练习验收任务', description: '练习指定曲目并提交记录。', start_at: '2020-01-01T00:00:00Z', end_at: '2099-12-31T23:59:59Z', audience: 'classes', target_classes: ['钢琴一班'], target_student_ids: [], score_mode: 'fixed', score_id: ids.score1, requirements: { audio: 'off', record: 'required', video: 'optional' } }
const task = await request('/tasks', 'POST', taskBody, 201)
assert.equal((await request(`/tasks?user_id=${student}`)).length, 1)
assert.equal((await request(`/tasks?user_id=${other}`)).length, 0)
await request(`/tasks/${task.id}?user_id=${other}`, 'GET', undefined, 403)
await request(`/tasks/${task.id}/submissions`, 'POST', { user_id: student }, 400)
await request(`/tasks/${task.id}/submissions`, 'POST', { user_id: other, record_text: '越权提交' }, 403)
const submission = await request(`/tasks/${task.id}/submissions`, 'POST', { user_id: student, practice_record_id: record.id, record_text: '完成一小时，关注双手平衡。' })
assert.ok(submission.id)
const teacherDetail = await request(`/tasks/${task.id}?user_id=${teacher}`)
assert.equal(teacherDetail.students.length, 1)
assert.equal(teacherDetail.submissions.length, 1)
await request(`/practice/${record.id}`, 'DELETE', { user_id: student }, 409)
await request(`/submissions/${submission.id}`, 'PATCH', { user_id: student, grade: 100, feedback: '不允许自评' }, 403)
await request(`/submissions/${submission.id}`, 'PATCH', { user_id: teacher, grade: 101, feedback: '超范围' }, 400)
await request(`/submissions/${submission.id}`, 'PATCH', { user_id: teacher, grade: 92, feedback: '乐句清晰，请继续加强弱拍控制。' })
const studentDetail = await request(`/tasks/${task.id}?user_id=${student}`)
assert.equal(studentDetail.submissions[0].grade, 92)
assert.match(studentDetail.submissions[0].feedback, /弱拍/)
await request(`/tasks/${task.id}`, 'PATCH', { user_id: teacher, closed: true })
await request(`/tasks/${task.id}`, 'PATCH', { user_id: teacher, title: '班级练习验收任务' })
const closed = (await request(`/tasks/${task.id}?user_id=${teacher}`)).task
assert.equal(closed.closed, true)
assert.deepEqual(closed.target_classes, ['钢琴一班'])
await request(`/tasks/${task.id}/submissions`, 'POST', { user_id: student, record_text: '关闭后不可提交' }, 409)
await request(`/tasks/${task.id}`, 'PATCH', { user_id: teacher, closed: false })
const random = await request('/tasks', 'POST', { ...taskBody, title: '随机选曲测试', audience: 'all', target_classes: [], score_mode: 'random', score_id: null }, 201)
const assigned = (await request(`/tasks/${random.id}?user_id=${student}`)).task.assigned_score_id
assert.ok(assigned)
assert.equal((await request(`/tasks/${random.id}?user_id=${student}`)).task.assigned_score_id, assigned)
const otherRecord = await request('/practice', 'POST', { user_id: other, score_id: assigned, piece_title: '其他学生练习', source: 'teacher', started_at: '2026-10-15T04:00:00Z', duration_seconds: 300 }, 201)
await request(`/tasks/${random.id}/submissions`, 'POST', { user_id: student, practice_record_id: otherRecord.id }, 403)
assert.equal((await request(`/tasks/${random.id}?user_id=${other}`)).submissions.length, 0)

console.log(JSON.stringify({ result: 'passed', checks, fixture_only: true, task_id: task.id, random_task_id: random.id, submission_id: submission.id }))
