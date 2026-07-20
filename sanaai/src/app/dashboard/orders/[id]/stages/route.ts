import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { successResponse, handleError } from '@/lib/server/responses'

/**
 * GET /api/production/[id]/stages
 * 
 * Fetch all production sub-stages for a specific order, organized by stage group,
 * along with their completion status by workers.
 * 
 * Automatically filters sub-stages based on print_or_embroidery choice:
 * - If "printing": show only printing-specific sub-stages
 * - If "embroidery": show only embroidery-specific sub-stages
 * - If unset: show all unconditional sub-stages only
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    const { id: productionId } = await params

    // Verify the production belongs to the caller's tenant
    const { data: prod, error: prodError } = await supabaseAdmin
      .from('production')
      .select('id, order_id, tenant_id, print_or_embroidery')
      .eq('id', productionId)
      .eq('tenant_id', user.tenantId)
      .single()

    if (prodError || !prod) {
      throw new Error('Production not found or unauthorized')
    }

    // Fetch all stage definitions for this tenant
    const { data: definitions, error: defError } = await supabaseAdmin
      .from('production_stage_definitions')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true })

    if (defError) throw defError

    // Fetch all completions for this production (including in-progress)
    const { data: completions, error: compError } = await supabaseAdmin
      .from('production_stage_completions')
      .select(`
        *,
        worker:users!worker_id(id, full_name),
        qa_checked_by_user:users!qa_checked_by(id, full_name)
      `)
      .eq('production_id', productionId)

    if (compError) throw compError

    // Filter definitions based on print_or_embroidery choice
    const filteredDefs = definitions.filter(def => {
      if (!def.conditional_on_choice) return true // Always show unconditional
      if (prod.print_or_embroidery === 'printing' && def.conditional_on_choice === 'printing')
        return true
      if (prod.print_or_embroidery === 'embroidery' && def.conditional_on_choice === 'embroidery')
        return true
      return false
    })

    // Organize by stage group
    const grouped: Record<
      string,
      Array<(typeof filteredDefs)[0] & { completion?: (typeof completions)[0] | null; progress?: number }>
    > = {}

    for (const def of filteredDefs) {
      if (!grouped[def.stage_group]) {
        grouped[def.stage_group] = []
      }
      const completion = completions.find(
        c => c.stage_group === def.stage_group && c.sub_stage_key === def.sub_stage_key,
      )
      grouped[def.stage_group].push({
        ...def,
        completion: completion || null,
        progress: completion?.completed_at ? 100 : completion?.started_at ? 50 : 0,
      })
    }

    // Calculate overall progress: completed / total visible stages
    const totalStages = filteredDefs.length
    const completedStages = filteredDefs.filter(
      def =>
        completions.find(
          c =>
            c.stage_group === def.stage_group &&
            c.sub_stage_key === def.sub_stage_key &&
            c.completed_at,
        ),
    ).length

    const overallProgress = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0

    return successResponse({
      production: {
        id: prod.id,
        print_or_embroidery: prod.print_or_embroidery,
        overall_progress_pct: overallProgress,
      },
      stages: grouped,
      summary: {
        total_stages: totalStages,
        completed_stages: completedStages,
        in_progress_stages: completions.filter(c => c.started_at && !c.completed_at).length,
      },
    })
  } catch (error) {
    return handleError(error)
  }
}