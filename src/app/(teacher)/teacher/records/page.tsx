'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRequireUser } from '@/lib/user-context'
import type { PracticeRecord, Profile } from '@/lib/teaching-types'
import { errorMessage, teachingApi, teachingDate, teachingDuration } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
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
  const columns: AdminColumn<PracticeRecord>[] = [
    { key: 'student', label: '学生 / 班级', render: record => <div className="space-y-1"><p className="font-medium">{studentMap.get(record.user_id)?.nickname}</p><p className="text-xs text-muted-foreground">{studentMap.get(record.user_id)?.class_name || '未分班'}</p></div> },
    { key: 'title', label: '练习曲目', render: record => record.piece_title || '未命名曲目' },
    { key: 'date', label: '开始时间', render: record => teachingDate(record.started_at) },
    { key: 'duration', label: '有效时长', render: record => <span className="tabular-nums">{teachingDuration(record.duration_seconds)}</span> },
    { key: 'pause', label: '暂停次数', render: record => record.pause_count },
    { key: 'audio', label: '练习录音', render: record => record.audio_url ? <audio className="h-9 w-60" controls preload="none" src={record.audio_url} aria-label={`${studentMap.get(record.user_id)?.nickname}的${record.piece_title}练习录音`} /> : <span className="text-muted-foreground">未录音</span> },
  ]
  if (user?.role !== 'teacher') return null
  return <div className="space-y-6"><AdminPageHeader title="练习记录" description="查看最近 500 条学生练习记录，有效时长不包含暂停时间。录音使用服务端签名地址。" /><div className="flex flex-wrap items-end gap-3"><div className="space-y-2"><Label htmlFor="records-search">搜索</Label><Input id="records-search" className="w-56" placeholder="学生昵称或曲名" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="space-y-2"><Label>班级</Label><Select value={className} onValueChange={setClassName}><SelectTrigger className="w-40" aria-label="筛选记录班级"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem><SelectItem value="unassigned">未分班</SelectItem>{classes.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="records-start">开始日期</Label><Input id="records-start" className="w-44" type="date" value={start} onChange={event => setStart(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="records-end">结束日期</Label><Input id="records-end" className="w-44" type="date" value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} /></div></div>{start && end && start > end ? <AdminNotice message="结束日期不能早于开始日期" /> : error ? <AdminNotice message={error} onRetry={() => void load()} /> : <AdminTable rows={rows} columns={columns} rowKey={record => record.id} emptyText={loading ? '正在读取练习记录…' : '暂无符合条件的练习记录'} />}</div>
}
