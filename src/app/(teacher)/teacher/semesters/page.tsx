'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireUser } from '@/lib/user-context'
import type { SemesterGoal } from '@/lib/teaching-types'
import { errorMessage, jsonBody, teachingApi, teachingDuration } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import '@/components/teacher/detail-workspaces.css'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type StudentProgress = NonNullable<SemesterGoal['student_progress']>[number]

export default function TeacherSemestersPage() {
  const { user } = useRequireUser()
  const [goals, setGoals] = useState<SemesterGoal[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const [progressSearch, setProgressSearch] = useState('')
  const [progressClass, setProgressClass] = useState('all')
  const [editing, setEditing] = useState<SemesterGoal | null | undefined>(undefined)
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', target_hours: '10' })
  const load = useCallback(async () => {
    if (user?.role !== 'teacher') return
    setLoading(true)
    setError('')
    try {
      const list = await teachingApi<SemesterGoal[]>('/api/semester-goals')
      setGoals(list)
      setSelected(current => list.some(goal => goal.id === current) ? current : list[0]?.id ?? '')
    } catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])
  function edit(goal: SemesterGoal | null) {
    if (goal) setSelected(goal.id)
    setEditing(goal)
    setForm(goal ? { name: goal.name, start_date: goal.start_date, end_date: goal.end_date, target_hours: String(goal.target_minutes / 60) } : { name: '', start_date: '', end_date: '', target_hours: '10' })
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !user) return
    if (form.end_date < form.start_date) { toast.error('学期结束日期不能早于开始日期'); return }
    setBusy(true)
    try {
      await teachingApi(editing ? `/api/semester-goals/${editing.id}` : '/api/semester-goals', { method: editing ? 'PATCH' : 'POST', ...jsonBody({ user_id: user.id, name: form.name.trim(), start_date: form.start_date, end_date: form.end_date, target_minutes: Math.round(Number(form.target_hours) * 60) }) })
      toast.success('学期目标已保存')
      setEditing(undefined)
      await load()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function remove(goal: SemesterGoal) {
    if (!user || busy || !window.confirm(`删除「${goal.name}」目标？已有练习记录会保留。`)) return
    setBusy(true)
    try { await teachingApi(`/api/semester-goals/${goal.id}`, { method: 'DELETE', ...jsonBody({ user_id: user.id }) }); toast.success('学期目标已删除'); await load() }
    catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  const current = goals.find(goal => goal.id === selected)
  const students = current?.student_progress ?? []
  const classes = [...new Set(students.map(student => student.class_name).filter((name): name is string => !!name))].sort()
  const progressRows = students.filter(student => student.nickname.toLocaleLowerCase().includes(progressSearch.trim().toLocaleLowerCase()) && (progressClass === 'all' || (progressClass === 'unassigned' ? !student.class_name : student.class_name === progressClass)))
  const columns: AdminColumn<SemesterGoal>[] = [
    { key: 'name', label: '学期名称', render: goal => <span className="font-medium">{goal.name}</span> },
    { key: 'dates', label: '起止日期', render: goal => `${goal.start_date} — ${goal.end_date}` },
    { key: 'target', label: '目标时长 / 人', render: goal => `${goal.target_minutes / 60} 小时` },
    { key: 'progress', label: '学生达标情况', render: goal => `${goal.student_progress?.filter(student => student.completed_seconds >= goal.target_minutes * 60).length ?? 0} / ${goal.student_progress?.length ?? 0} 人` },
    { key: 'actions', label: '操作', render: goal => <div className="flex gap-1"><Button variant="ghost" size="sm" aria-pressed={selected === goal.id} onClick={() => { setSelected(goal.id); setProgressClass('all'); setProgressSearch('') }}>查看进度</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => edit(goal)}>编辑</Button><Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => void remove(goal)}>删除</Button></div> },
  ]
  const progressColumns: AdminColumn<StudentProgress>[] = [
    { key: 'name', label: '学生昵称', render: student => student.nickname },
    { key: 'class', label: '班级', render: student => student.class_name || '未分班' },
    { key: 'time', label: '累计有效时长', render: student => teachingDuration(student.completed_seconds) },
    { key: 'progress', label: '目标完成进度', render: student => <div className="min-w-40 space-y-2"><span className="text-xs tabular-nums">{student.progress_percent}%</span><Progress value={Math.min(100, student.progress_percent)} className="h-1.5" /></div> },
    { key: 'status', label: '进度提醒', render: student => {
      const achieved = !!current && student.completed_seconds >= current.target_minutes * 60
      return <Badge variant={achieved ? 'default' : 'secondary'}>{achieved ? '目标已达成' : student.progress_percent < student.expected_percent ? `落后学期进度（${student.expected_percent}%）` : '当前进度达标'}</Badge>
    } },
  ]
  if (user?.role !== 'teacher') return null
  return <div className="teacher-detail-workspace space-y-6">
    <AdminPageHeader title="学期目标" description="按学期设置每位学生的练琴目标，并查看累计有效时长与达标进度。" actions={<Button disabled={busy} onClick={() => edit(null)}><Plus className="mr-2 h-4 w-4" />设置学期目标</Button>} />
    <section className="space-y-4" aria-label="学期记录"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">学期记录</h2><Input className="max-w-sm" aria-label="搜索学期名称" placeholder="搜索学期名称" value={search} onChange={event => setSearch(event.target.value)} /></div>{error ? <AdminNotice message={error} onRetry={() => void load()} /> : <AdminTable rows={goals.filter(goal => goal.name.includes(search.trim()))} columns={columns} rowKey={goal => goal.id} emptyText={loading ? '正在读取学期目标…' : '尚未设置学期目标'} />}</section>
    {current && <section className="space-y-4"><div><h2 className="text-lg font-semibold">{current.name} · 学生完成进度</h2><p className="mt-1 text-sm text-muted-foreground">统计 {current.start_date} 至 {current.end_date}，每人目标 {current.target_minutes / 60} 小时。</p></div><div className="flex flex-wrap gap-3"><Input className="w-56" aria-label="搜索目标学生" placeholder="搜索学生昵称" value={progressSearch} onChange={event => setProgressSearch(event.target.value)} /><Select value={progressClass} onValueChange={setProgressClass}><SelectTrigger className="w-44" aria-label="筛选目标班级"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem><SelectItem value="unassigned">未分班</SelectItem>{classes.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div><AdminTable rows={progressRows} columns={progressColumns} rowKey={student => student.id} emptyText="暂无符合条件的学生" /></section>}
    {editing !== undefined && <section className="teacher-detail-panel teacher-semester-editor" aria-labelledby="semester-editor-title"><header><div><h2 id="semester-editor-title">{editing ? '编辑学期目标' : '设置学期目标'}</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">目标适用于全体学生，进度按该学期内有效练琴时长计算。</p></div><Button variant="ghost" size="icon" aria-label="收起学期目标编辑" disabled={busy} onClick={() => setEditing(undefined)}><X className="size-4" /></Button></header>
      <form onSubmit={save}>
        <div className="space-y-2"><Label htmlFor="semester-name">学期名称</Label><Input id="semester-name" required maxLength={200} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="semester-start">学期开始</Label><Input id="semester-start" required type="date" value={form.start_date} onChange={event => setForm({ ...form, start_date: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="semester-end">学期结束</Label><Input id="semester-end" required type="date" min={form.start_date || undefined} value={form.end_date} onChange={event => setForm({ ...form, end_date: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="semester-hours">目标练琴时长（小时）</Label><Input id="semester-hours" required type="number" min="0.1" max="8760" step="0.1" value={form.target_hours} onChange={event => setForm({ ...form, target_hours: event.target.value })} /></div>
        <div className="teacher-editor-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(undefined)}>取消</Button><Button disabled={busy}>{busy ? '保存中…' : '保存目标'}</Button></div>
      </form>
    </section>}
  </div>
}
