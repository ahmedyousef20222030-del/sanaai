import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { updateOrderSchema, updateOrderStatusSchema } from '@/lib/server/validators'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'

type Props = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.OrdersRead)

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, tenant_id, client_id, assigned_user_id, order_number, order_seq, details, sector, quantity, status, delivery_status, total_amount, deposit_paid, remaining_amount, order_date, expected_delivery, actual_delivery, week_number, created_at, updated_at, attachments, clients(id, name, phone, sector, city, rating), assigned_user:users(id, full_name)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (error || !data) throw new NotFoundError('Order')
    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.OrdersUpdate)

    const body = await request.json()
    const validated = updateOrderSchema.partial().parse(body)

    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ ...validated, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id, tenant_id, client_id, assigned_user_id, order_number, order_seq, details, sector, quantity, status, delivery_status, total_amount, deposit_paid, remaining_amount, order_date, expected_delivery, actual_delivery, week_number, created_at, updated_at, attachments')
      .single()

    if (error || !data) throw new NotFoundError('Order')
    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.OrdersDelete)

    const { error } = await supabaseAdmin
      .from('orders')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)

    if (error) throw error
    return successResponse({ success: true, message: 'Order deleted' })
  } catch (error) {
    return handleError(error)
  }
}

// حالة الطلب اللي لما نوصلها، لازم شحنة تتفتح تلقائيًا لو مفيش شحنة موجودة أصلاً لنفس الطلب
const SHIPMENT_TRIGGER_STATUS = 'جاهز للشحن'

export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    checkPermission(user, Permission.OrdersUpdate)

    const body = await request.json()
    const validated = updateOrderStatusSchema.parse(body)

    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status: validated.status, notes: validated.notes, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id, tenant_id, client_id, assigned_user_id, order_number, order_seq, details, sector, quantity, status, delivery_status, total_amount, deposit_paid, remaining_amount, order_date, expected_delivery, actual_delivery, week_number, created_at, updated_at, attachments')
      .single()

    if (error || !data) throw new NotFoundError('Order')

    // ✅ لو الطلب دخل مرحلة "جاهز للشحن"، ننشئ صف شحنة تلقائيًا في جدول shipments
    // (لو مفيش شحنة مسجلة له بالفعل، عشان منكررش الصف لو الحالة اتغيرت رايح وجاي)
    if (validated.status === SHIPMENT_TRIGGER_STATUS) {
      const { data: existingShipment } = await supabaseAdmin
        .from('shipments')
        .select('id')
        .eq('order_id', id)
        .eq('tenant_id', user.tenantId)
        .maybeSingle()

      if (!existingShipment) {
        // بنجيب عنوان العميل عشان نحطه كعنوان تسليم افتراضي للشحنة
        const { data: client } = await supabaseAdmin
          .from('clients')
          .select('address, city')
          .eq('id', data.client_id)
          .maybeSingle()

        const shippingAddress = [client?.address, client?.city].filter(Boolean).join('، ') || null

        // bill_number عمود إجباري في جدول shipments وملوش قيمة افتراضية،
        // فبنولّده تلقائيًا من رقم الطلب نفسه
        const { error: shipmentError } = await supabaseAdmin
          .from('shipments')
          .insert({
            tenant_id: user.tenantId,
            order_id: id,
            bill_number: `SHP-${data.order_number}`,
            shipping_address: shippingAddress,
          })

        // خطأ إنشاء الشحنة ما ينفعش يفشّل تحديث حالة الطلب نفسه، بس نسجله في الـ logs
        if (shipmentError) {
          console.error('Failed to auto-create shipment for order', id, shipmentError)
        }
      }
    }

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}