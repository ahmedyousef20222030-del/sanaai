import { NextResponse } from 'next/server'
import { ApiError, toErrorResponse } from '@/lib/errors'
import type { SuccessResponse } from '@/lib/types'

/**
 * Create a success response
 */
export function successResponse<T>(
  data: T,
  statusCode: 200 | 201 = 200,
): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      statusCode,
    },
    { status: statusCode },
  )
}

/**
 * Create an error response from ApiError or other errors
 */
export function errorResponse(error: unknown) {
  const errorData = toErrorResponse(error)
  return NextResponse.json(errorData, {
    status: errorData.statusCode,
  })
}

/**
 * Handle errors in API routes
 */
export function handleError(error: unknown) {
  if (error instanceof ApiError) {
    console.warn(`[API Error] ${error.code}: ${error.message}`)
  } else if (error instanceof Error) {
    console.error('[Error]', error.message, error.stack)
  } else {
    console.error('[Unknown Error]', error)
  }

  return errorResponse(error)
}
