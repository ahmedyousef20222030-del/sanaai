'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase' // عدّل المسار حسب مكان الـ client عندك

// ---------------------------------------------
// Types
// ---------------------------------------------

export type OrderStatus = 'جديد' | 'تحت الإنتاج' | 'جاهز للشحن' | 'تم التسليم'

export interface ClientInfo {
  name: string
  phone: string | null
  sector: string | null
}

export interface OrderItem {
  id: string
  name: string
  size: string | null
  color: string | null
  quantity: number
  custom_detail: string | null
  execution_type: string | null
  unit_price: number | null
  total_price: number | null
}

export interface OrderImage {
  id: string
  image_url: string
  sort_order: number
}

export interface Order {
  id: string
  order_number: string
  execution_type: string
  status: OrderStatus
  quantity: number
  sector: string | null
  order_date: string | null
  expected_delivery: string | null
  notes: string | null
  details: string | null
  attachments: string[] | null
  clients: ClientInfo | null
  order_items: OrderItem[]
  order_images: OrderImage[]
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
// إعدادات أعمدة الـ Board
// ---------------------------------------------

const STATUS_COLUMNS: { key: OrderStatus; label: string; color: string }[] = [
  { key: 'جديد', label: 'جديد', color: '#94a3b8' },
  { key: 'تحت الإنتاج', label: 'تحت الإنتاج', color: '#3b82f6' },
  { key: 'جاهز للشحن', label: 'جاهز للشحن', color: '#f59e0b' },
  { key: 'تم التسليم', label: 'تم التسليم', color: '#22c55e' },
]

// ---------------------------------------------
// Hook: جلب الأوردرات كاملة (مع العميل، الأصناف، الصور) + تحديث لحظي
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
      .select(
        `
        id,
        order_number,
        execution_type,
        status,
        quantity,
        sector,
        order_date,
        expected_delivery,
        notes,
        details,
        attachments,
        clients ( name, phone, sector ),
        order_items ( id, name, size, color, quantity, custom_detail, execution_type, unit_price, total_price ),
        order_images ( id, image_url, sort_order )
      `
      )
      .eq('execution_type', executionType)
      .is('deleted_at', null) // استبعاد الأوردرات المحذوفة (soft delete)
      .order('created_at', { ascending: false })
      .order('sort_order', { foreignTable: 'order_images', ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setOrders([])
    } else {
      setOrders((data as unknown as Order[]) ?? [])
    }

    setIsLoading(false)
  }, [executionType])

  useEffect(() => {
    fetchOrders()

    // تحديث لحظي على orders نفسها
    const ordersChannel = supabase
      .channel(`orders-${executionType}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `execution_type=eq.${executionType}` },
        () => fetchOrders()
      )
      .subscribe()

    // تحديث لحظي لو اتضاف/اتعدل صنف داخل أي أوردر
    const itemsChannel = supabase
      .channel(`order-items-${executionType}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchOrders())
      .subscribe()

    // تحديث لحظي لو اتضافت/اتشالت صورة
    const imagesChannel = supabase
      .channel(`order-images-${executionType}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_images' }, () => fetchOrders())
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(itemsChannel)
      supabase.removeChannel(imagesChannel)
    }
  }, [executionType, fetchOrders])

  return { orders, isLoading, error, refetch: fetchOrders }
}

// ---------------------------------------------
// Hook: خطوات أوردر واحد (checklist) + تحديث لحظي
// ---------------------------------------------

function useOrderSteps(orderId: string) {
  const [steps, setSteps] = useState<OrderStep[]>([])

  const fetchSteps = useCallback(async () => {
    const { data } = await supabase
      .from('order_steps')
      .select('*')
      .eq('order_id', orderId)
      .order('sequence', { ascending: true })

    setSteps(data ?? [])
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

  return { steps, toggleStep, addCustomStep }
}

// ---------------------------------------------
// Component: صورة مصغّرة قابلة للتكبير
// ---------------------------------------------

function ImageThumbnail({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt="مرفق الأوردر"
      onClick={() => window.open(url, '_blank')}
      loading="lazy"
      style={{
        width: 72,
        height: 72,
        objectFit: 'cover',
        borderRadius: 8,
        cursor: 'pointer',
        border: '1px solid #eee',
      }}
    />
  )
}

// ---------------------------------------------
// Component: صف بيانات صغير (label: value) — لتقليل التكرار
// ---------------------------------------------

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 6, fontSize: 12.5 }}>
      <span style={{ color: '#8a8a8a', minWidth: 68 }}>{label}</span>
      <span style={{ color: '#222', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

// ---------------------------------------------
// Component: بطاقة أوردر واحدة
// ---------------------------------------------

function OrderCard({ order }: { order: Order }) {
  const { steps, toggleStep, addCustomStep } = useOrderSteps(order.id)
  const [isStepsExpanded, setIsStepsExpanded] = useState(true)
  const [newStepName, setNewStepName] = useState('')

  const completedCount = steps.filter((s) => s.is_completed).length
  const progress = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : null

  // الصور: أولوية لجدول order_images، ولو فاضي يرجع لعمود attachments القديم
  const images =
    order.order_images.length > 0
      ? order.order_images.map((img) => img.image_url)
      : order.attachments ?? []

  const handleAddStep = async () => {
    const trimmed = newStepName.trim()
    if (!trimmed) return
    await addCustomStep(trimmed)
    setNewStepName('')
  }

  const formattedDelivery = order.expected_delivery
    ? new Date(order.expected_delivery).toLocaleDateString('ar-EG', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : null

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        border: '1px solid #eee',
      }}
    >
      {/* رأس الكارت: رقم الأوردر + الكمية الإجمالية + القطاع */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 15 }}>#{order.order_number}</strong>
        <span
          style={{
            color: '#111',
            fontSize: 12.5,
            background: '#f3f4f6',
            padding: '3px 10px',
            borderRadius: 20,
            fontWeight: 600,
          }}
        >
          {order.quantity} قطعة إجمالي
        </span>
      </div>

      {/* بيانات أساسية: العميل / القطاع / تاريخ التسليم */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          marginBottom: 10,
          paddingBottom: 10,
          borderBottom: '1px solid #f2f2f2',
        }}
      >
        <InfoRow label="العميل" value={order.clients?.name} />
        {order.clients?.phone && <InfoRow label="التليفون" value={order.clients.phone} />}
        <InfoRow label="القطاع" value={order.sector ?? order.clients?.sector} />
        {formattedDelivery && (
          <InfoRow
            label="تسليم متوقع"
            value={formattedDelivery}
          />
        )}
      </div>

      {/* ملاحظات/تفاصيل الأوردر — أهم حاجة لفنى التطريز */}
      {(order.details || order.notes) && (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
            color: '#78350f',
          }}
        >
          {order.details && (
            <div>
              <span style={{ fontWeight: 700 }}>تفاصيل الأوردر: </span>
              {order.details}
            </div>
          )}
          {order.notes && (
            <div style={{ marginTop: order.details ? 4 : 0 }}>
              <span style={{ fontWeight: 700 }}>ملاحظات: </span>
              {order.notes}
            </div>
          )}
        </div>
      )}

      {/* الأصناف والكميات — مقاس/لون/تفاصيل مخصصة لكل صنف */}
      {order.order_items.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 700 }}>
            الأصناف ({order.order_items.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {order.order_items.map((item) => (
              <div
                key={item.id}
                style={{
                  fontSize: 13,
                  background: '#f8f9fa',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #eee',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <strong>×{item.quantity}</strong>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, color: '#666', fontSize: 12 }}>
                  {item.color && (
                    <span>
                      🎨 اللون: <b style={{ color: '#333' }}>{item.color}</b>
                    </span>
                  )}
                  {item.size && (
                    <span>
                      📏 المقاس: <b style={{ color: '#333' }}>{item.size}</b>
                    </span>
                  )}
                  {item.execution_type && item.execution_type !== order.execution_type && (
                    <span>
                      ⚙️ التنفيذ: <b style={{ color: '#333' }}>{item.execution_type}</b>
                    </span>
                  )}
                </div>
                {item.custom_detail && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12.5,
                      color: '#78350f',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: 6,
                      padding: '5px 8px',
                    }}
                  >
                    ✏️ {item.custom_detail}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الصور المرفقة — دايمًا ظاهرة، ده مهم للفنى عشان يشوف التصميم/العينة */}
      {images.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 700 }}>
            الصور المرفقة ({images.length})
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {images.map((url, i) => (
              <ImageThumbnail key={i} url={url} />
            ))}
          </div>
        </div>
      )}

      {/* خطوات التنفيذ (checklist) */}
      {steps.length > 0 && (
        <>
          <div
            onClick={() => setIsStepsExpanded((v) => !v)}
            style={{ cursor: 'pointer', marginTop: 6 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#666',
                marginBottom: 4,
                fontWeight: 700,
              }}
            >
              <span>
                خطوات التنفيذ ({completedCount}/{steps.length})
              </span>
              <span>{isStepsExpanded ? '▲' : '▼'}</span>
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

          {isStepsExpanded && (
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
    <div style={{ flex: 1, minWidth: 320 }}>
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