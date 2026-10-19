import { ApiError, dbCheck, validateScoreReference, type TeachingClient } from './teaching-server'
import { canReadScore } from './teaching-validation'
import type { PracticeTask, TeachingProfile, TeachingScore } from './teaching-types'

type TaskScoreScope = Pick<PracticeTask, 'score_mode' | 'audience' | 'target_classes' | 'target_student_ids'> & { score_id?: string | null }

export async function validateTaskScores(supabase: TeachingClient, user: TeachingProfile, task: TaskScoreScope): Promise<void> {
  const candidates: TeachingScore[] = []
  if (task.score_mode === 'fixed') {
    const score = await validateScoreReference(supabase, task.score_id, user, true)
    if (score) candidates.push(score)
  } else {
    for (let offset = 0; ; offset += 1000) {
      const page = await supabase.from('scores').select('*').eq('published', true).eq('source', 'teacher').order('id').range(offset, offset + 999)
      dbCheck(page.error)
      candidates.push(...(page.data ?? []) as TeachingScore[])
      if (!page.data || page.data.length < 1000) break
    }
  }
  if (!candidates.length) throw new ApiError('请先发布至少一份可用琴谱')
  if (task.audience === 'all') {
    if (!candidates.some(score => !score.target_classes?.length)) throw new ApiError('面向全体学生的任务需有向全部班级发布的琴谱，请调整任务范围或琴谱发布范围')
  } else if (task.audience === 'classes') {
    for (const className of task.target_classes) {
      if (!candidates.some(score => canReadScore({ id: '', role: 'student', class_name: className }, score))) throw new ApiError(`「${className}」没有可查看的任务琴谱，请调整任务范围或琴谱发布范围`)
    }
  } else {
    const selected = await supabase.from('profiles').select('id,nickname,role,class_name').eq('role', 'student').in('id', task.target_student_ids)
    dbCheck(selected.error)
    if (selected.data?.length !== new Set(task.target_student_ids).size) throw new ApiError('所选学生不存在，请刷新名单')
    for (const student of (selected.data ?? []) as TeachingProfile[]) {
      if (!candidates.some(score => canReadScore(student, score))) throw new ApiError(`「${student.nickname}」没有可查看的任务琴谱，请调整任务范围或琴谱发布范围`)
    }
  }
}
