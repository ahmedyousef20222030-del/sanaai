'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Props = {
  executionType: 'تطريز' | 'طباعة'
  title: string
  emoji: string
}

// طلب كامل النوع واحد (execution_type = تطريز أو طباعة مباشرة)
type WholeOrderRow = {
  id: string
  order_number: string
  status: string
  quantity: number | null
  expected_delivery: string | null
  execution_type: string | null
  clients: { name: string } | null
}

// صنف منفرد جوه طلب "مختلط" (فيه أكتر من نوع تنفيذ داخل نفس الطلب)
type MixedItemRow = {
  id: string
  name: string
  size: string | null
  color: string | null
  quantity: number
  execution_type: string | null
  custom_detail: string | null
  orders: {
    id: string
    order_number: string
    status: string
    expected_delivery: string | null
    execution_type: string | null
    clients: { name: string } | null
  } | null
}

const ACTIVE_STATUSES_EXCLUDE = ['تم التسليم', 'مغلق']

function statusColor(status: string) {
  const map: Record<string, string> = {
    'جديد': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    'تحت الإنتاج': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'فحص الجودة': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    'جاهز للشحن': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    'تم التسليم': 'bg-green-500/20 text-green-300 border-green-500/30',
    'مغلق': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }
  return map[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('ar-EG') : '—'
}

export default function ProductionTypeBoard({ executionType, title, emoji }: Props) {
  const router = useRouter()
  const [wholeOrders, setWholeOrders] = useState<WholeOrderRow[]>([])
  const [mixedItems, setMixedItems] = useState<MixedItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false) // false = إخفاء المُسلَّم/المغلق

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1) طلبات نوعها بالكامل نفس التصنيف المطلوب
      const wholeQuery = supabase
        .from('orders')
        .select('id, order_number, status, quantity, expected_delivery, execution_type, clients(name)')
        .eq('execution_type', executionType)
        .is('deleted_at', null)
        .order('expected_delivery', { ascending: true })

      // 2) أصناف منفردة جوه طلبات "مختلط" بتخص النوع المطلوب فقط
      const mixedQuery = supabase
        .from('order_items')
        .select(`
          id, name, size, color, quantity, execution_type, custom_detail,
          orders!inner(id, order_number, status, expected_delivery, execution_type, clients(name))
        `)
        .eq('execution_type', executionType)
        .eq('orders.execution_type', 'مختلط')

      const [wholeRes, mixedRes] = await Promise.all([wholeQuery, mixedQuery])

      if (wholeRes.error) throw wholeRes.error
      if (mixedRes.error) throw mixedRes.error

      setWholeOrders((wholeRes.data as any) || [])
      setMixedItems((mixedRes.data as any) || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }, [executionType])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const term = search.trim().toLowerCase()

  const filteredWhole = wholeOrders.filter(o => {
    if (!showAll && ACTIVE_STATUSES_EXCLUDE.includes(o.status)) return false
    if (!term) return true
    return (
      o.order_number?.toLowerCase().includes(term) ||
      o.clients?.name?.toLowerCase().includes(term)
    )
  })

  const filteredMixed = mixedItems.filter(item => {
    const parentStatus = item.orders?.status || ''
    if (!showAll && ACTIVE_STATUSES_EXCLUDE.includes(parentStatus)) return false
    if (!term) return true
    return (
      item.orders?.order_number?.toLowerCase().includes(term) ||
      item.orders?.clients?.name?.toLowerCase().includes(term) ||
      item.name?.toLowerCase().includes(term)
    )
  })

  const totalCount = filteredWhole.length + filteredMixed.length

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">{emoji} {title}</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} عنصر يحتاج {executionType}</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2 text-xs border border-amber-600/30 text-amber-400 rounded-lg hover:bg-amber-500/10 transition disabled:opacity-50"
        >
          {loading ? '⏳ تحديث...' : '🔄 تحديث'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}

      <div className="flex gap-3 flex-wrap mb-6">
        <input
          type="text"
          placeholder="🔍 ابحث برقم الطلب أو اسم العميل..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
        />
        <button
          onClick={() => setShowAll(v => !v)}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition border ${
            showAll
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              : 'text-gray-500 border-white/10 hover:border-white/20'
          }`}
        >
          {showAll ? '✅ عرض الكل (بما فيه المُسلَّم)' : '⚡ عرض النشط فقط'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري التحميل...</div>
      ) : totalCount === 0 ? (
        <div className="text-center py-16 bg-[#111927] rounded-3xl border border-white/5 text-gray-600">
          <div className="text-4xl mb-3">{emoji}</div>
          <p>لا توجد أوردرات {executionType} حالياً</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* الطلبات كاملة النوع */}
          {filteredWhole.length > 0 && (
            <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/5 text-xs font-bold text-amber-400">
                طلبات {executionType} بالكامل ({filteredWhole.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.02]">
                    <tr className="text-right">
                      {['رقم الطلب', 'العميل', 'الكمية', 'الحالة', 'التسليم المتوقع'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWhole.map(o => (
                      <tr
                        key={o.id}
                        onClick={() => router.push(`/dashboard/orders/${o.id}`)}
                        className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer"
                      >
                        <td className="px-4 py-3 font-mono text-amber-400 text-xs font-bold">{o.order_number}</td>
                        <td className="px-4 py-3 text-xs text-white">{o.clients?.name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{o.quantity ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(o.status)}`}>{o.status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(o.expected_delivery)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* أصناف منفردة جوه طلبات مختلطة */}
          {filteredMixed.length > 0 && (
            <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/5 text-xs font-bold text-cyan-400">
                أصناف {executionType} داخل طلبات مختلطة ({filteredMixed.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.02]">
                    <tr className="text-right">
                      {['رقم الطلب', 'العميل', 'الصنف', 'المقاس/اللون', 'الكمية', 'الحالة', 'التسليم المتوقع'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMixed.map(item => (
                      <tr
                        key={item.id}
                        onClick={() => item.orders?.id && router.push(`/dashboard/orders/${item.orders.id}`)}
                        className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer"
                      >
                        <td className="px-4 py-3 font-mono text-amber-400 text-xs font-bold">{item.orders?.order_number}</td>
                        <td className="px-4 py-3 text-xs text-white">{item.orders?.clients?.name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-white">
                          {item.name}
                          {item.custom_detail && <span className="block text-[10px] text-gray-500">{item.custom_detail}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {[item.size, item.color].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{item.quantity}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(item.orders?.status || '')}`}>
                            {item.orders?.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(item.orders?.expected_delivery || null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}