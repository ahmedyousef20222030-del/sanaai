'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Loader2,
  ClipboardList,
  Package,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Save,
  ShieldCheck,
  ShoppingCart,
  X,
  Info,
} from 'lucide-react'

// دالة العزل المعتمدة بمشروع صَنَاعي
async function getMyTenantId() {
  const { data: me, error } = await supabase.from('users').select('tenant_id').single()
  if (error || !me) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    return profile?.tenant_id ?? null
  }
  return me.tenant_id
}

interface OrderRecord {
  id: string
  tenant_id: string
  order_number: string
  product_name?: string
  quantity: number
  status: string
  created_at: string
}

interface RawMaterialRef {
  name: string
  unit: string
  current_stock: number
  unit_cost: number
}

interface OrderMaterialRow {
  id: string
  tenant_id: string
  order_id: string
  material_id: string
  quantity_required: number
  quantity_deducted: number
  status: 'pending' | 'deducted' | 'shortage' | 'cancelled'
  raw_materials: RawMaterialRef
}

interface BannerState {
  type: 'success' | 'error'
  message: string
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 }).format(value)
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export default function OrderMaterialsApprovalPage({ params }: { params: { orderId: string } }) {
  const orderId = params.orderId
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderRecord | null>(null)
  const [orderMaterials, setOrderMaterials] = useState<OrderMaterialRow[]>([])
  const [editedQuantities, setEditedQuantities] = useState<Record<string, string>>({})

  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true)
  const [isLoadingMaterials, setIsLoadingMaterials] = useState<boolean>(true)
  const [isSavingQuantities, setIsSavingQuantities] = useState<boolean>(false)
  const [isApproving, setIsApproving] = useState<boolean>(false)
  const [showApproveConfirm, setShowApproveConfirm] = useState<boolean>(false)
  const [banner, setBanner] = useState<BannerState | null>(null)

  const showBanner = useCallback((type: 'success' | 'error', message: string) => {
    setBanner({ type, message })
  }, [])

  const bootstrapSession = useCallback(async () => {
    setIsBootstrapping(true)
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) {
      showBanner('error', 'تعذر التحقق من تسجيل الدخول')
      setIsBootstrapping(false)
      return
    }

    setUserId(authData.user.id)
    const tid = await getMyTenantId()
    if (!tid) {
      showBanner('error', 'تعذر تحديد بيانات المصنع')
      setIsBootstrapping(false)
      return
    }

    setTenantId(tid)
    setIsBootstrapping(false)
  }, [showBanner])

  const fetchOrder = useCallback(async () => {
    if (!tenantId) return null
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) {
      showBanner('error', 'تعذر العثور على الطلب المطلوب')
      return null
    }

    setOrder(data as OrderRecord)
    return data as OrderRecord
  }, [tenantId, orderId, showBanner])

  const fetchOrderMaterials = useCallback(async () => {
    if (!tenantId) return
    setIsLoadingMaterials(true)

    const { data, error } = await supabase
      .from('order_materials')
      .select('*, raw_materials(name, unit, current_stock, unit_cost)')
      .eq('order_id', orderId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })

    if (error) {
      showBanner('error', 'تعذر تحميل خامات الطلب')
      setIsLoadingMaterials(false)
      return
    }

    setOrderMaterials((data as unknown as OrderMaterialRow[]) ?? [])
    setEditedQuantities({})
    setIsLoadingMaterials(false)
  }, [tenantId, orderId, showBanner])

  const initializeAndLoad = useCallback(async () => {
    if (!tenantId) return
    const ord = await fetchOrder()
    if (!ord) return

    await supabase.rpc('fn_initialize_order_materials', {
      p_order_id: orderId,
      p_tenant_id: tenantId,
    })

    await fetchOrderMaterials()
  }, [tenantId, orderId, fetchOrder, fetchOrderMaterials])

  useEffect(() => {
    bootstrapSession()
  }, [bootstrapSession])

  useEffect(() => {
    if (tenantId) {
      initializeAndLoad()
    }
  }, [tenantId, initializeAndLoad])

  const getEffectiveQuantity = useCallback(
    (row: OrderMaterialRow): number => {
      const edited = editedQuantities[row.id]
      if (edited === undefined) return row.quantity_required
      const parsed = Number(edited)
      return Number.isNaN(parsed) ? row.quantity_required : parsed
    },
    [editedQuantities]
  )

  const hasUnsavedChanges = Object.keys(editedQuantities).length > 0
  const isOrderEditable = order?.status !== 'جاهز للتصنيع' && order?.status !== 'مكتمل'

  const handleSaveQuantities = async () => {
    if (!tenantId || !hasUnsavedChanges) return
    setIsSavingQuantities(true)

    const updates = Object.entries(editedQuantities).map(([rowId, val]) =>
      supabase
        .from('order_materials')
        .update({ quantity_required: Number(val), status: 'pending' })
        .eq('id', rowId)
        .eq('tenant_id', tenantId)
    )

    await Promise.all(updates)
    showBanner('success', 'تم حفظ تعديل كميات الخامات بنجاح')
    setIsSavingQuantities(false)
    fetchOrderMaterials()
  }

  const handleApprove = async () => {
    if (!tenantId || !order) return
    setIsApproving(true)

    const { data, error } = await supabase.rpc('fn_approve_and_process_order_materials', {
      p_order_id: order.id,
      p_tenant_id: tenantId,
      p_user_id: userId,
    })

    if (error) {
      showBanner('error', 'حدث خطأ أثناء اعتماد وصرف الخامات')
      setIsApproving(false)
      setShowApproveConfirm(false)
      return
    }

    const result = data as { success: boolean; result?: string; message: string }
    showBanner(result.result === 'ready_for_manufacturing' ? 'success' : 'error', result.message)

    setIsApproving(false)
    setShowApproveConfirm(false)
    await fetchOrder()
    await fetchOrderMaterials()
  }

  if (isBootstrapping) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#0D1B2A]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#0D1B2A] text-[#F0EDE8] p-6 md:p-10" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {banner && (
        <div className={cn(
          'fixed top-5 left-1/2 z-[100] flex w-[92%] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm',
          banner.type === 'success' ? 'border-emerald-400/30 bg-emerald-950/90' : 'border-red-500/30 bg-red-950/90'
        )}>
          {banner.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5" /> : <XCircle className="h-5 w-5 text-red-400 mt-0.5" />}
          <p className="flex-1 text-sm">{banner.message}</p>
          <button onClick={() => setBanner(null)}><X className="h-4 w-4 opacity-50 hover:opacity-100" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-white/5 pb-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30">
            <ClipboardList className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">اعتماد خامات الطلب #{order?.order_number}</h1>
              <span className="rounded-full px-2.5 py-0.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                {order?.status}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">الكمية المطلوبة: {order?.quantity} قطعة</p>
          </div>
        </div>
      </div>

      {/* Materials Table */}
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#111927] p-5">
        <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Package className="h-4 w-4 text-amber-500" /> الخامات المخصصة لهذا الطلب
          </h2>
          {!isOrderEditable && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Info className="h-3.5 w-3.5" /> لا يمكن تعديل الكميات بعد الصرف
            </span>
          )}
        </div>

        {isLoadingMaterials ? (
          <div className="py-12 flex justify-center text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : orderMaterials.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            لا توجد بنود استهلاك مسجلة لهذا الصنف، يمكنك إضافة الخامات يدوياً.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b border-white/5 text-xs text-gray-400">
                  <th className="pb-3">الخامة</th>
                  <th className="pb-3">الكمية المطلوبة للطلب</th>
                  <th className="pb-3">الرصيد المتاح بالمخزن</th>
                  <th className="pb-3">حالة الصرف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orderMaterials.map((row) => {
                  const effectiveQty = getEffectiveQuantity(row)
                  const isSufficient = effectiveQty <= row.raw_materials.current_stock
                  return (
                    <tr key={row.id}>
                      <td className="py-3.5 font-bold text-white">
                        {row.raw_materials.name}
                        <span className="text-xs text-gray-500 font-normal mr-2">({row.raw_materials.unit})</span>
                      </td>
                      <td className="py-3.5">
                        {isOrderEditable && row.status !== 'deducted' ? (
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={editedQuantities[row.id] ?? String(row.quantity_required)}
                            onChange={(e) => setEditedQuantities((prev) => ({ ...prev, [row.id]: e.target.value }))}
                            className="w-28 rounded-lg border border-white/10 bg-[#0D1B2A] px-3 py-1.5 text-sm text-white outline-none focus:border-amber-500/50"
                          />
                        ) : (
                          <span className="font-mono font-bold text-white">{formatNumber(row.quantity_required)}</span>
                        )}
                      </td>
                      <td className="py-3.5 font-mono text-gray-300">
                        {formatNumber(row.raw_materials.current_stock)} {row.raw_materials.unit}
                      </td>
                      <td className="py-3.5">
                        {row.status === 'deducted' ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">تم الصرف</span>
                        ) : isSufficient ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">متوفرة بالكامل</span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">غير كافية (عجز)</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/5">
          {isOrderEditable && hasUnsavedChanges && (
            <button onClick={handleSaveQuantities} disabled={isSavingQuantities} className="flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/5">
              <Save className="h-4 w-4" /> حفظ التعديلات
            </button>
          )}

          {isOrderEditable && (
            <button
              onClick={() => setShowApproveConfirm(true)}
              disabled={isApproving || hasUnsavedChanges}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-400 transition disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" /> اعتماد وصرف الخامات للتصنيع
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showApproveConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full text-center">
            <ShieldCheck className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-2">تأكيد الاعتماد والصرف</h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-6">
              سيتم فحص الأرصدة وسحب الخامات فوراً إذا كانت كافية، أو إنشاء طلبات شراء بالنواقص تلقائياً وتعليق الطلب.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowApproveConfirm(false)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-400 hover:bg-white/5">تراجع</button>
              <button onClick={handleApprove} disabled={isApproving} className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black hover:bg-amber-400 transition">
                {isApproving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'نعم، اعتماد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}