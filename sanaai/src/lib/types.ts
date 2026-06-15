// Role definitions
export enum UserRole {
  Admin = 'admin',
  Manager = 'manager',
  Supervisor = 'supervisor',
  Employee = 'employee',
}

// Permissions
export enum Permission {
  // Orders
  OrdersRead = 'orders:read',
  OrdersCreate = 'orders:create',
  OrdersUpdate = 'orders:update',
  OrdersDelete = 'orders:delete',

  // Clients
  ClientsRead = 'clients:read',
  ClientsCreate = 'clients:create',
  ClientsUpdate = 'clients:update',
  ClientsDelete = 'clients:delete',

  // Production
  ProductionRead = 'production:read',
  ProductionUpdate = 'production:update',

  // Storage/Files
  FilesUpload = 'files:upload',
  FilesDelete = 'files:delete',
}

// Role to permissions mapping
export const rolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.Admin]: Object.values(Permission),
  [UserRole.Manager]: [
    Permission.OrdersRead,
    Permission.OrdersCreate,
    Permission.OrdersUpdate,
    Permission.ClientsRead,
    Permission.ClientsCreate,
    Permission.ClientsUpdate,
    Permission.ProductionRead,
    Permission.ProductionUpdate,
    Permission.FilesUpload,
  ],
  [UserRole.Supervisor]: [
    Permission.OrdersRead,
    Permission.OrdersUpdate,
    Permission.ClientsRead,
    Permission.ProductionRead,
    Permission.ProductionUpdate,
  ],
  [UserRole.Employee]: [
    Permission.OrdersRead,
    Permission.ClientsRead,
    Permission.ProductionRead,
  ],
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

// User context from auth
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
