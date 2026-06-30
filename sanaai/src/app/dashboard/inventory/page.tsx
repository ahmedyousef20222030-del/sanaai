'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Item = {
  id: string; name: string; sku: string | null; category: string | null;
  section: string | null; size: string | null; color: string | null;
  unit: string; current_stock: number; selling_price: number; min_stock: number;
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '', sku: '', category: '', section: 'يونيفورم', 
    size: '', color: '', unit: 'قطعة', current_stock: '', selling_price: '', min_stock: '',
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('inventory').select('*').order('name', { ascending: true })
    setItems(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!form.name.trim() || !form.current_stock) { alert('يرجى ملء الاسم والكمية'); return }
    setSaving(true)
    try {
      const { data: me } = await supabase.from('users').select('tenant_id').single()
      const { error } = await supabase.from('inventory').insert({
        tenant_id: me?.tenant_id,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category: form.category.trim() || null,
        section: form.section,
        size: form.size || null,
        color: form.color || null,
        unit: form.unit,
        current_stock: Number(form.current_stock),
        selling_price: Number(form.selling_price) || 0,
        min_stock: Number(form.min_stock) || 0,
      })
      if (error) throw error
      setShowForm(false)
      load()
    } catch (err: any) { alert('خطأ: ' + err.message) } finally { setSaving(false) }
  }

  async function updateQuantity(id: string, newQty: number) {
    if (newQty < 0) return
    const { error } = await supabase.from('inventory').update({ current_stock: newQty }).eq('id', id)
    if (!error) setItems(v => v.map(x => x.id === id ? { ...x, current_stock: newQty } : x))
  }

  const lowStock = items.filter(i => i.current_stock <= i.min_stock)

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">📦 إدارة المخزون</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} صنف مسجل في المخزن</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20">
          ➕ إضافة صنف جديد
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 animate-pulse">
          <h3 className="text-sm font-bold text-red-400 mb-2">⚠️ تنبيه: أصناف وصلت للحد الأدنى ({lowStock.length})</h3>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => (
              <span key={i.id} className="text-xs bg-red-500/20 text-red-300 px-3 py-1 rounded-full border border-red-500/20">
                {i.name} ({i.current_stock} {i.unit})
              </span>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-2xl w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-amber-400 mb-4">➕ إضافة صنف للمخزن</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">اسم الصنف *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">SKU</label>
                <input value={//form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">القسم</label>
                <select value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none">
                  {['رجالي', 'حريمي', 'أطفال', 'يونيفورم', 'أخرى'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">المقاس</label>
                <input value={form.size} onChange={e => setForm(f => ({ ...f, size: e.//target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">اللون</label>
                <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">وحدة القياس *</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none">
                  {['قطعة','متر','كجم','لفة','طقم'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الكمية الحالية *</label>
                <input type="number" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">سعر البيع</label>
                <input type="number" value={//form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">حد التنبيه</label>
                <input type="number" value={//form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleAdd} disabled={saving} className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50">{saving ? 'جاري الحفظ...' : '✅ حفظ الصنف'}</button>
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] border-b border-white/5">
              <tr className="text-right">
                {['الصنف', 'SKU', 'القسم', 'الكمية', 'سعر البيع', 'التنبيه', 'إجراءات'].map(h => (<th key={h} className="px-5 py-4 text-xs text-gray-500 font-medium">{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                  <td className="px-5 py-4 font-semibold text-white">{item.name} <span className="text-[10px] text-gray-600 block">{item.color} | {item.size}</span></td>
                  <td className="px-5 py-4 text-xs text-gray-500 font-mono">{item.sku || '—'}</td>
                  <td className="px-5 py-4 text-xs text-gray-400">{item.section || '—'}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateQuantity(item.id, item.current_stock - 1)} className="w-6 h-6 rounded bg-white/5 text-gray-400 hover:bg-white/10 text-xs">−</button>
                      <span className={`text-sm font-bold ${item.current_stock <= item.min_stock ? 'text-red-400' : 'text-white'}`}>{item.current_stock} {item.unit}</span>
                      <button onClick={() => updateQuantity(item.id, item.current_stock + 1)} className="w-6 h-6 rounded bg-white/5 text-gray-400 hover:bg-white/10 text-xs">+</button>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-amber-400 text-xs font-bold">{Number(item.selling_price || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-5 py-4 text-gray-500 text-xs">{item.min_stock} {item.unit}</td>
                  <td className="px-5 py-4"><button onClick={() => deleteItem(item.id)} className="text-red-400 hover:text-red-300 text-xs">🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
