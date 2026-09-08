// app/api/employees/route.ts
//
// ♻️ دمج: القديم كان بيرجع النشطين بس دايمًا (بدون خيار)، والجديد بيضيف
// role و user_id. علشان مايبوظش أي شاشة شغالة حاليًا بتعتمد على إن الـ GET
// بيرجع النشطين بس افتراضيًا، السلوك الافتراضي فضل زي ما هو — واللي عايز
// يشوف الكل (نشط وغير نشط) يبعت ?active=false صراحة.
import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { z } from 'zod'

const EMPLOYEE_COLUMNS =
  'id, tenant_id, name, role, user_id, active, created_at, updated_at'

const createEmployeeSchema = z.object({
  name: z.string().min(1, 'اسم الصنايعي مطلوب').transform(v => v.trim()),
  role: z.string().optional().default('صنايعي'),
  // لو صاحب المصنع عايز يربط الصنايعي ده بحساب دخول حقيقي
  user_id: z.string().uuid().nullable().optional(),
})

// GET /api/employees
//   افتراضيًا: بيرجع النشطين بس (زي السلوك القديم بالظبط) — للحفاظ على
//   توافقية الشاشات الحالية (زي صفحة الإنتاج) اللي بتعتمد على ده.
//   ?active=false  → يرجع الكل (نشط + غير نشط)، مفيد لشاشة إدارة الموظفين.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionRead)

    const activeParam = request.nextUrl.searchParams.get('active')

    let query = supabaseAdmin
      .from('employees')
      .select(EMPLOYEE_COLUMNS)
      .eq('tenant_id', user.tenantId) // 🔒 عزل التينانت — إجباري دايمًا
      .order('name', { ascending: true })

    // السلوك الافتراضي القديم: نشطين بس، إلا لو حد طلب صراحة يشوف الكل
    if (activeParam !== 'false') {
      query = query.eq('active', true)
    }

    const { data, error } = await query
    if (error) throw error

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// POST /api/employees — إضافة صنايعي جديد
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = createEmployeeSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('employees')
      .insert({ ...validated, tenant_id: user.tenantId }) // 🔒 tenant_id من السيرفر مش من الـ body
      .select(EMPLOYEE_COLUMNS)
      .single()

    if (error || !data) throw error

    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}