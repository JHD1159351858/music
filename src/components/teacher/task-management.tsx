'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Eye, LockKeyhole, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireUser } from '@/lib/user-context'
import { cn } from '@/lib/utils'
import type { PracticeTask, Profile, Score, TaskDetail, TaskSubmission } from '@/lib/teaching-types'
import { errorMessage, jsonBody, teachingApi, teachingDate } from '@/components/teaching/api'
import { TaskForm } from '@/components/teaching/task-form'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { TeacherReviewDialog } from '@/components/teacher/review-dialog'
import { revealStackedAdminPanel } from '@/components/teacher/detail-workspaces'
import { ScoreCover } from '@/components/practice/score-cover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function taskState(task: PracticeTask, now: number | null) {
  return task.closed ? 'closed' : now !== null && new Date(task.end_at).getTime() < now ? 'ended' : now !== null && new Date(task.start_at).getTime() > now ? 'pending' : 'active'
}
const stateLabels: Record<string, string> = { active: '进行中', pending: '未开始', ended: '已截止', closed: '已关闭' }
function audienceLabel(task: PracticeTask) {
  return task.audience === 'all' ? '全体学生' : task.audience === 'classes' ? task.target_classes.join('、') : `指定 ${task.target_student_ids.length} 位学生`
}
function useCurrentMinute() {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => { setNow(Date.now()); const interval = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(interval) }, [])
  return now
}

