'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '', contact_person: '', phone: '', email: '', address: '', category: 'أقمشة',
  })

  useEffect(() => {
    async function load() {
      const { data: me } = await supabase.from('users').select('tenant_id').single()
      setTenantId(me?.tenant_id)
      const { data } = await supabase.from('suppliers').select('*').order('name', { ascending: true })
      setSuppliers(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    if (!form.name) { alert('اسم المورد مطلوب'); return }
    setSaving(true)
    const { data, error } = await supabase.from('suppliers').insert({
      ...form, tenant_id: tenantId
    }).select().single()
    if (error) alert('خطأ: ' + error.message)
    else {
      setSuppliers(prev => [data, ...prev])
      setShowForm(false)
      setForm({ name: '', contact_person: '', phone: '', email: '', address: '', category: 'أقمشة' })
    }
    setSaving(false)
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">🚚 إدارة الموردين</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة مصادر توريد المواد الخام</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm">
          ➕ مورد جديد
        </button>
      </div>

      {showForm && (
        <div className="bg-[#111927] rounded-2xl border border-amber-500/20 p-6 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المورد *" className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
          <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="الشخص المسؤول" className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="رقم الهاتف" className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
          <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="البريد الإلكتروني" className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
          <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="العنوان" className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50" />
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50">
            {['أقمشة', 'إكسسوارات', 'خيوط', 'تغليف', 'أخرى'].map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="sm:col-span-3 flex gap-3">
            <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition"> {saving ? 'جاري الحفظ...' : '✅ حفظ المورد'} </button>
            <button onClick={() => setShowForm(false)} className="px-6 py-2 border border-white/10 text-gray-400 rounded-lg text-sm hover:bg-white/5 transition">إلغاء</button>
          </div>
        </div>
      )}

      <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] border-b border-white/5">
            <tr className="text-right">
              {['المورد', 'المسؤول', 'الهاتف', 'الفئة', 'العنوان', 'إجراء'].map(h => <th key={h} className="px-5 py-3 text-xs text-gray-500 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? ( <tr className="text-center py-10"><td colSpan={6} className="text-gray-600">جاري التحميل...</td></tr> ) : 
             suppliers.map(s => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/5 transition">
                <td className="px-5 py-3 font-bold text-white">{s.name}</td>
                <td className="px-5 py-3 text-gray-400">{s.contact_person || '—'}</td>
                <td className="px-5 py-3 text-gray-400">{s.phone || '—'}</td>
                <td className="px-5 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">{s.category}</span></td>
                <td className="px-5 py-3 text-gray-500 text-xs">{s.address || '—'}</td>
                <td className="px-5 py-3">
                  <button onClick={async () => { if(confirm('حذف المورد؟')) { await supabase.from('suppliers').delete().eq('id', s.id); setSuppliers(prev => prev.filter(x => x.id !== s.id)) }}} className="text-red-400 hover:text-red-300 text-xs">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}