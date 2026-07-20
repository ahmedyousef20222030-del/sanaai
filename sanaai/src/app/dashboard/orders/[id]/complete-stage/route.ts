import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { successResponse, handleError } from '@/lib/server/responses'
import { Permission } from '@/lib/types'
import { ValidationError } from '@/lib/errors'

const completeStageSchema = z.object({
  stage_group: z.enum(['design', 'cutting', 'print_embroidery', 'sewing', 'packing']),
  sub_stage_key: z.string().min(1),
  worker_id: z.string().uuid().optional(),
})

/**
 * POST /api/production/[id]/complete-stage
 * 
 * Mark a sub-stage as complete. The authenticated user must either:
 * - Have can_edit_orders permission (supervisor/manager), OR
 * - Be the worker completing their own stage
 * 
 * Automatically recalculates the production's overall_progress_pct.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id: productionId } = await params

    // Verify the production belongs to the caller's tenant
    const { data: prod, error: prodError } = await supabaseAdmin
      .from('production')
      .select('id, tenant_id')
      .eq('id', productionId)
      .eq('tenant_id', user.tenantId)
      .single()

    if (prodError || !prod) {
      throw new ValidationError('Production not found or unauthorized')
    }

    const body = await req.json()
    const { stage_group, sub_stage_key, worker_id: specifiedWorkerId } = completeStageSchema.parse(
      body,
    )

    // Determine who is completing this stage
    const workerId = specifiedWorkerId || user.id

    // Authorization: either the person doing it themselves, or someone with edit permission
    if (workerId !== user.id) {
      checkPermission(user, Permission.OrdersUpdate)
    }

    // Verify the worker exists and is in the same tenant
    const { data: worker, error: workerError } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id')
      .eq('id', workerId)
      .eq('tenant_id', user.tenantId)
      .single()

    if (workerError || !worker) {
      throw new ValidationError('Worker not found in your tenant')
    }

    // Verify the stage definition exists
    const { data: stageDef, error: stageDefError } = await supabaseAdmin
      .from('production_stage_definitions')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .eq('stage_group', stage_group)
      .eq('sub_stage_key', sub_stage_key)
      .single()

    if (stageDefError || !stageDef) {
      throw new ValidationError('Stage definition not found')
    }

    // Upsert the completion: if it already exists, just update completed_at
    const now = new Date().toISOString()
    const { data: completion, error: compError } = await supabaseAdmin
      .from('production_stage_completions')
      .upsert(
        {
          production_id: productionId,
          stage_group,
          sub_stage_key,
          worker_id: workerId,
          started_at: now,
          completed_at: now,
          qa_status: 'pending',
        },
        { onConflict: 'production_id,stage_group,sub_stage_key' },
      )
      .select()
      .single()

    if (compError) throw compError

    // Recalculate overall progress
    const { data: allDefinitions } = await supabaseAdmin
      .from('production_stage_definitions')
      .select('*')
      .eq('tenant_id', user.tenantId)

    const { data: productionData } = await supabaseAdmin
      .from('production')
      .select('print_or_embroidery')
      .eq('id', productionId)
      .single()

    const { data: allCompletions } = await supabaseAdmin
      .from('production_stage_completions')
      .select('*')
      .eq('production_id', productionId)

    // Filter definitions by print_or_embroidery
    const filteredDefs = (allDefinitions || []).filter(def => {
      if (!def.conditional_on_choice) return true
      return def.conditional_on_choice === productionData?.print_or_embroidery
    })

    const completedCount = filteredDefs.filter(def =>
      (allCompletions || []).find(
        c =>
          c.stage_group === def.stage_group &&
          c.sub_stage_key === def.sub_stage_key &&
          c.completed_at,
      ),
    ).length

    const newProgress = filteredDefs.length > 0 ? Math.round((completedCount / filteredDefs.length) * 100) : 0

    // Update the production's overall progress
    await supabaseAdmin.from('production').update({ overall_progress_pct: newProgress }).eq('id', productionId)

    return successResponse({
      completion,
      production: {
        overall_progress_pct: newProgress,
      },
    })
  } catch (error) {
    return handleError(error)
  }
}