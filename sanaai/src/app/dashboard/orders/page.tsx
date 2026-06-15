'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Order = {
  id: string
  order_number: string
  status: string
  delivery_status: string
  total_price: number // ✅ تم التصحيح من total_amount إلى total_price ليطابق السكيما
  expected_delivery: string
  created_at: string
  clients: { name: string; phone: string }
}

const statusColor: Record<string, string> = {
  'جديد':         'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'تحت الإنتاج': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'فحص الجودة':  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'جاهز للشحن':  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'تم التسليم':  'bg-green-500/20 text-green-300 border-green-500/30',
  'مغلق':        'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const deliveryColor: Record<string, string> = {
  'في الموعد': 'text-green-400',
  'متأخر':     'text-red-400',
  'مبكر':      'text-blue-400',
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders]   = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('الكل')

  const statuses = ['الكل', 'جديد', 'تحت الإنتاج', 'فحص الجودة', 'جاهز للشحن', 'تم التسليم', 'مغلق']

  useEffect(() => {
    fetchOrders()
  }, [])

  async function fetchOrders() {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, clients(name, phone)')
      .order('created_at', { ascending: false })
    
    if (!error) setOrders(data || [])
    setLoading(false)
  }

  const filtered = orders.filter(o => {
    const matchStatus = filter === 'الكل' || o.status === filter
    const matchSearch = !search ||
      o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.clients?.name?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">📦 إدارة الطلبات</h1>
            <p className="text-sm text-gray-500 mt-1">{orders.length} طلب في النظام</p>
          </div>
          {/* Quick Stat: Total Value of filtered orders */}
          <div className="mr-6 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <span className="text-[10px] text-gray-500 block">إجمالي القيمة</span>
            <span className="text-amber-400 font-bold text-sm">
              {filtered.reduce((acc, curr) => acc + (curr.total_price || 0), 0).toLocaleString('ar-EG')} ج.م
            </span>
          </div>
        </div>
        <button onClick={() => router.push('/dashboard/orders/new')}
          className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm shadow-lg shadow-amber-500/20">
          ➕ طلب جديد
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600">🔍</span>
          <input
            type="text" placeholder="بحث باسم العميل أو رقم الطلب..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#111927] border border-white/10 rounded-xl px-11 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 transition"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          {statuses.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition border whitespace-nowrap
                ${filter === s
                  ? 'bg-amber-500 text-black border-amber-500'
                  : 'text-gray-500 border-white/10 hover:border-white/20 bg-white/5'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-600 gap-3">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <p>جاري تحميل الطلبات...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-gray-600">لا توجد طلبات تطابق هذا البحث</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] border-b border-white/5">
                <tr className="text-right">
                  {['رقم الطلب', 'العميل', 'الحالة', 'التسليم', 'المبلغ الإجمالي', 'التاريخ'].map(h => (
                    <th key={h} className="text-xs text-gray-500 font-medium px-5 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}
                    className="border-b border-white/5 hover:bg-white/[0.03] transition cursor-pointer group"
                    onClick={() => router.push(`/dashboard/orders/${o.id}`)}>
                    <td className="px-5 py-4 font-mono text-amber-400 text-xs font-bold group-hover:text-amber-300">
                      {o.order_number}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white text-xs">{o.clients?.name || 'عميل غير معروف'}</div>
                      <div className="text-gray-600 text-[10px]">{o.clients?.phone}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor[o.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className={`px-5 py-4 text-xs font-medium ${deliveryColor[o.delivery_status] || 'text-gray-400'}`}>
                      {o.delivery_status || 'في الموعد'}
                    </td>
                    <td className="px-5 py-4 text-amber-400 font-bold text-xs">
                      {Number(o.total_price || 0).toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="px-5 py-4 text-gray-600 text-[10px]">
                      {new Date(o.created_at).toLocaleDateString('ar-EG')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}