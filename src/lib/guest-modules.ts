export const GUEST_MODULE_PATHS = ['/practice', '/analysis', '/tasks', '/community', '/map', '/stats'] as const

export type GuestModulePath = typeof GUEST_MODULE_PATHS[number]

export function isGuestModulePath(pathname: string): pathname is GuestModulePath {
  return GUEST_MODULE_PATHS.some(path => path === pathname)
}
