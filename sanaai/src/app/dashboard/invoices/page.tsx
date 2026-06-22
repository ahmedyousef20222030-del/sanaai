'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import InvoicePDF from '@/components/InvoicePDF'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)
  const [printInvoice, setPrintInvoice] = useState<any | null>(null)

  useEffect(() => {
    fetchInvoices()
  }, [])

  async function fetchInvoices() {
    setLoading(true)
    // ✅ جلب البيانات باستخدام المسميات الصحيحة في v1.1
    const { data, error } = await supabase
      .from('invoices')
      .select('*, orders(order_number, total_price, deposit_paid, quantity, clients(name, phone))')
      .order('created_at', { ascending: false })
    
    if (!error) setInvoices(data || [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    setSaving(id)
    try {
      // ✅ تحديث الحالة بقيم متوافقة مع CHECK constraint
      const { error } = await supabase.from('invoices').update({ status }).eq('id', id)
      if (error) throw error
      setInvoices(v => v.map(x => x.id === id ? { ...x, status } : x))
    } catch (err: any) {
      alert('خطأ في تحديث الحالة: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  // ✅ تحديث الألوان لتطابق حالات السكيما v1.1
  const statusColor: Record<string, string> = {
    'غير مدفوع': 'bg-red-500/20 text-red-400 border-red-500/30',
    'جزئي':      'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'مدفوع':     'bg-green-500/20 text-green-400 border-green-500/30',
    'متأخر':     'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'ملغي':      'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }

  const statuses = ['غير مدفوع', 'جزئي', 'مدفوع', 'متأخر', 'ملغي']

  // ✅ تصحيح الحسابات المالية باستخدام total_amount
  const totalAmount   = invoices.reduce((s, x) => s + (x.total_amount || 0), 0)
  const totalPaid     = invoices.filter(x => x.status === 'مدفوع').reduce((s, x) => s + (x.total_amount || 0), 0)
  const totalPending  = invoices.filter(x => x.status === 'غير مدفوع' || x.status === 'جزئي').reduce((s, x) => s + (x.total_amount || 0), 0)

  function fmt(n: number) {
    return Number(n || 0).toLocaleString('ar-EG') + ' ج.م'
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">🧾 إدارة الفواتير والتحصيل</h1>
        <p className="text-sm text-gray-500 mt-1">{invoices.length} فاتورة مسجلة</p>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-[#111927] rounded-2xl border border-white/5 p-5 shadow-lg">
          <div className="text-xs text-gray-500 mb-1">إجمالي قيمة الفواتير</div>
          <div className="text-2xl font-black text-white">{fmt(totalAmount)}</div>
        </div>
        <div className="bg-[#111927] rounded-2xl border border-white/5 p-5 shadow-lg border-r-4 border-r-green-500">
          <div className="text-xs text-gray-500 mb-1">إجمالي المحصل (مدفوع)</div>
          <div className="text-2xl font-black text-green-400">{fmt(totalPaid)}</div>
        </div>
        <div className="bg-[#111927] rounded-2xl border border-white/5 p-5 shadow-lg border-r-4 border-r-amber-500">
          <div className="text-xs text-gray-500 mb-1">مبالغ معلقة (غير مدفوعة)</div>
          <div className="text-2xl font-black text-amber-400">{fmt(totalPending)}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري تحميل الفواتير...</div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 text-gray-600 bg-[#111927] rounded-3xl border border-white/5">
          <div className="text-4xl mb-3">🧾</div>
          <p>لا توجد فواتير صادرة حالياً</p>
        </div>
      ) : (
        <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] border-b border-white/5">
                <tr className="text-right">
                  {['رقم الفاتورة', 'العميل', 'المبلغ الإجمالي', 'الحالة', 'تاريخ الاستحقاق', 'تحديث الحالة', 'إجراء'].map(h => (
                    <th key={h} className="px-5 py-4 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.03] transition">
                    <td className="px-5 py-4 font-mono text-amber-400 text-xs">
                      {inv.invoice_number || inv.orders?.order_number}
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-xs font-semibold text-white">{inv.orders?.clients?.name}</div>
                      <div className="text-[10px] text-gray-600">{inv.orders?.clients?.phone}</div>
                    </td>
                    <td className="px-5 py-4 text-amber-400 font-bold text-xs">
                      {fmt(inv.total_amount)}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${statusColor[inv.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                        {inv.status || 'غير مدفوع'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={inv.status || 'غير مدفوع'}
                        disabled={saving === inv.id}
                        onChange={e => updateStatus(inv.id, e.target.value)}
                        className="bg-[#0D1B2A] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500/50 transition"
                      >
                        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setPrintInvoice(inv)}
                        className="px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition"
                      >
                        🖨️ طباعة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {printInvoice && (
        <InvoicePDF invoice={printInvoice} onClose={() => setPrintInvoice(null)} />
      )}
    </div>
  )
}