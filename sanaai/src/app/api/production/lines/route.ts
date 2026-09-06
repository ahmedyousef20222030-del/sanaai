import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { z } from 'zod'

const LINE_COLUMNS =
  'id, tenant_id, name, description, status, capacity_per_day, created_at, updated_at'

const createProductionLineSchema = z.object({
  name: z.string().min(1, 'اسم خط الإنتاج مطلوب'),
  description: z.string().optional().default(''),
  status: z.enum(['active', 'paused', 'maintenance']).default('active'),
  capacity_per_day: z.number().int().min(0).default(0),
})

// GET /api/production/lines — كل خطوط الإنتاج الخاصة بالشركة الحالية
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionRead)

    const { data, error } = await supabaseAdmin
      .from('production_lines')
      .select(LINE_COLUMNS)
      // ✅ تصحيح: AuthUser بيرجع الحقل باسم tenantId (camelCase) مش tenant_id
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// POST /api/production/lines — إضافة خط إنتاج جديد
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = createProductionLineSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('production_lines')
      // ✅ تصحيح: كانت user.tenant_id (undefined) فبيروح insert من غير tenant_id
      // ويترفض بسبب NOT NULL constraint — وده كان سبب "الصفحة لا تسجل"
      .insert({ ...validated, tenant_id: user.tenantId })
      .select(LINE_COLUMNS)
      .single()

    if (error || !data) throw error

    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}
