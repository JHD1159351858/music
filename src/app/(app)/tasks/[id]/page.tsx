'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Music2, Pencil, Play, LockKeyhole, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRequireUser } from '@/lib/user-context'
import { TaskForm } from '@/components/teaching/task-form'
import { SubmissionForm } from '@/components/teaching/submission-form'
import { SubmissionReview } from '@/components/teaching/submission-materials'
import { errorMessage, jsonBody, teachingApi, teachingDate } from '@/components/teaching/api'
import type { PracticeRecord, Profile, Score, TaskDetail } from '@/lib/teaching-types'

export default function TaskDetailPage() {
  const { user } = useRequireUser()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [scores, setScores] = useState<Score[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [records, setRecords] = useState<PracticeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  const isTeacher = user?.role === 'teacher'
  const initialRecordId = searchParams.get('record_id')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const taskDetail = await teachingApi<TaskDetail>(`/api/tasks/${params.id}?user_id=${encodeURIComponent(user.id)}`)
      const scoreData = await teachingApi<Score[]>(`/api/scores?user_id=${encodeURIComponent(user.id)}`)
      if (user.role === 'teacher') {
        const profileData = await teachingApi<Profile[]>(`/api/profiles?user_id=${encodeURIComponent(user.id)}`)
        setStudents(profileData.filter((profile) => profile.role === 'student'))
      } else {
        setRecords(await teachingApi<PracticeRecord[]>(`/api/practice?user_id=${encodeURIComponent(user.id)}`))
      }
      setDetail(taskDetail)
      setScores(scoreData)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user, params.id])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])

  async function closeTask() {
    if (!user || !detail || !window.confirm('关闭此任务后，学生将无法继续提交，已有材料仍可评阅。确定关闭？')) return
    setMutating(true)
    try {
      await teachingApi(`/api/tasks/${params.id}`, { method: 'PATCH', ...jsonBody({ user_id: user.id, closed: true }) })
      toast.success('任务已关闭')
      await load()
    } catch (cause) { toast.error(errorMessage(cause)) }
    finally { setMutating(false) }
  }

  async function deleteTask() {
    if (!user || !detail || !window.confirm(`删除「${detail.task.title}」及其提交与评阅记录？此操作无法恢复。`)) return
    setMutating(true)
    try {
      await teachingApi(`/api/tasks/${params.id}`, { method: 'DELETE', ...jsonBody({ user_id: user.id }) })
      toast.success('任务已删除')
      router.push('/tasks')
    } catch (cause) { toast.error(errorMessage(cause)); setMutating(false) }
  }

  if (!user) return null
  if (loading) return <div className="py-20 text-center text-muted-foreground">正在读取练习任务…</div>
  if (error || !detail) return <div className="space-y-5"><Link className="flex items-center gap-2 text-sm text-muted-foreground" href="/tasks"><ArrowLeft className="h-4 w-4" />返回练习任务</Link><div className="rounded-xl border border-destructive/40 bg-card p-6"><p className="text-sm text-destructive">{error || '未找到此任务'}</p><Button className="mt-4" variant="outline" onClick={() => void load()}>重新加载</Button></div></div>
  const { task, submissions } = detail
  const scoreId = isTeacher ? task.score_id : task.assigned_score_id ?? task.score_id
  const score = scores.find((item) => item.id === scoreId)
  const ownSubmission = submissions.find((submission) => submission.student_id === user.id) ?? null
  const submittedIds = new Set(submissions.map((submission) => submission.student_id))
  const missing = detail.students.filter((student) => !submittedIds.has(student.id))
  const ended = now !== null && new Date(task.end_at).getTime() < now
  const pending = now === null || new Date(task.start_at).getTime() > now
  const canStart = !task.closed && !ended && !pending && Boolean(score?.published)
  const requirementLabels = { audio: '练习录音', record: '练习记录', video: '自制演奏视频' }
  const audienceLabel = task.audience === 'all' ? '全体学生' : task.audience === 'classes' ? task.target_classes.join('、') : `指定 ${task.target_student_ids.length} 位学生`

  return <div className="space-y-7">
    <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary" href="/tasks"><ArrowLeft className="h-4 w-4" />返回练习任务</Link>
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-3"><Badge variant={task.closed || ended ? 'secondary' : 'default'}>{task.closed ? '已关闭' : ended ? '已截止' : pending ? '未开始' : '进行中'}</Badge><h1 className="font-serif text-3xl font-bold">{task.title}</h1><p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />{teachingDate(task.start_at)} — {teachingDate(task.end_at)}</span><span className="inline-flex items-center gap-2"><Users className="h-4 w-4" />{audienceLabel}</span></p></div>{isTeacher && <div className="flex flex-wrap gap-2"><Button variant="outline" className="gap-2" disabled={mutating} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />编辑任务</Button>{!task.closed && <Button variant="outline" className="gap-2" disabled={mutating} onClick={() => void closeTask()}><LockKeyhole className="h-4 w-4" />关闭</Button>}<Button variant="outline" className="gap-2 text-destructive" disabled={mutating} onClick={() => void deleteTask()}><Trash2 className="h-4 w-4" />删除</Button></div>}</header>
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]"><section className="rounded-xl border border-border bg-card p-6"><h2 className="flex items-center gap-2 font-serif text-xl"><ClipboardList className="h-5 w-5 text-primary" />练习要求</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{task.description}</p><div className="mt-6 flex flex-wrap gap-2">{Object.entries(task.requirements).filter(([, value]) => value !== 'off').map(([kind, requirement]) => <Badge key={kind} variant="outline" className="px-3 py-1.5 font-normal">{requirementLabels[kind as keyof typeof requirementLabels]}<span className="ml-2 text-primary">{requirement === 'required' ? '必交' : '选交'}</span></Badge>)}</div></section><section className="flex flex-col rounded-xl border border-primary/25 bg-card p-6"><Music2 className="h-6 w-6 text-primary" /><h2 className="mt-4 font-serif text-xl">{score?.title ?? (task.score_mode === 'random' ? '系统随机选曲' : '指定曲目不可用')}</h2><p className="mt-2 text-sm text-muted-foreground">{score?.composer ?? (isTeacher ? '每位学生分配一首已发布曲目' : '请联系教师检查琴谱发布状态')}</p>{!isTeacher && <>{canStart ? <Button asChild className="mt-6 gap-2"><Link href={`/practice/session/${scoreId}?task_id=${task.id}`}><Play className="h-4 w-4" />按任务开始练习</Link></Button> : <Button disabled className="mt-6">{task.closed ? '任务已关闭' : ended ? '任务已截止' : pending ? '任务尚未开始' : '暂无可练习琴谱'}</Button>}<p className="mt-3 text-xs leading-relaxed text-muted-foreground">在线练习结束后，可返回本任务关联录音与练习记录并提交。</p></>}</section></div>
    {isTeacher ? <section className="space-y-5"><h2 className="font-serif text-xl">学生完成情况</h2><Tabs defaultValue="submitted"><TabsList><TabsTrigger value="submitted">已交 {submissions.length}</TabsTrigger><TabsTrigger value="missing">未交 {missing.length}</TabsTrigger></TabsList><TabsContent value="submitted" className="mt-5 space-y-5">{submissions.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">还没有学生提交材料。</p> : submissions.map((submission) => <SubmissionReview key={`${submission.id}-${submission.submitted_at}`} submission={submission} userId={user.id} canReview onSaved={() => void load()} />)}</TabsContent><TabsContent value="missing" className="mt-5"><div className="rounded-xl border border-border bg-card p-5">{missing.length === 0 ? <p className="text-sm text-muted-foreground">{detail.students.length > 0 ? '当前范围内学生均已提交。' : '当前范围内暂无学生。'}</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{missing.map((student) => <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-4" key={student.id}><div><p className="text-sm font-medium">{student.nickname}</p><p className="mt-1 text-xs text-muted-foreground">{student.class_name || '未分班'}</p></div><Badge variant="secondary">未交</Badge></div>)}</div>}</div></TabsContent></Tabs></section> : <>
      {ownSubmission && <section className="space-y-4"><h2 className="flex items-center gap-2 font-serif text-xl"><CheckCircle2 className="h-5 w-5 text-primary" />我的提交与评阅</h2><SubmissionReview key={`${ownSubmission.id}-${ownSubmission.submitted_at}`} submission={ownSubmission} userId={user.id} canReview={false} onSaved={() => void load()} /></section>}
      {(!task.closed && !ended) && <SubmissionForm key={ownSubmission?.submitted_at ?? 'new'} userId={user.id} task={task} records={records.filter((record) => record.score_id === scoreId)} initialRecordId={initialRecordId} submission={ownSubmission} onSaved={() => void load()} />}
      {!ownSubmission && (task.closed || ended) && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">你尚未提交此任务，当前任务已{task.closed ? '关闭' : '截止'}。</p>}
    </>}
    {editing && <TaskForm userId={user.id} task={task} scores={scores} students={students} onClose={() => setEditing(false)} onSaved={() => void load()} />}
  </div>
}
