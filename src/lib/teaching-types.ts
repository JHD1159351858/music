import type { ScoreStyle } from './score-classification'

export type UserRole = 'teacher' | 'student'
export interface TeachingProfile { id: string; nickname: string; role: UserRole; class_name: string | null }
export interface ScoreGenre { id: string; name: string; teacher_id: string }
export interface ScorePage {
  image_url: string | null
  file_id: string | null
  file_name: string | null
  file_type: string | null
  upload_receipt?: string | null
}
export interface TeachingScore {
  id: string
  title: string
  composer: string
  category: 'domestic' | 'foreign'
  score_type: string | null
  period: string | null
  score_style: ScoreStyle | null
  tips: string | null
  image_url: string | null
  file_id: string | null
  file_name: string | null
  file_type: string | null
  pages?: ScorePage[]
  cover_file_id?: string | null
  cover_url?: string | null
  published: boolean
  target_classes?: string[]
  source: 'teacher' | 'student'
  owner_id: string | null
  created_at: string
}
export type TaskScoreSummary = Pick<TeachingScore, 'id' | 'title' | 'composer' | 'cover_file_id' | 'cover_url'>
export type SubmissionRequirement = 'required' | 'optional' | 'off'
export interface SubmissionRequirements { audio: SubmissionRequirement; record: SubmissionRequirement; video: SubmissionRequirement }
export interface PracticeTask {
  id: string
  title: string
  description: string
  start_at: string
  end_at: string
  audience: 'all' | 'classes' | 'students'
  target_classes: string[]
  target_student_ids: string[]
  score_mode: 'fixed' | 'random'
  score_id: string | null
  assigned_score_id?: string | null
  score?: TaskScoreSummary | null
  requirements: SubmissionRequirements
  closed: boolean
  teacher_id: string
  created_at: string
  submitted_count?: number
  student_count?: number
  my_submission?: TaskSubmission | null
}
export interface TaskSubmission {
  id: string
  task_id: string
  student_id: string
  audio_url: string | null
  audio_file_id: string | null
  video_url: string | null
  video_file_id: string | null
  practice_record_id: string | null
  record_text: string | null
  grade: number | null
  feedback: string | null
  reviewed_at: string | null
  submitted_at: string
  profiles?: { nickname: string; class_name: string | null }
  practice_records?: { piece_title: string; duration_seconds: number; started_at: string; audio_url: string | null; audio_file_id?: string | null } | null
}
export interface SemesterGoal {
  id: string
  name: string
  start_date: string
  end_date: string
  target_minutes: number
  teacher_id: string
  created_at: string
  completed_seconds?: number
  progress_percent?: number
  expected_percent?: number
  student_progress?: { id: string; nickname: string; class_name: string | null; completed_seconds: number; progress_percent: number; expected_percent: number }[]
}
export interface TaskDetail { task: PracticeTask; submissions: TaskSubmission[]; students: TeachingProfile[] }
export type Score = TeachingScore
export type Genre = ScoreGenre
export type Profile = TeachingProfile
export interface PracticeRecord {
  id: string; user_id: string; score_id: string | null; piece_title: string; source: string
  practice_date: string; started_at: string; duration_seconds: number; pause_count: number
  audio_url: string | null; audio_file_id: string | null; created_at: string
  profiles?: { nickname: string }
}
