'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Download, MessagesSquare, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireUser } from '@/lib/user-context'
import { lessonFocusText } from '@/lib/community-export'
import { errorMessage, jsonBody, teachingApi, teachingDate } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import '@/components/teacher/detail-workspaces.css'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Comment { id: string; content?: string; created_at?: string; profiles?: { nickname: string; role?: string } }
interface Post {
  id: string; title: string; content: string; category: string; created_at: string
  ask_teacher: boolean; recipient_teacher_id: string | null; marked_for_lesson: boolean
  profiles?: { nickname: string }; comments?: Comment[]
}
const CATEGORIES = [
  { value: 'all', label: '全部分类' }, { value: 'method', label: '练习方法' },
  { value: 'theory', label: '乐理知识' }, { value: 'repertoire', label: '选曲建议' },
  { value: 'performance', label: '演出经验' }, { value: 'other', label: '其他' },
]
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(item => [item.value, item.label]))

async function publicPosts(): Promise<Post[]> {
  const result: Post[] = []
  for (let page = 0; ; page++) {
    const posts = await teachingApi<Post[]>(`/api/posts?page=${page}`)
    result.push(...posts)
    if (posts.length < 100) return result
  }
}

export default function TeacherCommunityPage() {
  const { user } = useRequireUser()
  const [posts, setPosts] = useState<Post[]>([])
  const [messages, setMessages] = useState<Post[]>([])
  const [focus, setFocus] = useState<Post[]>([])
  const [view, setView] = useState('public')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState('')
  const [commentsRevision, setCommentsRevision] = useState(0)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (user?.role !== 'teacher') return
    setLoading(true)
    setError('')
    try {
      const [publicList, messageList, focusList] = await Promise.all([publicPosts(), teachingApi<Post[]>('/api/posts?view=messages'), teachingApi<Post[]>('/api/posts?view=focus')])
      setPosts(publicList)
      setMessages(messageList)
      setFocus(focusList)
      setSelected(current => current ? [...publicList, ...messageList].find(post => post.id === current.id) ?? null : null)
    } catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])
  const selectedId = selected?.id
  useEffect(() => {
    if (!selectedId) return
    let active = true
    setComments([])
    setCommentsError('')
    setCommentsLoading(true)
    setDraft('')
    void teachingApi<Comment[]>(`/api/comments?post_id=${encodeURIComponent(selectedId)}`).then(list => { if (active) setComments(list) }).catch((cause: unknown) => { if (active) setCommentsError(errorMessage(cause)) }).finally(() => { if (active) setCommentsLoading(false) })
    return () => { active = false }
  }, [selectedId, commentsRevision])
  async function toggleMark(post: Post) {
    if (busy) return
    setBusy(true)
    try { await teachingApi(`/api/posts/${post.id}`, { method: 'PATCH', ...jsonBody({ marked_for_lesson: !post.marked_for_lesson }) }); toast.success(post.marked_for_lesson ? '已移出回课清单' : '已标记下节课当面指导'); await load() }
    catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function remove(post: Post) {
    if (busy || !window.confirm(`确认删除「${post.title}」及其交流记录？此操作无法撤销。`)) return
    setBusy(true)
    try { await teachingApi(`/api/posts/${post.id}`, { method: 'DELETE' }); toast.success('内容已删除'); await load() }
    catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !draft.trim() || busy) return
    setBusy(true)
    try {
      await teachingApi('/api/comments', { method: 'POST', ...jsonBody({ post_id: selected.id, content: draft.trim() }) })
      setComments(await teachingApi<Comment[]>(`/api/comments?post_id=${encodeURIComponent(selected.id)}`))
      setDraft('')
      setCommentsError('')
      toast.success('回复已发送')
      await load()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  function exportFocus() {
    const url = URL.createObjectURL(new Blob(['\uFEFF', lessonFocusText(focus)], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = '知音-下节课回课重点.txt'
    link.click()
    URL.revokeObjectURL(url)
  }
  const source = view === 'messages' ? messages : view === 'focus' ? focus : view === 'help' ? posts.filter(post => post.ask_teacher) : posts
  const rows = source.filter(post => (category === 'all' || post.category === category) && `${post.title} ${post.content} ${post.profiles?.nickname ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const columns: AdminColumn<Post>[] = [
    { key: 'title', label: '帖子 / 留言', render: post => <div className="max-w-sm"><button className="text-left font-medium hover:text-primary hover:underline" disabled={busy} aria-pressed={selected?.id === post.id} onClick={() => setSelected(post)}>{post.title}</button><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.content}</p></div> },
    { key: 'student', label: '发布昵称', render: post => post.profiles?.nickname ?? '未命名用户' },
    { key: 'category', label: '分类 / 来源', render: post => <div className="space-y-1"><p>{CATEGORY_LABEL[post.category] ?? post.category}</p><Badge variant="secondary">{post.recipient_teacher_id ? '私密留言' : post.ask_teacher ? '求助教师' : '社区帖子'}</Badge></div> },
    { key: 'date', label: '发布时间', render: post => teachingDate(post.created_at) },
    { key: 'mark', label: '回课状态', render: post => <Badge variant={post.marked_for_lesson ? 'default' : 'outline'}>{post.marked_for_lesson ? '已加入回课' : '未标记'}</Badge> },
    { key: 'actions', label: '操作', render: post => <div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelected(post)}>查看与回复</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void toggleMark(post)}>{post.marked_for_lesson ? '移出回课' : '标记回课'}</Button><Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => void remove(post)}>删除</Button></div> },
  ]
  if (user?.role !== 'teacher') return null
  return <div className="teacher-detail-workspace space-y-6">
    <AdminPageHeader title="社区管理" description="管理社区内容、回应学生求助，维护您自己的下节课回课重点。私密留言仅参与师生可见。" actions={<Button variant="outline" disabled={loading || busy || !focus.length} onClick={exportFocus}><Download className="mr-2 h-4 w-4" />导出回课清单（{focus.length}）</Button>} />
    <Tabs value={view} onValueChange={setView} className="space-y-5">
      <TabsList className="teacher-community-tabs" aria-label="内容视图"><TabsTrigger value="public">社区帖子</TabsTrigger><TabsTrigger value="help">公开求助</TabsTrigger><TabsTrigger value="messages">学生私密留言</TabsTrigger><TabsTrigger value="focus">我的回课清单</TabsTrigger></TabsList>
      <TabsContent value={view} className="teacher-detail-grid">
        <section className="min-w-0" aria-label="社区内容列表">
          <div className="teacher-detail-toolbar"><Input aria-label="搜索社区内容" className="w-64" placeholder="搜索标题、正文或学生昵称" value={search} onChange={event => setSearch(event.target.value)} /><Select value={category} onValueChange={setCategory}><SelectTrigger className="w-40" aria-label="社区分类"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
          {error ? <AdminNotice message={error} onRetry={() => void load()} /> : <AdminTable rows={rows} columns={columns} rowKey={post => post.id} emptyText={loading ? '正在读取社区内容…' : '暂无符合条件的内容'} />}
        </section>
        <aside className="teacher-detail-panel" aria-labelledby="community-panel-title">
          <header><div><h2 id="community-panel-title">{selected?.title ?? '查看与回复'}</h2>{selected && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{selected.profiles?.nickname} · {teachingDate(selected.created_at)}{selected.recipient_teacher_id ? ' · 师生私密留言' : ''}</p>}</div>{selected && <Button variant="ghost" size="icon" aria-label="收起社区回复" disabled={busy} onClick={() => setSelected(null)}><X className="size-4" /></Button>}</header>
          {selected ? <>
            <p className="whitespace-pre-wrap break-words text-sm leading-7">{selected.content}</p>
            <div className="mt-5 border-t border-border pt-4"><h3 className="mb-3 text-sm font-semibold">交流记录</h3>{commentsLoading ? <p className="text-sm text-muted-foreground">正在读取交流记录…</p> : commentsError ? <AdminNotice message={commentsError} onRetry={() => setCommentsRevision(current => current + 1)} /> : comments.length ? <div className="teacher-community-thread space-y-3">{comments.map(comment => <div key={comment.id} className="rounded-lg bg-muted/50 p-3 text-sm"><p className="font-medium">{comment.profiles?.nickname ?? '未命名用户'}{comment.profiles?.role === 'teacher' ? '（教师）' : ''}<span className="ml-2 text-xs font-normal text-muted-foreground">{comment.created_at ? teachingDate(comment.created_at) : ''}</span></p><p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{comment.content}</p></div>)}</div> : <p className="text-sm text-muted-foreground">暂无回复</p>}</div>
            <form className="teacher-community-reply space-y-3" onSubmit={reply}><Label htmlFor="community-reply">教师回复</Label><Textarea id="community-reply" rows={3} maxLength={10000} placeholder="回复这位同学…" value={draft} onChange={event => setDraft(event.target.value)} /><div className="flex justify-between gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void toggleMark(selected)}>{selected.marked_for_lesson ? '移出回课清单' : '标记下节课当面指导'}</Button><Button disabled={busy || !draft.trim()}>{busy ? '处理中…' : '发送回复'}</Button></div></form>
          </> : <div className="teacher-detail-empty"><MessagesSquare className="mb-4 size-7 text-primary" /><p>选择左侧帖子或留言，阅读交流记录并回复学生，也可标记为下节课回课重点。</p></div>}
        </aside>
      </TabsContent>
    </Tabs>
  </div>
}
