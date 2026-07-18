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
  // Optional fine-grained permission flags the creator may set explicitly.
  // Anything omitted defaults to a safe minimum below.
  can_edit_production: z.boolean().optional(),
  can_edit_orders: z.boolean().optional(),
  can_manage_sales: z.boolean().optional(),
  can_manage_users: z.boolean().optional(),
  can_view_clients: z.boolean().optional(),
  // 🔒 tenant_id is intentionally NOT accepted here. It is always taken
  // from the authenticated caller's own tenant (see below) — never from
  // the request body — otherwise anyone could create an account inside
  // a tenant they don't belong to.
})

/**
 * POST /api/create-employee
 * Creates (or re-provisions) an employee account inside the CALLER's own
 * tenant.
 *
 * 🔒 Security properties of this endpoint:
 * - Requires a valid session (getCurrentUser) — previously this endpoint
 *   had no auth check at all and was fully public.
 * - Requires Permission.UsersCreate, derived from the caller's real
 *   `can_manage_users` column — previously anyone, authenticated or not,
 *   could call it.
 * - tenant_id always comes from the caller's own session, never from the
 *   request body.
 * - Only an existing Owner may create another Owner or Admin account —
 *   an HR employee with can_manage_users=true should be able to onboard
 *   regular staff, but not mint themselves a co-owner.
 * - Cleans up the "ghost" tenant that `handle_new_user` unavoidably
 *   creates whenever a brand-new auth user is inserted (see note below).
 */
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

    // This upsert is what actually places the employee in the CALLER's
    // tenant with the intended role/permissions — it overrides whatever
    // handle_new_user may have just inserted (see cleanup note below).
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
          monthly_target: validated.monthly_target || 0,
          target_type: validated.target_type || 'طلبات',
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
      .select()
      .single()

    if (dbError) throw new ValidationError(dbError.message)

    // 🧹 IMPORTANT: supabaseAdmin.auth.admin.createUser() inserts a row
    // into auth.users, which unconditionally fires the `handle_new_user`
    // trigger — the same trigger that powers self-service signup. That
    // trigger always provisions a BRAND-NEW tenant (with this user as its
    // 'owner') regardless of the fact that we actually want this person
    // attached to the CALLER's existing tenant instead.
    //
    // The upsert above already corrected `users.tenant_id`/`role` to the
    // right values, so at this point the spurious tenant the trigger made
    // is a harmless-looking but real orphan row (dangling `owner_id`,
    // nobody's `users.tenant_id` points to it anymore). We delete it here
    // — AFTER the upsert above, specifically so nothing still references
    // it and this delete can't fail on a foreign-key/ordering issue.
    if (createdBrandNewAuthUser) {
      await supabaseAdmin.from('tenants').delete().eq('owner_id', userId)
    }

    return successResponse(user, 201)
  } catch (error) {
    return handleError(error)
  }
}