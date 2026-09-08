'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase' // عدّل المسار حسب مكان الـ client عندك

// ---------------------------------------------
// Types
// ---------------------------------------------

export type OrderStatus = 'جديد' | 'تحت الإنتاج' | 'جاهز للشحن' | 'تم التسليم'

export interface Order {
  id: string
  order_number: string
  client_name: string
  execution_type: string
  status: OrderStatus
  quantity: number
  due_date: string | null
  created_at: string
}

interface ProductionTypeBoardProps {
  executionType: string
  title: string
  emoji: string
}

export interface OrderStep {
  id: string
  order_id: string
  step_name: string
  sequence: number
  is_completed: boolean
  completed_at: string | null
}

// ---------------------------------------------
// إعدادات أعمدة الـ Board (عدّل العناوين والألوان براحتك)
// ---------------------------------------------

const STATUS_COLUMNS: { key: OrderStatus; label: string; color: string }[] = [
  { key: 'جديد', label: 'جديد', color: '#94a3b8' },
  { key: 'تحت الإنتاج', label: 'تحت الإنتاج', color: '#3b82f6' },
  { key: 'جاهز للشحن', label: 'جاهز للشحن', color: '#f59e0b' },
  { key: 'تم التسليم', label: 'تم التسليم', color: '#22c55e' },
]

// ---------------------------------------------
// Hook: جلب أوردرات نوع تنفيذ معين + تحديث لحظي (realtime)
// ---------------------------------------------

