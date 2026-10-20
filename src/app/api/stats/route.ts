import { NextResponse } from 'next/server'
import { actor, apiRoute, dbCheck } from '@/lib/teaching-server'
import type { TeachingProfile } from '@/lib/teaching-types'

interface StatRecord { id: string; user_id: string; practice_date: string; duration_seconds: number }

function dateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

// GET /api/stats?period=week|month
export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') === 'month' ? 'month' : 'week'

    // Course dates use China time, independently of the server time zone.
    const today = dateKey(new Date())
    const end = new Date(`${today}T12:00:00+08:00`)
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
    const from = period === 'month' ? `${today.slice(0, 8)}01` : dateKey(start)
    const trendStart = new Date(end)
    trendStart.setUTCDate(trendStart.getUTCDate() - 6)
    const trendFrom = dateKey(trendStart)
    const queryFrom = from < trendFrom ? from : trendFrom

    const students: TeachingProfile[] = []
    if (user.role === 'teacher') {
      for (let offset = 0; ; offset += 1000) {
        const page = await supabase.from('profiles').select('id,nickname,role,class_name').eq('role', 'student').order('id').range(offset, offset + 999)
        dbCheck(page.error)
        students.push(...(page.data ?? []) as TeachingProfile[])
        if (!page.data || page.data.length < 1000) break
      }
    } else students.push(user)
    const classes = user.role === 'teacher' ? [...new Set(students.map(student => student.class_name).filter((name): name is string => Boolean(name)))].sort() : []
    const selectedClass = user.role === 'teacher' ? searchParams.get('class_name')?.trim() ?? '' : ''
    const roster = selectedClass ? students.filter(student => student.class_name === selectedClass) : students
    const allowedIds = new Set(roster.map(student => student.id))
    const records: StatRecord[] = []
    for (let offset = 0; ; offset += 1000) {
      let query = supabase.from('practice_records').select('id,user_id,practice_date,duration_seconds').gte('practice_date', queryFrom).lte('practice_date', today)
      if (user.role === 'student') query = query.eq('user_id', user.id)
      const page = await query.order('id').range(offset, offset + 999)
      dbCheck(page.error)
      records.push(...((page.data ?? []) as StatRecord[]).filter(record => allowedIds.has(record.user_id)))
      if (!page.data || page.data.length < 1000) break
    }
    const selectedRecords = records.filter(record => record.practice_date >= from)
    const totalSeconds = selectedRecords.reduce((sum, record) => sum + record.duration_seconds, 0)
    const activeIds = new Set(selectedRecords.map(record => record.user_id))
    const perStudent = new Map(roster.map(student => [student.id, { nickname: student.nickname, seconds: 0, count: 0, days: new Set<string>() }]))
    for (const record of selectedRecords) {
      const current = perStudent.get(record.user_id)!
      current.seconds += record.duration_seconds
      current.count += 1
      current.days.add(record.practice_date)
    }
    const ranking = [...perStudent.entries()].map(([userId, value]) => ({ userId, nickname: value.nickname, seconds: value.seconds, count: value.count, days: value.days.size })).sort((a, b) => b.seconds - a.seconds || a.nickname.localeCompare(b.nickname, 'zh-CN'))
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(trendStart)
      date.setUTCDate(date.getUTCDate() + index)
      const key = dateKey(date)
      const dailyRecords = records.filter(record => record.practice_date === key)
      return { date: key.slice(5), seconds: dailyRecords.reduce((sum, record) => sum + record.duration_seconds, 0), count: dailyRecords.length }
    })

    return NextResponse.json({
      scope: user.role === 'teacher' ? 'class' : 'personal', period, dateRange: { from, to: today }, classes, selectedClass,
      overview: {
        totalSeconds,
        avgSeconds: roster.length ? Math.round(totalSeconds / roster.length) : 0,
        activeStudents: activeIds.size,
        participationRate: roster.length ? Math.round((activeIds.size / roster.length) * 100) : 0,
        totalSessions: selectedRecords.length,
        studentCount: roster.length,
        practiceDays: new Set(selectedRecords.map(record => record.practice_date)).size,
        avgSessionSeconds: selectedRecords.length ? Math.round(totalSeconds / selectedRecords.length) : 0,
      },
      ranking,
      trend,
    })
  })
}
