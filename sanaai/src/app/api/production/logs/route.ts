import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { z } from 'zod'

const LOG_COLUMNS =
  'id, tenant_id, machine_id, order_id, employee_id, log_type, event_type, ' +
  'quantity_produced, started_at, ended_at, notes, created_at, updated_at'

const createLogSchema = z
  .object({
    machine_id: z.string().uuid('لازم تختار مكينة'),
    order_id: z.string().uuid('لازم تختار الطلب المرتبط'),
    employee_id: z.string().uuid('لازم تختار الصنايعي'),
    log_type: z.enum(['quick', 'shift']).default('quick'),
    event_type: z
      .enum(['production', 'maintenance', 'breakdown', 'idle', 'other'])
      .default('production'),
    quantity_produced: z.number().int().min(0).default(0),
    started_at: z.string().datetime().optional(),
    // ended_at مطلوب بس لو log_type = 'shift' وعايز تقفل الشفت من الأول
    // (الحالة الشائعة: تسيبه فاضي وتقفل الشفت بعدين بـ PATCH)
    ended_at: z.string().datetime().nullable().optional(),
    notes: z.string().optional().default(''),
  })
  .transform(data => {
    const started_at = data.started_at ?? new Date().toISOString()
    // التسجيل السريع بيتقفل فورًا في نفس اللحظة (مفيش "شفت مفتوح")
    const ended_at = data.log_type === 'quick' ? started_at : data.ended_at ?? null
    return { ...data, started_at, ended_at }
  })

// GET /api/production/logs — سجل نشاط المكن، بفلاتر اختيارية:
//   ?machine_id=...   ?order_id=...   ?employee_id=...
//   ?from=ISO_DATE     ?to=ISO_DATE   ?open_shifts=true (الشفتات المفتوحة بس)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionRead)

    const params = request.nextUrl.searchParams
    let query = supabaseAdmin
      .from('machine_activity_logs')
      .select(LOG_COLUMNS)
      .eq('tenant_id', user.tenantId)
      .order('started_at', { ascending: false })

    const machineId = params.get('machine_id')
    const orderId = params.get('order_id')
    const employeeId = params.get('employee_id')
    const from = params.get('from')
    const to = params.get('to')
    const openShifts = params.get('open_shifts') === 'true'

    if (machineId) query = query.eq('machine_id', machineId)
    if (orderId) query = query.eq('order_id', orderId)
    if (employeeId) query = query.eq('employee_id', employeeId)
    if (from) query = query.gte('started_at', from)
    if (to) query = query.lte('started_at', to)
    if (openShifts) query = query.is('ended_at', null)

    const { data, error } = await query
    if (error) throw error

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// POST /api/production/logs — إضافة تسجيل جديد لنشاط مكينة
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = createLogSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('machine_activity_logs')
      .insert({ ...validated, tenant_id: user.tenantId })
      .select(LOG_COLUMNS)
      .single()

    if (error || !data) throw error

    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}
