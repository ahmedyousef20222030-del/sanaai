import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { 
      email, password, full_name, role, phone, 
      tenant_id, department, job_title, start_date, 
      monthly_target, target_type, notes 
    } = body

    // 1. التحقق من البيانات الأساسية
    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' }, { status: 400 })
    }

    // 2. التحقق من وجود tenant_id (ضروري جداً لمنع خطأ Foreign Key)
    if (!tenant_id) {
      return NextResponse.json({ error: 'يجب تحديد المصنع (Tenant ID) لإضافة الموظف' }, { status: 400 })
    }

    // 3. التعامل مع حساب الـ Auth (إنشاء أو تحديث)
    let userId: string

    // بدلاً من listUsers (البطيئة)، نحاول إنشاء مستخدم جديد
    // إذا كان موجوداً، سيعيد لنا خطأ، حينها نبحث عن الـ ID الخاص به
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name }
    })

    if (authError) {
      // إذا كان الخطأ هو أن المستخدم موجود بالفعل، نجلب الـ ID الخاص به
      if (authError.message.includes('already registered')) {
        const { data: existingUser, error: fetchError } = await supabaseAdmin.auth.admin.listUsers()
        const found = existingUser?.users?.find(u => u.email === email)
        if (!found) throw new Error('تعذر العثور على المستخدم الموجود')
        userId = found.id
        // تحديث كلمة المرور للمستخدم الموجود
        await supabaseAdmin.auth.admin.updateUserById(userId, { password })
      } else {
        throw authError
      }
    } else {
      userId = authData.user.id
    }

    // 4. الإدخال في جدول public.users (متوافق مع v1.1)
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        email,
        full_name,
        role: role || 'sales',
        phone: phone || null,
        tenant_id: tenant_id, // ✅ نستخدم tenant_id الحقيقي فقط
        department: department || null,
        job_title: job_title || null,
        start_date: start_date || null,
        monthly_target: Number(monthly_//target) || 0,
        target_type: target_type || 'جنيه',
        notes: notes || null,
        is_active: true,
        target_actual: 0, // ✅ تصحيح المسمى من actual_performance إلى target_actual
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
    console.error('Create Employee Error:', err)
    return NextResponse.json({ error: err.message || 'خطأ غير متوقع في السيرفر' }, { status: 500 })
  }
}