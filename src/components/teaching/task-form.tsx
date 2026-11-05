'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { errorMessage, jsonBody, teachingApi } from './api'
import type { PracticeTask, Profile, Score } from '@/lib/teaching-types'
import type { Classroom } from '@/lib/class-types'

interface TaskFormProps {
  userId: string
  task: PracticeTask | null
  scores: Score[]
  students: Profile[]
  embedded?: boolean
  onClose: () => void
  onSaved: () => void
}

type Requirement = 'off' | 'optional' | 'required'
type Audience = 'all' | 'classes' | 'students'

function localDateTime(value: string): string {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const MATERIALS = [{ key: 'audio', label: '练习录音' }, { key: 'record', label: '练习记录' }, { key: 'video', label: '自制演奏视频' }] as const

export function TaskForm({ userId, task, scores, students, embedded = false, onClose, onSaved }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [startsAt, setStartsAt] = useState(task ? localDateTime(task.start_at) : '')
  const [endsAt, setEndsAt] = useState(task ? localDateTime(task.end_at) : '')
  const [audience, setAudience] = useState<Audience>(task?.audience ?? 'all')
  const [classes, setClasses] = useState<string[]>(task?.target_classes ?? [])
  const [studentIds, setStudentIds] = useState<string[]>(task?.target_student_ids ?? [])
  const [scoreMode, setScoreMode] = useState<'fixed' | 'random'>(task?.score_mode ?? 'fixed')
  const [scoreId, setScoreId] = useState(task?.score_id ?? '')
  const [requirements, setRequirements] = useState<Record<'audio' | 'record' | 'video', Requirement>>(task?.requirements ?? { audio: 'required', record: 'required', video: 'off' })
  const [saving, setSaving] = useState(false)
  const [teacherClassNames, setTeacherClassNames] = useState<string[]>([])
  const [classLoading, setClassLoading] = useState(true)
  const [classError, setClassError] = useState('')
  const [classReload, setClassReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setClassLoading(true)
    setClassError('')
    teachingApi<Classroom[]>('/api/classes', { signal: controller.signal })
      .then((data) => setTeacherClassNames(data.map((item) => item.name)))
      .catch((error: unknown) => { if (!controller.signal.aborted) setClassError(errorMessage(error)) })
      .finally(() => { if (!controller.signal.aborted) setClassLoading(false) })
    return () => controller.abort()
  }, [userId, classReload])
  const classNames = [...new Set([...students.map((student) => student.class_name).filter((name): name is string => Boolean(name)), ...teacherClassNames, ...classes])].sort()
  const availableScores = scores.filter((score) => {
    if (!score.published || score.source !== 'teacher') return false
    const scoreClasses = score.target_classes ?? []
    if (!scoreClasses.length) return true
    if (audience === 'all') return false
    if (audience === 'classes') return classes.every((name) => scoreClasses.includes(name))
    return studentIds.every((id) => {
      const student = students.find((item) => item.id === id)
      return Boolean(student?.class_name && scoreClasses.includes(student.class_name))
    })
  })

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (new Date(endsAt) <= new Date(startsAt)) return toast.error('结束时间必须晚于开始时间')
    if (audience === 'classes' && classes.length === 0) return toast.error('请选择至少一个班级')
    if (audience === 'students' && studentIds.length === 0) return toast.error('请选择至少一位学生')
    if (!Object.values(requirements).some((value) => value !== 'off')) return toast.error('请设置至少一种提交材料')
    setSaving(true)
    try {
      await teachingApi(task ? `/api/tasks/${task.id}` : '/api/tasks', {
        method: task ? 'PATCH' : 'POST',
        ...jsonBody({ user_id: userId, title: title.trim(), description: description.trim(), start_at: new Date(startsAt).toISOString(), end_at: new Date(endsAt).toISOString(), audience, target_classes: audience === 'classes' ? classes : [], target_student_ids: audience === 'students' ? studentIds : [], score_mode: scoreMode, score_id: scoreMode === 'fixed' ? scoreId : null, requirements }),
      })
      toast.success(task ? '任务已更新' : '任务已发布')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const form = <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2"><Label htmlFor="task-title">任务名称</Label><Input id="task-title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：本周音阶与琶音练习" /></div>
          <div className="space-y-2"><Label htmlFor="task-description">练习要求</Label><Textarea id="task-description" required rows={3} maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="写明练习重点、速度与提交说明" /></div>
          <div className={embedded ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
            <div className="space-y-2"><Label htmlFor="task-start">开始时间</Label><Input id="task-start" type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="task-end">截止时间</Label><Input id="task-end" type="datetime-local" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div>
          </div>
          <div className="space-y-3">
            <Label>面向范围</Label>
            <Select value={audience} onValueChange={(value: Audience) => setAudience(value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全体学生</SelectItem><SelectItem value="classes">指定班级</SelectItem><SelectItem value="students">指定学生</SelectItem></SelectContent></Select>
            {audience === 'classes' && <div className="space-y-3 rounded-lg border border-border p-3">{classLoading && <p className="text-xs text-muted-foreground">正在读取已创建班级…</p>}{classError && <div role="alert" className="flex items-center gap-2 text-sm text-destructive"><span>读取已创建班级失败：{classError}，可继续使用当前已知班级。</span><Button type="button" variant="outline" size="sm" onClick={() => setClassReload((value) => value + 1)}>重试</Button></div>}<div className="flex flex-wrap gap-3">{!classLoading && !classError && classNames.length === 0 && <p className="text-sm text-muted-foreground">请先在「学生班级」创建班级。</p>}{classNames.map((name) => <label key={name} className="flex items-center gap-2 text-sm"><Checkbox checked={classes.includes(name)} onCheckedChange={(checked) => setClasses((current) => checked ? [...current, name] : current.filter((item) => item !== name))} />{name}</label>)}</div></div>}
            {audience === 'students' && <div className="grid max-h-40 gap-3 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">{students.length === 0 && <p className="text-sm text-muted-foreground">暂无学生身份。</p>}{students.map((student) => <label key={student.id} className="flex items-center gap-2 text-sm"><Checkbox checked={studentIds.includes(student.id)} onCheckedChange={(checked) => setStudentIds((current) => checked ? [...current, student.id] : current.filter((id) => id !== student.id))} />{student.nickname}<span className="text-xs text-muted-foreground">{student.class_name || '未分班'}</span></label>)}</div>}
          </div>
          <div className="space-y-3">
            <Label>练习曲目</Label>
            <Select value={scoreMode} onValueChange={(value: 'fixed' | 'random') => setScoreMode(value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">从琴谱库指定</SelectItem><SelectItem value="random">系统随机挑选已发布曲目</SelectItem></SelectContent></Select>
            {scoreMode === 'fixed' ? <><Select value={scoreId} onValueChange={setScoreId}><SelectTrigger className="w-full"><SelectValue placeholder="请选择已发布琴谱" /></SelectTrigger><SelectContent>{availableScores.map((score) => <SelectItem key={score.id} value={score.id}>{score.title} · {score.composer}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">仅展示当前任务范围内所有学生均可查看的琴谱；没有可选曲目时，请调整任务范围或琴谱发布班级。</p></> : <p className="text-xs text-muted-foreground">系统按班级可见范围为每位学生分配一首曲目，同一任务中分配结果保持一致。面向全体学生时，需至少一份向全部班级发布的琴谱。</p>}
          </div>
          <div className="space-y-3"><Label>提交要求</Label>{MATERIALS.map(({ key, label }) => <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2"><span className="text-sm">{label}</span><Select value={requirements[key]} onValueChange={(value: Requirement) => setRequirements((current) => ({ ...current, [key]: value }))}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="required">必交</SelectItem><SelectItem value="optional">选交</SelectItem><SelectItem value="off">无需提交</SelectItem></SelectContent></Select></div>)}</div>
          <Button type="submit" className="w-full" disabled={saving || (scoreMode === 'fixed' && !availableScores.some((score) => score.id === scoreId))}>{saving ? '保存中…' : task ? '保存修改' : '发布任务'}</Button>
        </form>
  if (embedded) return <section className="max-h-[calc(100dvh-10rem)] overflow-y-auto"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-serif text-xl">{task ? '编辑练习任务' : '发布练习任务'}</h2><p className="mt-1 text-sm text-muted-foreground">设置任务时间、面向范围、练习曲目与提交要求。</p></div><Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onClose}>取消</Button></div>{form}</section>
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{task ? '编辑练习任务' : '发布练习任务'}</DialogTitle><DialogDescription>设置任务时间、面向范围、练习曲目与提交要求。</DialogDescription></DialogHeader>{form}</DialogContent></Dialog>
}
