'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Users, Clock3, ClipboardCheck, Target, ArrowUpRight, Plus, CalendarRange, Search } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { errorMessage, teachingApi, teachingDate, teachingDuration } from '@/components/teaching/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TeacherOverviewPeriod, TeacherOverviewResponse, TeacherStudentProgress } from '@/lib/teacher-admin-types'

const periodLabels: Record<TeacherOverviewPeriod, string> = { semester: '学期', week: '本周', month: '本月' }
const chartTooltip = { background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12 }
function hours(seconds: number) { return Number((seconds / 3600).toFixed(2)) }

export default function TeacherOverviewPage() {
  const [data, setData] = useState<TeacherOverviewResponse | null>(null)
  const [semester, setSemester] = useState('current')
  const [className, setClassName] = useState('all')
  const [period, setPeriod] = useState<TeacherOverviewPeriod>('semester')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const query = new URLSearchParams({ period })
    if (semester !== 'current') query.set('semester_id', semester)
    if (className !== 'all') query.set('class_name', className)
    void teachingApi<TeacherOverviewResponse>(`/api/teacher/overview?${query}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result) }).catch((cause: unknown) => { if (!controller.signal.aborted) { setData(null); setError(errorMessage(cause)) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [semester, className, period, reload])
  const valid = Boolean(data?.selectedSemester)
  const metrics = data?.overview
  const studentColumns: AdminColumn<TeacherStudentProgress>[] = [
    { key: 'name', label: '学生', render: student => <span className="font-medium">{student.nickname}</span> },
    { key: 'class', label: '班级', render: student => student.class_name || '未分班' },
    { key: 'time', label: '学期有效练琴', render: student => <span className="whitespace-nowrap tabular-nums">{teachingDuration(student.completed_seconds)}</span> },
    { key: 'progress', label: '目标完成度', className: 'min-w-44', render: student => <div className="flex items-center gap-3"><Progress aria-label={`${student.nickname}目标完成度`} value={Math.min(100, student.progress_percent)} className="h-1.5 flex-1" /><span className="w-12 text-right tabular-nums">{student.progress_percent}%</span></div> },
    { key: 'status', label: '完成情况', render: student => <Badge variant={student.achieved ? 'default' : 'secondary'}>{student.achieved ? '已达标' : student.progress_percent >= student.expected_percent ? '进度正常' : '待跟进'}</Badge> },
  ]
  const taskColumns: AdminColumn<TeacherOverviewResponse['taskProgress'][number]>[] = [
    { key: 'title', label: '任务名称', render: task => <Link href={`/teacher/tasks/${task.id}`} className="font-medium hover:text-primary">{task.title}</Link> },
    { key: 'date', label: '截止时间', render: task => <span className="whitespace-nowrap text-muted-foreground">{teachingDate(task.end_at)}</span> },
    { key: 'count', label: '已交 / 应交', render: task => <span className="tabular-nums">{task.submittedCount} / {task.expectedCount}</span> },
    { key: 'rate', label: '提交率', render: task => task.expectedCount ? `${task.submissionRate}%` : '—' },
    { key: 'action', label: '操作', render: task => <Button asChild variant="ghost" size="sm"><Link href={`/teacher/tasks/${task.id}`}>查看完成情况<ArrowUpRight className="size-3.5" /></Link></Button> },
  ]
  return <>
    <AdminPageHeader title="教学概览" description="从练习投入到任务反馈，掌握本学期的教学进度。" actions={<Button asChild><Link href="/teacher/tasks?create=1"><Plus className="size-4" />发布任务</Link></Button>} />
    <div className="admin-filter-bar mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3"><CalendarRange className="hidden size-4 text-muted-foreground sm:block" /><Select value={semester} onValueChange={setSemester}><SelectTrigger aria-label="选择学期" className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="current">当前有效学期</SelectItem>{data?.semesters.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select><Select value={className} onValueChange={setClassName}><SelectTrigger aria-label="选择班级" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem>{data?.classes.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div>
      <div role="group" aria-label="统计周期" className="flex gap-1 rounded-lg bg-muted p-1">{(['semester', 'week', 'month'] as const).map(value => <Button key={value} variant={period === value ? 'outline' : 'ghost'} size="sm" aria-pressed={period === value} onClick={() => setPeriod(value)}>{periodLabels[value]}</Button>)}</div>
    </div>
    {error && <AdminNotice message={error} onRetry={() => setReload(value => value + 1)} />}
    {loading ? <div className="py-24 text-center text-sm text-muted-foreground" role="status">正在读取教学数据…</div> : data && <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{data.selectedSemester ? `${data.selectedSemester.name} · ${data.selectedSemester.start_date} 至 ${data.selectedSemester.end_date}` : '尚未选择有效学期'}{data.range.from && data.range.to && `　｜　${periodLabels[period]}统计：${data.range.from} 至 ${data.range.to}`}</span><span>有效时长不计暂停时间</span></div>
      <div className="admin-stat-strip mb-4 grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2 xl:grid-cols-4">{[
        { label: '学生人数', value: metrics?.studentCount ?? 0, suffix: '人', icon: Users, hint: className === 'all' ? '系统学生花名册' : `${className}学生` },
        { label: '有效练琴总时长', value: valid ? hours(metrics?.totalSeconds ?? 0) : '—', suffix: '小时', icon: Clock3, hint: `${periodLabels[period]}内有效练习累计` },
        { label: '任务提交率', value: valid && metrics?.expectedCount ? metrics.submissionRate : '—', suffix: '%', icon: ClipboardCheck, hint: valid ? `${metrics?.submittedCount} / ${metrics?.expectedCount} 应交人次` : '设置学期后统计' },
        { label: '学期时长达标率', value: valid && metrics?.studentCount ? metrics.achievementRate : '—', suffix: '%', icon: Target, hint: valid ? `${metrics?.achievedStudentCount} / ${metrics?.studentCount} 人达标 · 始终按所选学期` : '设置学期后统计' },
      ].map(metric => <div key={metric.label} className="p-5"><div className="flex items-center justify-between text-sm text-muted-foreground">{metric.label}<metric.icon className="size-[18px] text-primary/70" /></div><div className="mt-4 flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight tabular-nums">{metric.value}</span><span className="text-xs text-muted-foreground">{metric.suffix}</span></div><p className="mt-3 text-xs text-muted-foreground">{metric.hint}</p></div>)}</div>
      {!valid ? <div className="rounded-xl border border-dashed border-border bg-card px-6 py-20 text-center"><CalendarRange className="mx-auto mb-4 size-9 text-primary" /><h2 className="text-lg font-semibold">先设置本学期的练琴目标</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">当前没有有效学期。设置学期起止日期和目标时长后，即可查看练琴趋势、任务提交及学生达标进度。也可从上方选择历史学期。</p><Button asChild className="mt-6"><Link href="/teacher/semesters">设置学期目标</Link></Button></div> : <>
        <div className="mb-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <section className="min-w-0 rounded-xl border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">每日练习趋势</h2><span className="text-xs text-muted-foreground">单位：小时</span></div><div className="h-52 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend.map(item => ({ date: item.date.slice(5), hours: hours(item.seconds) }))} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}><CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 4" /><XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} minTickGap={30} /><YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} /><Tooltip contentStyle={chartTooltip} formatter={(value: number) => [`${value} 小时`, '有效练琴']} /><Line type="monotone" dataKey="hours" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div></section>
          <section className="min-w-0 rounded-xl border border-border bg-card p-5"><div className="mb-6 flex items-center justify-between"><h2 className="text-sm font-semibold">班级练琴时长对比</h2><span className="text-xs text-muted-foreground">单位：小时</span></div>{data.classComparison.length ? <div className="h-60 overflow-y-auto"><div style={{ height: Math.max(208, data.classComparison.length * 42) }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data.classComparison.map(item => ({ className: item.className, hours: hours(item.seconds) }))} margin={{ top: 0, right: 25, bottom: 0, left: 0 }}><XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="className" width={112} tickFormatter={(name: string) => name.length > 9 ? `${name.slice(0, 9)}…` : name} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltip} formatter={(value: number) => [`${value} 小时`, '有效练琴']} /><Bar dataKey="hours" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></div> : <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">暂无学生数据</div>}</section>
        </div>
        <section className="mb-6"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">学生达标进度</h2><p className="mt-1 text-xs text-muted-foreground">所选学期目标 {hours((data.selectedSemester?.target_minutes ?? 0) * 60)} 小时 · 当前应完成 {data.studentProgress[0]?.expected_percent ?? 0}%</p></div><div className="relative"><Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input aria-label="搜索学生进度" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索学生昵称" className="w-52 pl-9" /></div></div><AdminTable rows={data.studentProgress.filter(student => student.nickname.includes(search.trim()))} columns={studentColumns} rowKey={student => student.id} emptyText="暂无符合条件的学生" /></section>
        <section className="mb-6"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">任务完成情况</h2><Link href="/teacher/tasks" className="text-xs text-primary">全部任务 →</Link></div><AdminTable rows={data.taskProgress} columns={taskColumns} rowKey={task => task.id} emptyText="本周期没有截止的任务" /><p className="mt-2 text-xs leading-5 text-muted-foreground">按任务截止日期归入周期；提交率 = 已交人次 / 当前覆盖学生的应交人次。</p></section>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5"><div><h2 className="text-sm font-semibold">待评阅提醒</h2><p className="mt-1 text-xs text-muted-foreground">当前统计周期有 <span className="font-semibold text-primary">{metrics?.pendingReviewCount ?? 0}</span> 份提交等待反馈，评阅后学生即可看到结果。</p></div><Button asChild variant="outline"><Link href="/teacher/reviews?status=pending">进入提交评阅<ArrowUpRight className="size-4" /></Link></Button></div>
      </>}
    </>}
  </>
}
