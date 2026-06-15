'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState({ title: '', description: '', priority: 'متوسط' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.from('complaints')
      .select('*, clients(name), orders(order_number)')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setComplaints(data || []); setLoading(false) })
  }, [])

  async function updateStatus(id: string, status: string) {
    setSaving(id)
    await supabase.from('complaints').update({ status }).eq('id', id)
    setComplaints(c => c.map(x => x.id === id ? { ...x, status } : x))
    setSaving(null)
  }

  async function handleAdd() {
    if (!form.title) { alert('العنوان مطلوب'); return }
    setSubmitting(true)
    const { data: tenant } = await supabase.from('users').select('tenant_id').single()
    const { data, error } = await supabase.from('complaints')
      .insert({ ...form, tenant_id: tenant?.tenant_id, status: 'جديد' }).select().single()
    if (!error && data) { setComplaints(c => [data, ...c]); setShowForm(false); setForm({ title: '', description: '', priority: 'متوسط' }) }
    setSubmitting(false)
  }

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

  const statuses = ['جديد', 'قيد المعالجة', 'محلول', 'مغلق']

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">📢 الشكاوى</h1>
          <p className="text-sm text-gray-500 mt-1">{complaints.length} شكوى</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm">
          ➕ شكوى جديدة
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {statuses.map(s => (
          <div key={s} className="bg-[#111927] rounded-2xl border border-white/5 p-4 text-center">
            <div className="text-2xl font-black text-white mb-1">
              {complaints.filter(c => c.status === s).length}
            </div>
            <div className="text-xs text-gray-500">{s}</div>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-[#111927] rounded-2xl border border-amber-500/20 p-5 mb-6">
          <h2 className="text-sm font-bold text-amber-400 mb-4">إضافة شكوى جديدة</h2>
          <div className="space-y-3">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="عنوان الشكوى *"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="تفاصيل الشكوى..." rows={3}
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none" />
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50">
              {['عالي', 'متوسط', 'منخفض'].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} disabled={submitting}
              className="px-5 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm disabled:opacity-50">
              {submitting ? 'جاري الحفظ...' : 'حفظ'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-5 py-2 border border-white/10 text-gray-400 rounded-lg text-sm hover:bg-white/5 transition">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري التحميل...</div>
      ) : complaints.length === 0 ? (
        <div className="text-center py-16 text-gray-600">لا توجد شكاوى</div>
      ) : (
        <div className="space-y-4">
          {complaints.map(c => (
            <div key={c.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-white text-sm">{c.title}</h3>
                    {c.priority && (
                      <span className={`text-[10px] font-bold ${priorityColor[c.priority]}`}>
                        ● {c.priority}
                      </span>
                    )}
                  </div>
                  {c.clients?.name && <p className="text-xs text-gray-500">{c.clients.name}</p>}
                  {c.orders?.order_number && (
                    <p className="text-[10px] font-mono text-amber-400">{c.orders.order_number}</p>
                  )}
                </div>
                {c.status && (
                  <span className={`text-xs px-3 py-1 rounded-full border ${statusColor[c.status]}`}>
                    {c.status}
                  </span>
                )}
              </div>

              {c.description && (
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">{c.description}</p>
              )}

              <div className="flex gap-2">
                {statuses.map(st => (
                  <button key={st}
                    disabled={saving === c.id}
                    onClick={() => updateStatus(c.id, st)}
                    className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold border transition
                      ${c.status === st
                        ? statusColor[st]
                        : 'bg-white/5 text-gray-600 border-white/5 hover:border-white/10'}`}>
                    {st}
                  </button>
                ))}
              </div>

              <div className="text-[10px] text-gray-700 mt-3">
                {new Date(c.created_at).toLocaleDateString('ar-EG')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}