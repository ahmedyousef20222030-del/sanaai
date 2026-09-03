import { PageKey, PermissionLevel, PagePermissions, levelAtLeast } from './pages'

// ═══════════════════════════════════════════════════════════════
// Role definitions — MUST stay in sync with the DB CHECK constraint
// `users_role_check` on public.users:
//   CHECK (role = ANY (ARRAY['owner','admin','sales','production',
//                            'design','shipping','hr','accountant','employee']))
// These are broad system roles, NOT a permission hierarchy — the real
// authorization data lives in `page_permissions` below. A user's actual
// day-to-day job title (e.g. "مصمم أفلام تطريز", "سنجر", "أوفر") is a
// free-text label stored separately in `job_title` and carries no
// authorization meaning of its own — see DbUserRow.
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
  // Free-text job title set by the owner (or anyone with `/dashboard/permissions`
  // edit access) — e.g. "مصمم أفلام تطريز", "فنى تطريز", "مصمم جرافيك", "سنجر",
  // "أوفر", "مقص دار", "أورليه", or any other title. Purely descriptive: it
  // never affects `derivePermissions` below. `role` still carries the
  // system-level distinction (owner/admin/etc).
  job_title: string | null
  // Per-page permission level. Absence of a page key = no access to that
  // page at all. Replaces the old `allowed_pages: string[]` (view-only
  // boolean) plus the five ad-hoc `can_*` booleans.
  page_permissions: PagePermissions | null
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
  ProductionDelete = 'production:delete',

  EmployeesRead = 'employees:read',
  EmployeesCreate = 'employees:create',
  EmployeesUpdate = 'employees:update',
  EmployeesDelete = 'employees:delete',

  UsersCreate = 'users:create',
  UsersUpdate = 'users:update',
  UsersDelete = 'users:delete',

  FilesUpload = 'files:upload',
  FilesDelete = 'files:delete',
}

// Which PageKey drives each fine-grained action domain. Only pages with a
// real server-enforced action set need an entry here — the rest of
// PAGE_LIST are pure page-visibility gates (still get a level in
// page_permissions, it just isn't wired to a Permission yet).
const ORDERS_PAGE: PageKey = '/dashboard/orders'
const CLIENTS_PAGE: PageKey = '/dashboard/clients'
const PRODUCTION_PAGE: PageKey = '/dashboard/production'
const EMPLOYEES_PAGE: PageKey = '/dashboard/employees'
const USERS_PAGE: PageKey = '/dashboard/permissions'

/**
 * Derives the effective Permission list for a user from their real DB row.
 *
 * Design decisions (documented because the DB does not model every
 * permission explicitly — these are judgment calls, revisit if the
 * intended business rules differ):
 *
 * - READS: `tenant_isolation_policy` RLS is `ALL` (tenant-wide) for orders
 *   and production, so any active tenant member may read them here too,
 *   regardless of their page_permissions level (page_permissions only
 *   gates the dashboard's own navigation/UI, not these two tables' RLS).
 *   Clients is the one entity the DB explicitly gates for reads, so a
 *   `view`-or-above level on the clients page is required for ClientsRead.
 * - WRITES: an `edit` (or `edit_delete`) level on the relevant page grants
 *   create/update for that domain. `edit_delete` (or the Admin role, which
 *   is always trusted with destructive actions) additionally grants the
 *   delete permission for that domain.
 * - Owner is always a superset of every permission, mirroring
 *   `handle_new_user`, which grants a brand-new owner full access.
 */
export function derivePermissions(row: DbUserRow): Permission[] {
  if (row.role === UserRole.Owner) {
    return Object.values(Permission)
  }

  const perms = new Set<Permission>([Permission.OrdersRead, Permission.ProductionRead, Permission.FilesUpload])
  const isAdmin = row.role === UserRole.Admin
  const pages = row.page_permissions || {}

  // Clients
  const clientsLevel = pages[CLIENTS_PAGE]
  if (levelAtLeast(clientsLevel, 'view')) perms.add(Permission.ClientsRead)
  if (levelAtLeast(clientsLevel, 'edit')) {
    perms.add(Permission.ClientsCreate)
    perms.add(Permission.ClientsUpdate)
  }
  if (levelAtLeast(clientsLevel, 'edit_delete') || isAdmin) perms.add(Permission.ClientsDelete)

  // Orders
  const ordersLevel = pages[ORDERS_PAGE]
  if (levelAtLeast(ordersLevel, 'edit')) {
    perms.add(Permission.OrdersCreate)
    perms.add(Permission.OrdersUpdate)
  }
  if (levelAtLeast(ordersLevel, 'edit_delete') || isAdmin) perms.add(Permission.OrdersDelete)

  // Production
  const productionLevel = pages[PRODUCTION_PAGE]
  if (levelAtLeast(productionLevel, 'edit')) perms.add(Permission.ProductionUpdate)
  if (levelAtLeast(productionLevel, 'edit_delete') || isAdmin) perms.add(Permission.ProductionDelete)

  // Employees (the plain workers table — name/phone/job_title/salary, no login)
  const employeesLevel = pages[EMPLOYEES_PAGE]
  if (levelAtLeast(employeesLevel, 'view')) perms.add(Permission.EmployeesRead)
  if (levelAtLeast(employeesLevel, 'edit')) {
    perms.add(Permission.EmployeesCreate)
    perms.add(Permission.EmployeesUpdate)
  }
  if (levelAtLeast(employeesLevel, 'edit_delete') || isAdmin) perms.add(Permission.EmployeesDelete)

  // Users / permissions management
  const usersLevel = pages[USERS_PAGE]
  if (levelAtLeast(usersLevel, 'edit')) {
    perms.add(Permission.UsersCreate)
    perms.add(Permission.UsersUpdate)
  }
  if (levelAtLeast(usersLevel, 'edit_delete') || isAdmin) perms.add(Permission.UsersDelete)

  if (isAdmin) {
    perms.add(Permission.FilesDelete)
  }

  return Array.from(perms)
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
