'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireUser } from '@/lib/user-context'
import type { Profile } from '@/lib/teaching-types'
import type { Classroom } from '@/lib/class-types'
import { errorMessage, jsonBody, teachingApi } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

export default function TeacherStudentsPage() {
  const { user } = useRequireUser()
  const [students, setStudents] = useState<Profile[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [newClassName, setNewClassName] = useState('')
  const [creating, setCreating] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [className, setClassName] = useState('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (user?.role !== 'teacher') return
    setLoading(true)
    setError('')
    try {
      const [profiles, ownClasses] = await Promise.all([teachingApi<Profile[]>('/api/profiles'), teachingApi<Classroom[]>('/api/classes')])
      setStudents(profiles.filter(profile => profile.role === 'student'))
      setClassrooms(ownClasses)
    }
    catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])
  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creating || !newClassName.trim()) return
    setCreating(true)
    try {
      await teachingApi<Classroom>('/api/classes', { method: 'POST', ...jsonBody({ name: newClassName.trim() }) })
      setNewClassName('')
      toast.success('班级已创建，将入班码发给学生即可加入')
      await load()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setCreating(false) }
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); toast.success(`${label}已复制`) }
    catch { toast.error('复制失败，请选择文字手动复制') }
  }
  async function save(student: Profile) {
    if (!user || savingId) return
    setSavingId(student.id)
    try {
      await teachingApi('/api/profiles', { method: 'PATCH', ...jsonBody({ user_id: user.id, student_id: student.id, class_name: (drafts[student.id] ?? student.class_name ?? '').trim() || null }) })
      toast.success('班级归属已保存，发布任务时可按此班级选择学生')
      setDrafts(current => { const next = { ...current }; delete next[student.id]; return next })
      await load()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setSavingId(null) }
  }
  const classes = [...new Set([...classrooms.map(classroom => classroom.name), ...students.map(student => student.class_name).filter((name): name is string => !!name)])].sort()
  const rows = students.filter(student => student.nickname.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (className === 'all' || (className === 'unassigned' ? !student.class_name : student.class_name === className)))
  const columns: AdminColumn<Profile>[] = [
    { key: 'name', label: '学生昵称', render: student => <span className="font-medium">{student.nickname}</span> },
    { key: 'class', label: '当前班级', render: student => <Badge variant="secondary">{student.class_name || '未分班'}</Badge> },
    { key: 'edit', label: '维护班级归属', render: student => <Select value={(drafts[student.id] ?? student.class_name ?? '') ? `class:${drafts[student.id] ?? student.class_name}` : 'unassigned'} onValueChange={value => setDrafts(current => ({ ...current, [student.id]: value === 'unassigned' ? '' : value.slice(6) }))}><SelectTrigger className="w-56" aria-label={`${student.nickname}的班级`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">未分班</SelectItem>{classes.map(name => <SelectItem key={name} value={`class:${name}`}>{name}</SelectItem>)}</SelectContent></Select> },
    { key: 'actions', label: '操作', render: student => <Button size="sm" variant="outline" disabled={savingId !== null || (drafts[student.id] ?? student.class_name ?? '').trim() === (student.class_name ?? '')} onClick={() => void save(student)}>{savingId === student.id ? '保存中…' : '保存'}</Button> },
  ]
  const classColumns: AdminColumn<Classroom>[] = [
    { key: 'name', label: '班级名称', render: classroom => <span className="whitespace-nowrap font-medium">{classroom.name}</span> },
    { key: 'id', label: '班级 ID', render: classroom => <div className="flex items-center gap-2"><span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{classroom.id}</span><Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`复制${classroom.name}班级ID`} onClick={() => void copy(classroom.id, '班级 ID')}><Copy className="size-3.5" /></Button></div> },
    { key: 'code', label: '入班码', render: classroom => <div className="flex items-center gap-2"><span className="font-mono font-semibold tracking-widest text-primary">{classroom.join_code}</span><Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`复制${classroom.name}入班码`} onClick={() => void copy(classroom.join_code, '入班码')}><Copy className="size-3.5" /></Button></div> },
    { key: 'students', label: '学生人数', render: classroom => <span>{classroom.student_count} 人</span> },
  ]
  if (user?.role !== 'teacher') return null
  return <div className="space-y-8">
    <AdminPageHeader title="学生班级" description="创建班级并分享入班码，学生可在“我的资料”中加入；也可在花名册中调整归属。" />
    {error && <AdminNotice message={error} onRetry={() => void load()} />}
    <section className="space-y-4" aria-labelledby="teacher-classes-title">
      <div><h2 id="teacher-classes-title" className="text-lg font-semibold">我的班级</h2><p className="mt-1 text-sm text-muted-foreground">班级 ID 用于识别班级，入班码供学生加入。班级名称需全系统唯一；已有同名学生归属会自动计入人数。</p></div>
      <form onSubmit={event => void createClass(event)} className="admin-filter-bar flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="w-full space-y-2 sm:w-72"><Label htmlFor="new-class-name">新建班级名称</Label><Input id="new-class-name" value={newClassName} onChange={event => setNewClassName(event.target.value)} placeholder="例如：2026级钢琴一班" maxLength={100} disabled={creating} required /></div>
        <Button type="submit" disabled={creating || !newClassName.trim()}>{creating && <Loader2 className="size-4 animate-spin" />}{creating ? '创建中…' : '创建班级'}</Button>
      </form>
      <AdminTable rows={classrooms} columns={classColumns} rowKey={classroom => classroom.id} emptyText={loading ? '正在读取班级…' : '尚未创建班级，在上方填写名称即可创建'} />
    </section>
    <section className="space-y-4" aria-labelledby="teacher-students-title">
      <h2 id="teacher-students-title" className="text-lg font-semibold">学生花名册</h2>
      <div className="flex flex-wrap gap-3"><Input aria-label="搜索学生昵称" className="w-64" placeholder="搜索学生昵称" value={search} onChange={event => setSearch(event.target.value)} /><Select value={className} onValueChange={setClassName}><SelectTrigger className="w-44" aria-label="按班级筛选"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem><SelectItem value="unassigned">未分班</SelectItem>{classes.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select><span className="self-center text-sm text-muted-foreground">共 {rows.length} 位学生</span></div>
      <AdminTable rows={rows} columns={columns} rowKey={student => student.id} emptyText={loading ? '正在读取学生…' : '暂无符合条件的学生'} />
    </section>
  </div>
}
