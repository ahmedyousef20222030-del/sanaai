import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/server/supabase'
import { ValidationError, AuthenticationError, AuthorizationError } from '@/lib/errors'
import { handleError, successResponse } from '@/lib/server/responses'

// ═══════════════════════════════════════════════════════════════════
// حط الملف ده في: app/api/platform/orders/import/route.ts
//
// ده منفصل تمامًا عن app/api/orders/import/route.ts (لو كنت عملته من
// المحاولة اللي فاتت — احذفه، مش هنحتاجه، السيناريو كان مبني على فهم غلط).
//
// الفرق الجوهري هنا: التحقق مش عن طريق Permission/derivePermissions
// (اللي بتفترض إن المستخدم عضو جوه تينانت)، لكن عن طريق جدول
// platform_admins مباشرة — بالظبط زي app/platform/layout.tsx.
// ═══════════════════════════════════════════════════════════════════

const importRowSchema = z.object({
  import_reference: z.string().min(1),
  customer_name: z.string().min(1),
  customer_phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  order_date: z.string().optional().nullable(),
  expected_delivery: z.string().optional().nullable(),
  items_summary: z.string().optional().nullable(),
  sector: z.string().optional().nullable(),
  quantity: z.coerce.number().optional().nullable(),
  total_amount: z.coerce.number(),
  deposit_paid: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const importBodySchema = z.object({
  tenant_id: z.string().uuid(),
  assigned_user_id: z.string().uuid(),
  rows: z.array(importRowSchema).min(1).max(500),
})

const UNIQUE_VIOLATION_CODE = '23505'

// ── تحقق من هوية المستخدم + إنه platform admin فعلاً ──
async function requirePlatformAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.split('Bearer ')[1]
  if (!token) throw new AuthenticationError('Missing authentication token')

  const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authUser) throw new AuthenticationError('Invalid or expired token')

  const { data: adminRow, error: adminError } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (adminError) throw adminError
  if (!adminRow) throw new AuthorizationError('هذا الإجراء متاح فقط لمدير المنصة')

  return authUser
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin(req)

    const body = await req.json()
    const { tenant_id, assigned_user_id, rows } = importBodySchema.parse(body)

    // تأكد إن التينانت والسيلز فعلاً مرتبطين ببعض
    const { data: salesRep, error: salesRepError } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id, role, is_active, full_name')
      .eq('id', assigned_user_id)
      .eq('tenant_id', tenant_id)
      .single()

    if (salesRepError || !salesRep) {
      throw new ValidationError('السيلز المحدد غير تابع للشركة المختارة')
    }
    if (!salesRep.is_active) {
      throw new ValidationError('حساب السيلز المحدد موقوف')
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .eq('id', tenant_id)
      .single()

    if (tenantError || !tenant) {
      throw new ValidationError('الشركة المحددة غير موجودة')
    }

    const importBatchId = crypto.randomUUID()
    const now = new Date().toISOString()

    const results = {
      inserted: 0,
      duplicates: 0,
      failed: [] as { import_reference: string; reason: string }[],
    }

    for (const row of rows) {
      let clientId: string | null = null

      if (row.customer_phone) {
        const { data: existingClient } = await supabaseAdmin
          .from('clients')
          .select('id')
          .eq('tenant_id', tenant_id)
          .eq('phone', row.customer_phone)
          .maybeSingle()

        if (existingClient) clientId = existingClient.id
      }

      if (!clientId) {
        const { data: newClient, error: clientError } = await supabaseAdmin
          .from('clients')
          .insert({
            tenant_id,
            name: row.customer_name,
            phone: row.customer_phone || null,
            address: row.address || null,
            sector: row.sector || null,
          })
          .select('id')
          .single()

        if (clientError) {
          results.failed.push({ import_reference: row.import_reference, reason: 'فشل إنشاء العميل: ' + clientError.message })
          continue
        }
        clientId = newClient.id
      }

      const detailsNote = [
        row.notes,
        row.items_summary ? `الأصناف (من الشيت): ${row.items_summary}` : null,
        `مستورد بالجملة بواسطة مدير المنصة — رقم الطلب الأصلي: ${row.import_reference}`,
      ]
        .filter(Boolean)
        .join(' | ')

      const { error: orderError } = await supabaseAdmin.from('orders').insert({
        tenant_id,
        client_id: clientId,
        assigned_user_id,
        quantity: row.quantity || null,
        total_amount: row.total_amount,
        deposit_paid: row.deposit_paid || 0,
        order_date: row.order_date || null,
        expected_delivery: row.expected_delivery || null,
        sector: row.sector || null,
        details: detailsNote,
        status: 'جديد',
        delivery_status: 'في الموعد',
        needs_completion: true,
        import_batch_id: importBatchId,
        import_reference: row.import_reference,
        imported_by: admin.id,          // ⚠️ ده الـ platform admin نفسه، للتدقيق الداخلي بس
        imported_at: now,
      })

      if (orderError) {
        const isDuplicate =
          orderError.code === UNIQUE_VIOLATION_CODE &&
          orderError.message?.includes('uq_orders_import_dedupe')
        if (isDuplicate) results.duplicates++
        else results.failed.push({ import_reference: row.import_reference, reason: orderError.message })
        continue
      }

      results.inserted++
    }

    // سجل تدقيق — نفس جدول admin_actions المستخدم في صفحة إدارة الشركات
    await supabaseAdmin.from('admin_actions').insert({
      tenant_id,
      admin_id: admin.id,
      admin_email: admin.email,
      action: 'bulk_import_orders',
      details: {
        sales_rep_id: assigned_user_id,
        sales_rep_name: salesRep.full_name,
        inserted: results.inserted,
        duplicates: results.duplicates,
        failed: results.failed.length,
        import_batch_id: importBatchId,
      },
    })

    return successResponse(results, 201)
  } catch (error) {
    return handleError(error)
  }
}