import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { z } from 'zod'

const EMPLOYEE_COLUMNS =
  'id, tenant_id, name, role, user_id, active, created_at, updated_at'

const createEmployeeSchema = z.object({
  name: z.string().min(1, 'اسم الصنايعي مطلوب'),
  role: z.string().optional().default('صنايعي'),
  // لو صاحب المصنع عايز يربط الصنايعي ده بحساب دخول حقيقي
  user_id: z.string().uuid().nullable().optional(),
})

// GET /api/production/employees — كل الصنايعية الخاصين بالشركة الحالية
// اختياري: ?active=true لعرض النشطين بس (مفيد في قوائم الاختيار بالفورم)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionRead)

    const activeOnly = request.nextUrl.searchParams.get('active') === 'true'

    let query = supabaseAdmin
      .from('employees')
      .select(EMPLOYEE_COLUMNS)
      .eq('tenant_id', user.tenantId)
      .order('name', { ascending: true })

    if (activeOnly) query = query.eq('active', true)

    const { data, error } = await query
    if (error) throw error

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// POST /api/production/employees — إضافة صنايعي جديد
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = createEmployeeSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('employees')
      .insert({ ...validated, tenant_id: user.tenantId })
      .select(EMPLOYEE_COLUMNS)
      .single()

    if (error || !data) throw error

    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}
