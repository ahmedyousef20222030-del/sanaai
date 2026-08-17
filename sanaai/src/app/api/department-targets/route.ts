import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { UserRole, TARGET_TYPES } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { ValidationError } from '@/lib/errors'

function ensureCanManage(caller: { role: string }) {
  if (caller.role !== UserRole.Owner && caller.role !== UserRole.Admin) {
    throw new ValidationError('فقط المالك أو المدير يمكنه إدارة أهداف الأقسام')
  }
}

export async function GET() {
  try {
    const caller = await getCurrentUser()
    const { data, error } = await supabaseAdmin
      .from('department_targets')
      .select('department, monthly_target, target_type')
      .eq('tenant_id', caller.tenantId)
      .order('department', { ascending: true })

    if (error) throw error
    return successResponse(data || [])
  } catch (error) {
    return handleError(error)
  }
}

const upsertSchema = z.object({
  department: z.string().min(1),
  monthly_target: z.number().nonnegative(),
  target_type: z.enum(TARGET_TYPES),
})

export async function POST(req: NextRequest) {
  try {
    const caller = await getCurrentUser()
    ensureCanManage(caller)

    const body = await req.json()
    const validated = upsertSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('department_targets')
      .upsert(
        {
          tenant_id: caller.tenantId,
          department: validated.department,
          monthly_target: validated.monthly_target,
          target_type: validated.target_type,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,department' },
      )
      .select()
      .single()

    if (error) throw error
    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}

const deleteSchema = z.object({ department: z.string().min(1) })

export async function DELETE(req: NextRequest) {
  try {
    const caller = await getCurrentUser()
    ensureCanManage(caller)

    const body = await req.json()
    const validated = deleteSchema.parse(body)

    const { error } = await supabaseAdmin
      .from('department_targets')
      .delete()
      .eq('tenant_id', caller.tenantId)
      .eq('department', validated.department)

    if (error) throw error
    return successResponse({ success: true })
  } catch (error) {
    return handleError(error)
  }
}