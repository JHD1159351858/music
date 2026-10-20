import { ApiError, dbCheck, type TeachingClient } from './teaching-server'
import { semesterProgress, taskIsVisible } from './teaching-validation'
import type { PracticeTask, SemesterGoal, TeachingProfile } from './teaching-types'
import type { TeacherOverviewPeriod, TeacherOverviewResponse, TeacherSubmissionSummary, TeacherSubmissionsResponse } from './teacher-admin-types'

interface ReadResult { data: unknown[] | null; error: { message: string } | null }
interface OverviewRecord { id: string; user_id: string; practice_date: string; duration_seconds: number }
interface SubmissionMetadata {
  id: string; task_id: string; student_id: string; submitted_at: string
  grade: number | null; reviewed_at: string | null
  audio_url: string | null; audio_file_id: string | null; video_url: string | null; video_file_id: string | null
  practice_record_id: string | null; record_text: string | null
}
const submissionColumns = 'id,task_id,student_id,submitted_at,grade,reviewed_at,audio_url,audio_file_id,video_url,video_file_id,practice_record_id,record_text'
const taskColumns = 'id,title,end_at,closed,audience,target_classes,target_student_ids,teacher_id'

async function readPages<T>(fetch: (offset: number) => PromiseLike<ReadResult>): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const page = await fetch(offset)
    dbCheck(page.error)
    rows.push(...(page.data ?? []) as T[])
    if (!page.data || page.data.length < 1000) return rows
  }
}
function chinaDate(date: Date): string { return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) }
function shiftDate(day: string, days: number): string {
  const value = new Date(`${day}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
function percentage(count: number, total: number): number { return total ? Math.round(count / total * 100) : 0 }
function textParam(params: URLSearchParams, key: string, maxLength = 200): string {
  const values = params.getAll(key)
  if (values.length > 1) throw new ApiError(`${key} 参数不能重复`)
  const value = values[0]?.trim() ?? ''
  if (value.length > maxLength) throw new ApiError(`${key} 参数过长`)
  return value
}
function enumParam<T extends string>(params: URLSearchParams, key: string, values: readonly T[], fallback: T): T {
  const value = textParam(params, key)
  if (!value) return fallback
  if (!values.includes(value as T)) throw new ApiError(`${key} 参数无效`)
  return value as T
}
function pageParam(params: URLSearchParams, key: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const value = textParam(params, key)
  if (!value) return fallback
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) throw new ApiError(`${key} 参数无效`)
  return Number(value)
}
function loadStudents(supabase: TeachingClient): Promise<TeachingProfile[]> {
  return readPages(offset => supabase.from('profiles').select('id,nickname,role,class_name').eq('role', 'student').order('id').range(offset, offset + 999))
}
function loadTasks(supabase: TeachingClient, teacherId: string): Promise<PracticeTask[]> {
  return readPages(offset => supabase.from('tasks').select(taskColumns).eq('teacher_id', teacherId).order('id').range(offset, offset + 999))
}
async function loadSubmissions(supabase: TeachingClient, taskIds: string[]): Promise<SubmissionMetadata[]> {
  const rows: SubmissionMetadata[] = []
  // Keep the remote IN query bounded while reading all metadata beyond Supabase's default row limit.
  for (let index = 0; index < taskIds.length; index += 100) {
    const ids = taskIds.slice(index, index + 100)
    rows.push(...await readPages<SubmissionMetadata>(offset => supabase.from('submissions').select(submissionColumns).in('task_id', ids).order('id').range(offset, offset + 999)))
  }
  return rows
}
function classNames(students: TeachingProfile[]): string[] {
  return [...new Set(students.map(student => student.class_name).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export async function teacherOverview(supabase: TeachingClient, teacherId: string, params: URLSearchParams, now = new Date()): Promise<TeacherOverviewResponse> {
  const period = enumParam<TeacherOverviewPeriod>(params, 'period', ['semester', 'week', 'month'], 'semester')
  const semesterId = textParam(params, 'semester_id')
  const className = textParam(params, 'class_name', 100)
  const [students, semesters, tasks] = await Promise.all([
    loadStudents(supabase),
    readPages<SemesterGoal>(offset => supabase.from('semester_goals').select('id,name,start_date,end_date,target_minutes,teacher_id,created_at').eq('teacher_id', teacherId).order('start_date', { ascending: false }).order('id').range(offset, offset + 999)),
    loadTasks(supabase, teacherId),
  ])
  const today = chinaDate(now)
  const selectedSemester = semesterId ? semesters.find(semester => semester.id === semesterId) ?? null : semesters.find(semester => semester.start_date <= today && semester.end_date >= today) ?? null
  if (semesterId && !selectedSemester) throw new ApiError('学期不存在或无权查看', 404)
  const monday = shiftDate(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7))
  const range = period === 'semester' ? { from: selectedSemester?.start_date ?? null, to: selectedSemester?.end_date ?? null } : { from: period === 'month' ? `${today.slice(0, 8)}01` : monday, to: today }
  const roster = className ? students.filter(student => student.class_name === className) : students
  const allowedIds = new Set(roster.map(student => student.id))
  const fromDates = [range.from, selectedSemester?.start_date].filter((value): value is string => Boolean(value)).sort()
  const toDates = [range.to, selectedSemester?.end_date].filter((value): value is string => Boolean(value)).sort()
  const records = fromDates.length ? await readPages<OverviewRecord>(offset => supabase.from('practice_records').select('id,user_id,practice_date,duration_seconds').gte('practice_date', fromDates[0]).lte('practice_date', toDates[toDates.length - 1]).order('id').range(offset, offset + 999)) : []
  const permittedRecords = records.filter(record => allowedIds.has(record.user_id))
  const selectedRecords = permittedRecords.filter(record => range.from && range.to && record.practice_date >= range.from && record.practice_date <= range.to)
  const recordsByStudent = new Map<string, OverviewRecord[]>()
  for (const record of permittedRecords) {
    const rows = recordsByStudent.get(record.user_id) ?? []
    rows.push(record)
    recordsByStudent.set(record.user_id, rows)
  }
  const studentProgress = selectedSemester ? roster.map(student => {
    const progress = semesterProgress(selectedSemester, recordsByStudent.get(student.id) ?? [], now)
    return { id: student.id, nickname: student.nickname, class_name: student.class_name, ...progress, achieved: progress.completed_seconds >= selectedSemester.target_minutes * 60 }
  }).sort((a, b) => b.completed_seconds - a.completed_seconds || a.nickname.localeCompare(b.nickname, 'zh-CN')) : []
  const selectedTasks = tasks.filter(task => {
    const deadline = new Date(task.end_at)
    if (!Number.isFinite(deadline.getTime())) return false
    const day = chinaDate(deadline)
    return range.from && range.to && day >= range.from && day <= range.to
  }).sort((a, b) => a.end_at.localeCompare(b.end_at) || a.id.localeCompare(b.id))
  const submissions = await loadSubmissions(supabase, selectedTasks.map(task => task.id))
  const taskProgress = selectedTasks.map(task => {
    const targetIds = new Set(roster.filter(student => taskIsVisible(task, student)).map(student => student.id))
    const submitted = submissions.filter(submission => submission.task_id === task.id && targetIds.has(submission.student_id))
    const submittedCount = new Set(submitted.map(submission => submission.student_id)).size
    return { id: task.id, title: task.title, end_at: task.end_at, closed: task.closed, submittedCount, expectedCount: targetIds.size, submissionRate: percentage(submittedCount, targetIds.size), pendingReviewCount: submitted.filter(submission => !submission.reviewed_at).length }
  })
  const submittedCount = taskProgress.reduce((sum, task) => sum + task.submittedCount, 0)
  const expectedCount = taskProgress.reduce((sum, task) => sum + task.expectedCount, 0)
  const achievedStudentCount = studentProgress.filter(student => student.achieved).length
  const daily = new Map<string, { date: string; seconds: number; count: number }>()
  if (range.from && range.to) {
    for (let day = range.from; day <= range.to; day = shiftDate(day, 1)) daily.set(day, { date: day, seconds: 0, count: 0 })
  }
  const comparison = new Map<string, { className: string; studentCount: number; seconds: number; count: number }>()
  for (const student of roster) {
    const name = student.class_name || '未分班'
    const value = comparison.get(name) ?? { className: name, studentCount: 0, seconds: 0, count: 0 }
    value.studentCount += 1
    comparison.set(name, value)
  }
  const studentMap = new Map(roster.map(student => [student.id, student]))
  for (const record of selectedRecords) {
    const day = daily.get(record.practice_date)
    if (day) { day.seconds += record.duration_seconds; day.count += 1 }
    const value = comparison.get(studentMap.get(record.user_id)?.class_name || '未分班')
    if (value) { value.seconds += record.duration_seconds; value.count += 1 }
  }
  return {
    semesters, selectedSemester, classes: classNames(students), range, period, className,
    overview: { studentCount: roster.length, totalSeconds: selectedRecords.reduce((sum, record) => sum + record.duration_seconds, 0), submissionRate: percentage(submittedCount, expectedCount), achievementRate: percentage(achievedStudentCount, studentProgress.length), submittedCount, expectedCount, achievedStudentCount, pendingReviewCount: taskProgress.reduce((sum, task) => sum + task.pendingReviewCount, 0) },
    trend: [...daily.values()], classComparison: [...comparison.values()].sort((a, b) => b.seconds - a.seconds || a.className.localeCompare(b.className, 'zh-CN')), studentProgress, taskProgress,
  }
}

export async function teacherSubmissions(supabase: TeachingClient, teacherId: string, params: URLSearchParams): Promise<TeacherSubmissionsResponse> {
  const taskId = textParam(params, 'task_id')
  const className = textParam(params, 'class_name', 100)
  const status = enumParam(params, 'status', ['all', 'pending', 'reviewed'] as const, 'all')
  const q = textParam(params, 'q').toLocaleLowerCase('zh-CN')
  const requestedPage = pageParam(params, 'page', 1)
  const pageSize = pageParam(params, 'page_size', 20, 100)
  const [tasks, students] = await Promise.all([loadTasks(supabase, teacherId), loadStudents(supabase)])
  if (taskId && !tasks.some(task => task.id === taskId)) throw new ApiError('任务不存在或无权查看', 404)
  const selectedTasks = taskId ? tasks.filter(task => task.id === taskId) : tasks
  const taskMap = new Map(selectedTasks.map(task => [task.id, task]))
  const studentMap = new Map(students.map(student => [student.id, student]))
  const submissions = await loadSubmissions(supabase, selectedTasks.map(task => task.id))
  const matching: TeacherSubmissionSummary[] = []
  for (const submission of submissions) {
    const student = studentMap.get(submission.student_id)
    const task = taskMap.get(submission.task_id)
    if (!student || !task || className && student.class_name !== className) continue
    if (status === 'pending' && submission.reviewed_at || status === 'reviewed' && !submission.reviewed_at) continue
    if (q && !`${student.nickname} ${task.title}`.toLocaleLowerCase('zh-CN').includes(q)) continue
    matching.push({ id: submission.id, task_id: task.id, task_title: task.title, student_id: student.id, student_nickname: student.nickname, class_name: student.class_name, submitted_at: submission.submitted_at, grade: submission.grade, reviewed_at: submission.reviewed_at, has_audio: Boolean(submission.audio_file_id || submission.audio_url), has_video: Boolean(submission.video_file_id || submission.video_url), has_record: Boolean(submission.practice_record_id || submission.record_text) })
  }
  matching.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at) || a.id.localeCompare(b.id))
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(matching.length / pageSize)))
  const start = (page - 1) * pageSize
  return { items: matching.slice(start, start + pageSize), total: matching.length, page, pageSize, tasks: tasks.map(task => ({ id: task.id, title: task.title })).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')), classes: classNames(students) }
}
