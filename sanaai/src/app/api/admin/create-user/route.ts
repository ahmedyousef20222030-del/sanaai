// src/app/api/admin/create-user/route.ts
//
// نقطة نهاية آمنة (تعمل على السيرفر فقط) لإنشاء مستخدم جديد
// بواسطة صاحب المصنع (owner)، مع تحديد الباسورد مباشرة.
//
// خطوات الحماية:
// 1. نتأكد إن الطلب جاي من مستخدم مسجل دخول فعلاً (عبر التوكن).
// 2. نتأكد إن دوره owner داخل نفس المنشأة.
// 3. باستخدام المفتاح الإداري (سيرفر فقط)، ننشئ الحساب الجديد،
//    ونربطه تلقائياً بنفس tenant_id بتاع صاحب المصنع.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 })
    }
    const callerToken = authHeader.replace('Bearer ', '')

    // ── تحقق من هوية المتصل باستخدام التوكن الخاص به (مش المفتاح الإداري) ──
    const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    })
    const { data: { user: caller }, error: callerErr } = await supabaseAsCaller.auth.getUser()
    if (callerErr || !caller) {
      return NextResponse.json({ error: 'جلسة الدخول غير صالحة' }, { status: 401 })
    }

    // ── تحقق إن المتصل هو owner فعلاً، ونجيب tenant_id بتاعه ──
    const { data: callerRow, error: callerRowErr } = await supabaseAdmin
      .from('users')
      .select('tenant_id, role')
      .eq('id', caller.id)
      .single()

    if (callerRowErr || !callerRow) {
      return NextResponse.json({ error: 'تعذر تحديد بيانات المنشأة' }, { status: 403 })
    }
    if (callerRow.role !== 'owner') {
      return NextResponse.json({ error: 'إضافة مستخدمين جدد مسموح بها فقط لصاحب الحساب (owner)' }, { status: 403 })
    }

    // ── بيانات المستخدم الجديد من الفورم ──
    const body = await req.json()
    const { email, password, full_name, role } = body as {
      email: string; password: string; full_name: string; role: string
    }

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'كل الحقول مطلوبة' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 })
    }

    // ── إنشاء حساب auth.users فعلياً (يتطلب المفتاح الإداري) ──
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // تفعيل الحساب مباشرة بدون حاجة لتأكيد إيميل
      user_metadata: { full_name },
    })

    if (createErr || !created.user) {
      return NextResponse.json({ error: createErr?.message || 'تعذر إنشاء الحساب' }, { status: 400 })
    }

    // ── ملاحظة مهمة ──
    // إنشاء الحساب أعلاه يُفعّل تلقائياً trigger باسم handle_new_user على
    // مستوى قاعدة البيانات، واللي بينشئ منشأة (tenant) جديدة وصف جديد في
    // جدول users تلقائياً. عشان كده منقدرش نعمل insert جديد (هيتعارض مع
    // الصف اللي اتعمل تلقائياً بنفس الـ id) — لازم نُحدّث الصف الموجود
    // بدل ما نضيف واحد جديد، ونحذف المنشأة الوهمية اللي اتعملت زيادة.

    const { data: autoRow } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('id', created.user.id)
      .single()
    const bogusTenantId = autoRow?.tenant_id

    const { error: linkErr } = await supabaseAdmin
      .from('users')
      .update({
        tenant_id: callerRow.tenant_id,
        role,
        full_name,
        is_active: true,
      })
      .eq('id', created.user.id)

    if (linkErr) {
      // لو فشل الربط، نحذف حساب auth.users عشان ميفضلش حساب يتيم بلا منشأة
      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      return NextResponse.json({ error: 'تعذر ربط المستخدم بالمنشأة: ' + linkErr.message }, { status: 400 })
    }

    // تنظيف المنشأة الوهمية اللي اتعملت تلقائياً بسبب الـ trigger (لو مختلفة عن منشأة صاحب الطلب)
    if (bogusTenantId && bogusTenantId !== callerRow.tenant_id) {
      await supabaseAdmin.from('tenants').delete().eq('id', bogusTenantId)
    }

    return NextResponse.json({ success: true, userId: created.user.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}