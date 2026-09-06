import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'
import { z } from 'zod'

type Props = { params: Promise<{ id: string }> }

const LOG_COLUMNS =
  'id, tenant_id, machine_id, order_id, employee_id, log_type, event_type, ' +
  'quantity_produced, started_at, ended_at, notes, created_at, updated_at'

const updateLogSchema = z.object({
  order_id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  event_type: z.enum(['production', 'maintenance', 'breakdown', 'idle', 'other']).optional(),
  quantity_produced: z.number().int().min(0).optional(),
  // بتتبعت غالبًا لوحدها عشان "تقفل" شفت مفتوح: { ended_at: now, quantity_produced }
  ended_at: z.string().datetime().nullable().optional(),
  notes: z.string().optional(),
})

// PATCH /api/production/logs/[id] — تعديل تسجيل، أو قفل شفت مفتوح بإضافة ended_at
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = updateLogSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('machine_activity_logs')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select(LOG_COLUMNS)
      .single()

    if (error || !data) throw new NotFoundError('Log entry not found or update failed')

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// DELETE /api/production/logs/[id] — حذف تسجيل (تصحيح خطأ إدخال مثلًا)
export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionDelete)

    const { data, error } = await supabaseAdmin
      .from('machine_activity_logs')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id')
      .single()

    if (error || !data) throw new NotFoundError('Log entry not found or delete failed')

    return successResponse({ id })
  } catch (error) {
    return handleError(error)
  }
}
