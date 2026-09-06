import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'

const ENTITY_TYPES = ['machine', 'employee', 'production_line'] as const
const PERIODS = ['daily', 'weekly', 'monthly'] as const

// GET: كل التارجتات النشطة حاليًا — أي حد عنده Permission.ProductionRead
// (زي باقي صفحة الإنتاج: قراءة متاحة لأي عضو نشط في الـ tenant)
export async function GET() {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionRead)

    const { data, error } = await supabaseAdmin
      .from('production_targets')
      .select('id, entity_type, entity_id, target_quantity, period, effective_from')
      .eq('tenant_id', user.tenantId)
      .is('effective_to', null)
      .order('entity_type', { ascending: true })

    if (error) throw error
    return successResponse(data || [])
  } catch (error) {
    return handleError(error)
  }
}

const createSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  target_quantity: z.number().nonnegative(),
  period: z.enum(PERIODS),
})

// POST: إضافة/استبدال تارجت لمكنة أو موظف أو خط معيّن
// نفس صلاحية تعديل الإنتاج (Permission.ProductionUpdate) اللي بيحتاجها
// إنشاء/تعديل أي حاجة في صفحة الإنتاج — مش صلاحية منفصلة
// (لو فيه تارجت نشط لنفس الـ entity، بيتقفل تلقائيًا ويتعمل واحد جديد بدله)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = createSchema.parse(body)

    // اقفل أي تارجت نشط سابق لنفس الـ entity قبل ما نضيف الجديد
    const { error: closeError } = await supabaseAdmin
      .from('production_targets')
      .update({ effective_to: new Date().toISOString().slice(0, 10) })
      .eq('tenant_id', user.tenantId)
      .eq('entity_type', validated.entity_type)
      .eq('entity_id', validated.entity_id)
      .is('effective_to', null)

    if (closeError) throw closeError

    const { data, error } = await supabaseAdmin
      .from('production_targets')
      .insert({
        tenant_id: user.tenantId,
        entity_type: validated.entity_type,
        entity_id: validated.entity_id,
        target_quantity: validated.target_quantity,
        period: validated.period,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) throw error
    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}

const deleteSchema = z.object({ id: z.string().uuid() })

// DELETE: إنهاء تارجت (بيتقفل من النهارده، مش بيتمسح خالص عشان يفضل في
// السجل التاريخي) — نفس صلاحية حذف الإنتاج (Permission.ProductionDelete)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionDelete)

    const body = await request.json()
    const validated = deleteSchema.parse(body)

    const { error } = await supabaseAdmin
      .from('production_targets')
      .update({ effective_to: new Date().toISOString().slice(0, 10) })
      .eq('tenant_id', user.tenantId)
      .eq('id', validated.id)

    if (error) throw error
    return successResponse({ success: true })
  } catch (error) {
    return handleError(error)
  }
}