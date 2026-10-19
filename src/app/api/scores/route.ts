import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, ApiError, dbCheck, readJson, validateScoreFiles } from '@/lib/teaching-server'
import { canReadScore, scoreSchema } from '@/lib/teaching-validation'
import { refreshScoreFiles } from '@/lib/teaching-files'
import { getScorePages, type ScoreFiles } from '@/lib/score-pages'
import type { TeachingScore } from '@/lib/teaching-types'

type ScoreIntent = Pick<TeachingScore, 'title' | 'composer' | 'difficulty' | 'category' | 'published'> & Pick<Partial<TeachingScore>, 'genre_id' | 'tips' | 'target_classes'> & ScoreFiles
function savedIntent(score: ScoreIntent): string {
  return JSON.stringify({
    title: score.title, composer: score.composer, difficulty: score.difficulty, category: score.category,
    genre_id: score.genre_id ?? null, tips: score.tips ?? null, published: score.published,
    target_classes: [...new Set(score.target_classes ?? [])].sort(),
    pages: getScorePages(score).map(page => ({ file_id: page.file_id ?? null, image_url: page.file_id ? null : page.image_url ?? null, file_name: page.file_name ?? null, file_type: page.file_type ?? null })),
  })
}

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const params = new URL(request.url).searchParams
    let query = supabase.from('scores').select('*,genre:score_genres(id,name,teacher_id)')
    query = query.or(`published.eq.true,owner_id.eq.${user.id}`)
    const source = params.get('source'), owner = params.get('owner'), q = params.get('q'), difficulty = params.get('difficulty'), category = params.get('category'), genre = params.get('genre_id')
    if (source) query = query.eq('source', source)
    if (owner) query = query.eq('owner_id', owner)
    if (q) query = query.ilike('title', `%${q}%`)
    if (difficulty) query = query.eq('difficulty', difficulty)
    if (category) query = query.eq('category', category)
    if (genre) query = query.eq('genre_id', genre)
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
        return NextResponse.json(existing.data)
      }
    }
    if (body.genre_id) {
      const genre = await supabase.from('score_genres').select('id').eq('id', body.genre_id).maybeSingle()
      dbCheck(genre.error)
      if (!genre.data) throw new ApiError('请选择教师已确认的曲风')
    }
    const published = user.role === 'teacher' && body.published
    const files = await validateScoreFiles(supabase, user, body)
    if (published && (!body.genre_id || !files.pages.length)) throw new ApiError('发布前请设置曲风并上传琴谱文件')
    const values = withoutUserId(body)
    const { data, error } = await supabase.from('scores').insert({ ...values, ...files, published, target_classes: user.role === 'teacher' ? body.target_classes : [], source: user.role, owner_id: user.id }).select('*,genre:score_genres(id,name,teacher_id)').single()
    dbCheck(error)
    if (user.role === 'student') {
      const queued = await supabase.from('practice_list').upsert({ user_id: user.id, score_id: data.id }, { onConflict: 'user_id,score_id', ignoreDuplicates: true })
      dbCheck(queued.error)
    }
    return NextResponse.json(data, { status: 201 })
  })
}
