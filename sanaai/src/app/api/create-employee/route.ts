import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { Permission, UserRole, TARGET_TYPES } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { ValidationError } from '@/lib/errors'

const createEmployeeSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  full_name: z.string().min(1),
  role: z.nativeEnum(UserRole).default(UserRole.Employee),
  phone: z.string().optional(),
  department: z.string().optional(),
  job_title: z.string().optional(),
  start_date: z.string().optional(),
  monthly_target: z.number().nonnegative().optional(),
  target_type: z.enum(TARGET_TYPES).optional(),
  can_edit_production: z.boolean().optional(),
  can_edit_orders: z.boolean().optional(),
  can_manage_sales: z.boolean().optional(),
  can_manage_users: z.boolean().optional(),
  can_view_clients: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const caller = await getCurrentUser()
    checkPermission(caller, Permission.UsersCreate)

    const body = await req.json()
    const validated = createEmployeeSchema.parse(body)

    if (
      (validated.role === UserRole.Owner || validated.role === UserRole.Admin) &&
      caller.role !== UserRole.Owner
    ) {
      throw new ValidationError('فقط المالك يمكنه إنشاء حسابات مالك أو مدير')
    }

    const tenantId = caller.tenantId

    // ✅ لو الهدف الشهري مش متبعت يدويًا، نجيبه تلقائيًا حسب القسم من جدول department_targets
    let monthlyTarget = validated.monthly_target
    let targetType = validated.target_type

    if ((monthlyTarget === undefined || targetType === undefined) && validated.department) {
      const { data: deptTarget } = await supabaseAdmin
        .from('department_targets')
        .select('monthly_target, target_type')
        .eq('tenant_id', tenantId)
        .eq('department', validated.department)
        .maybeSingle()

      if (deptTarget) {
        if (monthlyTarget === undefined) monthlyTarget = deptTarget.monthly_target
        if (targetType === undefined) targetType = deptTarget.target_type as any
      }
    }

    const { data: existingUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers()
    if (listErr) throw new ValidationError('تعذر التحقق من البريد الإلكتروني: ' + listErr.message)
    const existingAuthUser = existingUsers?.users?.find((u) => u.email === validated.email)

    let userId: string
    let createdBrandNewAuthUser = false

    if (existingAuthUser) {
      userId = existingAuthUser.id
      await supabaseAdmin.auth.admin.updateUserById(userId, { password: validated.password })
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: validated.email,
        password: validated.password,
        email_confirm: true,
      })
      if (authError || !authData.user) {
        throw new ValidationError(authError?.message || 'تعذر إنشاء المستخدم')
      }
      userId = authData.user.id
      createdBrandNewAuthUser = true
    }

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          id: userId,
          email: validated.email,
          full_name: validated.full_name,
          role: validated.role,
          phone: validated.phone || null,
          tenant_id: tenantId,
          department: validated.department || null,
          job_title: validated.job_title || null,
          start_date: validated.start_date || null,
          monthly_target: monthlyTarget || 0,
          target_type: targetType || 'طلبات',
          is_active: true,
          target_actual: 0,
          can_edit_production: validated.can_edit_production ?? false,
          can_edit_orders: validated.can_edit_orders ?? false,
          can_manage_sales: validated.can_manage_sales ?? false,
          can_manage_users: validated.can_manage_users ?? false,
          can_view_clients: validated.can_view_clients ?? true,
        },
        { onConflict: 'id' },
      )
      .select('id, email, full_name, role, phone, tenant_id, department, job_title, start_date, monthly_target, target_type, is_active, can_edit_production, can_edit_orders, can_manage_sales, can_manage_users, can_view_clients, created_at, updated_at')
      .single()

    if (dbError) throw new ValidationError(dbError.message)

    // ✅ تسجيل تلقائي في جدول employees (مرتبط بنفس حساب الدخول عن طريق user_id)
    const { error: empError } = await supabaseAdmin
      .from('employees')
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          name: validated.full_name,
          phone: validated.phone || null,
          role: validated.role,
        },
        { onConflict: 'user_id' },
      )

    if (empError) {
      console.error('Failed to auto-register employee for user', userId, empError)
    }

    if (createdBrandNewAuthUser) {
      await supabaseAdmin.from('tenants').delete().eq('owner_id', userId)
    }

    return successResponse(user, 201)
  } catch (error) {
    return handleError(error)
  }
}