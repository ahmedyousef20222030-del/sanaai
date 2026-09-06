import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'
import { z } from 'zod'

type Props = { params: Promise<{ id: string }> }

const LINE_COLUMNS =
  'id, tenant_id, name, description, status, capacity_per_day, created_at, updated_at'

const updateProductionLineSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'paused', 'maintenance']).optional(),
  capacity_per_day: z.number().int().min(0).optional(),
})

// PATCH /api/production/lines/[id] — تعديل خط إنتاج
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = updateProductionLineSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('production_lines')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', id)
      // ✅ تصحيح: user.tenantId بدل user.tenant_id
      .eq('tenant_id', user.tenantId)
      .select(LINE_COLUMNS)
      .single()

    if (error || !data) throw new NotFoundError('Production line not found or update failed')

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// DELETE /api/production/lines/[id] — حذف خط إنتاج (وفك ربط أي مكن مرتبطة بيه أولًا)
export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    // ✅ صلاحية الحذف منفصلة عن التعديل (Permission.ProductionDelete مبنية
    // أصلاً على مستوى "edit_delete" في صفحة /dashboard/production — راجع
    // derivePermissions في lib/types.ts) بدل ما نكتفي بـ ProductionUpdate
    checkPermission(user, Permission.ProductionDelete)

    // فك ربط أي مكن مربوطة بالخط ده قبل الحذف
    await supabaseAdmin
      .from('machines')
      .update({ line_id: null })
      .eq('line_id', id)
      .eq('tenant_id', user.tenantId)

    const { data, error } = await supabaseAdmin
      .from('production_lines')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id')
      .single()

    if (error || !data) throw new NotFoundError('Production line not found or delete failed')

    return successResponse({ id })
  } catch (error) {
    return handleError(error)
  }
}
