'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ordersApi, authApi } from '@/lib/api/client'
import { Permission } from '@/lib/types'

// ── Types ──────────────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'جديد',         icon: '🆕', color: 'border-blue-500/30   bg-blue-500/5' },
  { key: 'تحت الإنتاج', icon: '⚙️', color: 'border-amber-500/30  bg-amber-500/5' },
  { key: 'فحص الجودة',  icon: '🔍', color: 'border-purple-500/30 bg-purple-500/5' },
  { key: 'جاهز للشحن',  icon: '📦', color: 'border-cyan-500/30   bg-cyan-500/5' },
  { key: 'تم التسليم',  icon: '✅', color: 'border-green-500/30  bg-green-500/5' },
] as const

const badgeColor: Record<string, string> = {
  'جديد':         'bg-blue-500/20 text-blue-300',
  'تحت الإنتاج': 'bg-amber-500/20 text-amber-300',
  'فحص الجودة':  'bg-purple-500/20 text-purple-300',
  'جاهز للشحن':  'bg-cyan-500/20 text-cyan-300',
  'تم التسليم':  'bg-green-500/20 text-green-300',
}

type PipelineOrder = {
  id: string
  order_number: string
  status: string
  delivery_status: string | null
  quantity: number
  total_amount: number
  remaining_amount: number | null
  expected_delivery: string | null
  clients: { name: string } | null
  assigned_user: { full_name: string } | null
  production: { progress_pct: number | null }[]
}

const fmt = (n: number) => Number(n || 0).toLocaleString('ar-EG')

