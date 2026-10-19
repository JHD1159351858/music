'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useRequireUser, useUser } from '@/lib/user-context'
import { cn } from '@/lib/utils'
import { AdminShell } from '@/components/teacher/admin-shell'
import { UserProfile } from '@/components/auth/user-profile'
import {
  Music,
  Timer,
  MessagesSquare,
  Map,
  BarChart3,
  LogOut,
  House,
  ClipboardList,
  BookOpen,
  UserRound,
} from 'lucide-react'

const NAV = [
  { href: '/', label: '知音首页', icon: House, roles: ['student', 'teacher'] },
  { href: '/practice', label: '琴谱与练习', icon: Timer, roles: ['student', 'teacher'] },
  { href: '/tasks', label: '练习任务与评阅', icon: ClipboardList, roles: ['student', 'teacher'] },
  { href: '/knowledge', label: '课程知识与答疑', icon: BookOpen, roles: ['student', 'teacher'] },
  { href: '/community', label: '练琴社区', icon: MessagesSquare, roles: ['student', 'teacher'] },
  { href: '/map', label: '音乐史地图', icon: Map, roles: ['student', 'teacher'] },
  { href: '/stats', label: '练琴数据', icon: BarChart3, roles: ['student', 'teacher'] },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireUser()
  const { logout } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const [logoutError, setLogoutError] = useState('')

  async function leave() {
    try {
      await logout()
      router.replace('/')
    } catch (cause: unknown) {
      setLogoutError(cause instanceof Error ? cause.message : '退出登录失败，请重试。')
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        加载中…
      </div>
    )
  }

  const items = NAV.filter((n) => n.roles.includes(user.role))

  if (pathname.startsWith('/practice/session/')) return <main>{children}</main>
  if (user.role === 'teacher') return <AdminShell>{children}</AdminShell>

  return (
    <div className="flex min-h-screen">
      {/* 侧边导航 */}
      <aside className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 backdrop-blur md:inset-y-0 md:right-auto md:w-60 md:flex-col md:border-t-0 md:border-r">
        <Link href="/" className="hidden items-center gap-3 px-6 py-6 md:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Music className="h-5 w-5" />
          </div>
          <div>
            <div className="font-serif text-xl font-bold text-foreground">知音</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Music Companion
            </div>
          </div>
        </Link>
        <nav aria-label="课堂导航" className="flex flex-1 gap-1 overflow-x-auto p-2 md:mt-2 md:block md:space-y-1 md:px-3">
          {items.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 flex-col items-center gap-1 rounded-lg px-3 py-2.5 text-xs transition-all md:flex-row md:gap-3 md:text-sm',
                  active
                    ? 'bg-primary/12 font-medium text-primary shadow-[inset_2px_0_0_0_var(--primary)]'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="hidden border-t border-border p-4 md:block">
          <div className="mb-3 px-2">
            <div className="break-words text-sm font-medium text-foreground">{user.display_name}</div>
            <div className="text-xs text-muted-foreground">
              学生
            </div>
          </div>
          <UserProfile user={user}><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"><UserRound className="h-4 w-4" />我的资料</button></UserProfile>
          <button
            onClick={() => void leave()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
          {logoutError && <p role="alert" className="mt-2 px-2 text-xs text-destructive">{logoutError}</p>}
        </div>
      </aside>
      {/* 内容区 */}
      <main className="min-h-screen min-w-0 flex-1 bg-background pb-24 md:ml-60 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  )
}
