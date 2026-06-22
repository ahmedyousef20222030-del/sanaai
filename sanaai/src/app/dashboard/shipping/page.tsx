'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ShippingPage() {
  const [shipments, setShipments] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState<string | null>(null)

  useEffect(() => {
    fetchShipments()
  }, [])

  async function fetchShipments() {
    setLoading(true)
    // جلب الشحنات مع بيانات الطلب والعميل (ربط صحيح حسب v1.1)
    const { data, error } = await supabase
      .from('shipments')
      .select('*, orders(order_number, actual_delivery, clients(name, phone))')
      .order('created_at', { ascending: false })
    
    if (!error) setShipments(data || [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string, orderId: string) {
    setSaving(id)
    try {
      // 1. تحديث حالة الشحنة (استخدام المسمى الصحيح delivery_status)
      const { error: shipError } = await supabase
        .from('shipments')
        .update({ delivery_status: status })
        .eq('id', id)
      
      if (shipError) throw shipError

      // 2. إذا كانت الحالة "تم التسليم"، نقوم بتحديث تاريخ التسليم الفعلي في جدول الطلبات
      if (status === 'تم التسليم') {
        await supabase
          .from('orders')
          .update({ actual_delivery: new Date().toISOString() })
          .eq('id', orderId)
      }

      // تحديث الحالة محلياً في الواجهة
      setShipments(s => s.map(x => x.id === id ? { ...x, delivery_status: status } : x))
    } catch (err: any) {
      alert('خطأ في تحديث الحالة: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  async function updateField(id: string, field: string, value: string) {
    try {
      // مابينج المسميات القديمة والجديدة لضمان عدم الخطأ
      const fieldMapping: Record<string, string> = {
        'carrier': 'shipping_company',
        'delivery_address': 'shipping_address',
        'tracking_number': 'tracking_number'
      }
      
      const dbField = fieldMapping[field] || field

      const { error } = await supabase
        .from('shipments')
        .update({ [dbField]: value })
        .eq('id', id)
      
      if (error) throw error
      setShipments(s => s.map(x => x.id === id ? { ...x, [field]: value } : x))
    } catch (err: any) {
      alert('خطأ في التحديث: ' + err.message)
    }
  }

  // ✅ قيم متوافقة مع CHECK constraint في السكيما v1.1
  const statusColor: Record<string, string> = {
    'في الموعد':   'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'في الطريق':   'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'تم التسليم':   'bg-green-500/20 text-green-400 border-green-500/30',
    'مرتجع':        'bg-red-500/20 text-red-400 border-red-500/30',
    'متأخر':        'bg-red-600/20 text-red-500 border-red-600/30',
  }

  const statuses = ['في الموعد', 'في الطريق', 'تم التسليم', 'مرتجع', 'متأخر']

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">🚚 إدارة الشحن والتوصيل</h1>
        <p className="text-sm text-gray-500 mt-1">{shipments.length} شحنة مسجلة</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {statuses.map(s => (
          <div key={s} className="bg-[#111927] rounded-2xl border border-white/5 p-4 text-center shadow-sm">
            <div className="text-2xl font-black mb-1 text-white">
              {shipments.filter(x => x.delivery_status === s).length}
            </div>
            <div className="text-xs text-gray-500">{s}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري تحميل الشحنات...</div>
      ) : shipments.length === 0 ? (
        <div className="text-center py-16 text-gray-600 bg-[#111927] rounded-3xl border border-white/5">
          <div className="text-4xl mb-3">🚚</div>
          <p>لا توجد شحنات حالية</p>
        </div>
      ) : (
        <div className="space-y-4">
          {shipments.map(s => (
            <div key={s.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold border border-amber-500/20">
                    🚚
                  </div>
                  <div>
                    <span className="text-xs font-mono text-amber-400">{s.orders?.order_number}</span>
                    <div className="text-sm font-bold text-white mt-1">{s.orders?.clients?.name}</div>
                    <div className="text-xs text-gray-500">{s.orders?.clients?.phone}</div>
                  </div>
                </div>
                {s.delivery_status && (
                  <span className={`text-xs px-3 py-1 rounded-full border font-bold ${statusColor[s.delivery_status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                    {s.delivery_status}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">شركة الشحن</label>
                  <input
                    defaultValue={s.shipping_company || ''}
                    onBlur={e => updateField(s.id, 'carrier', e.target.value)}
                    placeholder="مثلاً: أريدكس"
                    className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">رقم التتبع</label>
                  <input
                    defaultValue={s.tracking_number || ''}
                    onBlur={e => updateField(s.id, 'tracking_number', e.target.value)}
                    placeholder="رقم الشحنة"
                    className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">عنوان التسليم</label>
                  <input
                    defaultValue={s.shipping_address || ''}
                    onBlur={e => updateField(s.id, 'delivery_address', e.target.value)}
                    placeholder="المنطقة، الشارع..."
                    className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">تاريخ التسليم الفعلي</label>
                  <div className="text-xs text-white bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2">
                    {s.orders?.actual_delivery
                      ? new Date(s.orders.actual_delivery).toLocaleDateString('ar-EG')
                      : 'بانتظار التسليم'}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {statuses.map(st => (
                  <button key={st}
                    disabled={saving === s.id}
                    onClick={() => updateStatus(s.id, st, s.order_id)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all
                      ${s.delivery_status === st
                        ? statusColor[st]
                        : 'bg-white/5 text-gray-600 border-white/5 hover:border-white/10'}`}>
                    {st}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}