export default function PipelinePage() {
  const router = useRouter()
  const [orders, setOrders]   = useState<PipelineOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [moving, setMoving]   = useState<string | null>(null)
  const [canEditOrders, setCanEditOrders] = useState(false)
  const [permLoading, setPermLoading] = useState(true)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const draggingOrderId = useRef<string | null>(null)

  useEffect(() => {
    fetchOrders()
    fetchPermission()
  }, [])

  async function fetchPermission() {
    setPermLoading(true)
    try {
      const me = await authApi.getCurrentUser() as { permissions: string[] }
      setCanEditOrders(me.permissions.includes(Permission.OrdersUpdate))
    } catch {
      // Fail closed: if we can't confirm the permission, don't allow editing.
      setCanEditOrders(false)
    } finally {
      setPermLoading(false)
    }
  }

  async function fetchOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, delivery_status, quantity,
        total_amount, remaining_amount, expected_delivery,
        clients(name),
        assigned_user:users!assigned_user_id(full_name),
        production(progress_pct)
      `)
      .not('status', 'in', '("مغلق")')
      .order('created_at', { ascending: false })
    setOrders((data as unknown as PipelineOrder[]) || [])
    setLoading(false)
  }

  function getStageIndex(status: string) {
    return STAGES.findIndex(s => s.key === status)
  }

  async function moveOrder(orderId: string, newStatus: string) {
    if (!canEditOrders) return
    const current = orders.find(o => o.id === orderId)
    if (!current || current.status === newStatus) return

    setMoving(orderId)
    // Optimistic update
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o)))

    try {
      // 🔒 Routed through the already-secured PATCH /api/orders/[id]
      // endpoint, which checks Permission.OrdersUpdate (derived from the
      // real can_edit_orders column) server-side. The client-side
      // canEditOrders check above only controls the UI affordance —
      // this call is what actually enforces the permission, so even a
      // user poking at this from the browser console can't bypass it.
      await ordersApi.updateStatus(orderId, newStatus)
    } catch (err) {
      // Roll back on failure (e.g. permission revoked mid-session, network error)
      setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status: current.status } : o)))
      alert('تعذر نقل الطلب: ' + (err instanceof Error ? err.message : 'خطأ غير متوقع'))
    } finally {
      setMoving(null)
    }
  }

  function moveAdjacent(orderId: string, direction: 1 | -1) {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    const idx = getStageIndex(order.status)
    const nextIdx = idx + direction
    if (nextIdx < 0 || nextIdx >= STAGES.length) return
    moveOrder(orderId, STAGES[nextIdx].key)
  }

  // ── Drag & Drop handlers ──────────────────────────────────────────────────────
  function handleDragStart(orderId: string) {
    if (!canEditOrders) return
    draggingOrderId.current = orderId
  }

  function handleDragEnd() {
    draggingOrderId.current = null
    setDragOverStage(null)
  }

  function handleDropOnStage(stageKey: string) {
    setDragOverStage(null)
    const orderId = draggingOrderId.current
    draggingOrderId.current = null
    if (!orderId) return
    moveOrder(orderId, stageKey)
  }

  // ── Derived stats ──────────────────────────────────────────────────────────────
  const totalValue = orders.reduce((s, o) => s + (o.total_amount || 0), 0)
  const lateCount = orders.filter(o => o.delivery_status === 'متأخر').length

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black text-white">🔄 خط الإنتاج</h1>
          <p className="text-sm text-gray-500 mt-1">تتبع مراحل الطلبات — اسحب الكارت أو استخدم الأسهم للنقل</p>
        </div>
        <div className="flex gap-3 text-xs">
          <div className="bg-[#111927] border border-white/5 rounded-xl px-4 py-2 text-center">
            <div className="text-gray-500">إجمالي الطلبات</div>
            <div className="text-white font-bold text-sm">{orders.length}</div>
          </div>
          <div className="bg-[#111927] border border-white/5 rounded-xl px-4 py-2 text-center">
            <div className="text-gray-500">القيمة الإجمالية</div>
            <div className="text-amber-400 font-bold text-sm">{fmt(totalValue)} ج.م</div>
          </div>
          {lateCount > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 text-center">
              <div className="text-red-400">متأخرة</div>
              <div className="text-red-400 font-bold text-sm">{lateCount}</div>
            </div>
          )}
        </div>
      </div>

      {!permLoading && !canEditOrders && (
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 mb-6 text-xs text-gray-400">
          <span>👁</span>
          <span>وضع عرض فقط — ليس لديك صلاحية تعديل الطلبات، لذلك النقل والسحب معطّلان.</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري التحميل...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {STAGES.map((stage, stageIdx) => {
            const stageOrders = orders.filter(o => o.status === stage.key)
            const isDragOver = dragOverStage === stage.key
            return (
              <div
                key={stage.key}
                className={`rounded-2xl border p-4 transition ${stage.color} ${isDragOver ? 'ring-2 ring-amber-400/60' : ''}`}
                onDragOver={e => { if (canEditOrders) { e.preventDefault(); setDragOverStage(stage.key) } }}
                onDragLeave={() => setDragOverStage(prev => (prev === stage.key ? null : prev))}
                onDrop={e => { e.preventDefault(); handleDropOnStage(stage.key) }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span>{stage.icon}</span>
                    <span className="text-sm font-bold text-white">{stage.key}</span>
                  </div>
                  <span className="text-xs bg-white/10 text-gray-400 rounded-full px-2 py-0.5">
                    {stageOrders.length}
                  </span>
                </div>

                <div className="space-y-3 min-h-[80px]">
                  {stageOrders.map(o => {
                    const isMoving = moving === o.id
                    const isLate = o.delivery_status === 'متأخر'
                    const progress = o.production?.[0]?.progress_pct ?? null
                    const remaining = o.remaining_amount ?? (o.total_amount || 0)

                    return (
                      <div
                        key={o.id}
                        draggable={canEditOrders}
                        onDragStart={() => handleDragStart(o.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => router.push(`/dashboard/orders/${o.id}`)}
                        className={`bg-[#111927] rounded-xl border p-3 transition
                          ${canEditOrders ? 'cursor-grab active:cursor-grabbing hover:border-white/10' : 'cursor-pointer hover:border-white/10'}
                          ${isLate ? 'border-red-500/40' : 'border-white/5'}
                          ${isMoving ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-amber-400">{o.order_number}</span>
                          <div className="flex items-center gap-1">
                            {isLate && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">⚠ متأخر</span>
                            )}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${badgeColor[o.status] || ''}`}>
                              {o.status}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs font-semibold text-white mb-0.5">{o.clients?.name || '—'}</p>
                        <p className="text-[10px] text-gray-600 mb-2">{o.quantity} قطعة</p>

                        {o.assigned_user?.full_name && (
                          <p className="text-[10px] text-gray-500 mb-2 flex items-center gap-1">
                            👤 {o.assigned_user.full_name}
                          </p>
                        )}

                        {/* Financial info */}
                        <div className="flex items-center justify-between text-[10px] mb-2 bg-white/[0.03] rounded-lg px-2 py-1.5">
                          <span className="text-gray-500">الإجمالي: <span className="text-gray-300 font-bold">{fmt(o.total_amount)}</span></span>
                          {remaining > 0 && (
                            <span className="text-red-400 font-bold">متبقي {fmt(remaining)}</span>
                          )}
                        </div>

                        {/* Production progress */}
                        {progress !== null && (
                          <div className="mb-2">
                            <div className="flex justify-between text-[9px] text-gray-600 mb-1">
                              <span>تقدم الإنتاج</span>
                              <span className="text-amber-400 font-bold">{Math.round(progress)}%</span>
                            </div>
                            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        )}

                        {o.expected_delivery && (
                          <p className={`text-[9px] mb-2 ${isLate ? 'text-red-400' : 'text-gray-600'}`}>
                            📅 التسليم: {new Date(o.expected_delivery).toLocaleDateString('ar-EG')}
                          </p>
                        )}

                        {canEditOrders && (
                          <div className="flex gap-1.5">
                            <button
                              disabled={isMoving || stageIdx === 0}
                              onClick={e => { e.stopPropagation(); moveAdjacent(o.id, -1) }}
                              className="flex-1 text-[10px] py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
                              →
                            </button>
                            <button
                              disabled={isMoving || stageIdx === STAGES.length - 1}
                              onClick={e => { e.stopPropagation(); moveAdjacent(o.id, 1) }}
                              className="flex-1 text-[10px] py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-amber-500/20 hover:text-amber-400 transition border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
                              {isMoving ? '...' : '←'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {stageOrders.length === 0 && (
                    <div className="text-center py-6 text-gray-700 text-xs border-2 border-dashed border-white/5 rounded-xl">
                      اسحب طلب هنا
                    </div>
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