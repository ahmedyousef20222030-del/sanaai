import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { z } from 'zod'

const MACHINE_COLUMNS =
  'id, tenant_id, name, type, serial_number, status, line_id, notes, created_at, updated_at'

const createMachineSchema = z.object({
  name: z.string().min(1, 'اسم/كود المكينة مطلوب'),
  type: z.string().optional().default(''),
  serial_number: z.string().optional().default(''),
  status: z.enum(['working', 'idle', 'maintenance', 'broken']).default('working'),
  line_id: z.string().uuid().nullable().optional(),
  notes: z.string().optional().default(''),
})

// GET /api/production/machines — كل المكن الخاصة بالشركة الحالية
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionRead)

    const { data, error } = await supabaseAdmin
      .from('machines')
      .select(MACHINE_COLUMNS)
      // ✅ تصحيح: user.tenantId بدل user.tenant_id
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

// POST /api/production/machines — إضافة مكينة جديدة
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    const validated = createMachineSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('machines')
      // ✅ تصحيح: كانت user.tenant_id (undefined) فبيتحذف من الـ insert
      // ويترفض بسبب NOT NULL constraint — وده كان سبب "الصفحة لا تسجل"
      .insert({ ...validated, line_id: validated.line_id || null, tenant_id: user.tenantId })
      .select(MACHINE_COLUMNS)
      .single()

    if (error || !data) throw error

    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}
