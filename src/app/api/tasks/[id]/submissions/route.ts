import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, ApiError, assignedScore, dbCheck, getTask, readJson, taskAccess, validateFileReference, validateScoreReference } from '@/lib/teaching-server'
import { submissionSchema, validateSubmissionRequirements } from '@/lib/teaching-validation'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiRoute(async () => {
    const { id } = await params
    const body = submissionSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    if (user.role !== 'student') throw new ApiError('请使用学生身份提交任务', 403)
    const task = await getTask(supabase, id)
    taskAccess(task, user)
    const now = Date.now()
    if (task.closed) throw new ApiError('任务已关闭，无法提交', 409)
    if (now < new Date(task.start_at).getTime()) throw new ApiError('任务尚未开始，无法提交', 409)
    if (now > new Date(task.end_at).getTime()) throw new ApiError('任务已截止，无法提交', 409)
    if (task.requirements.audio === 'off' && (body.audio_url || body.audio_file_id) || task.requirements.video === 'off' && (body.video_url || body.video_file_id) || task.requirements.record === 'off' && (body.practice_record_id || body.record_text?.trim())) throw new ApiError('请仅提交任务要求的材料')
    const missing = validateSubmissionRequirements(task.requirements, body)
    if (missing) throw new ApiError(missing)
    if (!body.audio_url && !body.audio_file_id && !body.video_url && !body.video_file_id && !body.practice_record_id && !body.record_text?.trim()) throw new ApiError('请至少提交一项练习材料')
    const scoreId = await assignedScore(supabase, task, user)
    if (!scoreId) throw new ApiError('任务曲目不可用，请联系教师', 409)
    await validateScoreReference(supabase, scoreId, user, true)
    const [audioType, videoType] = await Promise.all([
      validateFileReference(supabase, user, body.audio_file_id, body.audio_url),
      validateFileReference(supabase, user, body.video_file_id, body.video_url),
    ])
    if (audioType && !audioType.startsWith('audio/')) throw new ApiError('练习录音必须使用音频文件')
    if (videoType && !videoType.startsWith('video/')) throw new ApiError('演奏视频必须使用视频文件')
    if (body.practice_record_id) {
      const record = await supabase.from('practice_records').select('id,score_id').eq('id', body.practice_record_id).eq('user_id', user.id).maybeSingle()
      dbCheck(record.error)
      if (!record.data) throw new ApiError('只能提交自己的练习记录', 403)
      if (record.data.score_id !== scoreId) throw new ApiError('请选择本任务指定曲目的练习记录')
    }
    const materials = withoutUserId(body)
    const { data, error } = await supabase.from('submissions').upsert({
      audio_url: null, audio_file_id: null, video_url: null, video_file_id: null, practice_record_id: null, record_text: null,
      ...materials, task_id: id, student_id: user.id, submitted_at: new Date().toISOString(), grade: null, feedback: null, reviewed_at: null,
    }, { onConflict: 'task_id,student_id' }).select().single()
    dbCheck(error)
    return NextResponse.json(data)
  })
}

