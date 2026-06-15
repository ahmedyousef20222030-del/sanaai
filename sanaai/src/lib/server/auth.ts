import { headers } from 'next/headers'
import { supabaseAdmin } from './supabase'
import { AuthenticationError, AuthorizationError } from '@/lib/errors'
import { AuthUser, UserRole, Permission, rolePermissions } from '@/lib/types'

export async function getAuthToken(): Promise<string | null> {
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  if (!authHeader) return null
  const [, token] = authHeader.split('Bearer ')
  return token || null
}

export async function getCurrentUser(): Promise<AuthUser> {
  const token = await getAuthToken()
  if (!token) {
    throw new AuthenticationError('Missing authentication token')
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      throw new AuthenticationError('Invalid or expired token')
    }

    const role = (user.user_metadata?.role as UserRole) || UserRole.Employee
    const tenantId = (user.user_metadata?.tenant_id as string) || user.id

    if (!Object.values(UserRole).includes(role)) {
      throw new AuthenticationError('Invalid user role')
    }

    return {
      id: user.id,
      email: user.email,
      role,
      tenantId,
      permissions: rolePermissions[role] || [],
    }
  } catch (error) {
    if (error instanceof AuthenticationError) throw error
    console.error('Auth error:', error)
    throw new AuthenticationError('Failed to authenticate user')
  }
}

export function checkPermission(user: AuthUser, required: Permission): void {
  if (!user.permissions.includes(required)) {
    throw new AuthorizationError(`Permission denied. Required: ${required}`)
  }
}

export function checkAnyPermission(user: AuthUser, required: Permission[]): void {
  if (!required.some((p) => user.permissions.includes(p))) {
    throw new AuthorizationError(`Permission denied. Required any of: ${required.join(', ')}`)
  }
}

export function checkAdmin(user: AuthUser): void {
  if (user.role !== UserRole.Admin) {
    throw new AuthorizationError('Admin access required')
  }
}

export async function requireAuth() {
  try {
    return await getCurrentUser()
  } catch (error) {
    throw error
  }
}