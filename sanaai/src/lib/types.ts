import { PagePermissions } from './pages'

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
// PAGE_LIST are pure page-visibility gates.
const ORDERS_PAGE = '/dashboard/orders'
const CLIENTS_PAGE = '/dashboard/clients'
const PRODUCTION_PAGE = '/dashboard/production'
const EMPLOYEES_PAGE = '/dashboard/employees'
const USERS_PAGE = '/dashboard/permissions'

/**
 * Derives the effective Permission list for a user from their real DB row.
 *
 * Design decisions:
 * - We have updated to a simple boolean permission system. 
 * - If a user has access to a page (e.g., `pages.clients === true`), they 
 *   automatically get Read, Create, and Update permissions for that domain.
 * - Delete operations are strictly reserved for Admins and Owners to ensure safety.
 */
export function derivePermissions(row: DbUserRow): Permission[] {
  if (row.role === UserRole.Owner) {
    return Object.values(Permission)
  }

  const perms = new Set<Permission>([Permission.OrdersRead, Permission.ProductionRead, Permission.FilesUpload])
  const isAdmin = row.role === UserRole.Admin
  const pages = row.page_permissions || {}

  // دالة مساعدة سريعة للتحقق من امتلاك الصلاحية (تدعم مفتاح المسار أو الكلمة المباشرة)
  const hasAccess = (path: string, key: string) => Boolean(pages[path] || pages[key])

  // Clients
  if (hasAccess(CLIENTS_PAGE, 'clients')) {
    perms.add(Permission.ClientsRead)
    perms.add(Permission.ClientsCreate)
    perms.add(Permission.ClientsUpdate)
  }
  if (isAdmin) perms.add(Permission.ClientsDelete)

  // Orders
  if (hasAccess(ORDERS_PAGE, 'orders')) {
    perms.add(Permission.OrdersCreate)
    perms.add(Permission.OrdersUpdate)
  }
  if (isAdmin) perms.add(Permission.OrdersDelete)

  // Production
  if (hasAccess(PRODUCTION_PAGE, 'production') || hasAccess(PRODUCTION_PAGE, 'machines')) {
    perms.add(Permission.ProductionUpdate)
  }
  if (isAdmin) perms.add(Permission.ProductionDelete)

  // Employees
  if (hasAccess(EMPLOYEES_PAGE, 'employees')) {
    perms.add(Permission.EmployeesRead)
    perms.add(Permission.EmployeesCreate)
    perms.add(Permission.EmployeesUpdate)
  }
  if (isAdmin) perms.add(Permission.EmployeesDelete)

  // Users / permissions management
  if (hasAccess(USERS_PAGE, 'permissions') || hasAccess(USERS_PAGE, 'users')) {
    perms.add(Permission.UsersCreate)
    perms.add(Permission.UsersUpdate)
  }
  if (isAdmin) perms.add(Permission.UsersDelete)

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