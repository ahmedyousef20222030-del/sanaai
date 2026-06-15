import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { updateClientSchema } from '@/lib/server/validators'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'

type Props = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ClientsRead)

    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (error || !data) throw new NotFoundError('Client')
    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ClientsUpdate)

    const body = await request.json()
    const validated = updateClientSchema.partial().parse(body)

    const { data, error } = await supabaseAdmin
      .from('clients')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Client')
    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ClientsDelete)

    const { error } = await supabaseAdmin
      .from('clients')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)

    if (error) throw error
    return successResponse({ success: true, message: 'Client deleted' })
  } catch (error) {
    return handleError(error)
  }
}