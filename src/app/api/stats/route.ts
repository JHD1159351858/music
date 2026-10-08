import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

// GET /api/stats?period=week|month
export async function GET(request: Request) {
  const supabase = createSupabaseServer()
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') === 'month' ? 'month' : 'week'

  const now = new Date()
  const from = new Date(now)
  from.setDate(now.getDate() - (period === 'week' ? 6 : 29))
  const fromStr = from.toISOString().slice(0, 10)

  const [{ data: records, error: e1 }, { data: students, error: e2 }] = await Promise.all([
    supabase
      .from('practice_records')
      .select('id, user_id, piece_title, practice_date, duration_seconds, profiles(nickname)')
      .gte('practice_date', fromStr),
    supabase.from('profiles').select('id, nickname').eq('role', 'student'),
  ])
  if (e1 || e2) {
    return NextResponse.json({ error: e1?.message || e2?.message }, { status: 500 })
  }

  const recs = records ?? []
  const roster = students ?? []
  const totalSeconds = recs.reduce((s, r) => s + (r.duration_seconds ?? 0), 0)
  const activeIds = new Set(recs.map((r) => r.user_id))

  // 学生排行
  const perStudent = new Map<string, { nickname: string; seconds: number; count: number; days: Set<string> }>()
  for (const r of recs) {
    const nick =
      (Array.isArray(r.profiles) ? r.profiles[0]?.nickname : (r.profiles as { nickname: string } | null)?.nickname) ??
      '匿名'
    const cur = perStudent.get(r.user_id) ?? { nickname: nick, seconds: 0, count: 0, days: new Set<string>() }
    cur.seconds += r.duration_seconds ?? 0
    cur.count += 1
    cur.days.add(r.practice_date)
    perStudent.set(r.user_id, cur)
  }
  const ranking = [...perStudent.entries()]
    .map(([userId, v]) => ({
      userId,
      nickname: v.nickname,
      seconds: v.seconds,
      count: v.count,
      days: v.days.size,
    }))
    .sort((a, b) => b.seconds - a.seconds)

  // 近 7 日趋势
  const trend: { date: string; seconds: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    trend.push({
      date: key.slice(5),
      seconds: recs.filter((r) => r.practice_date === key).reduce((s, r) => s + r.duration_seconds, 0),
    })
  }

  return NextResponse.json({
    overview: {
      totalSeconds,
      avgSeconds: roster.length ? Math.round(totalSeconds / roster.length) : 0,
      activeStudents: activeIds.size,
      participationRate: roster.length ? Math.round((activeIds.size / roster.length) * 100) : 0,
      totalSessions: recs.length,
      studentCount: roster.length,
    },
    ranking,
    trend,
  })
}
