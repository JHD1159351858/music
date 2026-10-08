'use client'

import { useEffect, useState } from 'react'
import { useRequireUser } from '@/lib/user-context'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  overview: {
    totalSeconds: number
    avgSeconds: number
    activeStudents: number
    participationRate: number
    totalSessions: number
    studentCount: number
  }
  ranking: { userId: string; nickname: string; seconds: number; count: number; days: number }[]
  trend: { date: string; seconds: number }[]
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

  useEffect(() => {
    fetch(`/api/stats?period=${period}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }, [period])

  if (!user) return null

  const o = data?.overview

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">练琴数据分析</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            自动汇总全班练习记录 · 仅作教学管理参考，不进入课程成绩
          </p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as 'week' | 'month')}>
          <TabsList>
            <TabsTrigger value="week">本周</TabsTrigger>
            <TabsTrigger value="month">本月</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {/* 总览卡 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Clock, label: '班级总练琴时长', value: o ? fmtHours(o.totalSeconds) : '—' },
          { icon: TrendingUp, label: '人均练琴时长', value: o ? fmtHours(o.avgSeconds) : '—' },
          { icon: Activity, label: '活跃学生数', value: o ? `${o.activeStudents} / ${o.studentCount}` : '—' },
          { icon: Users, label: '参与率', value: o ? `${o.participationRate}%` : '—' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40">
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

      <div className="grid gap-6 lg:grid-cols-5">
        {/* 排行榜 */}
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <h2 className="mb-4 font-serif text-lg font-semibold text-foreground">
            学生时长排名
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
        </div>

        {/* 图表区 */}
        <div className="space-y-6 lg:col-span-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-serif text-lg font-semibold text-foreground">时长分布</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.ranking.map((r) => ({ name: r.nickname, 时长: Math.round(r.seconds / 60) })) ?? []}>
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} unit="分" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--foreground)',
                    }}
                  />
                  <Bar dataKey="时长" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-serif text-lg font-semibold text-foreground">近 7 日班级总时长趋势</h2>
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
    </div>
  )
}
