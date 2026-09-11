'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Package,
  Search,
  Plus,
  Pencil,
  Trash2,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  X,
  Loader2,
  Boxes,
  Wallet,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Filter,
} from 'lucide-react'

// ============================================================================
// 🔒 الأمان: دالة العزل (معرّفة محلياً لتجنب أي أخطاء استيراد)
// ============================================================================
async function getMyTenantId(): Promise<string | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return null

  const { data, error } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', authData.user.id)
    .single()

  if (error || !data) return null
  return data.tenant_id
}

// ============================================================================
// 📦 الأنواع (Types)
// ============================================================================
type MaterialCategory = 'أقمشة' | 'خيوط' | 'أزرار وإكسسوارات' | 'عبوات وتغليف' | 'مواد كيماوية' | 'عام'
type MaterialUnit = 'متر' | 'بكرة' | 'حبة' | 'دستة' | 'كيلوجرام' | 'جرام' | 'لتر' | 'قطعة' | 'رول'

interface RawMaterial {
  id: string
  tenant_id: string
  name: string
  category: MaterialCategory
  unit: MaterialUnit
  current_stock: number
  alert_threshold: number
  unit_cost: number
  supplier_name: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}

interface MaterialFormState {
  id: string | null
  name: string
  category: MaterialCategory
  unit: MaterialUnit
  current_stock: string
  alert_threshold: string
  unit_cost: string
  supplier_name: string
  notes: string
}

type TransactionKind = 'supply' | 'waste'

interface TransactionFormState {
  material: RawMaterial | null
  type: TransactionKind
  quantity: string
  reference_note: string
}

interface BannerState {
  type: 'success' | 'error'
  message: string
}

type StockFilter = 'all' | 'low' | 'normal'

const CATEGORY_OPTIONS: MaterialCategory[] = ['أقمشة', 'خيوط', 'أزرار وإكسسوارات', 'عبوات وتغليف', 'مواد كيماوية', 'عام']
const UNIT_OPTIONS: MaterialUnit[] = ['متر', 'بكرة', 'حبة', 'دستة', 'كيلوجرام', 'جرام', 'لتر', 'قطعة', 'رول']

const EMPTY_MATERIAL_FORM: MaterialFormState = {
  id: null,
  name: '',
  category: 'أقمشة',
  unit: 'متر',
  current_stock: '0',
  alert_threshold: '10',
  unit_cost: '0',
  supplier_name: '',
  notes: '',
}

// ============================================================================
// 🎨 دوال مساعدة ومكونات UI مصغرة
// ============================================================================

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 }).format(value)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value)
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

function StockBadge({ material }: { material: RawMaterial }) {
  const isLow = material.current_stock <= material.alert_threshold
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border',
        isLow ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30'
      )}
    >
      {isLow ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      {isLow ? 'ناقص - يحتاج توريد' : 'رصيد كافي'}
    </span>
  )
}

function Banner({ banner, onClose }: { banner: BannerState; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500)
    return () => clearTimeout(t)
  }, [onClose])

  const isSuccess = banner.type === 'success'

  return (
    <div
      dir="rtl"
      className={cn(
        'fixed top-5 left-1/2 z-[100] flex w-[92%] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm transition-all animate-in fade-in slide-in-from-top-4',
        isSuccess ? 'border-emerald-400/30 bg-emerald-950/90' : 'border-red-500/30 bg-red-950/90'
      )}
    >
      {isSuccess ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />}
      <p className="flex-1 text-sm leading-relaxed text-white">{banner.message}</p>
      <button onClick={onClose} className="text-white/50 transition hover:text-white"><X className="h-4 w-4" /></button>
    </div>
  )
}

function ModalShell({ title, onClose, children, maxWidth = 'max-w-lg' }: { title: string; onClose: () => void; children: React.ReactNode; maxWidth?: string }) {
  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cn('w-full rounded-2xl border border-white/10 bg-[#111927] shadow-2xl animate-in zoom-in-95', maxWidth)}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {children}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 🚀 المكون الرئيسي
// ============================================================================

