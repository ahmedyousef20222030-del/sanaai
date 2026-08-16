import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !requester) {
      return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 })
    }

    const { data: adminRow } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', requester.id)
      .maybeSingle()
    if (!adminRow) {
      return NextResponse.json({ error: 'غير مصرح لك بهذا الإجراء' }, { status: 403 })
    }

    const { logId } = await req.json()
    if (!logId) return NextResponse.json({ error: 'logId مطلوب' }, { status: 400 })

    await supabaseAdmin
      .from('impersonation_log')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', logId)
      .eq('admin_id', requester.id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}