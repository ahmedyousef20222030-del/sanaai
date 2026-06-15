'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const sizes = ['S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size']
const sections = ['رجالي', 'حريمي', 'أطفال', 'يونيفورم', 'أخرى']

type Item = {
  id: string
  name: string
  size: string | null
  color: string | null
  current_stock: number // ✅ تصحيح من shelf_quantity
  selling_price: number // ✅ تصحيح من price
  min_stock: number     // ✅ تصحيح من min_shelf_limit
  section: string | null
  updated_at: string
}

type FilterKey = 'all' | 'low' | typeof sections[number]

export default function ShowroomPage() {
  const [items, setItems]     = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [modal, setModal]     = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [filter, setFilter]   = useState<FilterKey>('all')
  const [search, setSearch]   = useState('')
  const [tenantId, setTenantId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '', size: 'M', color: '', current_stock: '0',
    selling_price: '', min_stock: '5', section: 'رجالي',
  })

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: me } = await supabase.from('users').select('tenant_id').single()
      setTenantId(me?.tenant_id)
      
      const { data } = await supabase.from('inventory')
        .select('*')
        .order('updated_at', { ascending: false })
      
      setItems(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const stats = {
    total: items.length,
    low: items.filter(p => p.current_stock <= p.min_stock).length,
    totalPieces: items.reduce((s, p) => s + (p.current_stock || 0), 0),
  }

  const filtered = items.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.color?.toLowerCase().includes(search.toLowerCase())
    const matchFilter =
      filter === 'all' ? true :
      filter === 'low' ? p.current_stock <= p.min_stock :
      p.section === filter
    return matchSearch && matchFilter
  })

  function getStatus(item: Item) {
    if (item.current_stock === 0)
      return { label: 'نافذ تماماً', color: 'bg-red-500/20 text-red-400 border-red-500/30', urgent: true }
    if (item.current_stock <= item.min_stock)
      return { label: 'بحاجة لدعم', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', urgent: true }
    return { label: 'متوفر', color: 'bg-green-500/20 text-green-400 border-green-500/30', urgent: false }
  }

  function openAdd() {
    setEditItem(null)
    setForm({ name: '', size: 'M', color: '', current_stock: '0', selling_price: '', min_stock: '5', section: 'رجالي' })
    setModal(true)
  }

  function openEdit(item: Item) {
    setEditItem(item)
    setForm({
      name: item.name, size: item.size || 'M', color: item.color || '',
      current_stock: String(item.current_stock), selling_price: String(item.selling_price),
      min_stock: String(item.min_stock), section: item.section || 'رجالي',
    })
    setModal(true)
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.selling_price) {
      alert('يرجى ملء اسم الموديل والسعر'); return
    }
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      size: form.size,
      color: form.color.trim(),
      current_stock: Number(form.current_stock) || 0,
      selling_price: Number(form.selling_price) || 0,
      min_stock: Number(form.min_stock) || 0,
      section: form.section,
      updated_at: new Date().toISOString(),
    }

    try {
      if (editItem) {
        const { data, error } = await supabase.from('inventory').update(payload).eq('id', editItem.id).select().single()
        if (error) throw error
        setItems(prev => prev.map(p => p.id === editItem.id ? data : p))
      } else {
        const { data, error } = await supabase.from('inventory').insert({ ...payload, tenant_id: tenantId, unit: 'قطعة' }).select().single()
        if (error) throw error
        setItems(prev => [data, ...prev])
      }
      setModal(false); setEditItem(null)
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function adjustQty(item: Item, delta: number) {
    const newQty = Math.max(0, item.current_stock + delta)
    await supabase.from('inventory').update({ current_stock: newQty, updated_at: new Date().toISOString() }).eq('id', item.id)
    setItems(prev => prev.map(p => p.id === item.id ? { ...p, current_stock: newQty } : p))
  }

  const inputCls = "w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">🏪 المعروض على الرف</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة مبيعات صالة العرض والقطع الجاهزة</p>
        </div>
        <button onClick={openAdd} className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm">
          ➕ نقل إنتاج جديد للرف
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'إجمالي الموديلات', val: stats.total, color: 'text-blue-400', emoji: '🏪', f: 'all' as FilterKey },
          { label: 'نواقص الرفوف', val: stats.low, color: 'text-red-400', emoji: '⚠️', f: 'low' as FilterKey },
          { label: 'إجمالي القطع الجاهزة', val: stats.totalPieces, color: 'text-cyan-400', emoji: '👕', f: 'all' as FilterKey },
        ].map(s => (
          <button key={s.label} onClick={() => setFilter(s.f)} className={`bg-[#111927] rounded-2xl border p-4 text-center transition hover:-translate-y-0.5 ${filter === s.f ? 'border-amber-500/40' : 'border-white/5'}`}>
            <div className="text-2xl mb-1">{s.emoji}</div>
            <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </button>
        ))}
      </div>

      {stats.low > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-6 text-sm">
          <span>⚠️</span>
          <span className="text-amber-400">يوجد <strong className="text-white">{stats.low} موديلات</strong> كميتها حرجة على الرف — يرجى سحب إنتاج جديد من المخزن.</span>
        </div>
      )}

      <div className="flex gap-3 flex-wrap mb-6">
        <input type="text" placeholder="🔍 ابحث باسم الموديل أو اللون..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px] bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50" />
        <div className="flex gap-2 flex-wrap">
          {([['all', 'الكل'], ['low', 'النواقص'], ...sections.map(s => [s, s])] as [FilterKey, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${filter === k ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-gray-500 border-white/10 hover:border-white/20'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-600">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-600">لا توجد موديلات معروضة تطابق البحث</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5">
                <tr className="text-right">
                  {['الموديل', 'القسم', 'المقاس', 'اللون', 'الكمية', 'السعر', 'الحالة', 'تعديل سريع', 'إجراء'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs text-gray-600 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const status = getStatus(item)
                  return (
                    <tr key={item.id} className={`border-b border-white/5 hover:bg-white/5 transition ${status.urgent ? 'bg-amber-500/[0.03]' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-base">👕</div>
                          <div className="font-bold text-white text-xs">{item.name}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{item.section || 'عام'}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-amber-400">{item.size || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-300">{item.color || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => adjustQty(item, -1)} className="w-6 h-6 rounded-lg bg-red-500/10 text-red-400 border border-red-500/25 flex items-center justify-center text-xs font-bold hover:bg-red-500/20 transition">−</button>
                          <span className={`text-sm font-bold ${item.current_stock <= item.min_stock ? 'text-red-400' : 'text-white'}`}>{item.current_stock}</span>
                          <button onClick={() => adjustQty(item, 1)} className="w-6 h-6 rounded-lg bg-green-500/10 text-green-400 border border-green-500/25 flex items-center justify-center text-xs font-bold hover:bg-green-500/20 transition">+</button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-cyan-400 text-xs">{Number(item.selling_price).toLocaleString('ar-EG')} ج.م</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${status.color}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs">{item.updated_at ? new Date(item.updated_at).toLocaleDateString('ar-EG') : '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(item)} className="text-gray-500 hover:text-amber-400 transition text-xs">✏️ تعديل</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div onClick={() => { setModal(false); setEditItem(null) }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div onClick={e => e.stopPropagation()} className="bg-[#0D1B2A] border border-amber-500/20 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-white">{editItem ? '✏️ تعديل بيانات العرض' : '🏪 نقل إنتاج للرفوف'}</h3>
              <button onClick={() => { setModal(false); setEditItem(null) }} className="text-gray-500 hover:text-white transition">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">اسم الموديل *</label>
                <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">القسم *</label>
                <select className={inputCls} value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}>
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">المقاس *</label>
                <select className={inputCls} value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))}>
                  {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">اللون *</label>
                <input className={inputCls} value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">سعر البيع *</label>
                <input className={inputCls} type="number" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الكمية المعروضة *</label>
                <input className={inputCls} type="number" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">حد أمان الرف *</label>
                <input className={inputCls} type="number" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl text-sm hover:bg-amber-400 transition disabled:opacity-50">
                {saving ? 'جاري الحفظ...' : editItem ? '✅ حفظ التعديلات' : '✅ تأكيد العرض'}
              </button>
              <button onClick={() => { setModal(false); setEditItem(null) }} className="px-6 py-2.5 border border-white/10 text-gray-400 rounded-xl text-sm hover:bg-white/5 transition">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}