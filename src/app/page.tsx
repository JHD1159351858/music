'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, ClipboardCheck, FolderArchive, GraduationCap, Map, MessagesSquare, Music, Pause, Play, Sparkles, Timer, UserRound } from 'lucide-react'
import { useUser, type DemoUser } from '@/lib/user-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChatPanel } from '@/components/chat-panel'
import { LoginDialog } from '@/components/auth/login-dialog'
import { UserProfile } from '@/components/auth/user-profile'
import { JourneyAtmosphere } from '@/components/home/journey-atmosphere'

interface PortalEntry {
  label: string
  detail: string
  href: string
  icon: typeof Music
  box: [number, number, number, number]
  artwork: [number, number, number, number]
}

const HOME_SCENE = '/home/music-journey-motion-v2.webp'
const MODULE_ARTWORK = '/home/music-journey-clean.webp'

const ENTRIES: PortalEntry[] = [
  { label: '音乐史地图区', detail: '走进作曲家的音乐世界', href: '/map', icon: Map, box: [44.1, 16.2, 18.2, 10.5], artwork: [44.3, 16.3, 5.7, 10.5] },
  { label: '练琴社区', detail: '师生互动 · 互助答疑', href: '/community', icon: MessagesSquare, box: [68.8, 22.4, 18.5, 10.5], artwork: [68.8, 22.4, 5.7, 10.5] },
  { label: '曲库知识图谱', detail: '课程专属曲库', href: '/practice', icon: BookOpen, box: [9.1, 45.9, 11.1, 24.3], artwork: [9.7, 46.1, 9.5, 16.9] },
  { label: '练习任务引擎', detail: '教师任务 · 在线练习', href: '/tasks', icon: Timer, box: [25.1, 59.5, 11.8, 24.3], artwork: [26.4, 59.8, 9.5, 16.9] },
  { label: '练习档案', detail: '录音回溯 · 数据归集', href: '/practice?tab=history', icon: FolderArchive, box: [63.7, 59.5, 11.8, 24.3], artwork: [64.5, 59.9, 9.5, 16.9] },
  { label: '测评评阅', detail: '任务提交 · 教师反馈', href: '/tasks', icon: ClipboardCheck, box: [80.8, 45.9, 11.2, 24.3], artwork: [81.1, 46.1, 9.5, 16.9] },
  { label: '乐谱解析区', detail: '调性和声 · 结构分析', href: '/analysis', icon: BookOpen, box: [22.7, 31, 17.6, 10.7], artwork: [22.5, 31, 5.8, 10.8] },
]

function hotspotStyle([left, top, width, height]: PortalEntry['box']): CSSProperties {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }
}

