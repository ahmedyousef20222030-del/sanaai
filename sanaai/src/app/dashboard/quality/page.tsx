'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, ClipboardCheck, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'

type QualityCheck = {
  id: string
  order_id: string
  result: string // 'ناجح', 'راسب', 'يحتاج مراجعة'
  notes: string | null
  created_at: string
  orders: {
    order_number: string
    quantity: number
    clients: { name: string }
  }
}

const resultColor: Record<string, string> = {
  'ناجح':        'bg-green-500/20 text-green-400 border-green-500/30',
  'راسب':        'bg-red-500/20 text-red-400 border-red-500/30',
  'يحتاج مراجعة': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

export default function QualityPage() {
  const [checks, setChecks] = useState<QualityCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => { fetchChecks() }, [])

  async function fetchChecks() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('quality_checks')
        .select('*, orders(order_number, quantity, clients(name))')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setChecks(data || [])
    } catch (err: any) {
      console.error('Error fetching quality checks:', err)
    } finally {
      setLoading(false)
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  async function updateResult(id: string, result: string) {
    setSaving(id)
    try {
      // تحديث النتيجة في جدول الجودة
      // التريجر في DB سيتكفل بتحويل حالة الطلب إلى "جاهز للشحن" إذا كانت النتيجة "ناجح"
      const { error } = await supabase
        .from('quality_checks')
        .update({ result: result })
        .eq('id', id)

      if (error) throw error

      setChecks(prev => prev.map(c => c.id === id ? { ...c, result } : c))
      showMessage('success', `تم تحديث حالة الفحص إلى: ${result}`)
    } catch (err: any) {
      showMessage('error', 'فشل تحديث النتيجة: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  async function updateNotes(id: string, notes: string) {
    try {
      const { error } = await supabase.from('quality_checks').update({ notes }).eq('id', id)
      if (error) throw error
      // تحديث محلي صامت
      setChecks(prev => prev.map(c => c.id === id ? { ...c, notes } : c))
    } catch (err: any) {
      console.error('Error updating notes:', err)
    }
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {message && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-bold border ${
          message.type === 'success' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'
        }`}>
          {message.type === 'success' ? '✅ ' : '❌ '}{message.text}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-black text-white">🔍 مراقبة جودة الإنتاج</h1>
        <p className="text-sm text-gray-500 mt-1">مراجعة نهائية للطلبات قبل الانتقال لمرحلة الشحن</p>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'ناجح (جاهز للشحن)', color: 'text-green-400', icon: <CheckCircle2 size={20}/>, val: checks.filter(c => c.result === 'ناجح').length },
          { label: 'يحتاج مراجعة', color: 'text-amber-400', icon: <AlertCircle size={20}/>, val: checks.filter(c => c.result === 'يحتاج مراجعة' || !c.result).length },
          { label: 'راسب (إعادة تصنيع)', color: 'text-red-400', icon: <XCircle size={20}/>, val: checks.filter(c => c.result === 'راسب').length },
        ].map(s => (
          <div key={s.label} className="bg-[#111927] rounded-2xl border border-white/5 p-5 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-white/5 ${s.color}`}>{s.icon}</div>
              <span className="text-xs text-gray-500 font-medium">{s.label}</span>
            </div>
            <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-600 gap-3">
          <Loader2 size={32} className="animate-spin text-amber-500" />
          <p>جاري تحميل بيانات الجودة...</p>
        </div>
      ) : checks.length === 0 ? (
        <div className="text-center py-20 bg-[#111927] rounded-3xl border border-white/5">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-600">لا توجد عمليات فحص معلقة حالياً</p>
        </div>
      ) : (
        <div className="space-y-4">
          {checks.map(c => (
            <div key={c.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold border border-amber-500/20">
                    QC
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-mono text-amber-400">{c.orders?.order_number || 'بدون رقم'}</span>
                    <div className="text-sm font-bold text-white mt-1">{c.orders?.clients?.name || 'عميل غير معروف'}</div>
                    <div className="text-xs text-gray-500">{c.orders?.quantity} قطعة</div>
                  </div>
                </div>
                {c.result && (
                  <span className={`text-xs px-3 py-1 rounded-full border font-bold ${resultColor[c.result] || 'bg-gray-500/20'}`}>
                    {c.result}
                  </span>
                )}
              </div>

              <div className="flex gap-2 mb-4">
                {[
                  { val: 'ناجح', label: '✅ ناجح' }, 
                  { val: 'يحتاج مراجعة', label: '⏳ مراجعة' }, 
                  { val: 'راسب', label: '❌ راسب' }
                ].map(opt => (
                  <button key={opt.val}
                    disabled={saving === c.id}
                    onClick={() => updateResult(c.id, opt.val)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${c.result === opt.val ? resultColor[opt.val] : 'bg-white/5 text-gray-600 border-white/10 hover:border-amber-500/50 hover:text-amber-400'}`}>
                    {opt.val === 'ناجح' && saving === c.id ? <Loader2 size={14} className="animate-spin mx-auto" /> : opt.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <textarea
                  defaultValue={c.notes || ''}
                  onBlur={e => updateNotes(c.id, e.target.value)}
                  placeholder="أضف ملاحظات الفحص هنا (مثلاً: خطأ في اللون، تم إصلاحه...)"
                  rows={2}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-amber-500/50 resize-none transition"
                />
                <div className="absolute bottom-2 left-2 text-[10px] text-gray-600 pointer-events-none">حفظ تلقائي</div>
              </div>

              <div className="flex justify-between items-center mt-3">
                <div className="text-[10px] text-gray-700">تاريخ الفحص: {new Date(c.created_at).toLocaleDateString('ar-EG')}</div>
                <div className="text-[10px] text-gray-600">ID: {c.id.slice(0,8)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
