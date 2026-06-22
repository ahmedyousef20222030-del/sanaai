import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, full_name, role, phone, tenant_id, department, job_title, start_date, monthly_target, target_type } = body

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' }, { status: 400 })
    }

    // تحقق لو المستخدم موجود في Auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingAuthUser = existingUsers?.users?.find(u => u.email === email)

    let userId: string

    if (existingAuthUser) {
      // المستخدم موجود في Auth — استخدم نفس الـ id
      userId = existingAuthUser.id
      // حدّث كلمة المرور
      await supabaseAdmin.auth.admin.updateUserById(userId, { password })
    } else {
      // أنشئ مستخدم جديد في Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
      userId = authData.user.id
    }

    const resolvedTenantId = tenant_id || userId

    // upsert في جدول users
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        email,
        full_name,
        role: role || 'sales',
        phone: phone || null,
        tenant_id: resolvedTenantId,
        department: department || null,
        job_title: job_title || null,
        start_date: start_date || null,
        monthly_target: Number(monthly_target) || 0,
        target_type: target_type || 'طلبات',
        is_active: true,
        target_actual: 0,
        can_edit_production: false,
        can_view_clients: true,
        can_edit_orders: false,
        can_manage_sales: false,
        can_manage_users: false,
      }, { onConflict: 'id' })
      .select()
      .single()

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })

    return NextResponse.json({ user }, { status: 201 })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ غير متوقع' }, { status: 500 })
  }
}
