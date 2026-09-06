import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'
import { z } from 'zod'

type Props = { params: Promise<{ id: string }> }

const MACHINE_COLUMNS =
  'id, tenant_id, name, type, serial_number, status, line_id, notes, created_at, updated_at'

const updateMachineSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  serial_number: z.string().optional(),
  status: z.enum(['working', 'idle', 'maintenance', 'broken']).optional(),
  line_id: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
})

// PATCH /api/production/machines/[id] — تعديل مكينة
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = updateMachineSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('machines')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', id)
      // ✅ تصحيح: user.tenantId بدل user.tenant_id
      .eq('tenant_id', user.tenantId)
      .select(MACHINE_COLUMNS)
      .single()

    if (error || !data) throw new NotFoundError('Machine not found or update failed')

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// DELETE /api/production/machines/[id] — حذف مكينة
export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    // ✅ صلاحية حذف مخصّصة (edit_delete) بدل الاكتفاء بصلاحية التعديل
    checkPermission(user, Permission.ProductionDelete)

    const { data, error } = await supabaseAdmin
      .from('machines')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id')
      .single()

    if (error || !data) throw new NotFoundError('Machine not found or delete failed')

    return successResponse({ id })
  } catch (error) {
    return handleError(error)
  }
}
