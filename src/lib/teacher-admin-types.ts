import type { SemesterGoal } from './teaching-types'

export type TeacherOverviewPeriod = 'semester' | 'week' | 'month'
export interface TeacherStudentProgress {
  id: string
  nickname: string
  class_name: string | null
  completed_seconds: number
  progress_percent: number
  expected_percent: number
  achieved: boolean
}
export interface TeacherOverviewResponse {
  semesters: SemesterGoal[]
  selectedSemester: SemesterGoal | null
  classes: string[]
  range: { from: string | null; to: string | null }
  period: TeacherOverviewPeriod
  className: string
  overview: {
    studentCount: number
    totalSeconds: number
    submissionRate: number
    achievementRate: number
    submittedCount: number
    expectedCount: number
    achievedStudentCount: number
    pendingReviewCount: number
  }
  trend: { date: string; seconds: number; count: number }[]
  classComparison: { className: string; studentCount: number; seconds: number; count: number }[]
  studentProgress: TeacherStudentProgress[]
  taskProgress: { id: string; title: string; end_at: string; closed: boolean; submittedCount: number; expectedCount: number; submissionRate: number; pendingReviewCount: number }[]
}

export interface TeacherSubmissionSummary {
  id: string
  task_id: string
  task_title: string
  student_id: string
  student_nickname: string
  class_name: string | null
  submitted_at: string
  grade: number | null
  reviewed_at: string | null
  has_audio: boolean
  has_video: boolean
  has_record: boolean
}
export interface TeacherSubmissionsResponse {
  items: TeacherSubmissionSummary[]
  total: number
  page: number
  pageSize: number
  tasks: { id: string; title: string }[]
  classes: string[]
}
