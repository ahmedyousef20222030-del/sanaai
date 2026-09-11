'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import OrderTabs from './OrderTabs'
import OrderImageGallery from './OrderImageGallery'

// ── الأنواع (Types) ────────────────────────────────────────────────────────
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

interface Complaint {
  id: string
  complaint_type: string
  complaint_number?: string
  priority?: string
  status?: string
  description?: string
  created_at: string
}

interface OrderMaterialRow {
  id: string
  order_id: string
  material_id: string
  required_quantity: number
  is_approved?: boolean
  raw_materials: {
    name: string
    current_stock: number
    unit: string
  } | null
}

interface BannerState {
  type: 'success' | 'error'
  message: string
}

type StageKey = 'stage_design' | 'stage_cut' | 'stage_sew' | 'stage_print' | 'stage_pack'
type StageByKey = 'stage_design_by' | 'stage_cut_by' | 'stage_sew_by' | 'stage_print_by' | 'stage_pack_by'

// ── ثوابت وتنسيقات (Constants) ──────────────────────────────────────────
const statusColor: Record<string, string> = {
  'جديد': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'قيد المعالجة': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'جاهز للتصنيع': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'معلق - بانتظار خامات': 'bg-red-500/20 text-red-400 border-red-500/30',
  'محلول': 'bg-green-500/20 text-green-400 border-green-500/30',
  'مغلق': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const priorityColor: Record<string, string> = {
  'عالي': 'text-red-400',
  'متوسط': 'text-amber-400',
  'منخفض': 'text-green-400',
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
  if (current === 'done') return 'bg-emerald-500/20 text-emerald-400'
  if (current === 'in_progress') return 'bg-amber-500/20 text-amber-400'
  return 'bg-gray-500/20 text-gray-400'
}

function stageBadgeLabel(current: string) {
  if (current === 'done') return '✓ مكتمل'
  if (current === 'in_progress') return '⚙ جاري'
  return '⏳ بانتظار'
}

const inputClass = 'w-full bg-[#0B0D10] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4A843]/60 transition'

// ── مكونات مساعدة (UI Components) ─────────────────────────────────────────
function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function Banner({ banner, onClose }: { banner: BannerState; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])

  const isSuccess = banner.type === 'success'
  return (
    <div
      dir="rtl"
      className={`fixed top-5 left-1/2 z-[100] flex w-[92%] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm transition-all animate-in fade-in slide-in-from-top-4 ${
        isSuccess ? 'border-emerald-400/30 bg-emerald-950/90' : 'border-red-500/30 bg-red-950/90'
      }`}
    >
      <span className="mt-0.5 shrink-0">{isSuccess ? '✅' : '❌'}</span>
      <p className="flex-1 text-sm leading-relaxed text-white">{banner.message}</p>
      <button onClick={onClose} className="text-white/50 transition hover:text-white">✕</button>
    </div>
  )
}

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, loading, confirmText, isDanger }: { isOpen: boolean, title: string, message: string, onConfirm: () => void, onCancel: () => void, loading: boolean, confirmText: string, isDanger?: boolean }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-[#111927] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition flex justify-center items-center gap-2 disabled:opacity-50 ${
              isDanger ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-[#D4A843] text-[#08090A] hover:bg-[#D4A843]/90'
            }`}
          >
            {loading ? <Spinner /> : confirmText}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition disabled:opacity-50 text-sm font-bold"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ── المكون الرئيسي ─────────────────────────────────────────────────────────
export default function OrderDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [banner, setBanner] = useState<BannerState | null>(null)

  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [complaintsLoading, setComplaintsLoading] = useState(true)

  const [items, setItems] = useState<OrderItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)

  // إعدادات الخامات (Materials State)
  const [materials, setMaterials] = useState<OrderMaterialRow[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(true)
  const [editedMaterials, setEditedMaterials] = useState<Record<string, number>>({})
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [approvingMaterials, setApprovingMaterials] = useState(false)

  const [updatingStage, setUpdatingStage] = useState<StageKey | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('مستخدم')

  // --- Edit mode state ---
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const showBanner = useCallback((type: 'success' | 'error', message: string) => {
    setBanner({ type, message })
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) throw new Error('يجب تسجيل الدخول أولاً')

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('tenant_id, full_name')
        .eq('id', authData.user.id)
        .single()

      if (meError || !me?.tenant_id) throw new Error('لا توجد صلاحيات (Tenant ID) للمصنع')
      
      const currentTenantId = me.tenant_id
      setTenantId(currentTenantId)
      setCurrentUserName(me.full_name || 'مستخدم')

      // جلب بيانات الطلب الأساسية
      const { data, error } = await supabase
        .from('production')
        .select(`
          *,
          orders!order_id (
            id, order_number, order_date, expected_delivery, total_amount, deposit_paid, remaining_amount, details, sector, quantity, week_number, attachments, assigned_user_id, client_id,
            users:assigned_user_id ( full_name ),
            clients ( id, name, phone, address, city )
          )
        `)
        .eq('tenant_id', currentTenantId)
        .eq('order_id', id)
        .single()

      if (error || !data) throw new Error('الطلب غير موجود')

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
        tenant_id: currentTenantId,
        attachments: data.orders?.attachments,
      }

      setOrder(mapped)
      setEditMode(false)
      
      // تشغيل متوازي للوظائف المتعلقة بالطلب
      await Promise.all([
        loadComplaints(currentTenantId),
        loadItems(currentTenantId),
        loadMaterials(currentTenantId)
      ])

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ في جلب البيانات'
      setFetchError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function loadComplaints(tId: string) {
    setComplaintsLoading(true)
    const { data } = await supabase
      .from('complaints')
      .select('*')
      .eq('tenant_id', tId)
      .eq('order_id', id)
      .order('created_at', { ascending: false })
    setComplaints(data || [])
    setComplaintsLoading(false)
  }

  async function loadItems(tId: string) {
    setItemsLoading(true)
    const { data } = await supabase
      .from('order_items')
      .select('*')
      .eq('tenant_id', tId)
      .eq('order_id', id)
      .order('created_at', { ascending: true })
    setItems(data || [])
    setItemsLoading(false)
  }

  async function loadMaterials(tId: string) {
    setMaterialsLoading(true)
    try {
      // 1. استدعاء التهيئة المبدئية لملء الخامات بناءً على الـ BOM
      await supabase.rpc('fn_initialize_order_materials', { p_order_id: id })

      // 2. جلب الخامات للجدول
      const { data } = await supabase
        .from('order_materials')
        .select('*, raw_materials(name, current_stock, unit)')
        .eq('order_id', id)
        .eq('tenant_id', tId)

      setMaterials(data || [])
    } catch (err) {
      console.error('Error loading materials:', err)
    } finally {
      setMaterialsLoading(false)
    }
  }

  const isMaterialsApproved = useMemo(() => {
    return order?.final_status === 'جاهز للتصنيع' || order?.final_status === 'معلق - بانتظار خامات'
  }, [order?.final_status])

  const materialsStatus = useMemo(() => {
    return materials.map(m => {
      const required = editedMaterials[m.id] ?? m.required_quantity
      const available = m.raw_materials?.current_stock ?? 0
      const hasShortage = required > available
      return { ...m, required, available, hasShortage }
    })
  }, [materials, editedMaterials])

  async function handleUpdateMaterialQty(matId: string, value: number) {
    if (value < 0 || isMaterialsApproved) return
    setEditedMaterials(prev => ({ ...prev, [matId]: value }))
    
    // التحديث اللحظي الصامت في قاعدة البيانات 
    if (tenantId) {
      await supabase
        .from('order_materials')
        .update({ required_quantity: value })
        .eq('id', matId)
        .eq('tenant_id', tenantId)
    }
  }

  async function handleApproveMaterials() {
    if (!order || !tenantId) return
    setApprovingMaterials(true)
    try {
      const { data, error } = await supabase.rpc('fn_approve_and_process_order_materials', {
        p_order_id: order.order_id
      })
      if (error) throw error

      showBanner('success', 'تم اعتماد ومراجعة الخامات بنجاح.')
      setShowApproveConfirm(false)
      await loadData() // إعادة تحميل الصفحة لتعكس الحالة الجديدة والأرصدة
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل اعتماد الخامات.'
      showBanner('error', msg)
    } finally {
      setApprovingMaterials(false)
    }
  }

  async function updateStage(stageKey: StageKey, byField: StageByKey) {
    if (!order || !tenantId) return
    const previousValue = order[stageKey]
    const previousBy = order[byField]
    const newValue = nextStageValue(previousValue)

    // Optimistic Update
    setOrder(prev => (prev ? { ...prev, [stageKey]: newValue, [byField]: currentUserName } : prev))
    setUpdatingStage(stageKey)

    try {
      const { error } = await supabase
        .from('production')
        .update({ [stageKey]: newValue, [byField]: currentUserName, updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('tenant_id', tenantId)

      if (error) throw error
    } catch (err: unknown) {
      // Rollback
      setOrder(prev => (prev ? { ...prev, [stageKey]: previousValue, [byField]: previousBy } : prev))
      const msg = err instanceof Error ? err.message : 'تعذر تحديث حالة المرحلة.'
      showBanner('error', msg)
    } finally {
      setUpdatingStage(null)
    }
  }

  // --- Edit mode handlers ---
  function startEdit() {
    if (!order) return
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
    if (!order || !tenantId) return
    setSaving(true)
    try {
      const cleanItems = editItems.filter(it => (it.name || '').trim() !== '')
      const newTotal = cleanItems.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)

      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          expected_delivery: editForm.end_date || null,
          details: editForm.notes || null,
          sector: editForm.sector || null,
          quantity: editForm.quantity === '' ? null : Number(editForm.quantity),
          total_amount: newTotal,
        })
        .eq('id', order.order_id)
        .eq('tenant_id', tenantId)

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
          .eq('tenant_id', tenantId)
        if (clientErr) throw clientErr
      }

      const originalIds = items.map(it => it.id).filter(Boolean)
      const currentIds = cleanItems.map(it => it.id).filter(Boolean)
      const deletedIds = originalIds.filter(idVal => !currentIds.includes(idVal))

      if (deletedIds.length > 0) {
        const { error: delErr } = await supabase.from('order_items').delete().in('id', deletedIds as string[]).eq('tenant_id', tenantId)
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
          })
          .eq('id', it.id as string)
          .eq('tenant_id', tenantId)
        if (updErr) throw updErr
      }

      const toInsert = cleanItems
        .filter(it => !it.id)
        .map(it => ({
          order_id: order.order_id,
          tenant_id: tenantId,
          name: it.name,
          size: it.size || null,
          color: it.color || null,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
        }))

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('order_items').insert(toInsert)
        if (insErr) throw insErr
      }

      showBanner('success', 'تم حفظ التعديلات بنجاح')
      await loadData()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل حفظ التعديلات'
      showBanner('error', message)
    } finally {
      setSaving(false)
    }
  }

  // --- Delete mode handlers ---
  async function deleteOrder() {
    if (!order || !tenantId) return
    setDeleting(true)
    try {
      await supabase.from('complaints').delete().eq('order_id', order.order_id).eq('tenant_id', tenantId)
      await supabase.from('order_items').delete().eq('order_id', order.order_id).eq('tenant_id', tenantId)
      await supabase.from('order_materials').delete().eq('order_id', order.order_id).eq('tenant_id', tenantId)
      await supabase.from('production').delete().eq('id', order.id).eq('tenant_id', tenantId)
      
      const { error: orderErr } = await supabase.from('orders').delete().eq('id', order.order_id).eq('tenant_id', tenantId)
      if (orderErr) throw orderErr

      router.push('/dashboard/orders')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل حذف الطلب'
      showBanner('error', message)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Spinner className="w-8 h-8 text-[#D4A843]" />
          <span>جاري تحميل بيانات الطلب...</span>
        </div>
      </div>
    )
  }

  if (fetchError || !order) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center gap-4 text-center">
        <div className="text-red-400 p-6 bg-red-500/10 border border-red-500/30 rounded-2xl max-w-sm">
          <p className="text-xl font-bold mb-2">تعذر الوصول</p>
          <p className="text-sm">{fetchError || 'الطلب غير موجود'}</p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-6 py-2.5 bg-[#D4A843] text-[#08090A] rounded-xl font-bold transition hover:opacity-90"
        >
          رجوع للخلف
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] p-4 md:p-6 text-[#F0EDE8]" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white mb-1">تفاصيل الأوردر</h1>
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
                className="px-4 py-2 text-sm border border-white/10 rounded-xl text-gray-400 hover:bg-white/5 transition disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 text-sm bg-[#D4A843] text-[#08090A] rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? <Spinner /> : 'حفظ التعديلات'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="px-4 py-2 text-sm bg-[#D4A843] text-[#08090A] rounded-xl font-bold hover:bg-[#D4A843]/90 transition"
              >
                ✏️ تعديل
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 text-sm bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl font-bold hover:bg-red-500/20 transition"
              >
                🗑 حذف
              </button>
              <button
                onClick={() => router.back()}
                className="px-4 py-2 text-sm border border-white/10 rounded-xl text-gray-400 hover:bg-white/5 transition"
              >
                ← رجوع
              </button>
            </>
          )}
        </div>
      </div>

      <OrderTabs
        tabs={{
          details: (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#111927] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-1">الإجمالي</p>
                  <p className="text-xl font-black text-[#D4A843]">{order.total_price?.toLocaleString()} ج.م</p>
                </div>
                <div className="bg-[#111927] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-1">المدفوع</p>
                  <p className="text-xl font-black text-emerald-400">{order.paid?.toLocaleString()} ج.م</p>
                </div>
                <div className="bg-[#111927] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-1">المتبقي</p>
                  <p className="text-xl font-black text-red-400">{order.remaining?.toLocaleString()} ج.م</p>
                </div>
                <div className="bg-[#111927] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition">
                  <p className="text-xs text-gray-500 mb-2">الحالة</p>
                  <span className={`text-xs px-3 py-1.5 rounded-full border ${statusColor[order.final_status] || 'bg-gray-500/20 text-gray-400'}`}>
                    {order.final_status}
                  </span>
                </div>
              </div>

              <div className="bg-[#111927] border border-white/5 rounded-2xl p-5 space-y-4">
                {editMode ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">العميل</label>
                      <input
                        className={inputClass}
                        value={editForm.customer_name}
                        onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">الهاتف</label>
                      <input
                        className={inputClass}
                        value={editForm.phone}
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">العنوان</label>
                      <input
                        className={inputClass}
                        value={editForm.address}
                        onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">المدينة</label>
                      <input
                        className={inputClass}
                        value={editForm.city}
                        onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">التسليم المتوقع</label>
                      <input
                        type="date"
                        className={inputClass}
                        value={editForm.end_date}
                        onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">القطاع</label>
                      <input
                        className={inputClass}
                        value={editForm.sector}
                        onChange={e => setEditForm(f => ({ ...f, sector: e.target.value }))}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">الملاحظات</label>
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                      {order.quantity && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">الكمية</p>
                          <p className="text-white font-semibold">{order.quantity}</p>
                        </div>
                      )}
                    </div>
                    {order.notes && (
                      <div className="pt-4 border-t border-white/5">
                        <p className="text-xs text-gray-500 mb-1">الملاحظات</p>
                        <p className="text-sm text-gray-300 leading-relaxed">{order.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="bg-[#111927] border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">
                    الأصناف المطلوبة {(editMode ? editItems : items).length > 0 && `(${(editMode ? editItems : items).length})`}
                  </h3>
                  {editMode && (
                    <button
                      onClick={addEditItem}
                      className="text-xs px-4 py-2 rounded-xl bg-[#D4A843]/10 text-[#D4A843] border border-[#D4A843]/30 hover:bg-[#D4A843]/20 transition font-bold"
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
                          <th className="pb-3 font-normal">الصنف</th>
                          <th className="pb-3 font-normal">المقاس</th>
                          <th className="pb-3 font-normal">اللون</th>
                          <th className="pb-3 font-normal">الكمية</th>
                          <th className="pb-3 font-normal">سعر الوحدة</th>
                          <th className="pb-3 font-normal">الإجمالي</th>
                          <th className="pb-3 font-normal"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editItems.map((it, index) => (
                          <tr key={it.id ?? `new-${index}`} className="border-b border-white/5 last:border-0">
                            <td className="py-2 pl-2">
                              <input className={inputClass} value={it.name} onChange={e => updateEditItem(index, 'name', e.target.value)} />
                            </td>
                            <td className="py-2 pl-2 w-24">
                              <input className={inputClass} value={it.size || ''} onChange={e => updateEditItem(index, 'size', e.target.value)} />
                            </td>
                            <td className="py-2 pl-2 w-24">
                              <input className={inputClass} value={it.color || ''} onChange={e => updateEditItem(index, 'color', e.target.value)} />
                            </td>
                            <td className="py-2 pl-2 w-24">
                              <input type="number" className={inputClass} value={it.quantity} onChange={e => updateEditItem(index, 'quantity', e.target.value)} />
                            </td>
                            <td className="py-2 pl-2 w-28">
                              <input type="number" className={inputClass} value={it.unit_price} onChange={e => updateEditItem(index, 'unit_price', e.target.value)} />
                            </td>
                            <td className="py-2 text-[#D4A843] font-bold whitespace-nowrap">
                              {((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toLocaleString()} ج.م
                            </td>
                            <td className="py-2 text-left">
                              <button onClick={() => removeEditItem(index)} className="text-xs text-red-400 hover:text-red-300 px-2 font-bold">حذف</button>
                            </td>
                          </tr>
                        ))}
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
                          <th className="pb-3 font-normal">الصنف</th>
                          <th className="pb-3 font-normal">المقاس</th>
                          <th className="pb-3 font-normal">اللون</th>
                          <th className="pb-3 font-normal">الكمية</th>
                          <th className="pb-3 font-normal">سعر الوحدة</th>
                          <th className="pb-3 font-normal">الإجمالي</th>
                          <th className="pb-3 font-normal">المصدر</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {items.map(it => (
                          <tr key={it.id} className="hover:bg-white/[0.02] transition">
                            <td className="py-3 text-white font-semibold">{it.name}</td>
                            <td className="py-3 text-gray-300">{it.size || '—'}</td>
                            <td className="py-3 text-gray-300">{it.color || '—'}</td>
                            <td className="py-3 text-gray-300">{it.quantity}</td>
                            <td className="py-3 text-gray-300 font-mono">{Number(it.unit_price)?.toLocaleString()} ج.م</td>
                            <td className="py-3 text-[#D4A843] font-bold font-mono">
                              {Number(it.total_price ?? Number(it.unit_price) * Number(it.quantity))?.toLocaleString()} ج.م
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

          materials: (
            <div className="bg-[#111927] border border-white/5 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-3">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">الخامات المطلوبة للتنفيذ</h3>
                  <p className="text-xs text-gray-400">مراجعة وتعديل الخامات المحسوبة لتنفيذ الأوردر قبل الصرف</p>
                </div>
                {!isMaterialsApproved && materials.length > 0 && (
                  <button
                    onClick={() => setShowApproveConfirm(true)}
                    className="px-5 py-2.5 bg-[#D4A843] text-[#08090A] rounded-xl font-bold text-sm hover:opacity-90 transition shadow-lg shadow-[#D4A843]/20"
                  >
                    اعتماد وصرف الخامات للتصنيع
                  </button>
                )}
                {isMaterialsApproved && (
                  <span className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-bold flex items-center gap-2">
                    <span>✅</span> تم اعتماد وصرف الخامات
                  </span>
                )}
              </div>

              {materialsLoading ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-500 gap-3">
                  <Spinner className="w-6 h-6 text-[#D4A843]" />
                  <span className="text-sm">جاري تهيئة معادلات التصنيع (BOM) واستدعاء الخامات...</span>
                </div>
              ) : materials.length === 0 ? (
                <div className="text-center py-12 text-gray-500 border border-dashed border-white/10 rounded-xl">
                  <p className="text-sm">لا توجد خامات مسجلة بجدول معادلة التصنيع لهذا المنتج.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead>
                      <tr className="text-gray-400 text-xs border-b border-white/5">
                        <th className="pb-3 px-2 font-normal">اسم الخامة والمستلزم</th>
                        <th className="pb-3 px-2 font-normal">الكمية المطلوبة للصرف</th>
                        <th className="pb-3 px-2 font-normal">الرصيد المتاح بالمخزن</th>
                        <th className="pb-3 px-2 font-normal">حالة التوفر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {materialsStatus.map(m => (
                        <tr key={m.id} className="hover:bg-white/[0.02] transition">
                          <td className="py-4 px-2 text-white font-bold">{m.raw_materials?.name || 'خامة غير معرفة'}</td>
                          <td className="py-4 px-2">
                            {isMaterialsApproved ? (
                              <span className="text-gray-200 font-mono font-bold bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                                {m.required} <span className="text-xs text-gray-500 font-sans">{m.raw_materials?.unit}</span>
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={m.required}
                                  onChange={(e) => handleUpdateMaterialQty(m.id, Number(e.target.value))}
                                  className="w-24 bg-[#0B0D10] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#D4A843]/60 transition text-center font-mono"
                                />
                                <span className="text-gray-500 text-xs">{m.raw_materials?.unit}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-2 text-gray-300 font-mono">
                            {m.available} <span className="text-xs text-gray-500 font-sans">{m.raw_materials?.unit}</span>
                          </td>
                          <td className="py-4 px-2">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-bold ${
                              m.hasShortage ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}>
                              {m.hasShortage ? (
                                <><span>⚠️</span> يوجد عجز بالمخزن</>
                              ) : (
                                <><span>✅</span> رصيد كافي</>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {materialsStatus.some(m => m.hasShortage) && !isMaterialsApproved && (
                    <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                      <span className="mt-0.5">💡</span>
                      <p className="text-xs text-amber-400 leading-relaxed">
                        <strong>تنبيه:</strong> يوجد عجز في بعض الخامات. عند الضغط على زر "اعتماد وصرف الخامات للتصنيع"، سيتم سحب المتاح حالياً وإنشاء "إذن طلب شراء" بالنواقص تلقائياً لسرعة تدبيرها، وسيتحول الطلب إلى حالة "معلق - بانتظار خامات".
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ),

          production: (
            <div className="space-y-3">
              {PRODUCTION_STAGES.map(({ label, stage, byField, icon }) => {
                const current = order[stage] || 'pending'
                const byName = order[byField]
                const isUpdating = updatingStage === stage

                return (
                  <div key={stage} className="bg-[#111927] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-lg">{icon}</div>
                        <div>
                          <span className="font-bold text-white block">{label}</span>
                          {byName && (
                            <span className="text-[11px] text-gray-500 mt-1 block">👤 بواسطة: {byName}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateStage(stage, byField)}
                        disabled={isUpdating}
                        className={`text-xs px-4 py-2 rounded-xl font-bold transition flex items-center gap-2 hover:opacity-80 disabled:opacity-50 ${stageBadgeClasses(current)}`}
                      >
                        {isUpdating ? <Spinner /> : stageBadgeLabel(current)}
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
                <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-white/10 rounded-xl">لا توجد شكاوى مرتبطة بهذا الطلب</div>
              ) : (
                complaints.map(c => (
                  <div key={c.id} className="bg-[#111927] border border-white/5 rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-white text-sm">{c.complaint_type}</h3>
                          {c.complaint_number && (
                            <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded">#{c.complaint_number}</span>
                          )}
                          {c.priority && (
                            <span className={`text-[10px] font-bold ${priorityColor[c.priority]}`}>● {c.priority}</span>
                          )}
                        </div>
                      </div>
                      {c.status && (
                        <span className={`text-[11px] px-3 py-1 rounded-full border ${statusColor[c.status] || 'border-gray-500/30 text-gray-400'}`}>
                          {c.status}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-xs text-gray-400 leading-relaxed mb-3">{c.description}</p>
                    )}
                    <div className="text-[10px] text-gray-600 font-mono">
                      {new Date(c.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))
              )}
            </div>
          ),
        }}
      />

      <ConfirmModal
        isOpen={showApproveConfirm}
        title="تأكيد صرف الخامات للتصنيع"
        message="هل أنت متأكد من مراجعة واعتماد الكميات المطلوبة؟ سيتم سحب الخامات المتوفرة من المخزن فوراً وإنشاء أوامر شراء للنواقص إن وجدت."
        confirmText="تأكيد وصرف الخامات"
        loading={approvingMaterials}
        onConfirm={handleApproveMaterials}
        onCancel={() => setShowApproveConfirm(false)}
      />

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="تأكيد حذف الطلب"
        message={`هل أنت متأكد من حذف طلب "${order.customer_name}"؟ لا يمكن التراجع، وسيتم حذف كافة السجلات والشكاوى والأصناف المرتبطة به نهائياً.`}
        confirmText="تأكيد الحذف"
        isDanger={true}
        loading={deleting}
        onConfirm={deleteOrder}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}