export default function MaterialsInventoryPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true)

  const [searchTerm, setSearchTerm] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | 'الكل'>('الكل')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [banner, setBanner] = useState<BannerState | null>(null)

  const [showFormModal, setShowFormModal] = useState<boolean>(false)
  const [materialForm, setMaterialForm] = useState<MaterialFormState>(EMPTY_MATERIAL_FORM)
  const [isSavingMaterial, setIsSavingMaterial] = useState<boolean>(false)

  const [transactionForm, setTransactionForm] = useState<TransactionFormState | null>(null)
  const [isSavingTransaction, setIsSavingTransaction] = useState<boolean>(false)

  const [materialToDelete, setMaterialToDelete] = useState<RawMaterial | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)

  const showBanner = useCallback((type: 'success' | 'error', message: string) => {
    setBanner({ type, message })
  }, [])

  const bootstrapSession = useCallback(async () => {
    setIsBootstrapping(true)
    const tid = await getMyTenantId()
    
    if (!tid) {
      showBanner('error', 'تعذر تحديد بيانات المصنع. يرجى تسجيل الدخول مجدداً.')
      setIsBootstrapping(false)
      return
    }

    setTenantId(tid)
    setIsBootstrapping(false)
  }, [showBanner])

  const fetchMaterials = useCallback(async () => {
    if (!tenantId) return
    setIsLoading(true)

    const { data, error } = await supabase
      .from('raw_materials')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      showBanner('error', 'حدث خطأ أثناء جلب الخامات من المخزن')
      setIsLoading(false)
      return
    }

    setMaterials((data as RawMaterial[]) ?? [])
    setIsLoading(false)
  }, [tenantId, showBanner])

  useEffect(() => {
    bootstrapSession()
  }, [bootstrapSession])

  useEffect(() => {
    if (tenantId) {
      fetchMaterials()
    }
  }, [tenantId, fetchMaterials])

  const stats = useMemo(() => {
    const totalMaterials = materials.length
    const lowStockCount = materials.filter((m) => m.current_stock <= m.alert_threshold).length
    const totalInventoryValue = materials.reduce((sum, m) => sum + m.current_stock * m.unit_cost, 0)
    return { totalMaterials, lowStockCount, totalInventoryValue }
  }, [materials])

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchesSearch =
        searchTerm.trim() === '' ||
        m.name.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        (m.supplier_name ?? '').toLowerCase().includes(searchTerm.trim().toLowerCase())

      const matchesCategory = categoryFilter === 'الكل' || m.category === categoryFilter
      const isLow = m.current_stock <= m.alert_threshold
      const matchesStock =
        stockFilter === 'all' || (stockFilter === 'low' && isLow) || (stockFilter === 'normal' && !isLow)

      return matchesSearch && matchesCategory && matchesStock
    })
  }, [materials, searchTerm, categoryFilter, stockFilter])

  const openAddModal = () => {
    setMaterialForm(EMPTY_MATERIAL_FORM)
    setShowFormModal(true)
  }

  const openEditModal = (material: RawMaterial) => {
    setMaterialForm({
      id: material.id,
      name: material.name,
      category: material.category,
      unit: material.unit,
      current_stock: String(material.current_stock),
      alert_threshold: String(material.alert_threshold),
      unit_cost: String(material.unit_cost),
      supplier_name: material.supplier_name ?? '',
      notes: material.notes ?? '',
    })
    setShowFormModal(true)
  }

  const handleSaveMaterial = async () => {
    if (!tenantId) return

    if (!materialForm.name.trim()) {
      showBanner('error', 'الرجاء إدخال اسم الخامة أو المستلزم')
      return
    }

    const currentStock = Number(materialForm.current_stock)
    const alertThreshold = Number(materialForm.alert_threshold)
    const unitCost = Number(materialForm.unit_cost)

    setIsSavingMaterial(true)

    const payload = {
      tenant_id: tenantId,
      name: materialForm.name.trim(),
      category: materialForm.category,
      unit: materialForm.unit,
      current_stock: currentStock,
      alert_threshold: alertThreshold,
      unit_cost: unitCost,
      supplier_name: materialForm.supplier_name.trim() || null,
      notes: materialForm.notes.trim() || null,
    }

    if (materialForm.id) {
      const { error } = await supabase
        .from('raw_materials')
        .update(payload)
        .eq('id', materialForm.id)
        .eq('tenant_id', tenantId)

      if (error) {
        showBanner('error', 'تعذر تحديث بيانات الخامة')
        setIsSavingMaterial(false)
        return
      }
      showBanner('success', 'تم حفظ التعديلات بنجاح')
    } else {
      const { error } = await supabase.from('raw_materials').insert(payload)

      if (error) {
        showBanner('error', 'تعذر إضافة الخامة الجديدة')
        setIsSavingMaterial(false)
        return
      }
      showBanner('success', 'تمت إضافة الخامة إلى المخزن بنجاح')
    }

    setIsSavingMaterial(false)
    setShowFormModal(false)
    fetchMaterials()
  }

  const handleDeleteMaterial = async () => {
    if (!materialToDelete || !tenantId) return
    setIsDeleting(true)

    const { error } = await supabase
      .from('raw_materials')
      .update({ is_active: false })
      .eq('id', materialToDelete.id)
      .eq('tenant_id', tenantId)

    if (error) {
      showBanner('error', 'تعذر حذف الخامة من المخزن')
      setIsDeleting(false)
      return
    }

    showBanner('success', `تم حذف "${materialToDelete.name}" بنجاح`)
    setIsDeleting(false)
    setMaterialToDelete(null)
    fetchMaterials()
  }

  const openTransactionModal = (material: RawMaterial, type: TransactionKind) => {
    setTransactionForm({ material, type, quantity: '', reference_note: '' })
  }

  const handleSaveTransaction = async () => {
    if (!transactionForm || !transactionForm.material || !tenantId) return

    const quantity = Number(transactionForm.quantity)
    if (Number.isNaN(quantity) || quantity <= 0) {
      showBanner('error', 'الرجاء إدخال كمية صحيحة أكبر من صفر')
      return
    }

    setIsSavingTransaction(true)

    // 🔒 تم التأكيد على الثغرة: الدالة هنا تمرر فقط المعطيات المطلوبة، ويستنتج السيرفر الـ tenant_id من الجلسة تلقائياً.
    const { data, error } = await supabase.rpc('fn_record_manual_material_transaction', {
      p_material_id: transactionForm.material.id,
      p_transaction_type: transactionForm.type,
      p_quantity: quantity,
      p_reference_note: transactionForm.reference_note.trim() || null,
    })

    if (error) {
      showBanner('error', 'حدث خطأ أثناء قيد الحركة')
      setIsSavingTransaction(false)
      return
    }

    const result = data as { success: boolean; message: string }
    if (!result?.success) {
      showBanner('error', result?.message ?? 'تعذر قيد الحركة')
      setIsSavingTransaction(false)
      return
    }

    showBanner('success', result.message)
    setIsSavingTransaction(false)
    setTransactionForm(null)
    fetchMaterials()
  }

  if (isBootstrapping) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#0D1B2A]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen pb-16 bg-[#0D1B2A] text-[#F0EDE8] p-6 md:p-10" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-white/5 pb-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30">
            <Boxes className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">مخزن الخامات ومستلزمات الإنتاج</h1>
            <p className="text-sm text-gray-400">إدارة الأرصدة، حدود الطلب، وحركات التوريد والتصنيع</p>
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-[#0D1B2A] hover:bg-amber-400 transition"
        >
          <Plus className="h-4 w-4" /> إضافة خامة جديدة
        </button>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/5 bg-[#111927] p-5">
          <div className="flex items-center justify-between text-gray-400 text-sm">
            <span>إجمالي بنود الخامات</span>
            <Package className="h-4 w-4 opacity-50" />
          </div>
          <p className="mt-3 text-2xl font-bold text-white">{formatNumber(stats.totalMaterials)}</p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-[#111927] p-5">
          <div className="flex items-center justify-between text-amber-500 text-sm">
            <span>أصناف تحت حد التنبيه (نواقص)</span>
            <TrendingDown className="h-4 w-4 opacity-70" />
          </div>
          <p className="mt-3 text-2xl font-bold text-amber-400">{formatNumber(stats.lowStockCount)}</p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-[#111927] p-5">
          <div className="flex items-center justify-between text-emerald-400 text-sm">
            <span>القيمة التقديرية للمخزون</span>
            <Wallet className="h-4 w-4 opacity-70" />
          </div>
          <p className="mt-3 text-2xl font-bold text-emerald-400">{formatCurrency(stats.totalInventoryValue)} ج.م</p>
        </div>
      </div>

      {/* تنبيه النواقص الذكي */}
      {stats.lowStockCount > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 animate-in fade-in">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm leading-relaxed text-gray-300">
            يوجد <span className="font-bold text-amber-500">{formatNumber(stats.lowStockCount)}</span> صنف من
            الخامات وصل إلى حد التنبيه أو أقل. يُنصح بمراجعة هذه الأصناف وإصدار أذون توريد قريباً.
          </p>
        </div>
      )}

      {/* Filter Bar */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث باسم الخامة أو المورد..."
            className="w-full rounded-xl border border-white/10 bg-[#111927] py-2.5 pr-10 pl-4 text-sm text-white placeholder:text-gray-500 outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as MaterialCategory | 'الكل')}
            className="rounded-xl border border-white/10 bg-[#111927] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
          >
            <option value="الكل">كل التصنيفات</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as StockFilter)}
            className="rounded-xl border border-white/10 bg-[#111927] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
          >
            <option value="all">كل الأرصدة</option>
            <option value="low">تحت حد التنبيه فقط</option>
            <option value="normal">رصيد كافي فقط</option>
          </select>
        </div>
      </div>

      {/* Materials Table */}
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#111927]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
            <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
            <p className="text-sm">جارِ تحميل المخزن...</p>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-gray-500">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-sm">لا توجد خامات مطابقة في المخزن</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm text-right">
              <thead>
                <tr className="border-b border-white/5 text-gray-400 text-xs">
                  <th className="px-5 py-3.5">اسم الخامة والمستلزم</th>
                  <th className="px-5 py-3.5">التصنيف</th>
                  <th className="px-5 py-3.5">الرصيد المتاح</th>
                  <th className="px-5 py-3.5">حد التنبيه</th>
                  <th className="px-5 py-3.5">تكلفة الوحدة</th>
                  <th className="px-5 py-3.5">حالة الرصيد</th>
                  <th className="px-5 py-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredMaterials.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-5 py-4">
                      <p className="font-bold text-white">{item.name}</p>
                      {item.supplier_name && <p className="text-xs text-gray-500">المورد: {item.supplier_name}</p>}
                    </td>
                    <td className="px-5 py-4 text-gray-400">{item.category}</td>
                    <td className="px-5 py-4 font-bold text-white font-mono">
                      {formatNumber(item.current_stock)} <span className="text-xs font-sans text-gray-400">{item.unit}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 font-mono">{formatNumber(item.alert_threshold)} {item.unit}</td>
                    <td className="px-5 py-4 text-gray-300 font-mono">{formatCurrency(item.unit_cost)} ج.م</td>
                    <td className="px-5 py-4">
                      <StockBadge material={item} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button title="إذن توريد رصيد" onClick={() => openTransactionModal(item, 'supply')} className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition">
                          <ArrowUpCircle className="h-4 w-4" />
                        </button>
                        <button title="تسجيل هالك مخزني" onClick={() => openTransactionModal(item, 'waste')} className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-lg transition">
                          <ArrowDownCircle className="h-4 w-4" />
                        </button>
                        <button title="تعديل بيانات الخامة" onClick={() => openEditModal(item)} className="p-2 text-gray-400 hover:bg-white/5 rounded-lg transition">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button title="حذف الخامة" onClick={() => setMaterialToDelete(item)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal إضافة / تعديل */}
      {showFormModal && (
        <ModalShell title={materialForm.id ? 'تعديل بيانات الخامة' : 'إضافة خامة جديدة للمخزن'} onClose={() => !isSavingMaterial && setShowFormModal(false)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">اسم الخامة *</label>
              <input
                type="text"
                value={materialForm.name}
                onChange={(e) => setMaterialForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثال: قماش قطن سنغل، خيط أسود بكرة"
                className="w-full rounded-xl border border-white/10 bg-[#0D1B2A] px-4 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">التصنيف</label>
              <select
                value={materialForm.category}
                onChange={(e) => setMaterialForm((f) => ({ ...f, category: e.target.value as MaterialCategory }))}
                className="w-full rounded-xl border border-white/10 bg-[#0D1B2A] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
              >
                {CATEGORY_OPTIONS.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">وحدة القياس</label>
              <select
                value={materialForm.unit}
                onChange={(e) => setMaterialForm((f) => ({ ...f, unit: e.target.value as MaterialUnit }))}
                className="w-full rounded-xl border border-white/10 bg-[#0D1B2A] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
              >
                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">الرصيد الافتتاحي</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={materialForm.current_stock}
                disabled={!!materialForm.id}
                onChange={(e) => setMaterialForm((f) => ({ ...f, current_stock: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-[#0D1B2A] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50 disabled:opacity-40"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">حد إعادة الطلب</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={materialForm.alert_threshold}
                onChange={(e) => setMaterialForm((f) => ({ ...f, alert_threshold: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-[#0D1B2A] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">تكلفة الوحدة (ج.م)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={materialForm.unit_cost}
                onChange={(e) => setMaterialForm((f) => ({ ...f, unit_cost: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-[#0D1B2A] px-4 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">اسم المورد (اختياري)</label>
              <input
                type="text"
                value={materialForm.supplier_name}
                onChange={(e) => setMaterialForm((f) => ({ ...f, supplier_name: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-[#0D1B2A] px-4 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button onClick={() => setShowFormModal(false)} className="rounded-xl px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5">إلغاء</button>
            <button onClick={handleSaveMaterial} disabled={isSavingMaterial} className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-[#0D1B2A] hover:bg-amber-400 transition disabled:opacity-50">
              {isSavingMaterial && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ
            </button>
          </div>
        </ModalShell>
      )}

      {/* Modal حركة سريعة */}
      {transactionForm && (
        <ModalShell title={transactionForm.type === 'supply' ? 'إذن توريد وإضافة رصيد' : 'تسجيل إتلاف وهالك مخزني'} onClose={() => !isSavingTransaction && setTransactionForm(null)} maxWidth="max-w-md">
          <p className="text-xs text-gray-400 mb-4 bg-white/5 p-3 rounded-lg border border-white/5">الخامة: <span className="font-bold text-white">{transactionForm.material?.name}</span></p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">الكمية ({transactionForm.material?.unit}) *</label>
              <input
                type="number"
                min="0.001"
                step="0.001"
                autoFocus
                value={transactionForm.quantity}
                onChange={(e) => setTransactionForm((f) => f ? { ...f, quantity: e.target.value } : f)}
                className="w-full rounded-xl border border-white/10 bg-[#0D1B2A] px-4 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">ملاحظات / رقم الفاتورة</label>
              <input
                type="text"
                value={transactionForm.reference_note}
                onChange={(e) => setTransactionForm((f) => f ? { ...f, reference_note: e.target.value } : f)}
                className="w-full rounded-xl border border-white/10 bg-[#0D1B2A] px-4 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button onClick={() => setTransactionForm(null)} className="rounded-xl px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5">إلغاء</button>
            <button onClick={handleSaveTransaction} disabled={isSavingTransaction} className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-[#0D1B2A] hover:bg-amber-400 transition disabled:opacity-50">
              {isSavingTransaction && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد الحركة
            </button>
          </div>
        </ModalShell>
      )}

      {/* Modal حذف */}
      {materialToDelete && (
        <ModalShell title="تأكيد حذف الخامة" onClose={() => !isDeleting && setMaterialToDelete(null)} maxWidth="max-w-sm">
          <div className="text-center">
            <Trash2 className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-gray-300 mb-6">هل أنت متأكد من حذف "{materialToDelete.name}" من قائمة الخامات النشطة؟</p>
            <div className="flex gap-3">
              <button onClick={() => setMaterialToDelete(null)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-400 hover:bg-white/5">تراجع</button>
              <button onClick={handleDeleteMaterial} disabled={isDeleting} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition">
                {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                تأكيد الحذف
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}