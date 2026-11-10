import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, ApiError, dbCheck, readJson, validateScoreCover, validateScoreFiles } from '@/lib/teaching-server'
import { canReadScore, scoreSchema } from '@/lib/teaching-validation'
import { refreshScoreFiles } from '@/lib/teaching-files'
import { getScorePages, type ScoreFiles } from '@/lib/score-pages'
import type { TeachingScore } from '@/lib/teaching-types'

type ScoreIntent = Pick<TeachingScore, 'title' | 'composer' | 'category' | 'published'> & Pick<Partial<TeachingScore>, 'score_type' | 'period' | 'score_style' | 'tips' | 'target_classes'> & ScoreFiles
function savedIntent(score: ScoreIntent): string {
  return JSON.stringify({
    title: score.title, composer: score.composer, category: score.category,
    score_type: score.score_type ?? null, period: score.period ?? null, score_style: score.score_style ?? null, tips: score.tips ?? null, published: score.published,
    cover_file_id: score.cover_file_id ?? null,
    target_classes: [...new Set(score.target_classes ?? [])].sort(),
    pages: getScorePages(score).map(page => ({ file_id: page.file_id ?? null, image_url: page.file_id ? null : page.image_url ?? null, file_name: page.file_name ?? null, file_type: page.file_type ?? null })),
  })
}

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const params = new URL(request.url).searchParams
    let query = supabase.from('scores').select('*')
    query = query.or(`published.eq.true,owner_id.eq.${user.id}`)
    const source = params.get('source'), owner = params.get('owner'), q = params.get('q'), scoreType = params.get('score_type'), category = params.get('category'), period = params.get('period')
    if (source) query = query.eq('source', source)
    if (owner) query = query.eq('owner_id', owner)
    if (q) query = query.ilike('title', `%${q}%`)
    if (scoreType) query = query.eq('score_type', scoreType)
    if (category) query = query.eq('category', category)
    if (period) query = query.eq('period', period)
    const scoreStyle = params.get('score_style')
    if (scoreStyle) query = query.eq('score_style', scoreStyle)
    const { data, error } = await query.order('created_at', { ascending: false })
    dbCheck(error)
    return NextResponse.json(await refreshScoreFiles((data ?? []).filter(score => canReadScore(user, score))))
  })
}

export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = scoreSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    if (body.id) {
      const existing = await supabase.from('scores').select('*').eq('id', body.id).maybeSingle()
      dbCheck(existing.error)
      if (existing.data) {
        if (existing.data.owner_id !== user.id) throw new ApiError('此琴谱编号已被使用', 409)
        const files = await validateScoreFiles(supabase, user, body)
        const intent = { ...body, ...files, published: user.role === 'teacher' && body.published, target_classes: user.role === 'teacher' ? body.target_classes : [] }
        if (savedIntent(intent) !== savedIntent(existing.data)) throw new ApiError('此琴谱已保存，但本次内容已更改。请刷新谱库后编辑已保存的琴谱', 409)
        if (user.role === 'student') {
          const queued = await supabase.from('practice_list').upsert({ user_id: user.id, score_id: existing.data.id }, { onConflict: 'user_id,score_id', ignoreDuplicates: true })
          dbCheck(queued.error)
        }
        return NextResponse.json((await refreshScoreFiles([existing.data]))[0])
      }
    }
    const published = user.role === 'teacher' && body.published
    const files = await validateScoreFiles(supabase, user, body)
    const cover = await validateScoreCover(supabase, user, body)
    if (published && !files.pages.length) throw new ApiError('发布前请上传琴谱文件')
    const values = withoutUserId(body)
    Reflect.deleteProperty(values, 'cover_receipt')
    const { data, error } = await supabase.from('scores').insert({ ...values, ...files, ...cover, difficulty: 'beginner', published, target_classes: user.role === 'teacher' ? body.target_classes : [], source: user.role, owner_id: user.id }).select('*').single()
    dbCheck(error)
    if (user.role === 'student') {
      const queued = await supabase.from('practice_list').upsert({ user_id: user.id, score_id: data.id }, { onConflict: 'user_id,score_id', ignoreDuplicates: true })
      dbCheck(queued.error)
    }
    return NextResponse.json((await refreshScoreFiles([data]))[0], { status: 201 })
  })
}
