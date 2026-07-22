'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import OrderDetailTabs from './OrderDetailTabs'
import OrderProductionStages from './OrderProductionStages'
import OrderImageGallery from './OrderImageGallery'

export default function OrderDetailClientNew({ id }: { id: string }) {
  const router = useRouter()
  const [order, setOrder] = useState<any>(null)
  const [production, setProduction] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    fetchOrder()
  }, [id])

  async function fetchOrder() {
    setLoading(true)
    setFetchError(null)

    try {
      const { data: me } = await supabase.from('users').select('tenant_id').single()
      if (!me?.tenant_id) throw new Error('بدون صلاحيات')

      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          clients(*),
          assigned_user:users!assigned_user_id(full_name),
          order_images(image_url, sort_order),
          attachments
        `
        )
        .eq('id', id)
        .eq('tenant_id', me.tenant_id)
        .single()

      if (error) throw error
      if (!data) throw new Error('الطلب غير موجود')

      setOrder(data)

      // Fetch production data
      const { data: prod } = await supabase
        .from('production')
        .select('*')
        .eq('order_id', id)
        .eq('tenant_id', me.tenant_id)
        .single()

      if (prod) setProduction(prod)
    } catch (err) {
      console.error('Error:', err)
      setFetchError(err instanceof Error ? err.message : 'خطأ في جلب البيانات')
    } finally {
      setLoading(false)
    }
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
        <div className="text-red-400 text-center">
          <p className="text-lg font-bold">خطأ</p>
          <p className="text-sm">{fetchError || 'الطلب غير موجود'}</p>
        </div>
        <button onClick={() => router.back()} className="px-4 py-2 bg-[#D4A843] text-[#08090A] rounded-lg font-bold">
          رجوع
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#08090A] p-6 text-[#F0EDE8]" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white mb-1">طلب #{order.order_number}</h1>
          <p className="text-sm text-gray-500">{order.clients?.name || '—'}</p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 text-sm border border-white/10 rounded-lg text-gray-400 hover:text-[#D4A843] transition"
        >
          ← رجوع
        </button>
      </div>

      {/* Tabs Section */}
      <OrderDetailTabs
        children={{
          details: (
            <div className="space-y-6">
              {/* Original order details content */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#111318] border border-white/5 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">الكمية</p>
                  <p className="text-xl font-black text-white">{order.quantity || '—'}</p>
                </div>
                <div className="bg-[#111318] border border-white/5 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">تاريخ التسليم المتوقع</p>
                  <p className="text-sm font-bold text-white">{order.expected_delivery?.split('T')[0] || '—'}</p>
                </div>
                <div className="bg-[#111318] border border-white/5 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">الإجمالي</p>
                  <p className="text-xl font-black text-[#D4A843]">{order.total_amount?.toLocaleString() || '—'} ج.م</p>
                </div>
                <div className="bg-[#111318] border border-white/5 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">المدفوع</p>
                  <p className="text-xl font-black text-white">{order.deposit_paid?.toLocaleString() || '—'} ج.م</p>
                </div>
              </div>
              <div className="bg-[#111318] border border-white/5 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">الملاحظات</p>
                <p className="text-sm text-gray-300">{order.details || 'لا توجد ملاحظات'}</p>
              </div>
            </div>
          ),
          production: production ? (
            <OrderProductionStages productionId={production.id} />
          ) : (
            <div className="text-center py-12 text-gray-600">
              <p>لا توجد بيانات إنتاج لهذا الطلب</p>
            </div>
          ),
          images: <OrderImageGallery orderId={id} tenantId={order.tenant_id} canEdit={true} legacyAttachments={order.attachments || []} />,
        }}
      />
    </div>
  )
}