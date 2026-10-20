import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, dbCheck, readJson, validateScoreReference, validateFileReference } from '@/lib/teaching-server'
import { practiceSchema } from '@/lib/teaching-validation'
import { refreshPracticeFiles } from '@/lib/teaching-files'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    let query = supabase.from('practice_records').select('*,profiles(nickname)')
    if (user.role === 'student') query = query.eq('user_id', user.id)
    const student = new URL(request.url).searchParams.get('student_id')
    if (user.role === 'teacher' && student) query = query.eq('user_id', student)
    const { data, error } = await query.order('started_at', { ascending: false }).limit(500)
    dbCheck(error)
    return NextResponse.json(await refreshPracticeFiles(data ?? []))
  })
}
export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = practiceSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    if (body.id) {
      const existing = await supabase.from('practice_records').select('*').eq('id', body.id).maybeSingle()
      dbCheck(existing.error)
      if (existing.data) {
        if (existing.data.user_id !== user.id) throw new ApiError('此练习记录编号已被使用', 409)
        return NextResponse.json(existing.data)
      }
    }
    const score = await validateScoreReference(supabase, body.score_id, user)
    const audioType = await validateFileReference(supabase, user, body.audio_file_id, body.audio_url)
    if (audioType && !audioType.startsWith('audio/')) throw new ApiError('练习录音须为音频文件')
    if (new Date(body.started_at).getTime() > Date.now() + 60000) throw new ApiError('练习开始时间不能晚于当前时间')
    const date = new Date(new Date(body.started_at).getTime() + 8 * 3600000).toISOString().slice(0, 10)
    const { data, error } = await supabase.from('practice_records').insert({ ...body, user_id: user.id, piece_title: score?.title ?? body.piece_title, source: score?.source ?? body.source, practice_date: date }).select().single()
    if (error?.code === '23505' && body.id) {
      const existing = await supabase.from('practice_records').select('*').eq('id', body.id).eq('user_id', user.id).maybeSingle()
      dbCheck(existing.error)
      if (existing.data) return NextResponse.json(existing.data)
    }
    dbCheck(error)
    return NextResponse.json(data, { status: 201 })
  })
}
