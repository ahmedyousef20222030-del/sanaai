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
  stage_design_by?: string | null
  stage_cut_by?: string | null
  stage_sew_by?: string | null
  stage_print_by?: string | null
  stage_pack_by?: string | null
  updated_at: string
  tenant_id: string
  order_id: string
  attachments?: string[]
}

type StageKey = 'stage_design' | 'stage_cut' | 'stage_sew' | 'stage_print' | 'stage_pack'
type StageByKey = 'stage_design_by' | 'stage_cut_by' | 'stage_sew_by' | 'stage_print_by' | 'stage_pack_by'

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

const sourceLabel: Record<string, string> = {
  inventory: 'من المخزون',
  purchase: 'طلب شراء',
  purchase_order: 'طلب شراء',
}

const sourceColor: Record<string, string> = {
  inventory: 'bg-green-500/20 text-green-400 border-green-500/30',
  purchase: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  purchase_order: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

const PRODUCTION_STAGES: { label: string; stage: StageKey; byField: StageByKey; icon: string }[] = [
  { label: 'التصميم', stage: 'stage_design', byField: 'stage_design_by', icon: '🎨' },
  { label: 'القص', stage: 'stage_cut', byField: 'stage_cut_by', icon: '✂️' },
  { label: 'الخياطة', stage: 'stage_sew', byField: 'stage_sew_by', icon: '🧵' },
  { label: 'الطباعة', stage: 'stage_print', byField: 'stage_print_by', icon: '🖨️' },
  { label: 'التغليف', stage: 'stage_pack', byField: 'stage_pack_by', icon: '📦' },
]

function nextStageValue(current: string) {
  if (current === 'pending' || !current) return 'in_progress'
  if (current === 'in_progress') return 'done'
  return 'pending'
}

function stageBadgeClasses(current: string) {
  if (current === 'done') return 'bg-green-500/20 text-green-400'
  if (current === 'in_progress') return 'bg-amber-500/20 text-amber-400'
  return 'bg-gray-500/20 text-gray-400'
}

function stageBadgeLabel(current: string) {
  if (current === 'done') return '✓ مكتمل'
  if (current === 'in_progress') return '⚙ جاري'
  return '⏳ بانتظار'
}

export default function OrderDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [complaints, setComplaints] = useState<any[]>([])
  const [complaintsLoading, setComplaintsLoading] = useState(true)

  const [items, setItems] = useState<any[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)

  const [updatingStage, setUpdatingStage] = useState<StageKey | null>(null)
  const [stageError, setStageError] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('مستخدم')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authData?.user) throw new Error('يجب تسجيل الدخول')

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('tenant_id, full_name')
        .eq('id', authData.user.id)
        .single()

      if (meError) throw meError
      if (!me?.tenant_id) throw new Error('بدون صلاحيات')

      setCurrentUserName(me.full_name || 'مستخدم')

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
        stage_design_by: data.stage_design_by || null,
        stage_cut_by: data.stage_cut_by || null,
        stage_sew_by: data.stage_sew_by || null,
        stage_print_by: data.stage_print_by || null,
        stage_pack_by: data.stage_pack_by || null,
        updated_at: data.updated_at,
        tenant_id: me.tenant_id,
        attachments: data.orders?.attachments,
      }

      setOrder(mapped)
      loadComplaints(me.tenant_id)
      loadItems(me.tenant_id)
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

  async function loadItems(tenantId: string) {
    setItemsLoading(true)
    const { data } = await supabase
      .from('order_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('order_id', id)
      .order('created_at', { ascending: true })
    setItems(data || [])
    setItemsLoading(false)
  }

  async function updateStage(stageKey: StageKey, byField: StageByKey) {
    if (!order) return
    setStageError(null)
    const previousValue = order[stageKey]
    const previousBy = order[byField]
    const newValue = nextStageValue(previousValue)

    setOrder(prev => (prev ? { ...prev, [stageKey]: newValue, [byField]: currentUserName } : prev))
    setUpdatingStage(stageKey)

    try {
      const { error } = await supabase
        .from('production')
        .update({
          [stageKey]: newValue,
          [byField]: currentUserName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .eq('tenant_id', order.tenant_id)

      if (error) throw error
    } catch (err) {
      console.error('خطأ في تحديث المرحلة:', err)
      setOrder(prev => (prev ? { ...prev, [stageKey]: previousValue, [byField]: previousBy } : prev))
      setStageError('تعذر تحديث حالة المرحلة. تأكد من صلاحياتك وحاول مرة أخرى.')
    } finally {
      setUpdatingStage(null)
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

      <OrderTabs
        tabs={{
          details: (
            <div className="space-y-6">
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

              <div className="bg-[#111318] border border-white/5 rounded-lg p-6">
                <p className="text-xs text-gray-500 mb-4">الأصناف المطلوبة {items.length > 0 && `(${items.length})`}</p>
                {itemsLoading ? (
                  <div className="text-center py-8 text-gray-600 text-sm">جاري التحميل...</div>
                ) : items.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 text-sm">لا توجد أصناف مسجلة لهذا الطلب</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-right text-xs text-gray-500 border-b border-white/5">
                          <th className="pb-3 font-normal">الصنف</th>
                          <th className="pb-3 font-normal">المقاس</th>
                          <th className="pb-3 font-normal">اللون</th>
                          <th className="pb-3 font-normal">الكمية</th>
                          <th className="pb-3 font-normal">سعر الوحدة</th>
                          <th className="pb-3 font-normal">الإجمالي</th>
                          <th className="pb-3 font-normal">المصدر</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(it => (
                          <tr key={it.id} className="border-b border-white/5 last:border-0">
                            <td className="py-3 text-white font-semibold">{it.name}</td>
                            <td className="py-3 text-gray-300">{it.size || '—'}</td>
                            <td className="py-3 text-gray-300">{it.color || '—'}</td>
                            <td className="py-3 text-gray-300">{it.quantity}</td>
                            <td className="py-3 text-gray-300">{Number(it.unit_price)?.toLocaleString()} ج.م</td>
                            <td className="py-3 text-[#D4A843] font-bold">
                              {Number(it.total_price ?? it.unit_price * it.quantity)?.toLocaleString()} ج.م
                            </td>
                            <td className="py-3">
                              {it.source ? (
                                <span className={`text-[10px] px-2 py-1 rounded-full border ${sourceColor[it.source] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                                  {sourceLabel[it.source] || it.source}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ),

          production: (
            <div className="space-y-3">
              {stageError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                  {stageError}
                </div>
              )}

              {PRODUCTION_STAGES.map(({ label, stage, byField, icon }) => {
                const current = order[stage] || 'pending'
                const byName = order[byField]
                const isUpdating = updatingStage === stage

                return (
                  <div key={stage} className="bg-[#111318] border border-white/5 rounded-lg p-4 hover:border-white/10 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{icon}</span>
                        <div>
                          <span className="font-semibold text-white block">{label}</span>
                          {byName && (
                            <span className="text-[11px] text-gray-500">
                              👤 بواسطة: {byName}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateStage(stage, byField)}
                        disabled={isUpdating}
                        className={`text-xs px-3 py-1.5 rounded-full font-bold transition cursor-pointer hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed ${stageBadgeClasses(current)}`}
                      >
                        {isUpdating ? '...' : stageBadgeLabel(current)}
                      </button>
                    </div>
                  </div>
                )
              })}
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