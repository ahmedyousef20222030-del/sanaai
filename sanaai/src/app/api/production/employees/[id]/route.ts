import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'
import { z } from 'zod'

type Props = { params: Promise<{ id: string }> }

const EMPLOYEE_COLUMNS =
  'id, tenant_id, name, role, user_id, active, created_at, updated_at'

const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().optional(),
  user_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
})

// PATCH /api/production/employees/[id] — تعديل بيانات صنايعي (أو تعطيله بـ active:false)
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = updateEmployeeSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('employees')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select(EMPLOYEE_COLUMNS)
      .single()

    if (error || !data) throw new NotFoundError('Employee not found or update failed')

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// DELETE /api/production/employees/[id] — حذف صنايعي
// ⚠️ لو الصنايعي ده مرتبط بسجلات نشاط سابقة (machine_activity_logs)، الحذف
// هيترفض بسبب "on delete restrict" على employee_id — استخدم PATCH بـ
// { active: false } بدل الحذف في الحالة دي عشان تحافظ على تاريخ الإنتاج.
export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionDelete)

    const { data, error } = await supabaseAdmin
      .from('employees')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id')
      .single()

    if (error || !data) throw new NotFoundError('Employee not found or delete failed')

    return successResponse({ id })
  } catch (error) {
    return handleError(error)
  }
}
