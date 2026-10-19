'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Target, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage, jsonBody, teachingApi, teachingDuration } from './api'
import type { SemesterGoal } from '@/lib/teaching-types'

interface Props { userId: string; isTeacher: boolean; compact?: boolean }

export function SemesterGoals({ userId, isTeacher, compact = false }: Props) {
  const [goals, setGoals] = useState<SemesterGoal[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<SemesterGoal | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', start_date: '', end_date: '', target_hours: '10' })
  const [today, setToday] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setGoals(await teachingApi<SemesterGoal[]>(`/api/semester-goals?user_id=${encodeURIComponent(userId)}`)) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [userId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setToday(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })) }, [])

  function edit(goal: SemesterGoal | null) {
    setEditing(goal)
    setForm(goal ? { title: goal.name, start_date: goal.start_date, end_date: goal.end_date, target_hours: String(goal.target_minutes / 60) } : { title: '', start_date: '', end_date: '', target_hours: '10' })
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (form.end_date < form.start_date) return toast.error('学期结束日期不能早于开始日期')
    setSaving(true)
    try {
      await teachingApi(editing ? `/api/semester-goals/${editing.id}` : '/api/semester-goals', { method: editing ? 'PATCH' : 'POST', ...jsonBody({ user_id: userId, name: form.title.trim(), start_date: form.start_date, end_date: form.end_date, target_minutes: Math.round(Number(form.target_hours) * 60) }) })
      toast.success('学期目标已保存')
      setEditing(undefined)
      await load()
    } catch (cause) { toast.error(errorMessage(cause)) }
    finally { setSaving(false) }
  }

  async function remove(goal: SemesterGoal) {
    if (!window.confirm(`删除「${goal.name}」学期目标？`)) return
    try {
      await teachingApi(`/api/semester-goals/${goal.id}`, { method: 'DELETE', ...jsonBody({ user_id: userId }) })
      toast.success('学期目标已删除')
      await load()
    } catch (cause) { toast.error(errorMessage(cause)) }
  }

  if (compact && !isTeacher) {
    const current = goals.find((goal) => goal.start_date <= today && goal.end_date >= today)
    const actual = current?.progress_percent ?? 0
    const expected = current?.expected_percent ?? 0
    return <section aria-label="本学期练琴目标" className="rounded-lg border border-primary/20 bg-card px-4 py-3">
      {loading ? <p className="text-xs text-muted-foreground">正在读取学期目标…</p> : error ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-destructive">{error}</p><Button variant="ghost" size="sm" onClick={() => void load()}>重试</Button></div> : <div className="flex flex-wrap items-center gap-x-5 gap-y-3"><Target className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-40 flex-1">{current ? <><div className="flex items-center justify-between gap-3 text-xs"><span>{current.name} · 目标 {current.target_minutes / 60} 小时</span><span className="tabular-nums text-primary">{actual.toFixed(0)}%</span></div><Progress aria-label={`${current.name}已完成${actual}%`} value={actual} className="mt-2 h-1.5" /></> : <p className="text-xs text-muted-foreground">当前没有正在进行的学期目标</p>}</div>{current && <p className="text-xs text-muted-foreground">已练 {teachingDuration(current.completed_seconds ?? 0)} · 应达 {expected.toFixed(0)}%<span className="ml-2 text-primary">{actual >= 100 ? '目标已达成' : actual < expected ? '记得安排练习' : '进度达标'}</span></p>}<Link className="text-xs text-primary hover:underline" href="/tasks?tab=goals">查看全部目标</Link></div>}
    </section>
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-serif text-xl"><Target className="h-5 w-5 text-primary" />学期练琴目标</h2>{isTeacher && <Button variant="outline" size="sm" onClick={() => edit(null)}>设置学期目标</Button>}</div>
      {loading ? <p className="py-6 text-sm text-muted-foreground">正在读取学期目标…</p> : error ? <div className="rounded-xl border border-destructive/40 bg-card p-5"><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>重试</Button></div> : goals.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{isTeacher ? '设置学期日期与目标时长，学生即可查看自己的完成进度。' : '教师尚未设置学期练琴目标。'}</p> : <div className="grid gap-4 lg:grid-cols-2">{goals.map((goal) => {
        const actual = goal.progress_percent ?? 0
        const expected = goal.expected_percent ?? 0
        return <article key={goal.id} className="rounded-xl border border-primary/20 bg-card p-5">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-lg">{goal.name}</h3><p className="mt-1 text-xs text-muted-foreground">{goal.start_date} — {goal.end_date}</p></div>{isTeacher && <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`编辑${goal.name}`} onClick={() => edit(goal)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`删除${goal.name}`} onClick={() => void remove(goal)}><Trash2 className="h-4 w-4" /></Button></div>}</div>
          {isTeacher ? <><p className="mt-5 text-sm text-muted-foreground">学生目标 <span className="ml-1 text-2xl tabular-nums text-primary">{goal.target_minutes / 60}</span> 小时</p><p className="mt-2 text-xs text-muted-foreground">全体学生 · 按学期内的有效练习时长汇总</p><div className="mt-4 max-h-80 space-y-4 overflow-y-auto">{goal.student_progress?.map(student => <div key={student.id} className="space-y-2 border-t border-border pt-3"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{student.nickname}<span className="ml-2 text-xs text-muted-foreground">{student.class_name || '未分班'}</span></span><span className="tabular-nums text-primary">{teachingDuration(student.completed_seconds)} · {student.progress_percent}%</span></div><Progress value={student.progress_percent} className="h-1.5" /><p className="text-xs text-muted-foreground">{student.progress_percent >= 100 ? '目标已达成' : student.expected_percent >= 50 && student.progress_percent < student.expected_percent ? '学期已过半，请关注练习进度' : student.progress_percent < student.expected_percent ? `学期进度 ${student.expected_percent}%，请提醒安排练习` : `学期进度 ${student.expected_percent}%，当前进度达标`}</p></div>)}{!goal.student_progress?.length && <p className="text-xs text-muted-foreground">暂无学生</p>}</div></> : <><div className="mt-5 flex items-end justify-between gap-3"><p><span className="text-2xl tabular-nums text-primary">{actual.toFixed(1)}%</span><span className="ml-2 text-xs text-muted-foreground">已完成</span></p><p className="text-xs text-muted-foreground">{teachingDuration(goal.completed_seconds ?? 0)} / {goal.target_minutes / 60} 小时</p></div><Progress value={Math.min(100, actual)} className="mt-3 h-2" /><p className="mt-3 text-sm text-muted-foreground">{actual >= 100 ? '本学期目标已达成，继续保持练习！' : actual < expected ? `当前学期进度 ${expected.toFixed(1)}%，练琴进度落后 ${(expected - actual).toFixed(1)} 个百分点，记得安排练习。` : `当前学期进度 ${expected.toFixed(1)}%，练琴进度达标，继续保持。`}</p></>}
        </article>
      })}</div>}
      {editing !== undefined && <Dialog open onOpenChange={(open) => { if (!open && !saving) setEditing(undefined) }}><DialogContent><DialogHeader><DialogTitle>{editing ? '编辑学期目标' : '设置学期目标'}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4"><div className="space-y-2"><Label htmlFor="goal-title">学期名称</Label><Input id="goal-title" required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：2026 年秋季学期" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="goal-start">学期开始</Label><Input id="goal-start" required type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="goal-end">学期结束</Label><Input id="goal-end" required type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></div></div><div className="space-y-2"><Label htmlFor="goal-hours">目标练琴时长（小时）</Label><Input id="goal-hours" required type="number" min="0.1" max="8760" step="0.1" value={form.target_hours} onChange={(event) => setForm({ ...form, target_hours: event.target.value })} /></div><Button className="w-full" disabled={saving}>{saving ? '保存中…' : '保存目标'}</Button></form></DialogContent></Dialog>}
    </section>
  )
}
