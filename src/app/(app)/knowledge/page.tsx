'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { useRequireUser } from '@/lib/user-context'
import type { CourseKnowledge } from '@/lib/course-knowledge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ChatPanel } from '@/components/chat-panel'
import { teachingApi, jsonBody, errorMessage } from '@/components/teaching/api'
import { toast } from 'sonner'

const empty = { title: '', content: '', keywords: '', source_url: '' }

export default function KnowledgePage() {
  const { user } = useRequireUser()
  const [entries, setEntries] = useState<CourseKnowledge[]>([])
  const [draft, setDraft] = useState(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setEntries(await teachingApi<CourseKnowledge[]>('/api/knowledge')) }
    catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (user) void load() }, [user, load])
  if (!user) return null
  const isTeacher = user.role === 'teacher'
  const visible = entries.filter(entry => `${entry.title} ${entry.content} ${entry.keywords.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  async function save() {
    setBusy(true)
    try {
      await teachingApi(editing ? `/api/knowledge/${editing}` : '/api/knowledge', {
        method: editing ? 'PATCH' : 'POST',
        ...jsonBody({ ...draft, source_url: draft.source_url.trim() || null, keywords: draft.keywords.split(/[,，\n]/).map(term => term.trim()).filter(Boolean) }),
      })
      setDraft(empty); setEditing(null); setShowForm(false)
      toast.success('课程知识已保存')
      await load()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function remove(entry: CourseKnowledge) {
    if (!window.confirm(`删除“${entry.title}”？删除后智能答疑将不再引用该内容。`)) return
    setBusy(true)
    try {
      await teachingApi(`/api/knowledge/${entry.id}`, { method: 'DELETE' })
      if (editing === entry.id) { setDraft(empty); setEditing(null); setShowForm(false) }
      await load()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="font-serif text-3xl font-bold">{isTeacher ? '课程知识库' : '课程知识与答疑'}</h1><p className="mt-2 text-sm text-muted-foreground">{isTeacher ? '维护你提供的课程资料，作为乐曲导读与答疑的依据。' : '查阅教师收录的知识，围绕课程内容继续提问。'}未收录的问题会明确提示超出范围。</p></div>
      {isTeacher && <Button onClick={() => { setDraft(empty); setEditing(null); setShowForm(true) }}><Plus className="mr-2 h-4 w-4" />新增知识</Button>}
    </header>
    {showForm && isTeacher && <form className="space-y-4 rounded-xl border border-primary/30 bg-card p-5" onSubmit={event => { event.preventDefault(); void save() }}>
      <h2 className="font-serif text-lg font-semibold">{editing ? '编辑知识' : '新增知识'}</h2>
      <div className="space-y-2"><Label htmlFor="knowledge-title">知识标题</Label><Input id="knowledge-title" required maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="knowledge-content">课程内容</Label><Textarea id="knowledge-content" required rows={7} maxLength={12000} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} placeholder="填写已经确认的教学内容；可包含术语、练习方法、乐曲背景与允许使用的分析指标。" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="knowledge-keywords">检索词（用逗号分隔，最多16项）</Label><Input id="knowledge-keywords" value={draft.keywords} onChange={event => setDraft({ ...draft, keywords: event.target.value })} placeholder="连奏，legato" /><p className="text-xs text-muted-foreground">乐曲资料请将完整曲名加入检索词，背景字段可按“创作年代：…”等格式录入。</p></div>
        <div className="space-y-2"><Label htmlFor="knowledge-source">参考链接（选填）</Label><Input id="knowledge-source" type="url" value={draft.source_url} onChange={event => setDraft({ ...draft, source_url: event.target.value })} placeholder="https://" /></div>
      </div>
      <div className="flex gap-3"><Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存知识'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setShowForm(false)}>取消</Button></div>
    </form>}
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="space-y-4 lg:col-span-3">
        <Input aria-label="搜索课程知识" placeholder="搜索知识点、术语或乐曲…" value={query} onChange={event => setQuery(event.target.value)} />
        {loading ? <p className="text-sm text-muted-foreground">正在读取课程资料…</p> : error ? <div role="alert" className="rounded-xl border border-border p-6"><p>{error}</p><Button className="mt-3" variant="outline" onClick={() => void load()}>重试</Button></div> : visible.length === 0 ? <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground"><BookOpen className="mx-auto mb-3 h-7 w-7" /><p>{entries.length ? '未找到匹配的知识。' : '尚未收录课程知识。'}{isTeacher && '添加资料后，智能答疑才能引用课程内容。'}</p></div> : visible.map(entry => <article key={entry.id} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3"><h2 className="font-serif text-xl font-semibold">{entry.title}</h2>{isTeacher && <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`编辑${entry.title}`} disabled={busy} onClick={() => { setEditing(entry.id); setDraft({ ...entry, keywords: entry.keywords.join('，'), source_url: entry.source_url ?? '' }); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`删除${entry.title}`} disabled={busy} onClick={() => void remove(entry)}><Trash2 className="h-4 w-4" /></Button></div>}</div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{entry.content}</p>
          {!!entry.keywords.length && <p className="mt-4 text-xs text-muted-foreground">检索词：{entry.keywords.join(' · ')}</p>}
          {entry.source_url && <a className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline" href={entry.source_url} target="_blank" rel="noopener noreferrer">参考资料<ExternalLink className="h-3 w-3" /></a>}
        </article>)}
      </section>
      <aside className="lg:col-span-2"><ChatPanel className="h-[640px] lg:sticky lg:top-6" placeholder="围绕已收录的课程内容提问…" /></aside>
    </div>
  </div>
}
