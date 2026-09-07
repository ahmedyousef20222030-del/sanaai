import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'

type Period = 'daily' | 'weekly' | 'monthly'

function periodStart(period: Period): string {
  const now = new Date()
  if (period === 'daily') {
    return now.toISOString().slice(0, 10)
  }
  if (period === 'weekly') {
    const day = now.getDay() // 0 = الأحد
    const start = new Date(now)
    start.setDate(now.getDate() - day)
    return start.toISOString().slice(0, 10)
  }
  // monthly
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

// GET: أداء كل تارجت نشط — الكمية الفعلية من production_logs مقابل التارجت
export async function GET() {
  try {
    const caller = await getCurrentUser()
    checkPermission(caller, Permission.ProductionRead)

    const { data: targets, error: targetsError } = await supabaseAdmin
      .from('production_targets')
      // ملاحظة: اسم العمود الفعلي في الجدول هو target_period (مش period)
      .select('id, entity_type, entity_id, target_quantity, target_period')
      .eq('tenant_id', caller.tenantId)
      .is('effective_to', null)

    if (targetsError) throw targetsError
    if (!targets || targets.length === 0) return successResponse([])

    // كل الماكينات بتاعة كل خط (محتاجينها لو فيه تارجت على entity_type = 'production_line')
    const lineIds = targets
      .filter((t) => t.entity_type === 'production_line')
      .map((t) => t.entity_id)

    let machinesByLine: Record<string, string[]> = {}
    if (lineIds.length > 0) {
      const { data: machines, error: machinesError } = await supabaseAdmin
        .from('machines')
        .select('id, line_id')
        .eq('tenant_id', caller.tenantId)
        .in('line_id', lineIds)

      if (machinesError) throw machinesError
      machinesByLine = (machines || []).reduce((acc: Record<string, string[]>, m: any) => {
        if (!m.line_id) return acc
        acc[m.line_id] = acc[m.line_id] || []
        acc[m.line_id].push(m.id)
        return acc
      }, {})
    }

    const results = await Promise.all(
      targets.map(async (target) => {
        const startDate = periodStart(target.target_period as Period)

        let query = supabaseAdmin
          .from('machine_activity_logs')
          .select('quantity_produced')
          .eq('tenant_id', caller.tenantId)
          .eq('event_type', 'production') // نتجاهل سجلات الصيانة/العطل/التوقف
          .gte('started_at', startDate)

        if (target.entity_type === 'machine') {
          query = query.eq('machine_id', target.entity_id)
        } else if (target.entity_type === 'employee') {
          query = query.eq('employee_id', target.entity_id)
        } else {
          const machineIds = machinesByLine[target.entity_id] || []
          if (machineIds.length === 0) {
            return {
              ...target,
              actual_quantity: 0,
              achievement_percent: 0,
            }
          }
          query = query.in('machine_id', machineIds)
        }

        const { data: logs, error: logsError } = await query
        if (logsError) throw logsError

        const actual = (logs || []).reduce(
          (sum, l: any) => sum + Number(l.quantity_produced || 0),
          0,
        )
        const percent =
          target.target_quantity && target.target_quantity > 0
            ? Math.round((actual / target.target_quantity) * 100)
            : 0

        return {
          ...target,
          actual_quantity: actual,
          achievement_percent: percent,
        }
      }),
    )

    return successResponse(results)
  } catch (error) {
    return handleError(error)
  }
}