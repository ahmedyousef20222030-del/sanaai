import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/server/auth'
import { toErrorResponse } from '@/lib/errors'

/**
 * GET /api/auth/user
 * Get current authenticated user with full profile
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    return NextResponse.json(
      {
        success: true,
        data: user,
      },
      { status: 200 },
    )
  } catch (error) {
    const errorResponse = toErrorResponse(error)
    return NextResponse.json(errorResponse, {
      status: errorResponse.statusCode,
    })
  }
}
