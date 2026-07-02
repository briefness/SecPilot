const USER_KEY = 'secops_user'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'DEVELOPER' | 'AUDITOR' | 'VIEWER' | string
  mfaEnabled?: boolean
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getUser(): AuthUser | null {
  const userStr = localStorage.getItem(USER_KEY)
  if (!userStr) return null
  try {
    return JSON.parse(userStr) as AuthUser
  } catch {
    return null
  }
}

export function clearAuth(): void {
  localStorage.removeItem(USER_KEY)
}

export function isAuthenticated(): boolean {
  return !!getUser()
}
