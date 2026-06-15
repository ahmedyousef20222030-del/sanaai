import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { updateOrderSchema, updateOrderStatusSchema } from '@/lib/server/validators'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'

type Props = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.OrdersRead)

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*, clients(*), assigned_user:users(full_name)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (error || !data) throw new NotFoundError('Order')
    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.OrdersUpdate)

    const body = await request.json()
    const validated = updateOrderSchema.partial().parse(body)

    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ ...validated, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Order')
    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.OrdersDelete)

    const { error } = await supabaseAdmin
      .from('orders')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)

    if (error) throw error
    return successResponse({ success: true, message: 'Order deleted' })
  } catch (error) {
    return handleError(error)
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.OrdersUpdate)

    const body = await request.json()
    const validated = updateOrderStatusSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status: validated.status, notes: validated.notes, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Order')
    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}