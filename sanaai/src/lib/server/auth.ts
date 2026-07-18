import { headers } from 'next/headers'
import { supabaseAdmin } from './supabase'
import { AuthenticationError, AuthorizationError } from '@/lib/errors'
import { AuthUser, UserRole, Permission, DbUserRow, derivePermissions } from '@/lib/types'

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

  // Step 1 — AUTHENTICATION: verify this is a genuine, unexpired Supabase
  // session token. This only tells us WHO is calling; it says nothing
  // about their role/tenant/permissions.
  const {
    data: { user: authUser },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token)

  if (authError || !authUser) {
    throw new AuthenticationError('Invalid or expired token')
  }

  // Step 2 — AUTHORIZATION: role, tenant_id and permission flags are read
  // from public.users — the exact same table every RLS policy in this
  // project uses via get_tenant_id()/get_my_tenant_id()
  // (`SELECT tenant_id FROM public.users WHERE id = auth.uid()`).
  //
  // 🔒 We deliberately do NOT read role/tenant_id from the JWT's
  // user_metadata or app_metadata. user_metadata is writable by the
  // signed-in user themselves via supabase.auth.updateUser({ data }))
  // from the browser — trusting it here would let anyone hand
  // themselves any role or any tenant_id when calling our API routes.
  // app_metadata would avoid that specific problem, but would then be a
  // SECOND source of truth that has to be kept in sync with this table
  // (and with the `handle_new_user` trigger, and with RLS) — an
  // unnecessary and error-prone duplication. public.users is already the
  // single source of truth for every other part of this system, so we
  // read from it here too.
  const { data: row, error: rowError } = await supabaseAdmin
    .from('users')
    .select(
      'id, tenant_id, role, is_active, can_edit_production, can_edit_orders, can_manage_sales, can_manage_users, can_view_clients',
    )
    .eq('id', authUser.id)
    .single<DbUserRow>()

  if (rowError || !row) {
    throw new AuthenticationError('User profile not found — account may not be fully provisioned')
  }

  if (!row.is_active) {
    throw new AuthenticationError('This account has been deactivated')
  }

  if (!Object.values(UserRole).includes(row.role as UserRole)) {
    // Defensive check only — the DB CHECK constraint `users_role_check`
    // should already make this unreachable, but we never trust blindly.
    throw new AuthenticationError('Invalid user role')
  }

  return {
    id: row.id,
    email: authUser.email,
    role: row.role as UserRole,
    tenantId: row.tenant_id,
    permissions: derivePermissions(row),
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

/** Owner and Admin are the only roles allowed to perform tenant-wide
 * destructive/administrative actions that have no dedicated boolean
 * column (e.g. deleting another user's account). */
export function checkOwnerOrAdmin(user: AuthUser): void {
  if (user.role !== UserRole.Owner && user.role !== UserRole.Admin) {
    throw new AuthorizationError('Owner or Admin access required')
  }
}

export async function requireAuth() {
  return getCurrentUser()
}