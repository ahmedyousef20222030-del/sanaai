// app/api/production/logs/route.ts
//
// ♻️ استرجاع: ده نفس فيتشر production_logs القديم (اللي page.tsx الحالي
// شغال عليه فعليًا) — machine_id + line_id + snapshots + operator_type
// (user/employee) — لكن معاد كتابته بالأسلوب الاحترافي الجديد (getCurrentUser
// بدون args + checkPermission + zod + supabaseAdmin من lib/server/supabase).
//
// 🔒 الفحوصات الأمنية دي كانت موجودة في القديم واتحافظ عليها هنا حرفيًا:
//   - المكينة (وبالتبعية الخط) لازم تكون بتاعة نفس الـ tenant قبل التسجيل.
//   - لو operator_type = employee، الصنايعي لازم يكون بتاع نفس الـ tenant.
import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'
import { z } from 'zod'

const LOG_COLUMNS =
  'id, tenant_id, machine_id, line_id, machine_name_snapshot, line_name_snapshot, ' +
  'product_name, quantity, notes, produced_at, operator_type, operator_user_id, ' +
  'operator_employee_id, operator_name, created_at, updated_at'

const createLogSchema = z
  .object({
    machine_id: z.string().uuid('لازم تختار مكينة'),
    product_name: z.string().min(1, 'اسم المنتج مطلوب').transform(v => v.trim()),
    quantity: z.number().min(0, 'الكمية مينفعش تكون سالبة').default(0),
    notes: z.string().optional().default(''),
    produced_at: z.string().datetime().optional(),
    operator_type: z.enum(['user', 'employee']).default('user'),
    // مطلوب فقط لو operator_type = 'employee'
    operator_employee_id: z.string().uuid().optional(),
    operator_name: z.string().optional(),
  })
  .refine(data => data.operator_type !== 'employee' || !!data.operator_employee_id, {
    message: 'لازم تختار الصنايعي لو المسجّل نوعه موظف',
    path: ['operator_employee_id'],
  })

// GET /api/production/logs — بفلاتر اختيارية:
//   ?machine_id=...  ?line_id=...  ?from=ISO_DATE  ?to=ISO_DATE
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionRead)

    const params = request.nextUrl.searchParams
    let query = supabaseAdmin
      .from('production_logs')
      .select(LOG_COLUMNS)
      .eq('tenant_id', user.tenantId) // 🔒 الشرط الحاكم لعزل البيانات — إجباري دايمًا
      .order('produced_at', { ascending: false })

    const machineId = params.get('machine_id')
    const lineId = params.get('line_id')
    const from = params.get('from')
    const to = params.get('to')

    if (machineId) query = query.eq('machine_id', machineId)
    if (lineId) query = query.eq('line_id', lineId)
    if (from) query = query.gte('produced_at', from)
    if (to) query = query.lte('produced_at', to)

    const { data, error } = await query
    if (error) throw error

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// POST /api/production/logs — إضافة تسجيل إنتاج جديد
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = createLogSchema.parse(body)

    // 🔒 نتأكد إن المكينة (وخط الإنتاج المرتبط بيها) فعلاً بتاعة نفس الـ
    // tenant قبل ما نسجّل عليها — عشان محدش يقدر يسجّل إنتاج على مكينة
    // مصنع تاني حتى لو لقط الـ id بتاعها بأي طريقة.
    const { data: machine, error: machineError } = await supabaseAdmin
      .from('machines')
      .select('id, name, line_id')
      .eq('id', validated.machine_id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (machineError || !machine) {
      throw new NotFoundError('المكينة غير موجودة أو لا تتبع مصنعك')
    }

    let lineName: string | null = null
    if (machine.line_id) {
      const { data: line } = await supabaseAdmin
        .from('production_lines')
        .select('name')
        .eq('id', machine.line_id)
        .eq('tenant_id', user.tenantId)
        .single()
      lineName = line?.name ?? null
    }

    let operatorUserId: string | null = null
    let operatorEmployeeId: string | null = null
    let operatorName = validated.operator_name ?? ''

    if (validated.operator_type === 'employee') {
      // 🔒 لو "موظف"، نتأكد إنه فعلاً بتاع نفس المصنع قبل الربط
      const { data: employee, error: employeeError } = await supabaseAdmin
        .from('employees')
        .select('id, name')
        .eq('id', validated.operator_employee_id)
        .eq('tenant_id', user.tenantId)
        .single()

      if (employeeError || !employee) {
        throw new NotFoundError('الصنايعي غير موجود أو لا يتبع مصنعك')
      }

      operatorEmployeeId = employee.id
      operatorName = operatorName || employee.name
    } else {
      operatorUserId = user.id
      operatorName = operatorName || user.email || 'مستخدم'
    }

    const insertPayload = {
      tenant_id: user.tenantId, // 🔒 بيتفرض من السيرفر دايمًا، مش من الـ body
      machine_id: machine.id,
      line_id: machine.line_id,
      machine_name_snapshot: machine.name,
      line_name_snapshot: lineName,
      product_name: validated.product_name,
      quantity: validated.quantity,
      notes: validated.notes,
      produced_at: validated.produced_at ?? new Date().toISOString(),
      operator_type: validated.operator_type,
      operator_user_id: operatorUserId,
      operator_employee_id: operatorEmployeeId,
      operator_name: operatorName,
    }

    const { data, error } = await supabaseAdmin
      .from('production_logs')
      .insert(insertPayload)
      .select(LOG_COLUMNS)
      .single()

    if (error || !data) throw error

    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}