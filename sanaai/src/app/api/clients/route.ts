import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { createClientSchema, updateClientSchema, paginationSchema } from '@/lib/server/validators'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'

/**
 * GET /api/clients
 * Get all clients with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ClientsRead)

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit
    const search = searchParams.get('search')

    let query = supabaseAdmin
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('tenant_id', user.tenantId)
      .order('total_spent', { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    const { data, error, count } = await query

    if (error) throw error

    const totalPages = Math.ceil((count || 0) / limit)

    return successResponse({
      data: data || [],
      total: count || 0,
      page,
      pageSize: limit,
      totalPages,
    })
  } catch (error) {
    return handleError(error)
  }
}

/**
 * POST /api/clients
 * Create a new client
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ClientsCreate)

    const body = await request.json()
    const validated = createClientSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('clients')
      .insert({
        ...validated,
        tenant_id: user.tenantId,
        created_by: user.id,
      })
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Client')

    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}
