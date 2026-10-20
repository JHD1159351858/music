'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { AuthProfile, SessionUser } from '@/lib/auth-profile-types'

export type DemoUser = SessionUser

function readAuthProfile(value: unknown): AuthProfile | null {
  if (!value || typeof value !== 'object') return null
  if (!('real_name' in value) || (value.real_name !== null && typeof value.real_name !== 'string') ||
    !('account_number' in value) || (value.account_number !== null && typeof value.account_number !== 'string') ||
    !('school_name' in value) || (value.school_name !== null && typeof value.school_name !== 'string') ||
    !('provider_uid' in value) || typeof value.provider_uid !== 'string' ||
    !('provider_fid' in value) || typeof value.provider_fid !== 'string' ||
    !('verified_at' in value) || typeof value.verified_at !== 'string' ||
    !('roles' in value) || !Array.isArray(value.roles)) return null
  const roles: AuthProfile['roles'] = []
  for (const item of value.roles) {
    if (!item || typeof item !== 'object' || !('roleId' in item) || typeof item.roleId !== 'string' || !('roleName' in item) || typeof item.roleName !== 'string') return null
    roles.push({ roleId: item.roleId, roleName: item.roleName })
  }
  return { real_name: value.real_name, account_number: value.account_number, school_name: value.school_name, provider_uid: value.provider_uid, provider_fid: value.provider_fid, verified_at: value.verified_at, roles }
}

interface UserContextValue {
  user: DemoUser | null
  loading: boolean
  teacherPending: boolean
  refreshSession: () => Promise<void>
  logout: () => Promise<void>
}

const UserContext = createContext<UserContextValue | null>(null)
const STORAGE_KEY = 'zhiyin_user'

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [teacherPending, setTeacherPending] = useState(false)
  const sessionRequest = useRef(0)

  const refreshSession = useCallback(async () => {
    const request = ++sessionRequest.current
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' })
      if (!response.ok) throw new Error('暂时无法读取登录状态，请重试。')
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object' || !('user' in data)) throw new Error('登录状态返回异常，请重试。')
      const profile = data.user
      let nextUser: DemoUser | null = null
      if (profile !== null) {
        if (profile && typeof profile === 'object' && 'id' in profile && typeof profile.id === 'string' && 'nickname' in profile && typeof profile.nickname === 'string' && 'role' in profile && (profile.role === 'student' || profile.role === 'teacher')) {
          nextUser = {
            id: profile.id,
            nickname: profile.nickname,
            role: profile.role,
            class_name: 'class_name' in profile && typeof profile.class_name === 'string' ? profile.class_name : null,
            display_name: 'display_name' in profile && typeof profile.display_name === 'string' && profile.display_name.trim() ? profile.display_name : profile.nickname,
            auth_profile: 'auth_profile' in profile ? readAuthProfile(profile.auth_profile) : null,
          }
        } else throw new Error('登录状态返回异常，请重试。')
      }
      if (request !== sessionRequest.current) return
      const pending = 'teacherPending' in data && data.teacherPending === true
      setUser(pending ? null : nextUser)
      setTeacherPending(pending)
    } catch (cause: unknown) {
      if (request === sessionRequest.current) {
        setUser(null)
        setTeacherPending(false)
      }
      throw cause
    }
  }, [])

  useEffect(() => {
    let active = true
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    void refreshSession().catch(() => undefined).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [refreshSession])

  const logout = useCallback(async () => {
    ++sessionRequest.current
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    if (!response.ok) throw new Error('退出登录失败，请重试。')
    setUser(null)
    setTeacherPending(false)
  }, [])

  return (
    <UserContext.Provider value={{ user, loading, teacherPending, refreshSession, logout }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}

/** 页面守卫：未登录时返回首页认证，并保留目标页面。 */
export function useRequireUser() {
  const { user, loading } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    if (!loading && !user) router.replace(`/?login=1&next=${encodeURIComponent(pathname + window.location.search)}`)
  }, [loading, user, router, pathname])
  return { user, loading }
}
