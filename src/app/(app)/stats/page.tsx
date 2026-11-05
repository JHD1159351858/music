'use client'

import { useEffect, useState } from 'react'
import { useRequireUser } from '@/lib/user-context'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage, teachingApi } from '@/components/teaching/api'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'
import { Clock, Users, Activity, TrendingUp, Crown, Medal, Award } from 'lucide-react'

interface StatsData {
  scope: 'personal' | 'class'
  classes: string[]
  dateRange: { from: string; to: string }
  overview: {
    totalSeconds: number
    avgSeconds: number
    activeStudents: number
    participationRate: number
    totalSessions: number
    studentCount: number
    practiceDays: number
    avgSessionSeconds: number
  }
  ranking: { userId: string; nickname: string; seconds: number; count: number; days: number }[]
  trend: { date: string; seconds: number; count: number }[]
}

function fmtHours(sec: number) {
  const h = sec / 3600
  return h >= 1 ? `${h.toFixed(1)} 小时` : `${Math.round(sec / 60)} 分钟`
}

const RANK_ICON = [Crown, Medal, Award]
const RANK_COLOR = ['text-primary', 'text-chart-2', 'text-chart-3']

export default function StatsPage() {
  const { user } = useRequireUser()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [data, setData] = useState<StatsData | null>(null)
  const [classes, setClasses] = useState<string[]>([])
  const [className, setClassName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const isTeacher = user?.role === 'teacher'

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setData(null)
    const params = new URLSearchParams({ period })
    if (user.role === 'teacher' && className) params.set('class_name', className)
    void teachingApi<StatsData>(`/api/stats?${params}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setClasses(result.classes) } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorMessage(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [user, period, className, retry])

  if (!user) return null

  const o = data?.overview

  return (
    <div className={`space-y-8 ${isTeacher ? '' : 'concert-module concert-stats'}`}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">{isTeacher ? '班级练琴统计' : '我的练琴数据'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTeacher ? '自动汇总学生练习记录' : '仅统计你本人的有效练习记录'} · 仅作教学管理参考，不进入课程成绩
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {isTeacher && <Select value={className ? `class:${className}` : 'all'} onValueChange={(value) => setClassName(value === 'all' ? '' : value.slice(6))}><SelectTrigger aria-label="选择统计班级" className="w-44"><SelectValue placeholder="全部学生" /></SelectTrigger><SelectContent><SelectItem value="all">全部学生</SelectItem>{classes.map((name) => <SelectItem key={name} value={`class:${name}`}>{name}</SelectItem>)}</SelectContent></Select>}
        <Tabs value={period} onValueChange={(v) => setPeriod(v as 'week' | 'month')}>
          <TabsList>
            <TabsTrigger value="week">本周</TabsTrigger>
            <TabsTrigger value="month">本月</TabsTrigger>
          </TabsList>
        </Tabs>
        </div>
      </header>

      {data && <p className="text-sm text-muted-foreground">统计范围：{data.dateRange.from} — {data.dateRange.to}{isTeacher && ` · ${className || '全部学生'} · 共 ${data.overview.totalSessions} 次练习`}</p>}
      {loading && <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">正在汇总练琴数据…</p>}
      {error && <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6"><p className="text-sm text-destructive">{error}</p><Button variant="outline" className="mt-4" onClick={() => setRetry((value) => value + 1)}>重新加载</Button></div>}

      {!error && <>
      {/* 总览卡 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(isTeacher ? [
          { icon: Clock, label: '班级总练琴时长', value: o ? fmtHours(o.totalSeconds) : '—' },
          { icon: TrendingUp, label: '人均练琴时长', value: o ? fmtHours(o.avgSeconds) : '—' },
          { icon: Activity, label: '活跃学生数', value: o ? `${o.activeStudents} / ${o.studentCount}` : '—' },
          { icon: Users, label: '参与率', value: o ? `${o.participationRate}%` : '—' },
        ] : [
          { icon: Activity, label: '练琴频次', value: o ? `${o.practiceDays} 天` : '—' },
          { icon: TrendingUp, label: '练习次数', value: o ? `${o.totalSessions} 次` : '—' },
          { icon: Clock, label: '练习总时长', value: o ? fmtHours(o.totalSeconds) : '—' },
          { icon: Clock, label: '平均单次时长', value: o ? fmtHours(o.avgSessionSeconds) : '—' },
        ]).map((c) => (
          <div key={c.label} className="concert-stat-card rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <c.icon className="h-4 w-4 text-primary" />
              {c.label}
            </div>
            <div className="mt-3 font-mono text-3xl font-bold tabular-nums text-foreground">
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className={`grid gap-6 ${isTeacher ? 'lg:grid-cols-5' : ''}`}>
        {/* 排行榜 */}
        {isTeacher && <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <h2 className="mb-4 font-serif text-lg font-semibold text-foreground">
            学生练琴情况
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              按{period === 'week' ? '本周' : '本月'}累计时长
            </span>
          </h2>
          <div className="space-y-2">
            {data?.ranking.map((r, i) => {
              const Icon = RANK_ICON[i]
              return (
                <div
                  key={r.userId}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                    i < 3 ? 'bg-primary/8 border border-primary/20' : 'bg-muted/30'
                  }`}
                >
                  {Icon ? (
                    <Icon className={`h-5 w-5 ${RANK_COLOR[i]}`} />
                  ) : (
                    <span className="w-5 text-center font-mono text-sm text-muted-foreground">{i + 1}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{r.nickname}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.count} 次 · {r.days} 天
                    </div>
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-primary">
                    {fmtHours(r.seconds)}
                  </div>
                </div>
              )
            })}
            {data && data.ranking.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">该周期内暂无练习数据</p>
            )}
          </div>
        </div>}

        {/* 图表区 */}
        <div className={isTeacher ? 'space-y-6 lg:col-span-3' : 'grid gap-6 lg:grid-cols-2'}>
          <div className="concert-chart rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-serif text-lg font-semibold text-foreground">{isTeacher ? '学生时长分布' : '近 7 日练习次数'}</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={isTeacher ? data?.ranking.map((r) => ({ name: r.nickname, 时长: Math.round(r.seconds / 60) })) ?? [] : data?.trend.map((day) => ({ name: day.date, 次数: day.count })) ?? []}>
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} unit={isTeacher ? '分' : '次'} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--foreground)',
                    }}
                  />
                  <Bar dataKey={isTeacher ? '时长' : '次数'} fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="concert-chart rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-serif text-lg font-semibold text-foreground">近 7 日{isTeacher ? '班级总' : '练习'}时长趋势</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.trend.map((t) => ({ ...t, 分钟: Math.round(t.seconds / 60) })) ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} unit="分" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--foreground)',
                    }}
                  />
                  <Line type="monotone" dataKey="分钟" stroke="var(--chart-2)" strokeWidth={2.5} dot={{ fill: 'var(--chart-2)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">按北京时间统计，本周从周一开始，本月从月初开始。练琴频次为有练习记录的天数，练习次数为记录条数，时长不计暂停时间，平均单次时长为总时长除以练习次数。{isTeacher && '人均时长按所选范围的全部学生计算；活跃学生为周期内有练习记录的学生，参与率为活跃学生数除以学生总数。'}</p>
      </>}
    </div>
  )
}
