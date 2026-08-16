import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { paginationSchema } from '@/lib/server/validators'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'

/**
 * GET /api/orders
 * Get all orders with pagination and filtering
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    // Check permission
    if (!user.permissions.includes(Permission.OrdersRead)) {
      throw new Error('Insufficient permissions')
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Build query with tenant filter
    let query = supabaseAdmin
      .from('orders')
      .select('id, tenant_id, client_id, assigned_user_id, order_number, order_seq, details, sector, quantity, status, delivery_status, total_amount, deposit_paid, remaining_amount, order_date, expected_delivery, actual_delivery, week_number, created_at, updated_at, attachments, clients(name, phone, sector), assigned_user:users(full_name)', {
        count: 'exact',
      })
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters if provided
    const status = searchParams.get('status')
    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) throw error

    const totalPages = Math.ceil((count || 0) / limit)

    return successResponse({
      data: data || [],
      total: count || 0,
      page,
      pageSize: limit,
      totalPages,
    })
  } catch (error) {
    return handleError(error)
  }
}

// حالة الفاتورة بتتحدد حسب نسبة المبلغ المتبقي من إجمالي الطلب
function computeInvoiceStatus(totalAmount: number, remainingAmount: number, paidAmount: number): string {
  if (remainingAmount <= 0 && totalAmount > 0) return 'مدفوع'
  if (paidAmount > 0) return 'جزئي'
  return 'غير مدفوع'
}

/**
 * POST /api/orders
 * Create a new order
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    // Check permission
    if (!user.permissions.includes(Permission.OrdersCreate)) {
      throw new Error('Insufficient permissions')
    }

    const body = await request.json()

    // TODO: Add Zod validation
    // const validated = validateData(createOrderSchema, body)

    // Add tenant ID to the order
    const orderData = {
      ...body,
      tenant_id: user.tenantId,
      created_by: user.id,
    }

    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert(orderData)
      .select('id, tenant_id, client_id, assigned_user_id, order_number, order_seq, details, sector, quantity, status, delivery_status, total_amount, deposit_paid, remaining_amount, order_date, expected_delivery, actual_delivery, week_number, created_at, updated_at, attachments')
      .single()

    if (error) throw error
    if (!data) throw new NotFoundError('Order')

    // ✅ ننشئ فاتورة تلقائيًا مرتبطة بنفس الطلب، بنفس المبالغ
    // خطأ إنشاء الفاتورة ما ينفعش يفشّل إنشاء الطلب نفسه، بس نسجله في الـ logs
    const totalAmount = data.total_amount || 0
    const paidAmount = data.deposit_paid || 0
    const remainingAmount = data.remaining_amount ?? (totalAmount - paidAmount)

    const { error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert({
        tenant_id: user.tenantId,
        order_id: data.id,
        client_id: data.client_id,
        invoice_number: `INV-${data.order_number}`,
        invoice_date: new Date().toISOString().slice(0, 10),
        total_amount: totalAmount,
        paid_amount: paidAmount,
        // remaining_amount عمود محسوب تلقائيًا في الداتابيز (generated column)، مينفعش نكتب فيه يدويًا
        status: computeInvoiceStatus(totalAmount, remainingAmount, paidAmount),
      })

    if (invoiceError) {
      console.error('Failed to auto-create invoice for order', data.id, invoiceError)
    }

    return successResponse(data, 201)
  } catch (error) {
    return handleError(error)
  }
}