export default function LandingPage() {
  const { user, loading, teacherPending, logout } = useUser()
  const router = useRouter()
  const [identityOpen, setIdentityOpen] = useState(false)
  const [identityRole, setIdentityRole] = useState<DemoUser['role'] | null>('student')
  const [chatOpen, setChatOpen] = useState(false)
  const [destination, setDestination] = useState('/practice')
  const [error, setError] = useState('')
  const [loginAttempt, setLoginAttempt] = useState(0)
  const [motionPaused, setMotionPaused] = useState(false)
  const pageRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const directEntryHandled = useRef(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    setMotionPaused(preference.matches)
    const changed = (event: MediaQueryListEvent) => setMotionPaused(event.matches)
    preference.addEventListener('change', changed)
    return () => preference.removeEventListener('change', changed)
  }, [])

  useEffect(() => {
    const page = pageRef.current
    const stage = stageRef.current
    if (!page || !stage || motionPaused || !window.matchMedia('(pointer: fine)').matches) return
    let frame = 0
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        stage.style.setProperty('--scene-x', `${(event.clientX / window.innerWidth - 0.5) * 12}px`)
        stage.style.setProperty('--scene-y', `${(event.clientY / window.innerHeight - 0.5) * 10}px`)
      })
    }
    const reset = () => {
      cancelAnimationFrame(frame)
      stage.style.setProperty('--scene-x', '0px')
      stage.style.setProperty('--scene-y', '0px')
    }
    page.addEventListener('pointermove', move)
    page.addEventListener('pointerleave', reset)
    return () => {
      page.removeEventListener('pointermove', move)
      page.removeEventListener('pointerleave', reset)
      reset()
    }
  }, [motionPaused])

  const chooseIdentity = useCallback((href: string, role: DemoUser['role'] | null = null, message = '') => {
    setDestination(href)
    setIdentityRole(role ?? 'student')
    setError(message)
    setLoginAttempt((value) => value + 1)
    setIdentityOpen(true)
  }, [])

  useEffect(() => {
    if (loading || directEntryHandled.current) return
    directEntryHandled.current = true
    const query = new URLSearchParams(window.location.search)
    const role = query.get('role')
    const requestedNext = query.get('next')
    const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') && !requestedNext.includes('\\') ? requestedNext : '/practice'
    const errors: Record<string, string> = {
      config: '超星认证尚未完成配置，请联系管理员。',
      expired: '认证请求已过期，请重新登录。',
      verification: '超星身份验证未通过，请重新登录。',
      role: '当前超星账号不具备所选课堂身份，请更换身份或联系管理员。',
      unavailable: '超星认证暂时不可用，请稍后重试。',
    }
    const authError = query.get('auth_error')
    if (teacherPending || query.get('login') === 'teacher') chooseIdentity(next, 'teacher')
    else if (authError) chooseIdentity(next, null, errors[authError] ?? '登录未完成，请重新认证。')
    else if (role === 'student' || role === 'teacher') chooseIdentity(role === 'teacher' ? '/teacher' : '/practice', role)
    else if (query.get('login') === '1') chooseIdentity(next)
    else if (query.get('assistant') === '1') {
      if (user) setChatOpen(true)
      else chooseIdentity('/?assistant=1')
    }
  }, [loading, teacherPending, user, chooseIdentity])

  function navigate(href: string) {
    if (loading) return
    if (user) router.push(href)
    else chooseIdentity(href)
  }

  function openAssistant() {
    if (loading) return
    if (user) setChatOpen(true)
    else chooseIdentity('/?assistant=1')
  }

  function enterRole(role: DemoUser['role']) {
    if (user?.role === role) router.push(role === 'teacher' ? '/teacher' : '/practice')
    else chooseIdentity(role === 'teacher' ? '/teacher' : '/practice', role)
  }

  async function leave() {
    try {
      await logout()
      setChatOpen(false)
      router.replace('/')
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '退出登录失败，请重试。')
    }
  }

  return (
    <main className="journey-page" ref={pageRef} data-motion={motionPaused ? 'paused' : 'running'}>
      <h1 className="sr-only">知音 · 钢琴知音之旅</h1>
      <div className="journey-stage" ref={stageRef}>
        {/* 原画背景与模块分层，所有可点击图形随自己的按钮一起运动。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="journey-backdrop" src={HOME_SCENE} alt="黑金音乐厅中的悬浮琴键与金色乐径" width={1672} height={941} fetchPriority="high" />
        <JourneyAtmosphere />
        <nav aria-label="知音主页面功能入口" className="journey-hotspots">
          {ENTRIES.map((entry, index) => (
            <button key={entry.label} className={`journey-hotspot journey-module${index < 2 || entry.href === '/analysis' ? ' journey-module-wide' : ''}`} style={{ ...hotspotStyle(entry.box), '--float-delay': `${-index * 1.2}s` } as CSSProperties} aria-label={entry.label} title={`${entry.label} · ${entry.detail}`} onClick={() => navigate(entry.href)}>
              <span className="journey-module-visual">
                <span className="journey-medallion" aria-hidden="true">
                  <svg viewBox={entry.artwork.map((value, axis) => value * (axis % 2 === 0 ? 38.4 : 21.6)).join(' ')}><image href={MODULE_ARTWORK} width={3840} height={2160} /></svg>
                </span>
                <span className="journey-module-copy"><strong>{entry.label}</strong><small>{entry.detail}</small></span>
              </span>
            </button>
          ))}
          <button className="journey-hotspot journey-assistant" style={hotspotStyle([43.8, 51, 12.4, 33])} aria-label="AI助教" title="AI 助教 · 智能答疑与学习辅助" onClick={openAssistant}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="journey-robot"><img src="/home/journey-robot.png" alt="" width={852} height={1049} /></span>
            <span className="journey-module-copy"><strong>AI 助教</strong><small>智能答疑与学习辅助</small></span>
          </button>
          <button className="journey-hotspot journey-start" style={hotspotStyle([40.5, 89, 19.1, 8])} aria-label="开始弹奏吧！" onClick={() => navigate('/practice?tab=queue')}><span>开始弹奏吧！</span></button>
        </nav>
      </div>
      <nav className="journey-entry" aria-label="学生与教师入口">
        <Button variant="outline" onClick={() => enterRole('student')} disabled={loading}><BookOpen className="size-4" />学生入口</Button>
        <Button variant="outline" onClick={() => enterRole('teacher')} disabled={loading}><GraduationCap className="size-4" />教师入口</Button>
      </nav>
      <div className="journey-account">
        <span className="journey-account-caption"><span>以乐会友 · 以琴知音</span><Button className="journey-motion-toggle" variant="ghost" size="sm" aria-pressed={motionPaused} onClick={() => setMotionPaused(value => !value)}>{motionPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}{motionPaused ? '开启动效' : '暂停动效'}</Button></span>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {user && <UserProfile user={user}><Button variant="ghost" size="sm" className="shrink-0 px-1.5 text-xs sm:px-3 sm:text-sm"><UserRound className="size-4" />我的资料</Button></UserProfile>}
          <Button variant="ghost" size="sm" className="min-w-0 px-1.5 text-xs sm:px-3 sm:text-sm" onClick={() => user ? void leave() : chooseIdentity('/practice')} disabled={loading}>
            {!user && <UserRound className="size-4" />}<span className="max-w-[50vw] truncate">{user ? `${user.display_name} · ${user.role === 'teacher' ? '教师' : '学生'} · 退出登录` : '未登录 / 登录'}</span>
          </Button>
        </div>
        {error && !identityOpen && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <section className="journey-mobile-menu" aria-label="功能快捷入口">
        <div className="mb-5"><h2 className="font-serif text-2xl text-primary">开启你的音乐之旅</h2><p className="mt-2 text-sm text-muted-foreground">每一次练习，都让音乐更近一步。</p></div>
        <div className="grid grid-cols-2 gap-3">
          {ENTRIES.map((entry) => <button key={entry.label} onClick={() => navigate(entry.href)} className="rounded-xl border border-primary/20 bg-card p-4 text-left transition hover:border-primary/50"><entry.icon className="mb-3 size-6 text-primary" /><span className="block text-sm font-medium">{entry.label}</span><span className="mt-1 block text-xs text-muted-foreground">{entry.detail}</span></button>)}
          <button onClick={openAssistant} className="rounded-xl border border-primary/20 bg-card p-4 text-left"><Sparkles className="mb-3 size-6 text-primary" /><span className="block text-sm font-medium">AI 助教</span><span className="mt-1 block text-xs text-muted-foreground">智能答疑与学习辅助</span></button>
        </div>
        <Button className="mt-5 w-full" onClick={() => navigate('/practice?tab=queue')}><Music className="size-4" />开始弹奏吧！</Button>
      </section>
      <LoginDialog key={loginAttempt} open={identityOpen} onOpenChange={setIdentityOpen} role={identityRole} onRoleChange={setIdentityRole} next={destination} initialError={error} />
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle className="font-serif text-primary">AI 助教</DialogTitle><DialogDescription>聊聊乐理、作品理解，或今天练琴时遇到的问题。</DialogDescription></DialogHeader><ChatPanel className="h-[min(60dvh,540px)]" placeholder="向知音提问…" /></DialogContent>
      </Dialog>
    </main>
  )
}
