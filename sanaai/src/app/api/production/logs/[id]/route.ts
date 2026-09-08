// app/api/production/logs/[id]/route.ts
//
// ♻️ استرجاع: تعديل/حذف تسجيل إنتاج من الجدول القديم production_logs،
// بنفس منطق الفحص الأمني الأصلي، بالأسلوب الاحترافي الجديد.
import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'
import { z } from 'zod'

type Props = { params: Promise<{ id: string }> }

const LOG_COLUMNS =
  'id, tenant_id, machine_id, line_id, machine_name_snapshot, line_name_snapshot, ' +
  'product_name, quantity, notes, produced_at, operator_type, operator_user_id, ' +
  'operator_employee_id, operator_name, created_at, updated_at'

const updateLogSchema = z
  .object({
    product_name: z.string().min(1).transform(v => v.trim()).optional(),
    quantity: z.number().min(0).optional(),
    notes: z.string().optional(),
    produced_at: z.string().datetime().optional(),
    operator_type: z.enum(['user', 'employee']).optional(),
    operator_employee_id: z.string().uuid().optional(),
    operator_name: z.string().optional(),
  })
  .refine(data => data.operator_type !== 'employee' || !!data.operator_employee_id, {
    message: 'لازم تحدد الصنايعي لو operator_type هيتغيّر لـ employee',
    path: ['operator_employee_id'],
  })

// PATCH /api/production/logs/[id] — تعديل تسجيل إنتاج
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = updateLogSchema.parse(body)

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (validated.product_name !== undefined) updatePayload.product_name = validated.product_name
    if (validated.quantity !== undefined) updatePayload.quantity = validated.quantity
    if (validated.notes !== undefined) updatePayload.notes = validated.notes
    if (validated.produced_at !== undefined) updatePayload.produced_at = validated.produced_at

    if (validated.operator_type !== undefined) {
      updatePayload.operator_type = validated.operator_type

      if (validated.operator_type === 'employee') {
        // 🔒 نفس فحص الملكية اللي في POST — الصنايعي لازم يتبع نفس المصنع
        const { data: employee, error: employeeError } = await supabaseAdmin
          .from('employees')
          .select('id, name')
          .eq('id', validated.operator_employee_id)
          .eq('tenant_id', user.tenantId)
          .single()

        if (employeeError || !employee) {
          throw new NotFoundError('الصنايعي غير موجود أو لا يتبع مصنعك')
        }

        updatePayload.operator_user_id = null
        updatePayload.operator_employee_id = employee.id
        updatePayload.operator_name = validated.operator_name ?? employee.name
      } else {
        updatePayload.operator_user_id = user.id
        updatePayload.operator_employee_id = null
        updatePayload.operator_name = validated.operator_name ?? user.email ?? 'مستخدم'
      }
    } else if (validated.operator_name !== undefined) {
      updatePayload.operator_name = validated.operator_name
    }

    // 🔒 .eq('tenant_id', ...) هنا هو اللي بيمنع تعديل سجل بتاع مصنع تاني
    const { data, error } = await supabaseAdmin
      .from('production_logs')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select(LOG_COLUMNS)
      .single()

    if (error || !data) throw new NotFoundError('السجل غير موجود أو التعديل فشل')

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// DELETE /api/production/logs/[id] — حذف تسجيل إنتاج
export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionDelete)

    const { data, error } = await supabaseAdmin
      .from('production_logs')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId) // 🔒 نفس مبدأ العزل
      .select('id')
      .single()

    if (error || !data) throw new NotFoundError('السجل غير موجود أو الحذف فشل')

    return successResponse({ id })
  } catch (error) {
    return handleError(error)
  }
}