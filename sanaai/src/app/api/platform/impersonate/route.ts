import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    // ── تأكد إن الطالب مسجل دخول فعلاً ──
    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !requester) {
      return NextResponse.json({ error: 'جلسة غير صالحة، سجّل الدخول مرة أخرى' }, { status: 401 })
    }

    // ── تأكد إن الطالب platform admin فعلاً (مش أي حد) ──
    const { data: adminRow } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', requester.id)
      .maybeSingle()
    if (!adminRow) {
      return NextResponse.json({ error: 'غير مصرح لك بهذا الإجراء' }, { status: 403 })
    }

    const { targetUserId } = await req.json()
    if (!targetUserId) return NextResponse.json({ error: 'targetUserId مطلوب' }, { status: 400 })

    // ── اجيب بيانات المستخدم المستهدف ──
    const { data: targetUser, error: targetErr } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, tenant_id, role')
      .eq('id', targetUserId)
      .single()
    if (targetErr || !targetUser) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    }

    // ── احتياط أمني: امنع انتحال شخصية platform admin تاني ──
    const { data: targetIsAdmin } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', targetUserId)
      .maybeSingle()
    if (targetIsAdmin) {
      return NextResponse.json({ error: 'لا يمكن الدخول كمدير منصة آخر' }, { status: 403 })
    }

    // ── ولّد رابط دخول شرعي للمستخدم المستهدف ──
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email,
    })
    if (linkError || !linkData) {
      throw linkError || new Error('تعذر توليد رابط الدخول')
    }

    const hashedToken = (linkData.properties as any)?.hashed_token
    if (!hashedToken) throw new Error('تعذر استخراج رمز الدخول')

    // ── سجل العملية في سجل التدقيق ──
    const { data: logRow, error: logError } = await supabaseAdmin
      .from('impersonation_log')
      .insert({
        admin_id: requester.id,
        target_user_id: targetUser.id,
        tenant_id: targetUser.tenant_id,
      })
      .select('id')
      .single()
    if (logError) throw logError

    return NextResponse.json({
      tokenHash: hashedToken,
      logId: logRow.id,
      targetUser: { full_name: targetUser.full_name, email: targetUser.email, role: targetUser.role },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}