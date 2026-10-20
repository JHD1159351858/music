'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, GraduationCap, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useUser, type DemoUser } from '@/lib/user-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: DemoUser['role'] | null
  onRoleChange: (role: DemoUser['role']) => void
  next: string
  initialError?: string
}

export function LoginDialog({ open, onOpenChange, role, onRoleChange, next, initialError = '' }: LoginDialogProps) {
  const { teacherPending, refreshSession } = useUser()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (!teacherPending && !role)) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(teacherPending ? '/api/auth/teacher' : '/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teacherPending ? { password } : { role, next }),
      })
      const data: unknown = await response.json()
      if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '登录暂时不可用，请重试。')
      if (teacherPending) {
        if (!data || typeof data !== 'object' || !('redirectTo' in data) || typeof data.redirectTo !== 'string') throw new Error('登录响应异常，请重试。')
        await refreshSession()
        setPassword('')
        onOpenChange(false)
        router.replace(data.redirectTo.startsWith('/') && !data.redirectTo.startsWith('//') && !data.redirectTo.includes('\\') ? data.redirectTo : '/')
        setBusy(false)
      } else {
        if (!data || typeof data !== 'object' || !('url' in data) || typeof data.url !== 'string') throw new Error('认证地址暂时不可用，请重试。')
        window.location.assign(data.url)
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '登录暂时不可用，请重试。')
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!busy) { if (!value) setPassword(''); onOpenChange(value) } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-primary">{teacherPending ? '教师安全验证' : '登录知音课堂'}</DialogTitle>
          <DialogDescription>{teacherPending ? '超星身份已验证，请输入教师安全密码，完成教师登录。' : '请选择课堂身份，通过超星统一认证后进入。教师还需完成安全密码验证。'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void authenticate(event)} className="space-y-5">
          {teacherPending ? (
            <div className="space-y-2">
              <Label htmlFor="teacher-security-password">教师安全密码</Label>
              <Input id="teacher-security-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="登录身份">
              <Button type="button" variant={role === 'student' ? 'default' : 'outline'} aria-pressed={role === 'student'} disabled={busy} onClick={() => { onRoleChange('student'); setError('') }}><BookOpen className="size-4" />学生登录</Button>
              <Button type="button" variant={role === 'teacher' ? 'default' : 'outline'} aria-pressed={role === 'teacher'} disabled={busy} onClick={() => { onRoleChange('teacher'); setError('') }}><GraduationCap className="size-4" />教师登录</Button>
            </div>
          )}
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || (!teacherPending && !role)}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{busy ? teacherPending ? '正在验证…' : '正在跳转超星认证…' : teacherPending ? '验证并进入教师端' : '前往超星认证登录'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
