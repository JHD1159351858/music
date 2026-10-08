'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useRequireUser, useUser } from '@/lib/user-context'
import { cn } from '@/lib/utils'
import {
  Music,
  Timer,
  FileMusic,
  MessagesSquare,
  Map,
  BarChart3,
  LogOut,
} from 'lucide-react'

const NAV = [
  { href: '/practice', label: '练琴记录', icon: Timer, roles: ['student', 'teacher'] },
  { href: '/analysis', label: '乐谱分析', icon: FileMusic, roles: ['student'] },
  { href: '/community', label: '练琴社区', icon: MessagesSquare, roles: ['student', 'teacher'] },
  { href: '/map', label: '音乐史地图', icon: Map, roles: ['student'] },
  { href: '/stats', label: '数据分析', icon: BarChart3, roles: ['teacher'] },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireUser()
  const { logout } = useUser()
  const pathname = usePathname()
  const router = useRouter()

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        加载中…
      </div>
    )
  }

  const items = NAV.filter((n) => n.roles.includes(user.role))

  return (
    <div className="flex min-h-screen">
      {/* 侧边导航 */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card/60 backdrop-blur">
        <Link href="/practice" className="flex items-center gap-3 px-6 py-6">
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
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {items.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all',
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
        <div className="border-t border-border p-4">
          <div className="mb-3 px-2">
            <div className="text-sm font-medium text-foreground">{user.nickname}</div>
            <div className="text-xs text-muted-foreground">
              {user.role === 'teacher' ? '教师' : '学生'}
            </div>
          </div>
          <button
            onClick={() => {
              logout()
              router.replace('/')
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            切换身份
          </button>
        </div>
      </aside>
      {/* 内容区 */}
      <main className="ml-60 min-h-screen flex-1 bg-background">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
