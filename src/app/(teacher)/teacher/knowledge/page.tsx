'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireUser } from '@/lib/user-context'
import type { CourseKnowledge } from '@/lib/course-knowledge'
import { errorMessage, jsonBody, teachingApi, teachingDate } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const EMPTY_FORM = { title: '', content: '', keywords: '', source_url: '' }

export default function TeacherKnowledgePage() {
  const { user } = useRequireUser()
  const [entries, setEntries] = useState<CourseKnowledge[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CourseKnowledge | null | undefined>(undefined)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (user?.role !== 'teacher') return
    setLoading(true)
    setError('')
    try { setEntries(await teachingApi<CourseKnowledge[]>('/api/knowledge')) }
    catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])
  function edit(entry: CourseKnowledge | null) {
    setEditing(entry)
    setForm(entry ? { title: entry.title, content: entry.content, keywords: entry.keywords.join('，'), source_url: entry.source_url ?? '' } : EMPTY_FORM)
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const keywords = [...new Set(form.keywords.split(/[,，、\n]/).map(word => word.trim()).filter(Boolean))]
    if (keywords.length > 16 || keywords.some(word => word.length > 60)) { toast.error('关键词最多 16 个，每个不超过 60 字'); return }
    setBusy(true)
    try {
      await teachingApi(editing ? `/api/knowledge/${editing.id}` : '/api/knowledge', { method: editing ? 'PATCH' : 'POST', ...jsonBody({ title: form.title.trim(), content: form.content.trim(), keywords, source_url: form.source_url.trim() || null }) })
      toast.success('课程知识已保存')
      setEditing(undefined)
      await load()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function remove(entry: CourseKnowledge) {
    if (busy || !window.confirm(`确认删除知识条目「${entry.title}」？`)) return
    setBusy(true)
    try { await teachingApi(`/api/knowledge/${entry.id}`, { method: 'DELETE' }); toast.success('知识条目已删除'); await load() }
    catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  const rows = entries.filter(entry => `${entry.title} ${entry.content} ${entry.keywords.join(' ')}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const columns: AdminColumn<CourseKnowledge>[] = [
    { key: 'title', label: '知识标题', render: entry => <div className="max-w-sm"><p className="font-medium">{entry.title}</p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{entry.content}</p></div> },
    { key: 'keywords', label: '关键词', render: entry => <div className="flex max-w-56 flex-wrap gap-1">{entry.keywords.length ? entry.keywords.map(word => <Badge key={word} variant="secondary">{word}</Badge>) : <span className="text-muted-foreground">未设置</span>}</div> },
    { key: 'source', label: '参考来源', render: entry => entry.source_url ? <a className="text-primary hover:underline" href={entry.source_url} target="_blank" rel="noreferrer">查看参考链接</a> : <span className="text-muted-foreground">未附链接</span> },
    { key: 'date', label: '创建时间', render: entry => teachingDate(entry.created_at) },
    { key: 'actions', label: '操作', render: entry => <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => edit(entry)} disabled={busy}>编辑</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(entry)} disabled={busy}>删除</Button></div> },
  ]
  if (user?.role !== 'teacher') return null
  return <div className="space-y-6"><AdminPageHeader title="课程知识" description="管理您录入的课程知识，供学生在课程答疑中检索参考。" actions={<Button onClick={() => edit(null)}><Plus className="mr-2 h-4 w-4" />新增知识</Button>} /><Input aria-label="搜索课程知识" className="max-w-sm" placeholder="搜索标题、正文或关键词" value={search} onChange={event => setSearch(event.target.value)} />{error ? <AdminNotice message={error} onRetry={() => void load()} /> : <AdminTable rows={rows} columns={columns} rowKey={entry => entry.id} emptyText={loading ? '正在读取课程知识…' : '暂无符合条件的知识条目'} />}<Dialog open={editing !== undefined} onOpenChange={open => { if (!open && !busy) setEditing(undefined) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? '编辑课程知识' : '新增课程知识'}</DialogTitle><DialogDescription>填写知识正文、检索关键词和可选参考来源。</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={save}><div className="space-y-2"><Label htmlFor="knowledge-title">知识标题</Label><Input id="knowledge-title" required maxLength={160} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="knowledge-content">知识正文</Label><Textarea id="knowledge-content" required rows={9} maxLength={12000} value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="knowledge-keywords">关键词</Label><Input id="knowledge-keywords" placeholder="用逗号分隔，最多 16 个" value={form.keywords} onChange={event => setForm({ ...form, keywords: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="knowledge-source">参考链接（选填）</Label><Input id="knowledge-source" type="url" placeholder="https://" value={form.source_url} onChange={event => setForm({ ...form, source_url: event.target.value })} /></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(undefined)}>取消</Button><Button disabled={busy}>{busy ? '保存中…' : '保存知识'}</Button></div></form></DialogContent></Dialog></div>
}
