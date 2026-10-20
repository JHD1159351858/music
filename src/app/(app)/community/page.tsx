'use client'

import { useCallback, useEffect, useState } from 'react'
import { useUser } from '@/lib/user-context'
import { ChatPanel } from '@/components/chat-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { teachingApi, jsonBody, errorMessage } from '@/components/teaching/api'
import { lessonFocusText } from '@/lib/community-export'
import { cn } from '@/lib/utils'
import { Heart, MessageSquare, Plus, Megaphone, ClipboardList, Send, Download, LockKeyhole, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Comment {
  id: string
  content?: string
  created_at?: string
  profiles?: { nickname: string; role?: string }
}
interface Post {
  id: string
  user_id: string
  title: string
  content: string
  category: string
  ask_teacher: boolean
  recipient_teacher_id: string | null
  recipient_nickname?: string | null
  marked_for_lesson: boolean
  like_count: number
  created_at: string
  profiles?: { nickname: string }
  comments?: Comment[]
  post_likes?: { user_id: string }[]
}
interface Teacher { id: string; nickname: string }
const CATEGORIES = [
  { value: 'all', label: '全部' }, { value: 'method', label: '练习方法' },
  { value: 'theory', label: '乐理知识' }, { value: 'repertoire', label: '选曲建议' },
  { value: 'performance', label: '演出经验' }, { value: 'other', label: '其他' },
]
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(category => [category.value, category.label]))
const EMPTY_FORM = { title: '', content: '', category: 'method', ask_teacher: false, recipient_teacher_id: '' }

