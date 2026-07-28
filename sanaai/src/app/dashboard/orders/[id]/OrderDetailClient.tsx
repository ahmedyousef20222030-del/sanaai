'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import OrderTabs from './OrderTabs'
import OrderImageGallery from './OrderImageGallery'

interface ProductionOrder {
  id: string
  customer_name: string
  phone?: string
  order_date: string
  end_date?: string
  final_status: string
  sales_rep: string
  supervisor?: string
  address?: string
  city?: string
  notes?: string
  total_price?: number
  paid?: number
  remaining?: number
  details?: string
  design_link?: string
  order_number?: string
  sector?: string
  quantity?: number
  week_number?: number
  stage_design: string
  stage_cut: string
  stage_sew: string
  stage_print: string
  stage_pack: string
  updated_at: string
  tenant_id: string
  order_id: string
  attachments?: string[]
}

const statusColor: Record<string, string> = {
  'جديد':      'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'قيد المعالجة': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'محلول':     'bg-green-500/20 text-green-400 border-green-500/30',
  'مغلق':      'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const priorityColor: Record<string, string> = {
  'عالي':   'text-red-400',
  'متوسط':  'text-amber-400',
  'منخفض':  'text-green-400',
}

export default function OrderDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [complaints, setComplaints] = useState<any[]>([])
  const [complaintsLoading, setComplaintsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: me } = await supabase.from('users').select('tenant_id').single()
      if (!me?.tenant_id) throw new Error('بدون صلاحيات')

      const { data, error } = await supabase
        .from('production')
        .select(
          `
          *,
          orders!order_id (
            id,
            order_number,
            order_date,
            expected_delivery,
            total_amount,
            deposit_paid,
            remaining_amount,
            details,
            sector,
            quantity,
            week_number,
            attachments,
            assigned_user_id,
            users:assigned_user_id (
              full_name
            ),
            clients (
              name,
              phone,
              address,
              city
            )
          )
        `
        )
        .eq('tenant_id', me.tenant_id)
        .eq('order_id', id)
        .single()

      if (error) throw error
      if (!data) throw new Error('الطلب غير موجود')

      const mapped: ProductionOrder = {
        id: data.id,
        order_id: id,
        customer_name: data.orders?.clients?.name || '—',
        phone: data.orders?.clients?.phone,
        order_date: data.orders?.order_date || '',
        end_date: data.orders?.expected_delivery,
        final_status: data.final_status || 'بانتظار التنفيذ',
        sales_rep: data.orders?.users?.full_name || '—',
        supervisor: data.orders?.users?.full_name,
        address: data.orders?.clients?.address,
        city: data.orders?.clients?.city,
        notes: data.orders?.details,
        total_price: data.orders?.total_amount,
        paid: data.orders?.deposit_paid,
        remaining: data.orders?.remaining_amount,
        details: data.orders?.details,
        design_link: undefined,
        order_number: data.orders?.order_number,
        sector: data.orders?.sector,
        quantity: data.orders?.quantity,
        week_number: data.orders?.week_number,
        stage_design: data.stage_design || 'pending',
        stage_cut: data.stage_cut || 'pending',
        stage_sew: data.stage_sew || 'pending',
        stage_print: data.stage_print || 'pending',
        stage_pack: data.stage_pack || 'pending',
        updated_at: data.updated_at,
        tenant_id: me.tenant_id,
        attachments: data.orders?.attachments,
      }

      setOrder(mapped)
      loadComplaints(me.tenant_id)
    } catch (err) {
      console.error('خطأ:', err)
      setFetchError(err instanceof Error ? err.message : 'خطأ في جلب البيانات')
    } finally {
      setLoading(false)
    }
  }

  async function loadComplaints(tenantId: string) {
    setComplaintsLoading(true)
    const { data } = await supabase
      .from('complaints')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('order_id', id)
      .order('created_at', { ascending: false })
    setComplaints(data || [])
    setComplaintsLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08090A] flex items-center justify-center">
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    )
  }

  if (fetchError || !order) {
    return (
      <div className="min-h-screen bg-[#08090A] flex flex-col items-center justify-center gap-4">
        <div className="text-red-400">
          <p className="text-lg font-bold">خطأ</p>
          <p className="text-sm">{fetchError || 'الطلب غير موجود'}</p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-[#D4A843] text-[#08090A] rounded-lg font-bold"
        >
          رجوع
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#08090A] p-6 text-[#F0EDE8]" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white mb-2">طلب</h1>
          <p className="text-sm text-gray-400">
            {order.customer_name}
            {order.order_number && <span className="text-[#D4A843] font-mono mr-2">· {order.order_number}</span>}
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 text-sm border border-white/10 rounded-lg text-gray-400 hover:text-[#D4A843] transition"
        >
          ← رجوع
        </button>
      </div>

      {/* Tabs */}
      <OrderTabs
        tabs={{
          details: (
            <div className="space-y-6">
              {/* Financial Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#111318] border border-white/5 rounded-lg p-4 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-2">الإجمالي</p>
                  <p className="text-2xl font-black text-[#D4A843]">{order.total_price?.toLocaleString()} ج.م</p>
                </div>
                <div className="bg-[#111318] border border-white/5 rounded-lg p-4 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-2">المدفوع</p>
                  <p className="text-2xl font-black text-green-400">{order.paid?.toLocaleString()} ج.م</p>
                </div>
                <div className="bg-[#111318] border border-white/5 rounded-lg p-4 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-2">المتبقي</p>
                  <p className="text-2xl font-black text-red-400">{order.remaining?.toLocaleString()} ج.م</p>
                </div>
                <div className="bg-[#111318] border border-white/5 rounded-lg p-4 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-2">الحالة</p>
                  <p className="text-sm font-bold text-[#D4A843]">{order.final_status}</p>
                </div>
              </div>

              {/* Order Info */}
              <div className="bg-[#111318] border border-white/5 rounded-lg p-6 space-y-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">العميل</p>
                    <p className="text-white font-semibold">{order.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">الهاتف</p>
                    <p className="text-white font-semibold">{order.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">العنوان</p>
                    <p className="text-white font-semibold">
                      {order.address || '—'}{order.city ? ` - ${order.city}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">مندوب المبيعات</p>
                    <p className="text-white font-semibold">{order.sales_rep}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">تاريخ الطلب</p>
                    <p className="text-white font-semibold">{order.order_date?.split('T')[0] || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">التسليم المتوقع</p>
                    <p className="text-white font-semibold">{order.end_date?.split('T')[0] || '—'}</p>
                  </div>
                  {order.sector && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">القطاع</p>
                      <p className="text-white font-semibold">{order.sector}</p>
                    </div>
                  )}
                  {order.quantity !== undefined && order.quantity !== null && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">الكمية</p>
                      <p className="text-white font-semibold">{order.quantity}</p>
                    </div>
                  )}
                </div>
                {order.notes && (
                  <div className="pt-4 border-t border-white/5">
                    <p className="text-xs text-gray-500 mb-2">الملاحظات</p>
                    <p className="text-sm text-gray-300">{order.notes}</p>
                  </div>
                )}
              </div>
            </div>
          ),

          production: (
            <div className="space-y-3">
              {[
                { label: 'التصميم', stage: 'stage_design', icon: '🎨' },
                { label: 'القص', stage: 'stage_cut', icon: '✂️' },
                { label: 'الخياطة', stage: 'stage_sew', icon: '🧵' },
                { label: 'الطباعة', stage: 'stage_print', icon: '🖨️' },
                { label: 'التغليف', stage: 'stage_pack', icon: '📦' },
              ].map(({ label, stage, icon }) => (
                <div key={stage} className="bg-[#111318] border border-white/5 rounded-lg p-4 hover:border-white/10 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{icon}</span>
                      <span className="font-semibold text-white">{label}</span>
                    </div>
                    <span
                      className={`text-xs px-3 py-1 rounded-full font-bold ${
                        order[stage as keyof ProductionOrder] === 'done'
                          ? 'bg-green-500/20 text-green-400'
                          : order[stage as keyof ProductionOrder] === 'in_progress'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {order[stage as keyof ProductionOrder] === 'done'
                        ? '✓ مكتمل'
                        : order[stage as keyof ProductionOrder] === 'in_progress'
                          ? '⚙ جاري'
                          : '⏳ بانتظار'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ),

          images: <OrderImageGallery orderId={id} tenantId={order.tenant_id} canEdit={true} legacyAttachments={order.attachments || []} />,

          complaints: (
            <div className="space-y-4">
              {complaintsLoading ? (
                <div className="text-center py-12 text-gray-600 text-sm">جاري التحميل...</div>
              ) : complaints.length === 0 ? (
                <div className="text-center py-12 text-gray-600 text-sm">لا توجد شكاوى مرتبطة بهذا الطلب</div>
              ) : (
                complaints.map(c => (
                  <div key={c.id} className="bg-[#111318] border border-white/5 rounded-lg p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-white text-sm">{c.complaint_type}</h3>
                          {c.complaint_number && (
                            <span className="text-[10px] font-mono text-gray-600">#{c.complaint_number}</span>
                          )}
                          {c.priority && (
                            <span className={`text-[10px] font-bold ${priorityColor[c.priority]}`}>
                              ● {c.priority}
                            </span>
                          )}
                        </div>
                      </div>
                      {c.status && (
                        <span className={`text-xs px-3 py-1 rounded-full border ${statusColor[c.status]}`}>
                          {c.status}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-xs text-gray-500 leading-relaxed mb-2">{c.description}</p>
                    )}
                    <div className="text-[10px] text-gray-700">
                      {new Date(c.created_at).toLocaleDateString('ar-EG')}
                    </div>
                  </div>
                ))
              )}
            </div>
          ),
        }}
      />
    </div>
  )
}