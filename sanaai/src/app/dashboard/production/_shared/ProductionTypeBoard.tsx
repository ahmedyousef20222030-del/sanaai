'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase' // عدّل المسار حسب مكان الـ client عندك

// ---------------------------------------------
// Types
// ---------------------------------------------

export type OrderStatus = 'pending' | 'in_progress' | 'completed'

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

// ---------------------------------------------
// إعدادات أعمدة الـ Board (عدّل العناوين والألوان براحتك)
// ---------------------------------------------

const STATUS_COLUMNS: { key: OrderStatus; label: string; color: string }[] = [
  { key: 'pending', label: 'قيد الانتظار', color: '#f59e0b' },
  { key: 'in_progress', label: 'جاري التنفيذ', color: '#3b82f6' },
  { key: 'completed', label: 'مكتمل', color: '#22c55e' },
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
// Component: بطاقة أوردر واحدة
// ---------------------------------------------

function OrderCard({ order }: { order: Order }) {
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
        <div style={{ fontSize: 12, color: '#999' }}>
          تسليم: {new Date(order.due_date).toLocaleDateString('ar-EG')}
        </div>
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
      pending: [],
      in_progress: [],
      completed: [],
    }
    for (const order of orders) {
      if (map[order.status]) {
        map[order.status].push(order)
      }
    }
    return map
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
            orders={grouped[col.key]}
          />
        ))}
      </div>
    </div>
  )
}