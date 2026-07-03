export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'DEVELOPER' | 'AUDITOR' | 'VIEWER' | string
  mfaEnabled?: boolean
}

let currentUser: AuthUser | null = null
let initPromise: Promise<AuthUser | null> | null = null

export async function fetchUser(): Promise<AuthUser | null> {
  const { default: api } = await import('./api')
  try {
    const res = await api.get('/auth/me') as any
    currentUser = res?.user ?? null
    return currentUser
  } catch {
    currentUser = null
    return null
  }
}

export function initAuth(): Promise<AuthUser | null> {
  if (!initPromise) {
    initPromise = fetchUser()
  }
  return initPromise
}

export function setUser(user: AuthUser): void {
  currentUser = user
}

export function getUser(): AuthUser | null {
  return currentUser
}

export function clearAuth(): void {
  currentUser = null
  initPromise = null
}

export function isAuthenticated(): boolean {
  return !!currentUser
}
