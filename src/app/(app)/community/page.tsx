'use client'

import { useEffect, useMemo, useState } from 'react'
import { useUser } from '@/lib/user-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Heart, MessageSquare, Plus, Megaphone, ClipboardList, Send } from 'lucide-react'
import { toast } from 'sonner'

interface Comment {
  id: string
  content: string
  created_at: string
  profiles?: { nickname: string; role: string }
}

interface Post {
  id: string
  user_id: string
  title: string
  content: string
  category: string
  ask_teacher: boolean
  marked_for_lesson: boolean
  like_count: number
  created_at: string
  profiles?: { nickname: string }
  comments?: { id: string }[]
  post_likes?: { user_id: string }[]
}

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'method', label: '练习方法' },
  { value: 'theory', label: '乐理知识' },
  { value: 'repertoire', label: '选曲建议' },
  { value: 'performance', label: '演出经验' },
  { value: 'other', label: '其他' },
]
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]))

export default function CommunityPage() {
  const { user } = useUser()
  const [posts, setPosts] = useState<Post[]>([])
  const [category, setCategory] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({})
  const [commentDraft, setCommentDraft] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', category: 'method', ask_teacher: false })
  const isTeacher = user?.role === 'teacher'

  const load = () => {
    fetch('/api/posts')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setPosts(d))
      .catch(() => {})
  }
  useEffect(load, [])

  const filtered = useMemo(
    () => posts.filter((p) => category === 'all' || p.category === category),
    [posts, category]
  )
  const lessonFocus = posts.filter((p) => p.marked_for_lesson)

  const submitPost = async () => {
    if (!user || !form.title.trim() || !form.content.trim()) return
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, user_id: user.id }),
    })
    if (res.ok) {
      toast.success('发布成功')
      setDialogOpen(false)
      setForm({ title: '', content: '', category: 'method', ask_teacher: false })
      load()
    } else toast.error('发布失败')
  }

  const toggleLike = async (post: Post) => {
    if (!user) return
    const res = await fetch(`/api/posts/${post.id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id }),
    })
    if (res.ok) load()
  }

  const toggleExpand = async (postId: string) => {
    if (expanded === postId) {
      setExpanded(null)
      return
    }
    setExpanded(postId)
    if (!commentsMap[postId]) {
      const res = await fetch(`/api/comments?post_id=${postId}`)
      if (res.ok) {
        const list = await res.json()
        setCommentsMap((m) => ({ ...m, [postId]: list }))
      }
    }
  }

  const submitComment = async (postId: string) => {
    if (!user || !commentDraft.trim()) return
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, user_id: user.id, content: commentDraft }),
    })
    if (res.ok) {
      setCommentDraft('')
      const list = await fetch(`/api/comments?post_id=${postId}`).then((r) => r.json())
      setCommentsMap((m) => ({ ...m, [postId]: list }))
      load()
    }
  }

  const toggleMark = async (post: Post) => {
    const res = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marked_for_lesson: !post.marked_for_lesson }),
    })
    if (res.ok) {
      toast.success(post.marked_for_lesson ? '已移出回课清单' : '已加入回课清单')
      load()
    }
  }

  if (!user) return null

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">练琴社区</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            用昵称交流练琴中的真实问题 · 卡住的段落、看不懂的术语，都可以发出来
          </p>
        </div>
        {!isTeacher && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5">
                <Plus className="h-4 w-4" /> 发帖
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>发一条新帖子</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="标题"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <Textarea
                  placeholder="描述你的问题或想分享的经验…"
                  rows={4}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setForm({ ...form, category: c.value })}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        form.category === c.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={form.ask_teacher}
                    onCheckedChange={(v) => setForm({ ...form, ask_teacher: v === true })}
                  />
                  求助老师（这条帖会进入老师的留言区）
                </label>
                <Button className="w-full" onClick={submitPost} disabled={!form.title.trim() || !form.content.trim()}>
                  发布
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </header>

      {/* 教师端：回课重点清单 */}
      {isTeacher && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-lg font-semibold text-foreground">下节课回课重点</h2>
            <Badge variant="outline" className="border-primary/40 text-primary">
              {lessonFocus.length} 条
            </Badge>
          </div>
          {lessonFocus.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              在学生留言或帖子上点击「标记回课」，会自动汇总到这里。
            </p>
          ) : (
            <ul className="space-y-2">
              {lessonFocus.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-card px-4 py-2.5 text-sm">
                  <span className="text-foreground">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{p.profiles?.nickname}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              category === c.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 帖子列表 */}
      <div className="space-y-4">
        {filtered.map((p) => {
          const liked = !!user && p.post_likes?.some((l) => l.user_id === user.id)
          return (
            <article
              key={p.id}
              className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{CATEGORY_LABEL[p.category] ?? p.category}</Badge>
                {p.ask_teacher && (
                  <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/15">
                    <Megaphone className="h-3 w-3" /> 求助老师
                  </Badge>
                )}
                {p.marked_for_lesson && (
                  <Badge variant="outline" className="border-chart-3/50 text-chart-3">
                    已排入回课
                  </Badge>
                )}
                <span className="ml-auto">
                  {p.profiles?.nickname ?? '匿名'} · {new Date(p.created_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <h3 className="mt-3 font-serif text-lg font-semibold text-foreground">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.content}</p>

              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={() => toggleLike(p)}
                  className={cn(
                    'flex items-center gap-1.5 text-sm transition-colors',
                    liked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
                  {p.like_count}
                </button>
                <button
                  onClick={() => toggleExpand(p.id)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <MessageSquare className="h-4 w-4" />
                  {p.comments?.length ?? 0}
                </button>
                {isTeacher && (
                  <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => toggleMark(p)}>
                    {p.marked_for_lesson ? '移出回课清单' : '标记下节课当面指导'}
                  </Button>
                )}
              </div>

              {expanded === p.id && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  {(commentsMap[p.id] ?? []).map((c) => (
                    <div key={c.id} className="rounded-lg bg-muted/40 px-4 py-2.5 text-sm">
                      <span
                        className={cn(
                          'mr-2 font-medium',
                          c.profiles?.role === 'teacher' ? 'text-primary' : 'text-foreground'
                        )}
                      >
                        {c.profiles?.nickname ?? '匿名'}
                        {c.profiles?.role === 'teacher' && (
                          <span className="ml-1 text-xs">（老师）</span>
                        )}
                      </span>
                      <span className="text-muted-foreground">{c.content}</span>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder={isTeacher ? '回复这位同学…' : '写下你的评论…'}
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitComment(p.id)}
                    />
                    <Button size="icon" onClick={() => submitComment(p.id)} disabled={!commentDraft.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
        {filtered.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">这个分类下还没有帖子</p>
        )}
      </div>

      {/* 教师端：学生留言 */}
      {isTeacher && <TeacherInbox posts={posts.filter((p) => p.ask_teacher)} onMark={toggleMark} />}
    </div>
  )
}

function TeacherInbox({ posts, onMark }: { posts: Post[]; onMark: (p: Post) => void }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
        <Megaphone className="h-5 w-5 text-primary" />
        学生求助留言
        <Badge variant="outline">{posts.length}</Badge>
      </h2>
      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂时没有学生求助。</p>
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/30 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{p.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.profiles?.nickname} · {p.content}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onMark(p)}>
                {p.marked_for_lesson ? '移出回课清单' : '排入下节课'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
