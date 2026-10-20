'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { Loader2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage, jsonBody, teachingApi } from '@/components/teaching/api'
import type { SessionUser } from '@/lib/auth-profile-types'
import { useUser } from '@/lib/user-context'

function syncedAt(value: string | undefined) {
  if (!value) return '需重新登录同步'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '需重新登录同步'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(date)
}

export function UserProfile({ user, children }: { user: SessionUser; children?: ReactNode }) {
  const { refreshSession } = useUser()
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [joinSuccess, setJoinSuccess] = useState('')
  async function joinClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (joining || !code.trim()) return
    setJoining(true)
    setJoinError('')
    setJoinSuccess('')
    try {
      const result = await teachingApi<{ class: { id: string; name: string } }>('/api/classes/join', { method: 'POST', ...jsonBody({ code: code.trim() }) })
      await refreshSession()
      setCode('')
      setJoinSuccess(`已加入“${result.class.name}”`)
    } catch (cause: unknown) { setJoinError(errorMessage(cause)) }
    finally { setJoining(false) }
  }
  const profile = user.auth_profile
  const fields = [
    ['真实姓名', profile?.real_name || (profile ? '未提供' : '需重新登录同步')],
    ['学校', profile?.school_name || '未提供'],
    ['学工号', profile?.account_number || '未提供'],
    ['超星 UID', profile?.provider_uid || '未提供'],
    ['超星学校 ID', profile?.provider_fid || '未提供'],
    ['认证角色', profile?.roles.map(role => role.roleName || role.roleId).filter(Boolean).join('、') || '未提供'],
    ['课堂身份', user.role === 'teacher' ? '教师' : '学生'],
    ['当前班级', user.class_name || '未设置'],
    ['最后同步时间', syncedAt(profile?.verified_at)],
  ]
  return <Dialog>
    <DialogTrigger asChild>{children ?? <Button variant="ghost" size="sm"><UserRound className="size-4" />我的资料</Button>}</DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto font-sans sm:max-w-lg">
      <DialogHeader><DialogTitle>我的资料</DialogTitle><DialogDescription>查看当前登录账号的认证信息与课堂资料。</DialogDescription></DialogHeader>
      <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="size-5" /></div><div className="min-w-0"><p className="break-words font-semibold">{user.display_name}</p><p className="mt-1 text-xs text-muted-foreground">{user.role === 'teacher' ? '教师账号' : '学生账号'}</p></div></div>
      {!profile && <p className="text-sm text-muted-foreground">当前会话尚未同步认证资料，请退出后重新登录。</p>}
      <dl className="divide-y divide-border">{fields.map(([label, value]) => <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="break-words text-foreground">{value}</dd></div>)}</dl>
      {user.role === 'student' && <form onSubmit={event => void joinClass(event)} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <div><Label htmlFor="student-class-code">加入班级</Label><p id="student-class-code-help" className="mt-1.5 text-xs leading-relaxed text-muted-foreground">输入教师提供的 8 位入班码。每人当前加入一个班级，加入新班级将更换原班级归属。</p></div>
        <div className="flex gap-2"><Input id="student-class-code" aria-describedby="student-class-code-help" placeholder="输入 8 位入班码" value={code} onChange={event => { setCode(event.target.value.toUpperCase()); setJoinError(''); setJoinSuccess('') }} maxLength={8} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={joining} className="font-mono tracking-widest" /><Button type="submit" disabled={joining || code.trim().length !== 8}>{joining && <Loader2 className="size-4 animate-spin" />}{joining ? '加入中…' : '加入班级'}</Button></div>
        {joinError && <p role="alert" className="text-sm text-destructive">{joinError}</p>}
        {joinSuccess && <p role="status" className="text-sm text-primary">{joinSuccess}</p>}
      </form>}
    </DialogContent>
  </Dialog>
}
