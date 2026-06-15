'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const stages = [
  { key: 'جديد',         icon: '🆕', color: 'border-blue-500/30   bg-blue-500/5' },
  { key: 'تحت الإنتاج', icon: '⚙️', color: 'border-amber-500/30  bg-amber-500/5' },
  { key: 'فحص الجودة',  icon: '🔍', color: 'border-purple-500/30 bg-purple-500/5' },
  { key: 'جاهز للشحن',  icon: '📦', color: 'border-cyan-500/30   bg-cyan-500/5' },
  { key: 'تم التسليم',  icon: '✅', color: 'border-green-500/30  bg-green-500/5' },
]

const badgeColor: Record<string, string> = {
  'جديد':         'bg-blue-500/20 text-blue-300',
  'تحت الإنتاج': 'bg-amber-500/20 text-amber-300',
  'فحص الجودة':  'bg-purple-500/20 text-purple-300',
  'جاهز للشحن':  'bg-cyan-500/20 text-cyan-300',
  'تم التسليم':  'bg-green-500/20 text-green-300',
}

export default function PipelinePage() {
  const router = useRouter()
  const [orders, setOrders]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [moving, setMoving]   = useState<string | null>(null)

  useEffect(() => {
    supabase.from('orders')
      .select('id, order_number, status, quantity, expected_delivery, clients(name)')
      .not('status', 'in', '("مغلق")')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setOrders(data || []); setLoading(false) })
  }, [])

  async function moveOrder(orderId: string, newStatus: string) {
    setMoving(orderId)
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    setOrders(o => o.map((x: any) => x.id === orderId ? { ...x, status: newStatus } : x))
    setMoving(null)
  }

  function getNext(status: string) {
    const idx = stages.findIndex(s => s.key === status)
    return idx < stages.length - 1 ? stages[idx + 1].key : null
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">🔄 خط الإنتاج</h1>
        <p className="text-sm text-gray-500 mt-1">تتبع مراحل الطلبات</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري التحميل...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {stages.map(stage => {
            const stageOrders = orders.filter((o: any) => o.status === stage.key)
            return (
              <div key={stage.key} className={`rounded-2xl border p-4 ${stage.color}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span>{stage.icon}</span>
                    <span className="text-sm font-bold text-white">{stage.key}</span>
                  </div>
                  <span className="text-xs bg-white/10 text-gray-400 rounded-full px-2 py-0.5">
                    {stageOrders.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {stageOrders.map((o: any) => {
                    const next    = getNext(o.status)
                    const isMoving = moving === o.id
                    return (
                      <div key={o.id}
                        className="bg-[#111927] rounded-xl border border-white/5 p-3 cursor-pointer hover:border-white/10 transition"
                        onClick={() => router.push(`/dashboard/orders/${o.id}`)}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-amber-400">{o.order_number}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${badgeColor[o.status] || ''}`}>
                            {o.status}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-white mb-1">{o.clients?.name}</p>
                        <p className="text-[10px] text-gray-600 mb-3">{o.quantity} قطعة</p>
                        {next && (
                          <button
                            disabled={isMoving}
                            onClick={e => { e.stopPropagation(); moveOrder(o.id, next) }}
                            className="w-full text-[10px] py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-amber-500/20 hover:text-amber-400 transition border border-white/5 disabled:opacity-50">
                            {isMoving ? '...' : `← ${next}`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {stageOrders.length === 0 && (
                    <div className="text-center py-6 text-gray-700 text-xs">فارغ</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}