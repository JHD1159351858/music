export interface AuthProfile {
  real_name: string | null
  account_number: string | null
  school_name: string | null
  provider_uid: string
  provider_fid: string
  roles: { roleId: string; roleName: string }[]
  verified_at: string
}

export interface SessionUser {
  id: string
  nickname: string
  role: 'student' | 'teacher'
  class_name: string | null
  display_name: string
  auth_profile: AuthProfile | null
}