export default function CommunityPage() {
  const { user } = useUser()
  const isTeacher = user?.role === 'teacher'
  const [posts, setPosts] = useState<Post[]>([])
  const [messages, setMessages] = useState<Post[]>([])
  const [helpPosts, setHelpPosts] = useState<Post[]>([])
  const [lessonFocus, setLessonFocus] = useState<Post[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [tab, setTab] = useState('community')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('latest')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[] | undefined>>({})
  const [commentDraft, setCommentDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [privateMessage, setPrivateMessage] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setLoadError('')
    try {
      const query = `category=${category}&sort=${sort}`
      const [publicPosts, directMessages, focus, help] = await Promise.all([
        teachingApi<Post[]>(`/api/posts?${query}`),
        teachingApi<Post[]>('/api/posts?view=messages'),
        isTeacher ? teachingApi<Post[]>('/api/posts?view=focus') : Promise.resolve([] as Post[]),
        isTeacher ? teachingApi<Post[]>('/api/posts?ask_teacher=true') : Promise.resolve([] as Post[]),
      ])
      setPosts(publicPosts)
      setPage(0)
      setHasMore(publicPosts.length === 100)
      setMessages(directMessages)
      setLessonFocus(focus)
      setHelpPosts(help)
    } catch (error: unknown) { setLoadError(errorMessage(error)) }
    finally { setLoading(false) }
  }, [user, isTeacher, category, sort])

  useEffect(() => { void load() }, [load])

  const openCompose = async (privateMode: boolean) => {
    setPrivateMessage(privateMode)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
    if (privateMode) {
      try { setTeachers(await teachingApi<Teacher[]>('/api/teachers')) }
      catch (error: unknown) { toast.error(errorMessage(error)) }
    }
  }
  const submitPost = async () => {
    if (!user || busy) return
    setBusy(true)
    try {
      await teachingApi('/api/posts', { method: 'POST', ...jsonBody({ ...form, recipient_teacher_id: privateMessage ? form.recipient_teacher_id : null }) })
      toast.success(privateMessage ? '留言已发送' : '发布成功')
      setDialogOpen(false)
      setTab(privateMessage ? 'inbox' : 'community')
      await load()
    } catch (error: unknown) { toast.error(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const toggleLike = async (post: Post) => {
    if (busy) return
    setBusy(true)
    try {
      await teachingApi(`/api/posts/${post.id}/like`, { method: 'POST', ...jsonBody({}) })
      await load()
    } catch (error: unknown) { toast.error(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const toggleExpand = async (postId: string) => {
    if (expanded === postId) { setExpanded(null); return }
    setExpanded(postId)
    setCommentDraft('')
    setCommentsMap(current => ({ ...current, [postId]: undefined }))
    try {
      const list = await teachingApi<Comment[]>(`/api/comments?post_id=${postId}`)
      setCommentsMap(current => ({ ...current, [postId]: list }))
    } catch (error: unknown) { toast.error(errorMessage(error)); setExpanded(null) }
  }
  const submitComment = async (postId: string) => {
    if (!commentDraft.trim() || busy) return
    setBusy(true)
    try {
      await teachingApi('/api/comments', { method: 'POST', ...jsonBody({ post_id: postId, content: commentDraft }) })
      setCommentDraft('')
      const list = await teachingApi<Comment[]>(`/api/comments?post_id=${postId}`)
      setCommentsMap(current => ({ ...current, [postId]: list }))
      await load()
    } catch (error: unknown) { toast.error(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const toggleMark = async (post: Post) => {
    if (busy) return
    setBusy(true)
    try {
      await teachingApi(`/api/posts/${post.id}`, { method: 'PATCH', ...jsonBody({ marked_for_lesson: !post.marked_for_lesson }) })
      toast.success(post.marked_for_lesson ? '已移出回课清单' : '已加入回课清单')
      await load()
    } catch (error: unknown) { toast.error(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const loadMore = async () => {
    if (loading) return
    setLoading(true)
    try {
      const nextPage = page + 1
      const next = await teachingApi<Post[]>(`/api/posts?category=${category}&sort=${sort}&page=${nextPage}`)
      setPosts(current => [...current, ...next.filter(post => !current.some(existing => existing.id === post.id))])
      setPage(nextPage)
      setHasMore(next.length === 100)
    } catch (error: unknown) { toast.error(errorMessage(error)) }
    finally { setLoading(false) }
  }
  const exportFocus = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF', lessonFocusText(lessonFocus)], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = '知音-下节课回课重点.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!user) return null
  const inbox = isTeacher ? [...messages, ...helpPosts].sort((a, b) => b.created_at.localeCompare(a.created_at)) : messages
  const visible = tab === 'inbox' ? inbox : posts

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-serif text-3xl font-bold text-foreground">练琴社区</h1><p className="mt-1 text-sm text-muted-foreground">用昵称交流真实问题，也可以给老师留言或向知音提问。</p></div>
        {!isTeacher && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void openCompose(true)}><LockKeyhole className="mr-1.5 h-4 w-4" />给老师留言</Button><Button onClick={() => void openCompose(false)}><Plus className="mr-1.5 h-4 w-4" />发帖</Button></div>}
      </header>

      {isTeacher && <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /><h2 className="font-serif text-lg font-semibold">下节课回课重点</h2><Badge variant="outline">{lessonFocus.length} 条</Badge><Button className="ml-auto gap-1.5" size="sm" variant="outline" onClick={exportFocus} disabled={!lessonFocus.length || busy || loading}><Download className="h-4 w-4" />导出完整清单</Button></div>
        <p className="mb-3 text-xs text-muted-foreground">每位教师独立维护自己的重点。导出包含问题正文及交流记录，请妥善保存师生私密留言。</p>
        {!lessonFocus.length ? <p className="text-sm text-muted-foreground">在帖子或留言上标记“下节课当面指导”，会自动汇总到这里。</p> : <ul className="max-h-80 space-y-3 overflow-y-auto">{lessonFocus.map(post => <li key={post.id} className="rounded-lg bg-card px-4 py-3"><div className="flex items-start gap-2"><span className="flex-1 text-sm font-medium">{post.title}</span><span className="text-xs text-muted-foreground">{post.profiles?.nickname}{post.recipient_teacher_id ? ' · 私密留言' : ''}</span><Button size="sm" variant="ghost" onClick={() => void toggleMark(post)} disabled={busy}>移出</Button></div><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{post.content}</p></li>)}</ul>}
      </section>}

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="community">社区帖子</TabsTrigger><TabsTrigger value="inbox">{isTeacher ? '学生求助与留言' : '我的师生留言'}{inbox.length > 0 && <span className="ml-1.5 tabular-nums">{inbox.length}</span>}</TabsTrigger><TabsTrigger value="assistant"><Sparkles className="mr-1.5 h-4 w-4" />智能答疑</TabsTrigger></TabsList>
        <TabsContent value="assistant"><div className="mb-4 text-sm text-muted-foreground">围绕课程知识点、术语或练习问题提问。演奏水平与艺术处理建议仅供参考，具体由任课教师指导。</div><ChatPanel className="h-[min(70dvh,640px)]" placeholder="例如：怎样练习连奏与跳音？" /></TabsContent>
        {tab !== 'assistant' && <TabsContent value={tab} className="space-y-6">
          {tab === 'community' ? <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{CATEGORIES.map(item => <Button key={item.value} size="sm" variant={category === item.value ? 'default' : 'outline'} onClick={() => setCategory(item.value)}>{item.label}</Button>)}</div><Select value={sort} onValueChange={setSort}><SelectTrigger className="w-32" aria-label="帖子排序"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="latest">最新发布</SelectItem><SelectItem value="popular">点赞最多</SelectItem></SelectContent></Select></div> : <p className="text-sm text-muted-foreground">{isTeacher ? '公开求助和发给您的私密留言汇总在此，点击“查看与回复”直接交流。' : '只有您与所选收件教师可以查看这些留言及回复。'}</p>}
          {loadError && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-4 text-sm"><span className="flex-1">{loadError}</span><Button size="sm" variant="outline" onClick={() => void load()}>重新加载</Button></div>}
          <div className="space-y-4">{visible.map(post => {
            const liked = post.post_likes?.some(like => like.user_id === user.id)
            const commentList = commentsMap[post.id]
            const commentCount = commentList?.length ?? post.comments?.length ?? 0
            return <article key={post.id} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{CATEGORY_LABEL[post.category] ?? post.category}</Badge>{post.recipient_teacher_id ? <Badge variant="outline" className="gap-1 border-primary/40 text-primary"><LockKeyhole className="h-3 w-3" />私密留言</Badge> : post.ask_teacher && <Badge variant="outline" className="gap-1 text-primary"><Megaphone className="h-3 w-3" />求助老师</Badge>}{post.marked_for_lesson && <Badge variant="outline" className="text-primary">已排入我的回课</Badge>}<span className="ml-auto">{post.profiles?.nickname ?? '未命名用户'}{post.recipient_nickname ? ` → ${post.recipient_nickname}` : ''} · {new Date(post.created_at).toLocaleDateString('zh-CN')}</span></div>
              <h3 className="mt-3 font-serif text-lg font-semibold">{post.title}</h3><p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{post.content}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">{!post.recipient_teacher_id && <Button variant="ghost" size="sm" className={cn('gap-1.5 px-0', liked ? 'text-primary' : 'text-muted-foreground')} disabled={busy} onClick={() => void toggleLike(post)} aria-label={liked ? '取消点赞' : '点赞'}><Heart className={cn('h-4 w-4', liked && 'fill-current')} />{post.like_count}</Button>}<Button variant="ghost" size="sm" className="gap-1.5 px-0 text-muted-foreground" onClick={() => void toggleExpand(post.id)}><MessageSquare className="h-4 w-4" />{expanded === post.id ? '收起回复' : '查看与回复'} · {commentCount}</Button>{isTeacher && <Button variant="ghost" size="sm" className="ml-auto text-xs" disabled={busy} onClick={() => void toggleMark(post)}>{post.marked_for_lesson ? '移出回课清单' : '标记下节课当面指导'}</Button>}</div>
              {expanded === post.id && <div className="mt-4 space-y-3 border-t border-border pt-4">{!commentList ? <p className="text-sm text-muted-foreground">正在读取回复…</p> : <>{commentList.map(comment => <div key={comment.id} className="rounded-lg bg-muted/40 px-4 py-2.5 text-sm"><span className={cn('mr-2 font-medium', comment.profiles?.role === 'teacher' ? 'text-primary' : 'text-foreground')}>{comment.profiles?.nickname ?? '未命名用户'}{comment.profiles?.role === 'teacher' && '（老师）'}</span><span className="whitespace-pre-wrap text-muted-foreground">{comment.content}</span></div>)}{!commentList.length && <p className="text-sm text-muted-foreground">还没有回复。</p>}</>}<div className="flex items-end gap-2"><Textarea placeholder={isTeacher ? '回复这位同学…' : '写下你的评论或补充问题…'} rows={2} value={commentDraft} onChange={event => setCommentDraft(event.target.value)} maxLength={10000} /><Button size="icon" disabled={!commentDraft.trim() || busy} onClick={() => void submitComment(post.id)} aria-label="发送回复"><Send className="h-4 w-4" /></Button></div></div>}
            </article>
          })}{!visible.length && !loadError && <p className="py-16 text-center text-muted-foreground">{loading ? '正在读取…' : tab === 'inbox' ? '暂时没有求助或留言。' : '这个分类下还没有帖子。'}</p>}</div>
          {tab === 'community' && hasMore && <div className="text-center"><Button variant="outline" disabled={loading} onClick={() => void loadMore()}>{loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}查看更多帖子</Button></div>}
        </TabsContent>}
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{privateMessage ? '给老师留言' : '发一条新帖子'}</DialogTitle><DialogDescription>{privateMessage ? '请按实际授课关系选择教师，留言仅您与收件教师可见。' : '分享练习经验，或描述遇到的问题。'}</DialogDescription></DialogHeader><div className="space-y-4">
        {privateMessage && <div className="space-y-2"><Label>收件教师</Label><Select value={form.recipient_teacher_id} onValueChange={value => setForm({ ...form, recipient_teacher_id: value })}><SelectTrigger><SelectValue placeholder="选择任课教师" /></SelectTrigger><SelectContent>{teachers.map(teacher => <SelectItem key={teacher.id} value={teacher.id}>{teacher.nickname}</SelectItem>)}</SelectContent></Select>{!teachers.length && <p className="text-xs text-muted-foreground">暂无可选教师，请确认教师已登录创建账号。</p>}</div>}
        <div className="space-y-2"><Label htmlFor="community-title">标题</Label><Input id="community-title" placeholder="例如：这段跳音怎样练？" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} maxLength={200} /></div>
        <div className="space-y-2"><Label htmlFor="community-content">正文</Label><Textarea id="community-content" placeholder="描述你的问题或想分享的经验…" rows={4} value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} maxLength={10000} /></div>
        <div className="flex flex-wrap gap-2">{CATEGORIES.filter(item => item.value !== 'all').map(item => <Button key={item.value} size="sm" variant={form.category === item.value ? 'default' : 'outline'} onClick={() => setForm({ ...form, category: item.value })}>{item.label}</Button>)}</div>
        {!privateMessage && <label className="flex items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={form.ask_teacher} onCheckedChange={value => setForm({ ...form, ask_teacher: value === true })} />求助老师（帖子保持公开，并进入教师求助区）</label>}
        <Button className="w-full" onClick={() => void submitPost()} disabled={busy || !form.title.trim() || !form.content.trim() || privateMessage && !form.recipient_teacher_id}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{privateMessage ? '发送私密留言' : '发布'}</Button>
      </div></DialogContent></Dialog>
    </div>
  )
}
