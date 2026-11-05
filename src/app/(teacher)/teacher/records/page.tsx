'use client'

import { useCallback, useEffect, useState } from 'react'
import { Headphones, X } from 'lucide-react'
import { useRequireUser } from '@/lib/user-context'
import type { PracticeRecord, Profile } from '@/lib/teaching-types'
import { errorMessage, teachingApi, teachingDate, teachingDuration } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function TeacherRecordsPage() {
  const { user } = useRequireUser()
  const [records, setRecords] = useState<PracticeRecord[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [className, setClassName] = useState('all')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (user?.role !== 'teacher') return
    setLoading(true)
    setError('')
    try {
      const [practice, profiles] = await Promise.all([teachingApi<PracticeRecord[]>('/api/practice'), teachingApi<Profile[]>('/api/profiles')])
      setRecords(practice)
      setStudents(profiles.filter(profile => profile.role === 'student'))
    } catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])
  const studentMap = new Map(students.map(student => [student.id, student]))
  const classes = [...new Set(students.map(student => student.class_name).filter((name): name is string => !!name))].sort()
  const rows = records.filter(record => {
    const student = studentMap.get(record.user_id)
    return !!student && `${student.nickname} ${record.piece_title}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (className === 'all' || (className === 'unassigned' ? !student.class_name : student.class_name === className)) && (!start || record.practice_date >= start) && (!end || record.practice_date <= end)
  })
  const invalidDates = Boolean(start && end && start > end)
  const selected = !invalidDates && !error && !loading ? rows.find(record => record.id === selectedId && record.audio_url) : undefined
  useEffect(() => { if (selectedId && !selected) setSelectedId(null) }, [selectedId, selected])
  const columns: AdminColumn<PracticeRecord>[] = [
    { key: 'student', label: '学生 / 班级', render: record => <div className="space-y-1"><p className="font-medium">{studentMap.get(record.user_id)?.nickname}</p><p className="text-xs text-muted-foreground">{studentMap.get(record.user_id)?.class_name || '未分班'}</p></div> },
    { key: 'title', label: '练习曲目', render: record => record.piece_title || '未命名曲目' },
    { key: 'date', label: '开始时间', render: record => teachingDate(record.started_at) },
    { key: 'duration', label: '有效时长', render: record => <span className="tabular-nums">{teachingDuration(record.duration_seconds)}</span> },
    { key: 'pause', label: '暂停次数', render: record => record.pause_count },
    { key: 'audio', label: '练习录音', render: record => record.audio_url ? <Button type="button" variant={selected?.id === record.id ? 'secondary' : 'outline'} size="sm" aria-expanded={selected?.id === record.id} aria-controls="record-audio-player" onClick={() => setSelectedId(record.id)}><Headphones className="size-3.5" />回听</Button> : <span className="text-muted-foreground">未录音</span> },
  ]
  if (user?.role !== 'teacher') return null
  return <div className="space-y-6"><AdminPageHeader title="练习记录" description="查看最近 500 条学生练习记录，有效时长不包含暂停时间。录音使用服务端签名地址。" /><div className="flex flex-wrap items-end gap-3"><div className="space-y-2"><Label htmlFor="records-search">搜索</Label><Input id="records-search" className="w-56" placeholder="学生昵称或曲名" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="space-y-2"><Label>班级</Label><Select value={className} onValueChange={setClassName}><SelectTrigger className="w-40" aria-label="筛选记录班级"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem><SelectItem value="unassigned">未分班</SelectItem>{classes.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="records-start">开始日期</Label><Input id="records-start" className="w-44" type="date" value={start} onChange={event => setStart(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="records-end">结束日期</Label><Input id="records-end" className="w-44" type="date" value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} /></div></div>{invalidDates ? <AdminNotice message="结束日期不能早于开始日期" /> : error ? <AdminNotice message={error} onRetry={() => void load()} /> : <AdminTable rows={rows} columns={columns} rowKey={record => record.id} emptyText={loading ? '正在读取练习记录…' : '暂无符合条件的练习记录'} />}{selected && <section id="record-audio-player" aria-label="所选练习录音" className="rounded-xl border border-primary/20 bg-card p-4 sm:p-5"><div className="mb-4 flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Headphones className="size-5" /></span><div className="min-w-0"><h2 className="break-words text-sm font-semibold">{selected.piece_title || '未命名曲目'}</h2><div className="mt-1 flex flex-col gap-1 text-xs leading-5 text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-4"><span>{studentMap.get(selected.user_id)?.nickname} · {studentMap.get(selected.user_id)?.class_name || '未分班'}</span><span>{teachingDate(selected.started_at)}</span><span>有效时长 {teachingDuration(selected.duration_seconds)}</span></div></div></div><Button type="button" variant="ghost" size="icon" aria-label="关闭练习录音播放器" className="shrink-0" onClick={() => setSelectedId(null)}><X className="size-4" /></Button></div><audio key={selected.id} controls preload="none" className="w-full" src={selected.audio_url ?? undefined} aria-label={`${studentMap.get(selected.user_id)?.nickname}的${selected.piece_title}练习录音`} /></section>}</div>
}
