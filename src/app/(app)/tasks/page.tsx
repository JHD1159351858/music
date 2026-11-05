'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ClipboardList, CalendarDays, Plus, ArrowLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useRequireUser } from '@/lib/user-context'
import { TaskForm } from '@/components/teaching/task-form'
import { SemesterGoals } from '@/components/teaching/semester-goals'
import { ClassManager } from '@/components/teaching/class-manager'
import { ScoreCover } from '@/components/practice/score-cover'
import { errorMessage, teachingApi, teachingDate } from '@/components/teaching/api'
import type { PracticeTask, Profile, Score } from '@/lib/teaching-types'

const requirementNames = { audio: '录音', record: '练习记录', video: '演奏视频' }

export default function TasksPage() {
  return <Suspense fallback={<p className="py-12 text-center text-muted-foreground">正在读取练习任务…</p>}><TasksWorkspace /></Suspense>
}

function TasksWorkspace() {
  const { user } = useRequireUser()
  const searchParams = useSearchParams()
  const [tasks, setTasks] = useState<PracticeTask[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  const isTeacher = user?.role === 'teacher'
  const showGoals = !isTeacher && searchParams.get('tab') === 'goals'

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const result = await teachingApi<PracticeTask[]>(`/api/tasks?user_id=${encodeURIComponent(user.id)}`)
      setTasks(result)
      if (user.role === 'teacher') {
        const [scoreData, profileData] = await Promise.all([teachingApi<Score[]>(`/api/scores?user_id=${encodeURIComponent(user.id)}`), teachingApi<Profile[]>(`/api/profiles?user_id=${encodeURIComponent(user.id)}`)])
        setScores(scoreData)
        setStudents(profileData.filter((profile) => profile.role === 'student'))
      }
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])

  if (!user) return null
  const filtered = tasks.filter((task) => task.title.toLowerCase().includes(query.trim().toLowerCase()))
  const activeCount = tasks.filter((task) => !task.closed && (now === null || new Date(task.end_at).getTime() > now)).length
  const submittedCount = tasks.filter((task) => task.my_submission).length

  return <div className={`space-y-9 ${isTeacher ? '' : 'concert-module concert-tasks'}`}>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs uppercase tracking-widest text-primary">Practice Studio</p><h1 className="font-serif text-3xl font-bold">{isTeacher ? '练习任务' : showGoals ? '学期练琴目标' : '练习任务与评阅'}</h1><p className="mt-2 text-sm text-muted-foreground">{isTeacher ? '布置每一次练习，听见每一份进步。' : showGoals ? '查看各学期的目标与完成进度。' : '读懂要求，留下每次练习的成长。'}</p></div>{isTeacher && <Button className="gap-2" disabled={loading || Boolean(error)} onClick={() => setCreating(true)}><Plus className="h-4 w-4" />发布任务</Button>}</header>
    {showGoals && <Button asChild variant="outline"><Link href="/tasks"><ArrowLeft className="h-4 w-4" />返回练习任务</Link></Button>}
    <SemesterGoals userId={user.id} isTeacher={isTeacher} compact={!isTeacher && !showGoals} />
    {!showGoals && <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h2 className="font-serif text-xl">{isTeacher ? '我发布的任务' : '我的练习任务'}</h2><Badge variant="outline">进行中 {activeCount}</Badge>{!isTeacher && <Badge variant="secondary">已提交 {submittedCount}</Badge>}</div><Input aria-label="搜索任务" className="w-full sm:w-60" placeholder="搜索任务名称" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {loading ? <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground">正在读取任务…</div> : error ? <div className="rounded-xl border border-destructive/40 bg-card p-6"><p className="text-sm text-destructive">{error}</p><p className="mt-2 text-xs text-muted-foreground">任务需要连接项目数据库。配置后可重试。</p><Button className="mt-4" variant="outline" onClick={() => void load()}>重新加载</Button></div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border py-16 text-center"><ClipboardList className="mx-auto mb-3 h-8 w-8 text-primary/60" /><p className="text-muted-foreground">{query ? '没有匹配的任务' : isTeacher ? '还没有发布练习任务' : '暂时没有面向你的练习任务'}</p></div> : <div className={isTeacher ? 'grid gap-5 md:grid-cols-2' : 'grid gap-4'}>{filtered.map((task) => {
        const overdue = now !== null && new Date(task.end_at).getTime() < now
        const pending = now !== null && new Date(task.start_at).getTime() > now
        const submission = task.my_submission
        const status = task.closed ? '已关闭' : submission ? submission.reviewed_at ? '已评阅' : '已提交' : overdue ? '已截止' : pending ? '未开始' : '进行中'
        return <Link key={task.id} href={`/tasks/${task.id}`} className={`group flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50 ${isTeacher ? '' : 'concert-task-card'}`}>
          <div className="concert-task-identity flex items-start justify-between gap-3" data-has-cover={!isTeacher && Boolean(task.score)}>{!isTeacher && task.score ? <ScoreCover score={task.score} className="concert-task-cover" /> : <div className="concert-task-emblem flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></div>}<Badge variant={status === '进行中' ? 'default' : 'secondary'}>{status}</Badge></div>
          <div className="concert-task-copy"><h3 className="mt-5 font-serif text-xl font-semibold">{task.title}</h3>{!isTeacher && task.score && <p className="mt-2 text-sm text-primary">{task.score.title}<span className="text-muted-foreground"> · {task.score.composer}</span></p>}<p className="mt-2 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">{task.description}</p><div className="mt-4 flex flex-wrap gap-2">{Object.entries(task.requirements).filter(([, value]) => value !== 'off').map(([key, value]) => <Badge variant="outline" key={key} className="text-xs font-normal">{requirementNames[key as keyof typeof requirementNames]} · {value === 'required' ? '必交' : '选交'}</Badge>)}</div><p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />截止 {teachingDate(task.end_at)}</p><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><span className="text-sm text-muted-foreground">{isTeacher ? `已交 ${task.submitted_count ?? 0} / ${task.student_count ?? 0} 人` : submission?.grade != null ? `教师评分 ${submission.grade} 分` : task.score_mode === 'random' ? '系统为你分配曲目' : '教师指定曲目'}</span><span className="flex items-center gap-1 text-sm text-primary">{isTeacher ? '查看与评阅' : submission ? '查看提交' : '前往练习'}{submission && !isTeacher ? <CheckCircle2 className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}</span></div></div>
        </Link>
      })}</div>}
    </section>}
    {isTeacher && !loading && !error && <ClassManager userId={user.id} students={students} onSaved={() => void load()} />}
    {creating && <TaskForm userId={user.id} task={null} scores={scores} students={students} onClose={() => setCreating(false)} onSaved={() => void load()} />}
  </div>
}