function useOrdersByExecutionType(executionType: string) {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('execution_type', executionType)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setOrders([])
    } else {
      setOrders(data ?? [])
    }

    setIsLoading(false)
  }, [executionType])

  useEffect(() => {
    fetchOrders()

    // تحديث لحظي: أي إضافة/تعديل/حذف في جدول orders بيتحدث في الـ board تلقائي
    const channel = supabase
      .channel(`orders-${executionType}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `execution_type=eq.${executionType}`,
        },
        () => {
          fetchOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [executionType, fetchOrders])

  return { orders, isLoading, error, refetch: fetchOrders }
}

// ---------------------------------------------
// Hook: خطوات أوردر واحد (checklist) + تحديث لحظي
// ---------------------------------------------

function useOrderSteps(orderId: string) {
  const [steps, setSteps] = useState<OrderStep[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchSteps = useCallback(async () => {
    const { data } = await supabase
      .from('order_steps')
      .select('*')
      .eq('order_id', orderId)
      .order('sequence', { ascending: true })

    setSteps(data ?? [])
    setIsLoading(false)
  }, [orderId])

  useEffect(() => {
    fetchSteps()

    const channel = supabase
      .channel(`order-steps-${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_steps', filter: `order_id=eq.${orderId}` },
        () => fetchSteps()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, fetchSteps])

  const toggleStep = useCallback(async (step: OrderStep) => {
    // تحديث فوري في الواجهة قبل رد السيرفر (optimistic update)
    setSteps((prev) =>
      prev.map((s) => (s.id === step.id ? { ...s, is_completed: !s.is_completed } : s))
    )

    await supabase
      .from('order_steps')
      .update({
        is_completed: !step.is_completed,
        completed_at: !step.is_completed ? new Date().toISOString() : null,
      })
      .eq('id', step.id)
  }, [])

  const addCustomStep = useCallback(
    async (stepName: string) => {
      const nextSequence = steps.length > 0 ? Math.max(...steps.map((s) => s.sequence)) + 1 : 1
      await supabase.from('order_steps').insert({
        order_id: orderId,
        step_name: stepName,
        sequence: nextSequence,
      })
    },
    [orderId, steps]
  )

  return { steps, isLoading, toggleStep, addCustomStep }
}

// ---------------------------------------------
// Component: بطاقة أوردر واحدة
// ---------------------------------------------

function OrderCard({ order }: { order: Order }) {
  const { steps, toggleStep, addCustomStep } = useOrderSteps(order.id)
  const [isExpanded, setIsExpanded] = useState(false)
  const [newStepName, setNewStepName] = useState('')

  const completedCount = steps.filter((s) => s.is_completed).length
  const progress = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : null

  const handleAddStep = async () => {
    const trimmed = newStepName.trim()
    if (!trimmed) return
    await addCustomStep(trimmed)
    setNewStepName('')
  }

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        border: '1px solid #eee',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>#{order.order_number}</strong>
        <span style={{ color: '#666', fontSize: 13 }}>{order.quantity} قطعة</span>
      </div>
      <div style={{ fontSize: 14, marginBottom: 4 }}>{order.client_name}</div>
      {order.due_date && (
        <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
          تسليم: {new Date(order.due_date).toLocaleDateString('ar-EG')}
        </div>
      )}

      {steps.length > 0 && (
        <>
          {/* شريط تقدم الخطوات */}
          <div
            onClick={() => setIsExpanded((v) => !v)}
            style={{ cursor: 'pointer', marginTop: 6 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 4 }}>
              <span>خطوات التنفيذ ({completedCount}/{steps.length})</span>
              <span>{isExpanded ? '▲' : '▼'}</span>
            </div>
            <div style={{ background: '#eee', borderRadius: 6, height: 6, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: progress === 100 ? '#22c55e' : '#3b82f6',
                  transition: 'width 0.2s',
                }}
              />
            </div>
          </div>

          {isExpanded && (
            <div style={{ marginTop: 10, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
              {steps.map((step) => (
                <label
                  key={step.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    padding: '4px 0',
                    cursor: 'pointer',
                    color: step.is_completed ? '#999' : '#333',
                    textDecoration: step.is_completed ? 'line-through' : 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={step.is_completed}
                    onChange={() => toggleStep(step)}
                  />
                  {step.step_name}
                </label>
              ))}

              {/* إضافة خطوة خاصة بهذا الأوردر بس (زي "تطريز خاص") */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  type="text"
                  value={newStepName}
                  onChange={(e) => setNewStepName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
                  placeholder="إضافة خطوة خاصة..."
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid #ddd',
                  }}
                />
                <button
                  onClick={handleAddStep}
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#111',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  إضافة
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------
// Component: العمود (حالة واحدة)
// ---------------------------------------------

function StatusColumn({
  label,
  color,
  orders,
}: {
  label: string
  color: string
  orders: Order[]
}) {
  return (
    <div style={{ flex: 1, minWidth: 260 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: color,
            display: 'inline-block',
          }}
        />
        <span>{label}</span>
        <span style={{ color: '#999', fontWeight: 400 }}>({orders.length})</span>
      </div>

      <div>
        {orders.length === 0 ? (
          <div style={{ color: '#bbb', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
            لا يوجد أوردرات
          </div>
        ) : (
          orders.map((order) => <OrderCard key={order.id} order={order} />)
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------
// Component رئيسي: ProductionTypeBoard
// ---------------------------------------------

export default function ProductionTypeBoard({
  executionType,
  title,
  emoji,
}: ProductionTypeBoardProps) {
  const { orders, isLoading, error, refetch } = useOrdersByExecutionType(executionType)

  const grouped = useMemo(() => {
    const map: Record<OrderStatus, Order[]> = {
      'جديد': [],
      'تحت الإنتاج': [],
      'جاهز للشحن': [],
      'تم التسليم': [],
    }
    const unmatched: Order[] = []

    for (const order of orders) {
      if (map[order.status]) {
        map[order.status].push(order)
      } else {
        // status مش من القيم المعروفة - يظهر في عمود "غير مصنف" بدل ما يختفي بصمت
        unmatched.push(order)
      }
    }
    return { map, unmatched }
  }, [orders])

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
        جاري تحميل الأوردرات...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: '#e11d48', marginBottom: 12 }}>حصل خطأ: {error}</p>
        <button
          onClick={refetch}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#111',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    )
  }

  return (
    <div dir="rtl" style={{ padding: 20, fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 28 }}>{emoji}</span>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>
        <span
          style={{
            marginRight: 'auto',
            color: '#666',
            fontSize: 14,
            background: '#f3f4f6',
            padding: '4px 10px',
            borderRadius: 20,
          }}
        >
          إجمالي: {orders.length}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {STATUS_COLUMNS.map((col) => (
          <StatusColumn
            key={col.key}
            label={col.label}
            color={col.color}
            orders={grouped.map[col.key]}
          />
        ))}

        {grouped.unmatched.length > 0 && (
          <StatusColumn
            label="غير مصنف (status غير معروف)"
            color="#ef4444"
            orders={grouped.unmatched}
          />
        )}
      </div>
    </div>
  )
}