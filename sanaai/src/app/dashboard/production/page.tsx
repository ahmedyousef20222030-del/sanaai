'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Loader2, RefreshCw, Search,
  User, PenTool, Scissors, Shirt, Printer, Package, FileText, ImageOff
} from 'lucide-react'

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
  notes?: string
  total_price?: number
  paid?: number
  remaining?: number
  details?: string
  design_link?: string
  image_url?: string
  // ✅ تحديث المسميات لتطابق السكيما v1.1
  stage_design: string
  stage_cut: string
  stage_sew: string
  stage_print: string
  stage_pack: string
  updated_at: string
}

type FilterStatus = 'all' | 'جديد' | 'قيد التنفيذ' | 'جاهز للشحن' | 'تم التسليم' | 'ملغى'

// ✅ ربط الحقول بالمسميات الصحيحة في قاعدة البيانات
type StageField = 'stage_design' | 'stage_cut' | 'stage_sew' | 'stage_print' | 'stage_pack'

const STAGES: { field: StageField; icon: ReactNode; label: string }[] = [
  { field: 'stage_design',    icon: <PenTool  size={14} />, label: 'تصميم' },
  { field: 'stage_cut',       icon: <Scissors size={14} />, label: 'قص'    },
  { field: 'stage_sew',       icon: <Shirt    size={14} />, label: 'خياطة' },
  { field: 'stage_print',     icon: <Printer  size={14} />, label: 'طباعة' },
  { field: 'stage_pack',      icon: <Package  size={14} />, label: 'تغليف' },
]

