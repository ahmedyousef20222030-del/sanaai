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
  client_id?: string | null
  attachments?: string[]
}

interface OrderItem {
  id: string | null
  name: string
  size?: string | null
  color?: string | null
  quantity: number | string
  unit_price: number | string
  total_price?: number
  source?: string | null
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

const inputClass =
  'w-full bg-[#0B0D10] border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#D4A843]/60'

export default function OrderDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [complaints, setComplaints] = useState<any[]>([])
  const [complaintsLoading, setComplaintsLoading] = useState(true)

  const [items, setItems] = useState<OrderItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)

  const [updatingStage, setUpdatingStage] = useState<StageKey | null>(null)
  const [stageError, setStageError] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('مستخدم')

  // --- Edit mode state ---
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    customer_name: '',
    phone: '',
    address: '',
    city: '',
    order_date: '',
    end_date: '',
    sector: '',
    quantity: '' as string | number,
    notes: '',
  })
  const [editItems, setEditItems] = useState<OrderItem[]>([])

  // --- Delete mode state ---
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
            client_id,
            users:assigned_user_id (
              full_name
            ),
            clients (
              id,
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
        client_id: data.orders?.client_id || data.orders?.clients?.id || null,
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
      setEditMode(false)
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

  // --- Edit mode handlers ---
  function startEdit() {
    if (!order) return
    setSaveError(null)
    setEditForm({
      customer_name: order.customer_name === '—' ? '' : order.customer_name,
      phone: order.phone || '',
      address: order.address || '',
      city: order.city || '',
      order_date: order.order_date ? order.order_date.split('T')[0] : '',
      end_date: order.end_date ? order.end_date.split('T')[0] : '',
      sector: order.sector || '',
      quantity: order.quantity ?? '',
      notes: order.notes || '',
    })
    setEditItems(items.map(it => ({ ...it })))
    setEditMode(true)
  }

  function cancelEdit() {
    setEditMode(false)
    setSaveError(null)
  }

  function updateEditItem(index: number, field: keyof OrderItem, value: string) {
    setEditItems(prev => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  function addEditItem() {
    setEditItems(prev => [...prev, { id: null, name: '', size: '', color: '', quantity: 1, unit_price: 0 }])
  }

  function removeEditItem(index: number) {
    setEditItems(prev => prev.filter((_, i) => i !== index))
  }

  async function saveEdit() {
    if (!order) return
    setSaving(true)
    setSaveError(null)
    try {
      const cleanItems = editItems.filter(it => (it.name || '').trim() !== '')
      const newTotal = cleanItems.reduce(
        (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
        0
      )
      const newRemaining = newTotal - (order.paid || 0)

      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          expected_delivery: editForm.end_date || null,
          details: editForm.notes || null,
          sector: editForm.sector || null,
          quantity: editForm.quantity === '' ? null : Number(editForm.quantity),
          total_amount: newTotal,
          remaining_amount: newRemaining,
        })
        .eq('id', order.order_id)
        .eq('tenant_id', order.tenant_id)
      if (orderErr) throw orderErr

      if (order.client_id) {
        const { error: clientErr } = await supabase
          .from('clients')
          .update({
            name: editForm.customer_name || null,
            phone: editForm.phone || null,
            address: editForm.address || null,
            city: editForm.city || null,
          })
          .eq('id', order.client_id)
          .eq('tenant_id', order.tenant_id)
        if (clientErr) throw clientErr
      }

      const originalIds = items.map(it => it.id).filter(Boolean)
      const currentIds = cleanItems.map(it => it.id).filter(Boolean)
      const deletedIds = originalIds.filter(idVal => !currentIds.includes(idVal))

      if (deletedIds.length > 0) {
        const { error: delErr } = await supabase.from('order_items').delete().in('id', deletedIds as string[])
        if (delErr) throw delErr
      }

      const toUpdate = cleanItems.filter(it => it.id)
      for (const it of toUpdate) {
        const { error: updErr } = await supabase
          .from('order_items')
          .update({
            name: it.name,
            size: it.size || null,
            color: it.color || null,
            quantity: Number(it.quantity) || 0,
            unit_price: Number(it.unit_price) || 0,
            total_price: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
          })
          .eq('id', it.id as string)
        if (updErr) throw updErr
      }

      const toInsert = cleanItems
        .filter(it => !it.id)
        .map(it => ({
          order_id: order.order_id,
          tenant_id: order.tenant_id,
          name: it.name,
          size: it.size || null,
          color: it.color || null,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          total_price: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
        }))
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('order_items').insert(toInsert)
        if (insErr) throw insErr
      }

      await loadData()
    } catch (err: any) {
      console.error('خطأ في الحفظ:', err)
      const message = err?.message || err?.error_description || err?.details || 'فشل حفظ التعديلات'
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  // --- Delete mode handlers ---
  async function deleteOrder() {
    if (!order) return
    setDeleting(true)
    setDeleteError(null)
    try {
      // حذف السجلات المرتبطة أولاً حتى لو مفيش cascade على الداتابيز
      const { error: complaintsErr } = await supabase
        .from('complaints')
        .delete()
        .eq('order_id', order.order_id)
        .eq('tenant_id', order.tenant_id)
      if (complaintsErr) throw complaintsErr

      const { error: itemsErr } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', order.order_id)
        .eq('tenant_id', order.tenant_id)
      if (itemsErr) throw itemsErr

      const { error: productionErr } = await supabase
        .from('production')
        .delete()
        .eq('id', order.id)
        .eq('tenant_id', order.tenant_id)
      if (productionErr) throw productionErr

      const { error: orderErr } = await supabase
        .from('orders')
        .delete()
        .eq('id', order.order_id)
        .eq('tenant_id', order.tenant_id)
      if (orderErr) throw orderErr

      router.push('/orders')
    } catch (err: any) {
      console.error('خطأ في حذف الطلب:', err)
      const message = err?.message || err?.error_description || err?.details || 'فشل حذف الطلب'
      setDeleteError(message)
      setDeleting(false)
      setShowDeleteConfirm(false)
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
    <div className="min-h-screen bg-[#08090A] p-4 text-[#F0EDE8]" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white mb-1">طلب</h1>
          <p className="text-sm text-gray-400">
            {order.customer_name}
            {order.order_number && <span className="text-[#D4A843] font-mono mr-2">· {order.order_number}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="px-4 py-2 text-sm border border-white/10 rounded-lg text-gray-400 hover:text-white transition disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 text-sm bg-[#D4A843] text-[#08090A] rounded-lg font-bold hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => router.push(`/dashboard/orders/${order.order_id}/edit`)}
                className="px-4 py-2 text-sm bg-[#D4A843] text-[#08090A] rounded-lg font-bold hover:opacity-90 transition"
              >
                ✎ تعديل الطلب
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 text-sm bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg font-bold hover:bg-red-500/20 transition"
              >
                🗑 حذف
              </button>
              <button
                onClick={() => router.back()}
                className="px-4 py-2 text-sm border border-white/10 rounded-lg text-gray-400 hover:text-[#D4A843] transition"
              >
                ← رجوع
              </button>
            </>
          )}
        </div>
      </div>

      {saveError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
          {saveError}
        </div>
      )}

      {deleteError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
          {deleteError}
        </div>
      )}

      <OrderTabs
        tabs={{
          details: (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#111318] border border-white/5 rounded-lg p-3 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-1">الإجمالي</p>
                  <p className="text-xl font-black text-[#D4A843]">{order.total_price?.toLocaleString()} ج.م</p>
                </div>
                <div className="bg-[#111318] border border-white/5 rounded-lg p-3 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-1">المدفوع</p>
                  <p className="text-xl font-black text-green-400">{order.paid?.toLocaleString()} ج.م</p>
                </div>
                <div className="bg-[#111318] border border-white/5 rounded-lg p-3 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-1">المتبقي</p>
                  <p className="text-xl font-black text-red-400">{order.remaining?.toLocaleString()} ج.م</p>
                </div>
                <div className="bg-[#111318] border border-white/5 rounded-lg p-3 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-1">الحالة</p>
                  <p className="text-sm font-bold text-[#D4A843]">{order.final_status}</p>
                </div>
              </div>

              <div className="bg-[#111318] border border-white/5 rounded-lg p-4 space-y-3">
                {editMode ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">العميل</p>
                      <input
                        className={inputClass}
                        value={editForm.customer_name}
                        onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">الهاتف</p>
                      <input
                        className={inputClass}
                        value={editForm.phone}
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">العنوان</p>
                      <input
                        className={inputClass}
                        value={editForm.address}
                        onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">المدينة</p>
                      <input
                        className={inputClass}
                        value={editForm.city}
                        onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">التسليم المتوقع</p>
                      <input
                        type="date"
                        className={inputClass}
                        value={editForm.end_date}
                        onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">القطاع</p>
                      <input
                        className={inputClass}
                        value={editForm.sector}
                        onChange={e => setEditForm(f => ({ ...f, sector: e.target.value }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">الكمية</p>
                      <input
                        type="number"
                        className={inputClass}
                        value={editForm.quantity}
                        onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-gray-500 mb-1">الملاحظات</p>
                      <textarea
                        className={inputClass}
                        rows={2}
                        value={editForm.notes}
                        onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid md:grid-cols-2 gap-4">
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
                      <div className="pt-3 border-t border-white/5">
                        <p className="text-xs text-gray-500 mb-1">الملاحظات</p>
                        <p className="text-sm text-gray-300">{order.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="bg-[#111318] border border-white/5 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500">
                    الأصناف المطلوبة {(editMode ? editItems : items).length > 0 && `(${(editMode ? editItems : items).length})`}
                  </p>
                  {editMode && (
                    <button
                      onClick={addEditItem}
                      className="text-xs px-3 py-1.5 rounded-full bg-[#D4A843]/10 text-[#D4A843] border border-[#D4A843]/30 hover:bg-[#D4A843]/20 transition"
                    >
                      + إضافة صنف
                    </button>
                  )}
                </div>

                {editMode ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-right text-xs text-gray-500 border-b border-white/5">
                          <th className="pb-2 font-normal">الصنف</th>
                          <th className="pb-2 font-normal">المقاس</th>
                          <th className="pb-2 font-normal">اللون</th>
                          <th className="pb-2 font-normal">الكمية</th>
                          <th className="pb-2 font-normal">سعر الوحدة</th>
                          <th className="pb-2 font-normal">الإجمالي</th>
                          <th className="pb-2 font-normal"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editItems.map((it, index) => (
                          <tr key={it.id ?? `new-${index}`} className="border-b border-white/5 last:border-0">
                            <td className="py-2 pl-2">
                              <input
                                className={inputClass}
                                value={it.name}
                                onChange={e => updateEditItem(index, 'name', e.target.value)}
                              />
                            </td>
                            <td className="py-2 pl-2">
                              <input
                                className={inputClass}
                                value={it.size || ''}
                                onChange={e => updateEditItem(index, 'size', e.target.value)}
                              />
                            </td>
                            <td className="py-2 pl-2">
                              <input
                                className={inputClass}
                                value={it.color || ''}
                                onChange={e => updateEditItem(index, 'color', e.target.value)}
                              />
                            </td>
                            <td className="py-2 pl-2 w-20">
                              <input
                                type="number"
                                className={inputClass}
                                value={it.quantity}
                                onChange={e => updateEditItem(index, 'quantity', e.target.value)}
                              />
                            </td>
                            <td className="py-2 pl-2 w-24">
                              <input
                                type="number"
                                className={inputClass}
                                value={it.unit_price}
                                onChange={e => updateEditItem(index, 'unit_price', e.target.value)}
                              />
                            </td>
                            <td className="py-2 text-[#D4A843] font-bold whitespace-nowrap">
                              {((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toLocaleString()} ج.م
                            </td>
                            <td className="py-2">
                              <button
                                onClick={() => removeEditItem(index)}
                                className="text-xs text-red-400 hover:text-red-300 px-2"
                              >
                                حذف
                              </button>
                            </td>
                          </tr>
                        ))}
                        {editItems.length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center py-6 text-gray-600 text-sm">
                              لا توجد أصناف — اضغط "إضافة صنف"
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : itemsLoading ? (
                  <div className="text-center py-6 text-gray-600 text-sm">جاري التحميل...</div>
                ) : items.length === 0 ? (
                  <div className="text-center py-6 text-gray-600 text-sm">لا توجد أصناف مسجلة لهذا الطلب</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-right text-xs text-gray-500 border-b border-white/5">
                          <th className="pb-2 font-normal">الصنف</th>
                          <th className="pb-2 font-normal">المقاس</th>
                          <th className="pb-2 font-normal">اللون</th>
                          <th className="pb-2 font-normal">الكمية</th>
                          <th className="pb-2 font-normal">سعر الوحدة</th>
                          <th className="pb-2 font-normal">الإجمالي</th>
                          <th className="pb-2 font-normal">المصدر</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(it => (
                          <tr key={it.id} className="border-b border-white/5 last:border-0">
                            <td className="py-2 text-white font-semibold">{it.name}</td>
                            <td className="py-2 text-gray-300">{it.size || '—'}</td>
                            <td className="py-2 text-gray-300">{it.color || '—'}</td>
                            <td className="py-2 text-gray-300">{it.quantity}</td>
                            <td className="py-2 text-gray-300">{Number(it.unit_price)?.toLocaleString()} ج.م</td>
                            <td className="py-2 text-[#D4A843] font-bold">
                              {Number(it.total_price ?? Number(it.unit_price) * Number(it.quantity))?.toLocaleString()} ج.م
                            </td>
                            <td className="py-2">
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
            <div className="space-y-2">
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
                  <div key={stage} className="bg-[#111318] border border-white/5 rounded-lg p-3 hover:border-white/10 transition">
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
            <div className="space-y-3">
              {complaintsLoading ? (
                <div className="text-center py-10 text-gray-600 text-sm">جاري التحميل...</div>
              ) : complaints.length === 0 ? (
                <div className="text-center py-10 text-gray-600 text-sm">لا توجد شكاوى مرتبطة بهذا الطلب</div>
              ) : (
                complaints.map(c => (
                  <div key={c.id} className="bg-[#111318] border border-white/5 rounded-lg p-4">
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

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111318] border border-white/10 rounded-xl p-5 max-w-sm w-full">
            <h3 className="text-white font-bold text-lg mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-gray-400 mb-5">
              هل أنت متأكد من حذف طلب "{order.customer_name}"؟ لا يمكن التراجع عن هذا الإجراء، وسيتم حذف كل الأصناف والشكاوى المرتبطة به.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm border border-white/10 rounded-lg text-gray-400 hover:text-white transition disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={deleteOrder}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg font-bold hover:opacity-90 transition disabled:opacity-50"
              >
                {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}