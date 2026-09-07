'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import InvoicePDF from '@/components/InvoicePDF'
import { Loader2, FileText, CheckCircle2, CreditCard, AlertTriangle, Search, Download, X, Link } from 'lucide-react'

// دالة مساعدة محلية لجلب معرّف المصنع (Tenant)
async function getTenantId() {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data, error } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
    
  if (error) return null
  return data?.tenant_id
}

type Invoice = {
  id: string
  invoice_number: string
  total_amount: number
  paid_amount: number
  remaining_amount: number
  status: string
  due_date: string | null
  created_at: string
  orders: {
    order_number: string
    total_amount: number
    deposit_paid: number
    clients: { name: string; phone: string }
  } | null
}

const statusColor: Record<string, string> = {
  'غير مدفوع': 'bg-red-500/20 text-red-400 border-red-500/30',
  'جزئي':      'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'مدفوع':     'bg-green-500/20 text-green-400 border-green-500/30',
  'متأخر':     'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'ملغي':      'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('الكل')

  const [partialInvoice, setPartialInvoice] = useState<Invoice | null>(null)
  const [partialAmount, setPartialAmount] = useState<string>('')

  useEffect(() => { 
    fetchInvoices() 
  }, [])

  async function fetchInvoices() {
    setLoading(true)
    setErrorMsg(null)
    try {
      const tenantId = await getTenantId()
      if (!tenantId) throw new Error('لم يتم العثور على صلاحيات المصنع')

      const { data, error } = await supabase
        .from('invoices')
        .select('*, orders(order_number, total_amount, deposit_paid, clients(name, phone))')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setInvoices(data || [])
    } catch (err: any) {
      console.error('Error fetching invoices:', err)
      setErrorMsg('حدث خطأ أثناء جلب الفواتير. يرجى تحديث الصفحة.')
    } finally {
      setLoading(false)
    }
  }

  function handleStatusChange(invoice: Invoice, newStatus: string) {
    if (newStatus === 'جزئي') {
      setPartialInvoice(invoice)
      setPartialAmount('')
    } else {
      updateStatus(invoice, newStatus)
    }
  }

  // 🛠️ تم تصحيح الدالة لاحترام قاعدة البيانات المحسوبة
  async function updateStatus(invoice: Invoice, newStatus: string) {
    setSaving(invoice.id)
    setErrorMsg(null)
    try {
      const tenantId = await getTenantId()
      
      // 1. نجهز البيانات لقاعدة البيانات (بدون remaining_amount)
      let dbUpdateData: any = { status: newStatus }
      let newPaid = invoice.paid_amount

      if (newStatus === 'مدفوع') {
        newPaid = invoice.total_amount
        dbUpdateData.paid_amount = newPaid
      }

      // إرسال التحديث لـ Supabase
      const { error } = await supabase
        .from('invoices')
        .update(dbUpdateData)
        .eq('id', invoice.id)
        .eq('tenant_id', tenantId)

      if (error) throw error

      // 2. تحديث الواجهة محلياً ليرى المستخدم النتيجة فوراً
      setInvoices(v => v.map(x => {
        if (x.id === invoice.id) {
          return {
            ...x,
            status: newStatus,
            paid_amount: newPaid,
            remaining_amount: x.total_amount - newPaid // الحساب في الواجهة فقط
          }
        }
        return x
      }))
    } catch (err: any) {
      setErrorMsg('خطأ في تحديث الحالة: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  // 🛠️ تم تصحيح الدالة لاحترام قاعدة البيانات المحسوبة
  async function submitPartialPayment() {
    if (!partialInvoice) return
    const amount = Number(partialAmount)
    
    if (isNaN(amount) || amount <= 0) {
      setErrorMsg('الرجاء إدخال مبلغ صحيح')
      return
    }
    if (amount > partialInvoice.remaining_amount) {
      setErrorMsg('المبلغ المدخل أكبر من المتبقي للفاتورة!')
      return
    }

    const newPaid = partialInvoice.paid_amount + amount
    const newRemaining = partialInvoice.total_amount - newPaid
    const computedStatus = newRemaining === 0 ? 'مدفوع' : 'جزئي'

    setSaving(partialInvoice.id)
    setErrorMsg(null)
    try {
      const tenantId = await getTenantId()
      
      // إرسال التحديث لـ Supabase (بدون remaining_amount)
      const { error } = await supabase
        .from('invoices')
        .update({
          status: computedStatus,
          paid_amount: newPaid
        })
        .eq('id', partialInvoice.id)
        .eq('tenant_id', tenantId)

      if (error) throw error
      
      // تحديث الواجهة محلياً
      setInvoices(v => v.map(x => x.id === partialInvoice.id ? {
        ...x,
        status: computedStatus,
        paid_amount: newPaid,
        remaining_amount: newRemaining // الحساب في الواجهة فقط
      } : x))
      
      setPartialInvoice(null)
    } catch (err: any) {
      setErrorMsg(err.message) // يفضل عرض نص الخطأ الفعلي كما طلبنا
    } finally {
      setSaving(null)
    }
  }

  function handleFullPayment(invoice: Invoice) {
    if (confirm(`هل أنت متأكد من تسديد المبلغ المتبقي (${fmt(invoice.remaining_amount)}) بالكامل؟`)) {
      updateStatus(invoice, 'مدفوع')
    }
  }

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch = 
        (inv.invoice_number?.includes(searchTerm)) || 
        (inv.orders?.order_number?.includes(searchTerm)) ||
        (inv.orders?.clients?.name?.includes(searchTerm))
      const matchesStatus = statusFilter === 'الكل' || inv.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [invoices, searchTerm, statusFilter])

  const { totalAmount, totalPaid, totalPending } = useMemo(() => {
    return {
      totalAmount: filteredInvoices.reduce((s, x) => s + (x.total_amount || 0), 0),
      totalPaid: filteredInvoices.reduce((s, x) => s + (x.paid_amount || 0), 0),
      totalPending: filteredInvoices.reduce((s, x) => s + (x.remaining_amount || 0), 0)
    }
  }, [filteredInvoices])

  function fmt(n: number | null | undefined) {
    return Number(n || 0).toLocaleString('ar-EG') + ' ج.م'
  }

  function exportToCSV() {
    const headers = ['رقم الفاتورة', 'رقم الطلب', 'العميل', 'المبلغ الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'تاريخ الاستحقاق']
    const rows = filteredInvoices.map(inv => [
      inv.invoice_number || '',
      inv.orders?.order_number || 'غير مربوط',
      inv.orders?.clients?.name || '',
      inv.total_amount,
      inv.paid_amount,
      inv.remaining_amount,
      inv.status,
      inv.due_date ? new Date(inv.due_date).toLocaleDateString('ar-EG') : '—'
    ])
    
    const csvContent = '\uFEFF' + [headers, ...rows].map(e => e.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `فواتير_صناعي_${new Date().toLocaleDateString('ar-EG')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="p-6 min-h-screen bg-[#0D1B2A]" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">🧾 إدارة الفواتير والتحصيل</h1>
          <p className="text-sm text-gray-500 mt-1">{filteredInvoices.length} فاتورة معروضة</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 bg-[#111927] border border-white/10 hover:border-amber-500/50 text-white px-4 py-2 rounded-xl transition text-sm font-bold"
        >
          <Download size={16} className="text-amber-500" /> تصدير إكسيل
        </button>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm font-medium">
          <AlertTriangle size={18} />
          {errorMsg}
        </div>
      )}

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#111927] rounded-2xl border border-white/5 p-5 shadow-lg">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <FileText size={14} /> إجمالي الفواتير المعروضة
          </div>
          <div className="text-2xl font-black text-white">{fmt(totalAmount)}</div>
        </div>
        <div className="bg-[#111927] rounded-2xl border border-white/5 p-5 shadow-lg border-r-4 border-r-green-500">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <CheckCircle2 size={14} /> إجمالي المحصل المعروض
          </div>
          <div className="text-2xl font-black text-green-400">{fmt(totalPaid)}</div>
        </div>
        <div className="bg-[#111927] rounded-2xl border border-white/5 p-5 shadow-lg border-r-4 border-r-amber-500">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <CreditCard size={14} /> المبالغ المعلقة المعروضة
          </div>
          <div className="text-2xl font-black text-amber-400">{fmt(totalPending)}</div>
        </div>
      </div>

      {/* 🔍 Search & Filters Bar */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="ابحث برقم الفاتورة، الطلب، أو اسم العميل..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#111927] border border-white/10 rounded-xl pr-11 pl-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition"
          />
        </div>
        <div className="flex overflow-x-auto pb-2 sm:pb-0 hide-scrollbar gap-2">
          {['الكل', 'غير مدفوع', 'جزئي', 'مدفوع', 'متأخر'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
                statusFilter === status 
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' 
                  : 'bg-[#111927] text-gray-400 border-white/10 hover:border-white/30'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-3">
          <Loader2 size={32} className="animate-spin text-amber-500" />
          <p className="text-sm font-medium">جاري تحميل الفواتير...</p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-20 bg-[#111927] rounded-3xl border border-white/5">
          <div className="text-4xl mb-3 opacity-50">🔍</div>
          <p className="text-gray-500 font-medium">لا توجد فواتير تطابق بحثك حالياً</p>
        </div>
      ) : (
        <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] border-b border-white/5">
                <tr className="text-right">
                  {['الفاتورة', 'الطلب', 'العميل', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'الاستحقاق', 'تحديث الحالة', 'إجراء'].map(h => (
                    <th key={h} className="px-5 py-4 text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(inv => (
                  <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.03] transition">
                    <td className="px-5 py-4 font-mono text-amber-400 text-xs whitespace-nowrap font-bold">
                      {inv.invoice_number || 'بدون رقم'}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {inv.orders?.order_number ? (
                        <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-md w-fit">
                          <Link size={12} />
                          <span className="text-[11px] font-mono font-bold">{inv.orders.order_number}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">غير مربوط</span>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="text-xs font-bold text-white">{inv.orders?.clients?.name || '—'}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{inv.orders?.clients?.phone}</div>
                    </td>
                    <td className="px-5 py-4 text-white font-bold text-xs whitespace-nowrap">
                      {fmt(inv.total_amount)}
                    </td>
                    <td className="px-5 py-4 text-green-400 font-bold text-xs whitespace-nowrap">
                      {fmt(inv.paid_amount)}
                    </td>
                    <td className="px-5 py-4 text-red-400 font-bold text-xs whitespace-nowrap">
                      {fmt(inv.remaining_amount)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold ${statusColor[inv.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                        {inv.status || 'غير مدفوع'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <select
                        value={inv.status || 'غير مدفوع'}
                        disabled={saving === inv.id}
                        onChange={e => handleStatusChange(inv, e.target.value)}
                        className={`bg-[#0D1B2A] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50 transition cursor-pointer ${saving === inv.id ? 'opacity-50' : ''}`}
                      >
                        {['غير مدفوع', 'جزئي', 'مدفوع', 'متأخر', 'ملغي'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {inv.status !== 'مدفوع' && inv.remaining_amount > 0 && (
                          <button
                            onClick={() => handleFullPayment(inv)}
                            disabled={saving === inv.id}
                            className={`px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold hover:bg-green-500/20 transition flex items-center gap-1.5 ${saving === inv.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="تسديد المبلغ المتبقي بالكامل"
                          >
                            💰 تسديد
                          </button>
                        )}
                        <button
                          onClick={() => setPrintInvoice(inv)}
                          className="px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition flex items-center gap-1.5"
                        >
                          🖨️ طباعة
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 💳 نافذة الدفع الجزئي (Modal) */}
      {partialInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#111927] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden relative">
            <button 
              onClick={() => setPartialInvoice(null)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white transition"
            >
              <X size={20} />
            </button>
            <div className="p-6">
              <h3 className="text-lg font-black text-white mb-2">تسجيل دفعة جزئية</h3>
              <p className="text-xs text-gray-400 mb-6">فاتورة رقم {partialInvoice.invoice_number}</p>
              
              <div className="bg-[#0D1B2A] border border-white/5 rounded-xl p-4 mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-500">إجمالي الفاتورة:</span>
                  <span className="text-white font-bold">{fmt(partialInvoice.total_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">المبلغ المتبقي:</span>
                  <span className="text-red-400 font-bold">{fmt(partialInvoice.remaining_amount)}</span>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-bold text-gray-400 mb-2">المبلغ المحصل الآن (ج.م)</label>
                <input
                  type="number"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder="أدخل المبلغ هنا..."
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 transition font-bold"
                  autoFocus
                />
              </div>

              <button
                onClick={submitPartialPayment}
                disabled={saving === partialInvoice.id || !partialAmount}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-black py-3 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving === partialInvoice.id ? <Loader2 size={18} className="animate-spin" /> : 'حفظ الدفعة وتحديث الفاتورة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {printInvoice && (
        <InvoicePDF invoice={printInvoice} onClose={() => setPrintInvoice(null)} />
      )}
    </div>
  )
}