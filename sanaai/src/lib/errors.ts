// Custom error classes for API responses
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED')
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends ApiError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, 'FORBIDDEN')
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, `${resource} not found`, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends ApiError {
  constructor(
    message: string,
    public details?: Record<string, string>,
  ) {
    super(400, message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message, 'CONFLICT')
    this.name = 'ConflictError'
  }
}

export class RateLimitError extends ApiError {
  constructor(message = 'Too many requests') {
    super(429, message, 'RATE_LIMITED')
    this.name = 'RateLimitError'
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error') {
    super(500, message, 'INTERNAL_ERROR')
    this.name = 'InternalServerError'
  }
}

// Type-safe error response
export interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, string>
  }
  statusCode: number
}

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ApiError) {
    return {
      success: false,
      error: {
        code: error.code || 'ERROR',
        message: error.message,
      },
      statusCode: error.statusCode,
    }
  }

  if (error instanceof Error) {
    return {
      success: false,
      error: {
        code: 'ERROR',
        message: error.message,
      },
      statusCode: 500,
    }
  }

  return {
    success: false,
    error: {
      code: 'ERROR',
      message: 'An unexpected error occurred',
    },
    statusCode: 500,
  }
}