export default function ProductionBoardPage() {
  const [orders,         setOrders]         = useState<ProductionOrder[]>([])
  const [loading,        setLoading]        = useState(true)
  const [updatingId,     setUpdatingId]     = useState<string | null>(null)
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState<FilterStatus>('all')
  const [salesRepFilter, setSalesRepFilter] = useState('')
  const [salesRepsList,  setSalesRepsList]  = useState<string[]>([])
  const [message,        setMessage]        = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [previewImage,   setPreviewImage]   = useState<string | null>(null)

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  async function loadData() {
    setLoading(true)
    try {
      const { data: me } = await supabase.from('users').select('tenant_id').single()
      if (!me?.tenant_id) throw new Error('لم يتم العثور على صلاحيات المصنع')

      // ✅ استعلام محسن لجلب البيانات المرتبطة
      const { data, error } = await supabase
        .from('production')
        .select(`
          *,
          supervisor:users!supervisor_id ( full_name ),
          orders (
            order_number, order_date, expected_delivery,
            total_price, deposit_paid, remaining,
            notes, details, design_url,
            clients (name, phone, address)
          )
        `)
        .eq('tenant_id', me.tenant_id)
        .order('updated_at', { ascending: false })

      if (error) throw error

      const mapped: ProductionOrder[] = (data || []).map((p: any) => ({
        id:               p.id,
        customer_name:    p.orders?.clients?.name  || '—',
        phone:            p.orders?.clients?.phone,
        order_date:       p.orders?.order_date      || '',
        end_date:         p.orders?.expected_delivery,
        final_status:     p.final_status            || 'بانتظار التنفيذ',
        sales_rep:        p.supervisor?.full_name || '—',
        supervisor:       p.supervisor?.full_name,
        address:          p.orders?.clients?.address,
        notes:            p.orders?.notes,
        total_price:      p.orders?.total_price,
        paid:             p.orders?.deposit_paid,
        remaining:        p.orders?.remaining,
        details:          p.orders?.details         || p.details,
        design_link:      p.orders?.design_url,
        image_url:        p.orders?.design_url, // الاعتماد على رابط التصميم الأساسي
        stage_design:    p.stage_design    || 'pending',
        stage_cut:       p.stage_cut       || 'pending',
        stage_sew:       p.stage_sew       || 'pending',
        stage_print:     p.stage_print     || 'pending',
        stage_pack:      p.stage_pack      || 'pending',
        updated_at:       p.updated_at,
      }))

      setOrders(mapped)
      const reps = Array.from(new Set(mapped.map(o => o.sales_rep).filter(Boolean))) as string[]
      setSalesRepsList(reps.sort())

    } catch (err: any) {
      showMessage('error', 'خطأ في تحميل البيانات: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // ── Toggle Stage (المنطق المحدث v1.1) ────────────────────────────
  async function handleToggleStage(
    orderId: string,
    field: StageField,
    currentVal: string
  ) {
    // ✅ تبديل بين pending و done (تطابق مع السكيما)
    const nextVal = currentVal === 'done' ? 'pending' : 'done'
    
    setUpdatingId(orderId)

    try {
      // تحديث المرحلة فقط -> التريجر في DB سيتكفل بتحديث حالة الطلب والـ final_status
      const { error } = await supabase
        .from('production')
        .update({ [field]: nextVal, updated_at: new Date().toISOString() })
        .eq('id', orderId)

      if (error) throw error

      // تحديث الحالة في الواجهة محلياً
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: nextVal } : o))
      showMessage('success', 'تم تحديث المرحلة بنجاح')
      
      // إعادة تحميل البيانات لجلب الحالة النهائية (final_status) التي حدثها التريجر
      loadData() 

    } catch (err: any) {
      showMessage('error', 'فشل التحديث: ' + err.message)
    } finally {
      setUpdatingId(null)
    }
  }

  function getFinalBadgeClass(status: string): string {
    switch (status) {
      case 'تم التسليم':    return 'bg-green-500/15 text-green-400 border-green-500/30'
      case 'جاهز للشحن':     return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
      case 'قيد التنفيذ':    return 'bg-orange-500/15 text-orange-400 border-orange-500/30'
      case 'ملغى':           return 'bg-red-500/15 text-red-400 border-red-500/30'
      default:               return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    }
  }

  function getStageClass(status: string): string {
    if (status === 'done') return 'bg-green-500/10 border-green-500/40 text-green-400 font-bold'
    if (status === 'in_progress') return 'bg-amber-500/10 border-amber-500/40 text-amber-400'
    return 'bg-white/5 border-white/10 text-gray-400 hover:border-amber-500/30 hover:text-amber-400'
  }

  const filtered = orders.filter(o => {
    if (o.final_status === 'تم التسليم' && !search && statusFilter === 'all') return false
    const term = search.toLowerCase()
    const matchSearch = !search || o.customer_name.toLowerCase().includes(term) || (o.phone?.includes(search) ?? false)
    const matchStatus = statusFilter === 'all' || o.final_status === statusFilter
    const matchRep    = !salesRepFilter || o.sales_rep === salesRepFilter
    return matchSearch && matchStatus && matchRep
  })

  return (
    <div className="space-y-5 p-4" dir="rtl">
      {/* Toast message */}
      {message && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-bold border ${
          message.type === 'success' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'
        }`}>
          {message.type === 'success' ? '✅ ' : '❌ '}{message.text}
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="preview" className="max-w-full max-h-full rounded-2xl border border-white/10" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-black flex items-center gap-2 text-white">👷 شاشة تشغيل ومتابعة الإنتاج</h1>
          <p className="text-gray-500 text-sm">تحديث لحظي لمراحل التنفيذ داخل المصنع</p>
        </div>
        <button onClick={loadData} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} تحديث
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-[#111927] border border-white/5 p-4 rounded-2xl">
        <div className="md:col-span-5 flex items-center gap-2 bg-[#0D1B2A] border border-white/10 rounded-xl px-3 py-2 focus-within:border-amber-500/50 transition-colors">
          <Search size={16} className="text-gray-500" />
          <input type="text" placeholder="ابحث باسم العميل أو الجوال..." className="bg-transparent outline-none text-sm w-full text-white placeholder:text-white/30" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="md:col-span-3">
          <select className="w-full bg-[#0D1B2A] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" value={statusFilter} onChange={e => setStatusFilter(e.target.value as FilterStatus)}>
            <option value="all">كل الحالات</option>
            <option value="جديد">جديد</option>
            <option value="قيد التنفيذ">قيد التنفيذ</option>
            <option value="جاهز للشحن">جاهز للشحن</option>
            <option value="تم التسليم">تم التسليم</option>
            <option value="ملغى">ملغى</option>
          </select>
        </div>
        <div className="md:col-span-4">
          <select className="w-full bg-[#0D1B2A] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" value={salesRepFilter} onChange={e => setSalesRepFilter(e.target.value)}>
            <option value="">كل موظفي المبيعات</option>
            {salesRepsList.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-[#111927] border border-white/5 rounded-2xl p-16 text-center text-gray-500">
          <Loader2 size={32} className="animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-sm">جاري مزامنة خطوط الإنتاج...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#111927] border border-white/5 rounded-2xl p-16 text-center text-gray-500">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-sm">لا توجد طلبيات نشطة حالياً</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filtered.map(order => (
            <div key={order.id} className={`bg-[#111927] border rounded-2xl p-4 flex flex-col justify-between transition-all hover:border-white/10 ${order.final_status === 'قيد التنفيذ' ? 'border-orange-500/20' : 'border-white/5'}`}>
              <div>
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-start gap-2.5">
                    {order.image_url ? (
                      <button onClick={() => setPreviewImage(order.image_url!)} className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-white/10 hover:border-amber-500/50 transition">
                        <img src={order.image_url} alt="design" className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="shrink-0 w-12 h-12 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-gray-600">
                        <ImageOff size={16} />
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        <span className="font-mono bg-white/5 border border-white/10 text-amber-400 px-2 py-0.5 rounded-md text-xs">{order.id.slice(0, 8)}</span>
                        {order.design_link && <a href={order.design_link} target="_blank" rel="noreferrer" className="text-cyan-400 text-xs hover:underline">🖼️ باترون</a>}
                      </div>
                      <div className="text-xs font-bold mt-1.5 flex items-center gap-1 text-white">
                        <User size={12} className="text-gray-500" /> {order.customer_name}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${getFinalBadgeClass(order.final_status)}`}>{order.final_status}</span>
                    <span className="text-xs text-gray-500 font-mono">🗓️ {order.order_date}</span>
                  </div>
                </div>

                <div className="h-px bg-white/5 my-3" />
                <div className="space-y-1.5 text-xs text-gray-500">
                  <div>👔 المسؤول: <span className="text-white font-medium mr-1">{order.supervisor || order.sales_rep || '—'}</span></div>
                  {order.notes && <div className="bg-amber-500/5 border border-amber-500/15 p-2 rounded-lg text-xs text-amber-400/90">📝 {order.notes}</div>}
                  <div className="bg-white/5 p-1.5 rounded-md text-xs font-mono flex justify-around border border-white/5">
                    <span>إجمالي: <span className="text-cyan-400 font-bold">{order.total_price ?? 0}</span></span>
                    <span>متبقي: <span className="text-red-400 font-bold">{order.remaining ?? 0}</span></span>
                  </div>
                </div>
              </div>

              <div>
                <div className="h-px bg-white/5 my-3" />
                <div className="text-xs text-gray-500 mb-2 font-bold flex items-center justify-between">
                  <span>🛠️ مراحل التنفيذ:</span>
                  {order.final_status === 'جاهز للشحن' && <span className="text-cyan-400 animate-pulse">🚚 جاهز للشحن</span>}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {STAGES.map(stage => {
                    const val = order[stage.field]
                    return (
                      <button
                        key={stage.field}
                        disabled={updatingId === order.id}
                        onClick={() => handleToggleStage(order.id, stage.field, val)}
                        className={`border rounded-lg px-1 py-2 text-center text-[10px] transition-all flex flex-col items-center justify-center gap-1 ${getStageClass(val)} ${updatingId === order.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {updatingId === order.id ? <Loader2 size={12} className="animate-spin" /> : (val === 'done' ? <span className="text-sm">✅</span> : stage.icon)}
                        <span className="leading-tight">{stage.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}