import { getCurrentUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { successResponse, handleError } from '@/lib/server/responses'

export async function GET() {
  try {
    const caller = await getCurrentUser()

    // بيانات الأداء (fullName, department, targetType, monthlyTarget)
    // مش جزء من AuthUser الأمني — بنجيبها هنا بشكل منفصل
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('full_name, department, target_type, monthly_target')
      .eq('id', caller.id)
      .single()

    if (profileError || !profile) throw profileError || new Error('Profile not found')

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('assigned_user_id', caller.id)
      .eq('tenant_id', caller.tenantId)
      .gte('order_date', monthStart)
      .lt('order_date', monthEnd)

    if (ordersError) throw ordersError

    const orderIds = (orders || []).map((o) => o.id)
    let actual = 0

    if (profile.target_type === 'جنيه') {
      if (orderIds.length > 0) {
        const { data: invoices, error: invError } = await supabaseAdmin
          .from('invoices')
          .select('paid_amount')
          .in('order_id', orderIds)

        if (invError) throw invError
        actual = (invoices || []).reduce((sum, inv) => sum + Number(inv.paid_amount || 0), 0)
      }
    } else {
      actual = orderIds.length
    }

    const target = profile.monthly_target || 0
    const percentage = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0

    return successResponse({
      fullName: profile.full_name,
      department: profile.department,
      targetType: profile.target_type,
      monthlyTarget: target,
      actual,
      percentage,
      ordersCount: orderIds.length,
      periodLabel: now.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }),
    })
  } catch (error) {
    return handleError(error)
  }
}