function TaskActions({ task, userId, onEdit, onChanged, onDeleted }: { task: PracticeTask; userId: string; onEdit: () => void; onChanged: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState<'close' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  async function mutate() {
    if (!confirm) return
    setBusy(true)
    try {
      await teachingApi(`/api/tasks/${task.id}`, { method: confirm === 'close' ? 'PATCH' : 'DELETE', ...jsonBody({ user_id: userId, ...(confirm === 'close' ? { closed: true } : {}) }) })
      toast.success(confirm === 'close' ? '任务已关闭' : '任务已删除')
      setConfirm(null)
      if (confirm === 'delete') onDeleted()
      else onChanged()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <><Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" />编辑</Button>{!task.closed && <Button size="sm" variant="ghost" onClick={() => setConfirm('close')}><LockKeyhole className="h-3.5 w-3.5" />关闭</Button>}<Button size="icon" variant="ghost" className="text-destructive" aria-label={`删除任务${task.title}`} onClick={() => setConfirm('delete')}><Trash2 className="h-3.5 w-3.5" /></Button><Dialog open={confirm !== null} onOpenChange={open => { if (!open && !busy) setConfirm(null) }}><DialogContent><DialogHeader><DialogTitle>{confirm === 'close' ? '关闭任务' : '删除任务'}</DialogTitle><DialogDescription>{confirm === 'close' ? `关闭「${task.title}」后，学生无法继续提交，已有材料仍可评阅。` : `确定删除「${task.title}」及其提交与评阅记录？此操作无法恢复。`}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>取消</Button><Button variant={confirm === 'delete' ? 'destructive' : 'default'} disabled={busy} onClick={() => void mutate()}>{busy ? '处理中…' : confirm === 'close' ? '确认关闭' : '确认删除'}</Button></DialogFooter></DialogContent></Dialog></>
}

export function TaskManagement() {
  return <Suspense fallback={<p className="py-16 text-center text-muted-foreground">正在读取任务…</p>}><TaskManagementContent /></Suspense>
}

function TaskManagementContent() {
  const { user } = useRequireUser()
  const searchParams = useSearchParams()
  const [tasks, setTasks] = useState<PracticeTask[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const panel = useRef<HTMLElement>(null)
  const [editor, setEditor] = useState<{ task: PracticeTask | null } | null>(null)
  const [selected, setSelected] = useState<PracticeTask | null>(null)
  const now = useCurrentMinute()
  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const id = encodeURIComponent(user.id)
      const [taskData, scoreData, profileData] = await Promise.all([
        teachingApi<PracticeTask[]>(`/api/tasks?user_id=${id}`),
        teachingApi<Score[]>(`/api/scores?user_id=${id}`),
        teachingApi<Profile[]>(`/api/profiles?user_id=${id}`),
      ])
      setTasks(taskData.filter(task => task.teacher_id === user.id))
      setScores(scoreData)
      setStudents(profileData.filter(profile => profile.role === 'student'))
    } catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (searchParams.get('create') === '1') setEditor({ task: null }) }, [searchParams])
  useEffect(() => {
    if (editor && !loading) revealStackedAdminPanel(panel.current)
  }, [editor, loading])
  const filtered = useMemo(() => tasks.filter(task => task.title.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'all' || taskState(task, now) === status)), [tasks, query, status, now])
  const columns: AdminColumn<PracticeTask>[] = [
    { key: 'title', label: '任务名称', render: task => <div className="min-w-36"><button type="button" className={cn('text-left font-medium hover:text-primary', selected?.id === task.id && 'text-primary')} onClick={() => { setSelected(task); revealStackedAdminPanel(panel.current) }}>{task.title}</button><p className="mt-1 line-clamp-1 max-w-44 text-xs text-muted-foreground">{task.description}</p></div> },
    { key: 'score', label: '练习曲目', render: task => { const score = scores.find(item => item.id === task.score_id); return task.score_mode === 'random' ? <span className="text-sm">系统随机选曲</span> : score ? <div className="flex min-w-28 items-center gap-2"><div className="size-9 shrink-0 overflow-hidden rounded border border-border bg-muted"><ScoreCover score={score} /></div><span className="text-sm">{score.title}</span></div> : <span className="text-sm">曲目不可用</span> } },
    { key: 'status', label: '状态', render: task => <Badge variant={taskState(task, now) === 'active' ? 'default' : 'secondary'}>{stateLabels[taskState(task, now)]}</Badge> },
    { key: 'actions', label: '操作', render: task => user && <div className="flex items-center gap-1"><Button asChild variant="ghost" size="sm"><Link href={`/teacher/tasks/${task.id}`}><Eye className="h-3.5 w-3.5" />查看</Link></Button><TaskActions task={task} userId={user.id} onEdit={() => setEditor({ task })} onChanged={() => void load()} onDeleted={() => void load()} /></div> },
  ]
  if (!user) return null
  const selectedTask = filtered.find(task => task.id === selected?.id) ?? filtered[0] ?? null
  return <div className="space-y-6"><AdminPageHeader title="练习任务" description="发布练习要求，按任务跟踪提交和完成情况。" actions={<Button disabled={loading || Boolean(error)} onClick={() => setEditor({ task: null })}><Plus className="h-4 w-4" />发布任务</Button>} /><div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4"><div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="搜索任务名称" placeholder="搜索任务名称" value={query} onChange={event => setQuery(event.target.value)} /></div><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="任务状态筛选" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem>{Object.entries(stateLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>{error ? <AdminNotice message={error} onRetry={() => void load()} /> : loading ? <p className="py-16 text-center text-muted-foreground">正在读取任务…</p> : <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]"><AdminTable rows={filtered} columns={columns} rowKey={task => task.id} emptyText="暂无符合条件的练习任务" /><aside ref={panel} className="min-w-0 scroll-mt-24 rounded-xl border border-border bg-card p-5 xl:sticky xl:top-24 xl:self-start">{editor ? <TaskForm key={editor.task?.id ?? 'new'} embedded userId={user.id} task={editor.task} scores={scores} students={students} onClose={() => setEditor(null)} onSaved={() => void load()} /> : selectedTask ? <><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">任务详情</p><h2 className="mt-1 font-serif text-xl">{selectedTask.title}</h2></div><Badge variant={taskState(selectedTask, now) === 'active' ? 'default' : 'secondary'}>{stateLabels[taskState(selectedTask, now)]}</Badge></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selectedTask.description}</p><div className="mt-5 space-y-2 border-t border-border pt-4 text-sm"><p>截止时间：{teachingDate(selectedTask.end_at)}</p><p>面向范围：{audienceLabel(selectedTask)}</p><p>已交 / 应交：{selectedTask.submitted_count ?? 0} / {selectedTask.student_count ?? 0} 人</p></div><div className="mt-5"><Button className="w-full" onClick={() => setEditor({ task: selectedTask })}><Pencil className="h-4 w-4" />编辑任务</Button></div></> : <p className="py-16 text-center text-sm text-muted-foreground">选择任务后查看要求与提交进度。</p>}</aside></div>}</div>
}

interface StudentCompletion extends Profile { submission?: TaskSubmission; currentAudience: boolean }

export function TaskDetailManagement({ taskId }: { taskId: string }) {
  const { user } = useRequireUser()
  const router = useRouter()
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [scores, setScores] = useState<Score[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [review, setReview] = useState<TaskSubmission | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const now = useCurrentMinute()
  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const id = encodeURIComponent(user.id)
      const [taskData, scoreData, profileData] = await Promise.all([
        teachingApi<TaskDetail>(`/api/tasks/${encodeURIComponent(taskId)}?user_id=${id}`),
        teachingApi<Score[]>(`/api/scores?user_id=${id}`),
        teachingApi<Profile[]>(`/api/profiles?user_id=${id}`),
      ])
      setDetail(taskData)
      setScores(scoreData)
      setStudents(profileData.filter(profile => profile.role === 'student'))
    } catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user, taskId])
  useEffect(() => { void load() }, [load])
  const rows = useMemo(() => {
    if (!detail) return []
    const submitted = new Map(detail.submissions.map(item => [item.student_id, item]))
    const currentIds = new Set(detail.students.map(item => item.id))
    const all: StudentCompletion[] = detail.students.map(student => ({ ...student, submission: submitted.get(student.id), currentAudience: true }))
    for (const submission of detail.submissions) if (!currentIds.has(submission.student_id)) all.push({ id: submission.student_id, nickname: submission.profiles?.nickname ?? '学生', role: 'student', class_name: submission.profiles?.class_name ?? null, submission, currentAudience: false })
    return all.filter(student => `${student.nickname} ${student.class_name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'all' || (status === 'missing' ? !student.submission : status === 'pending' ? student.submission && !student.submission.reviewed_at : Boolean(student.submission?.reviewed_at))))
  }, [detail, query, status])
  const columns: AdminColumn<StudentCompletion>[] = [
    { key: 'name', label: '学生昵称', render: student => <div><span className="font-medium">{student.nickname}</span>{!student.currentAudience && <p className="mt-1 text-xs text-muted-foreground">已不在当前任务范围</p>}</div> },
    { key: 'class', label: '班级', render: student => student.class_name || '未分班' },
    { key: 'status', label: '提交状态', render: student => <Badge variant={student.submission ? 'default' : 'secondary'}>{student.submission ? '已交' : '未交'}</Badge> },
    { key: 'review', label: '评阅状态', render: student => student.submission ? <Badge variant="outline">{student.submission.reviewed_at ? '已评阅' : '待评阅'}</Badge> : '—' },
    { key: 'time', label: '提交时间', render: student => <span className="whitespace-nowrap text-xs text-muted-foreground">{student.submission ? teachingDate(student.submission.submitted_at) : '—'}</span> },
    { key: 'grade', label: '评分', render: student => student.submission?.grade != null ? `${student.submission.grade} 分` : '—' },
    { key: 'actions', label: '操作', render: student => student.submission ? <Button variant="outline" size="sm" onClick={() => setReview(student.submission ?? null)}>{student.submission.reviewed_at ? '查看 / 修改评阅' : '查看材料并评阅'}</Button> : <span className="text-xs text-muted-foreground">等待提交</span> },
  ]
  if (!user) return null
  if (loading) return <p className="py-16 text-center text-muted-foreground">正在读取任务详情…</p>
  if (error || !detail) return <div className="space-y-5"><Button asChild variant="ghost"><Link href="/teacher/tasks"><ArrowLeft className="h-4 w-4" />返回练习任务</Link></Button><AdminNotice message={error || '未找到此任务'} onRetry={() => void load()} /></div>
  const task = detail.task
  const score = scores.find(item => item.id === task.score_id)
  const requirementLabels = { audio: '练习录音', record: '练习记录', video: '演奏视频' }
  return <div className="space-y-6"><Button asChild variant="ghost" className="-ml-3"><Link href="/teacher/tasks"><ArrowLeft className="h-4 w-4" />返回练习任务</Link></Button><AdminPageHeader title={task.title} description={`${teachingDate(task.start_at)} — ${teachingDate(task.end_at)}`} actions={<div className="flex gap-1"><TaskActions task={task} userId={user.id} onEdit={() => setEditing(true)} onChanged={() => void load()} onDeleted={() => router.push('/teacher/tasks')} /></div>} /><section className="space-y-5 rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-center gap-3"><Badge variant={taskState(task, now) === 'active' ? 'default' : 'secondary'}>{stateLabels[taskState(task, now)]}</Badge><span className="text-sm text-muted-foreground">{audienceLabel(task)}</span><span className="ml-auto text-sm tabular-nums text-muted-foreground">当前范围 {detail.students.length} 人 · 已交 {detail.submissions.filter(submission => detail.students.some(student => student.id === submission.student_id)).length} 人</span></div><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"><div><h2 className="text-sm font-semibold">练习要求</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{task.description}</p><div className="mt-4 flex flex-wrap gap-2">{Object.entries(task.requirements).filter(([, value]) => value !== 'off').map(([kind, value]) => <Badge key={kind} variant="outline">{requirementLabels[kind as keyof typeof requirementLabels]} · {value === 'required' ? '必交' : '选交'}</Badge>)}</div></div><div className="rounded-lg bg-muted/50 p-4"><h2 className="text-sm font-semibold">练习曲目</h2><p className="mt-2 text-sm">{task.score_mode === 'random' ? '系统随机选曲' : score?.title ?? '指定曲目不可用'}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{task.score_mode === 'random' ? '系统为每位学生分配一首已发布曲目。' : score?.composer}</p></div></div></section><section className="space-y-4"><h2 className="text-lg font-semibold">学生完成情况</h2><div className="flex flex-wrap gap-3"><div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="搜索学生或班级" className="pl-9" placeholder="搜索学生昵称或班级" value={query} onChange={event => setQuery(event.target.value)} /></div><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="完成状态筛选" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部学生</SelectItem><SelectItem value="missing">未交</SelectItem><SelectItem value="pending">已交 · 待评阅</SelectItem><SelectItem value="reviewed">已评阅</SelectItem></SelectContent></Select></div><AdminTable rows={rows} columns={columns} rowKey={student => student.id} emptyText="当前条件下暂无学生" /></section>{editing && <TaskForm userId={user.id} task={task} scores={scores} students={students} onClose={() => setEditing(false)} onSaved={() => void load()} />}{review && <TeacherReviewDialog userId={user.id} taskId={task.id} taskTitle={task.title} submissionId={review.id} submission={review} onClose={() => setReview(null)} onSaved={() => void load()} />}</div>
}
