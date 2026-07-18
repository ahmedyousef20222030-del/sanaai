// ═══════════════════════════════════════════════════════════════
// Role definitions — MUST stay in sync with the DB CHECK constraint
// `users_role_check` on public.users:
//   CHECK (role = ANY (ARRAY['owner','admin','sales','production',
//                            'design','shipping','hr','accountant','employee']))
// These are job-function labels, NOT a permission hierarchy — the real
// authorization data lives in the boolean columns below.
// ═══════════════════════════════════════════════════════════════
export enum UserRole {
  Owner = 'owner',
  Admin = 'admin',
  Sales = 'sales',
  Production = 'production',
  Design = 'design',
  Shipping = 'shipping',
  HR = 'hr',
  Accountant = 'accountant',
  Employee = 'employee',
}

// Matches CHECK constraint `users_target_type_check`
export const TARGET_TYPES = ['جنيه', 'قطع', 'تصميم', 'شحنة', 'ليدز', 'طلبات'] as const
export type TargetType = (typeof TARGET_TYPES)[number]

// The exact shape of a row from public.users needed for authorization.
// Field names match the real columns 1:1 — do not rename without also
// checking auth.ts, which selects these exact column names.
export interface DbUserRow {
  id: string
  tenant_id: string
  role: string
  is_active: boolean
  can_edit_production: boolean
  can_edit_orders: boolean
  can_manage_sales: boolean
  can_manage_users: boolean
  can_view_clients: boolean
}

// ═══════════════════════════════════════════════════════════════
// Permissions — app-level actions. These are kept as named constants
// (rather than checking booleans ad-hoc everywhere) so API routes read
// clearly, e.g. `checkPermission(user, Permission.OrdersUpdate)`.
// ═══════════════════════════════════════════════════════════════
export enum Permission {
  ClientsRead = 'clients:read',
  ClientsCreate = 'clients:create',
  ClientsUpdate = 'clients:update',
  ClientsDelete = 'clients:delete',

  OrdersRead = 'orders:read',
  OrdersCreate = 'orders:create',
  OrdersUpdate = 'orders:update',
  OrdersDelete = 'orders:delete',

  ProductionRead = 'production:read',
  ProductionUpdate = 'production:update',

  UsersCreate = 'users:create',
  UsersUpdate = 'users:update',
  UsersDelete = 'users:delete',

  FilesUpload = 'files:upload',
  FilesDelete = 'files:delete',
}

/**
 * Derives the effective Permission list for a user from their real DB row.
 *
 * Design decisions (documented because the DB does not model every
 * permission explicitly — these are judgment calls, revisit if the
 * intended business rules differ):
 *
 * - READS: `tenant_isolation_policy` RLS is `ALL` (tenant-wide) for orders
 *   and production, so any active tenant member may read them here too.
 *   Clients is the one entity the DB explicitly gates for reads via
 *   `can_view_clients`, so we honor that column specifically.
 * - WRITES: map 1:1 onto the boolean columns that actually exist.
 *   Clients has no dedicated `can_edit_clients` column; `can_manage_sales`
 *   is used since clients are sales-owned entities and the 'sales' role
 *   exists specifically for this.
 * - DESTRUCTIVE actions (delete client/order/user) have no DB column at
 *   all, so they are gated on role (owner/admin only) — mirroring how
 *   `tenants` RLS itself restricts updates to role = 'owner'.
 * - Owner is always a superset of every permission, mirroring
 *   `handle_new_user`, which grants a brand-new owner all five booleans
 *   set to true.
 */
export function derivePermissions(row: DbUserRow): Permission[] {
  if (row.role === UserRole.Owner) {
    return Object.values(Permission)
  }

  const perms: Permission[] = [Permission.OrdersRead, Permission.ProductionRead, Permission.FilesUpload]
  const isAdmin = row.role === UserRole.Admin

  if (row.can_view_clients) perms.push(Permission.ClientsRead)

  if (row.can_manage_sales) {
    perms.push(Permission.ClientsCreate, Permission.ClientsUpdate)
  }
  if (row.can_edit_orders) {
    perms.push(Permission.OrdersCreate, Permission.OrdersUpdate)
  }
  if (row.can_edit_production) {
    perms.push(Permission.ProductionUpdate)
  }
  if (row.can_manage_users) {
    perms.push(Permission.UsersCreate, Permission.UsersUpdate)
  }

  if (isAdmin) {
    perms.push(Permission.ClientsDelete, Permission.OrdersDelete, Permission.UsersDelete, Permission.FilesDelete)
  }

  return perms
}

// API Response types
export interface SuccessResponse<T> {
  success: true
  data: T
  statusCode: 200 | 201
}

export interface ErrorResponseData {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  statusCode: number
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponseData

// User context from auth — carried through every API route via getCurrentUser()
export interface AuthUser {
  id: string
  email?: string
  role: UserRole
  tenantId: string
  permissions: Permission[]
}

// Pagination
export interface PaginationParams {
  page?: number
  limit?: number
  offset?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}