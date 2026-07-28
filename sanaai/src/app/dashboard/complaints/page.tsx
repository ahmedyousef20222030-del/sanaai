'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState({ complaint_type: '', description: '', priority: 'متوسط' })
  const [submitting, setSubmitting] = useState(false)

  // --- بحث العميل (بالاسم أو رقم الموبايل) ---
  const [clientQuery, setClientQuery]     = useState('')
  const [clientResults, setClientResults] = useState<any[]>([])
  const [clientLoading, setClientLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [showClientList, setShowClientList] = useState(false)

  // --- بحث الأوردر (برقم الأوردر) ---
  const [orderQuery, setOrderQuery]     = useState('')
  const [orderResults, setOrderResults] = useState<any[]>([])
  const [orderLoading, setOrderLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showOrderList, setShowOrderList] = useState(false)

  const clientBoxRef = useRef<HTMLDivElement>(null)
  const orderBoxRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadComplaints()
  }, [])

  function loadComplaints() {
    setLoading(true)
    supabase.from('complaints')
      .select('*, clients(name, phone), orders(order_number)')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setComplaints(data || []); setLoading(false) })
  }

  // إغلاق القوائم عند الضغط خارجها
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node)) setShowClientList(false)
      if (orderBoxRef.current && !orderBoxRef.current.contains(e.target as Node)) setShowOrderList(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // بحث العملاء (اسم أو موبايل) مع debounce
  useEffect(() => {
    if (!clientQuery.trim()) { setClientResults([]); return }
    setClientLoading(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone')
        .or(`name.ilike.%${clientQuery}%,phone.ilike.%${clientQuery}%`)
        .limit(10)
      setClientResults(data || [])
      setClientLoading(false)
    }, 350)
    return () => clearTimeout(t)
  }, [clientQuery])

  // بحث الأوردرات برقم الأوردر
  useEffect(() => {
    if (!orderQuery.trim()) { setOrderResults([]); return }
    setOrderLoading(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, client_id, clients(name, phone)')
        .ilike('order_number', `%${orderQuery}%`)
        .limit(10)
      setOrderResults(data || [])
      setOrderLoading(false)
    }, 350)
    return () => clearTimeout(t)
  }, [orderQuery])

  function pickClient(client: any) {
    setSelectedClient(client)
    setClientQuery(client.name)
    setShowClientList(false)
  }

  function pickOrder(order: any) {
    setSelectedOrder(order)
    setOrderQuery(order.order_number)
    setShowOrderList(false)
    // لو الأوردر مرتبط بعميل، نختار العميل تلقائياً
    if (order.clients) {
      setSelectedClient({ id: order.client_id, name: order.clients.name, phone: order.clients.phone })
      setClientQuery(order.clients.name)
    }
  }

  function clearClient() {
    setSelectedClient(null)
    setClientQuery('')
  }

  function clearOrder() {
    setSelectedOrder(null)
    setOrderQuery('')
  }

  function resetForm() {
    setForm({ complaint_type: '', description: '', priority: 'متوسط' })
    clearClient()
    clearOrder()
    setShowForm(false)
  }

  async function updateStatus(id: string, status: string) {
    setSaving(id)
    await supabase.from('complaints').update({ status }).eq('id', id)
    setComplaints(c => c.map(x => x.id === id ? { ...x, status } : x))
    setSaving(null)
  }

  async function handleAdd() {
    if (!form.complaint_type) { alert('العنوان مطلوب'); return }
    setSubmitting(true)
    const { data: tenant } = await supabase.from('users').select('tenant_id').single()
    const { data, error } = await supabase.from('complaints')
      .insert({
        complaint_number: `CMP-${Date.now().toString().slice(-6)}`,
        complaint_type: form.complaint_type,
        description: form.description,
        priority: form.priority,
        tenant_id: tenant?.tenant_id,
        status: 'جديد',
        client_id: selectedClient?.id ?? null,
        order_id: selectedOrder?.id ?? null,
      })
      .select('*, clients(name, phone), orders(order_number)')
      .single()
    if (!error && data) {
      setComplaints(c => [data, ...c])
      resetForm()
    } else if (error) {
      alert('خطأ في الحفظ: ' + error.message)
    }
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

            {/* بحث العميل بالاسم أو الموبايل */}
            <div className="relative" ref={clientBoxRef}>
              <label className="block text-[11px] text-gray-500 mb-1">العميل (ابحث بالاسم أو رقم الموبايل)</label>
              <div className="relative">
                <input
                  value={clientQuery}
                  onChange={e => { setClientQuery(e.target.value); setSelectedClient(null); setShowClientList(true) }}
                  onFocus={() => setShowClientList(true)}
                  placeholder="اسم العميل أو رقم الموبايل..."
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 pl-8"
                />
                {selectedClient && (
                  <button onClick={clearClient} type="button"
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
                )}
              </div>

              {selectedClient && (
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-green-400">
                  <span>✓ محدد: {selectedClient.name}</span>
                  {selectedClient.phone && <span className="text-gray-500 font-mono">({selectedClient.phone})</span>}
                </div>
              )}

              {showClientList && clientQuery && !selectedClient && (
                <div className="absolute z-20 mt-1 w-full bg-[#0D1B2A] border border-white/10 rounded-lg max-h-52 overflow-y-auto shadow-xl">
                  {clientLoading ? (
                    <div className="px-3 py-2 text-xs text-gray-500">جاري البحث...</div>
                  ) : clientResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-500">لا يوجد نتائج</div>
                  ) : clientResults.map(cl => (
                    <button key={cl.id} type="button" onClick={() => pickClient(cl)}
                      className="w-full text-right px-3 py-2 text-xs text-white hover:bg-amber-500/10 flex items-center justify-between">
                      <span>{cl.name}</span>
                      {cl.phone && <span className="text-gray-500 font-mono text-[10px]">{cl.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* بحث الأوردر برقم الأوردر */}
            <div className="relative" ref={orderBoxRef}>
              <label className="block text-[11px] text-gray-500 mb-1">الأوردر المرتبط (ابحث برقم الأوردر) - اختياري</label>
              <div className="relative">
                <input
                  value={orderQuery}
                  onChange={e => { setOrderQuery(e.target.value); setSelectedOrder(null); setShowOrderList(true) }}
                  onFocus={() => setShowOrderList(true)}
                  placeholder="رقم الأوردر..."
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 pl-8"
                />
                {selectedOrder && (
                  <button onClick={clearOrder} type="button"
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
                )}
              </div>

              {selectedOrder && (
                <div className="mt-1.5 text-[11px] text-green-400">
                  ✓ محدد: {selectedOrder.order_number}
                </div>
              )}

              {showOrderList && orderQuery && !selectedOrder && (
                <div className="absolute z-20 mt-1 w-full bg-[#0D1B2A] border border-white/10 rounded-lg max-h-52 overflow-y-auto shadow-xl">
                  {orderLoading ? (
                    <div className="px-3 py-2 text-xs text-gray-500">جاري البحث...</div>
                  ) : orderResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-500">لا يوجد نتائج</div>
                  ) : orderResults.map(ord => (
                    <button key={ord.id} type="button" onClick={() => pickOrder(ord)}
                      className="w-full text-right px-3 py-2 text-xs text-white hover:bg-amber-500/10 flex items-center justify-between">
                      <span className="font-mono">{ord.order_number}</span>
                      {ord.clients?.name && <span className="text-gray-500 text-[10px]">{ord.clients.name}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input value={form.complaint_type} onChange={e => setForm(f => ({ ...f, complaint_type: e.target.value }))}
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
            <button onClick={resetForm}
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
                    <h3 className="font-bold text-white text-sm">{c.complaint_type}</h3>
                    {c.priority && (
                      <span className={`text-[10px] font-bold ${priorityColor[c.priority]}`}>
                        ● {c.priority}
                      </span>
                    )}
                  </div>
                  {c.clients?.name && (
                    <p className="text-xs text-gray-500">
                      {c.clients.name}{c.clients.phone ? ` - ${c.clients.phone}` : ''}
                    </p>
                  )}
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