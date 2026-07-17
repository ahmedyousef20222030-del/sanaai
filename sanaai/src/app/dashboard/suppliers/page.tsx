'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Supplier = { id: string; name: string; phone: string; email: string; address: string; category: string }

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', category: 'أقمشة' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').order('name', { ascending: true })
    setSuppliers(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!form.name.trim()) { alert('الاسم مطلوب'); return }
    setSaving(true)
    try {
      // نتأكد إن المستخدم مسجل دخول فعلاً
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) throw new Error('يجب تسجيل الدخول أولاً')

      // ندور على بيانات المستخدم بالـ id بتاعه بالضبط (بدل الاعتماد الأعمى على RLS)
      const { data: me, error: meError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', authUser.id)
        .single()

      if (meError) throw new Error('تعذر تحديد هوية المستخدم: ' + meError.message)
      if (!me?.tenant_id) throw new Error('تعذر تحديد بيانات المنشأة الخاصة بالمستخدم')

      const { error } = await supabase.from('suppliers').insert({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        category: form.category,
        tenant_id: me.tenant_id,
      })
      if (error) throw error

      setShowForm(false)
      setForm({ name: '', phone: '', email: '', address: '', category: 'أقمشة' })
      load()
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-black text-white">🚚 إدارة الموردين</h1><p className="text-sm text-gray-500 mt-1">قاعدة بيانات موردين المواد الخام</p></div>
        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20">➕ مورد جديد</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-amber-400 mb-4">➕ إضافة مورد جديد</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">اسم المورد *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">الهاتف</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">البريد الإلكتروني</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">العنوان</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">الفئة (مثلاً: أقمشة، خيوط)</label><input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleAdd} disabled={saving} className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50">{saving ? 'جاري الحفظ...' : '✅ حفظ المورد'}</button>
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري تحميل الموردين...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {suppliers.map(s => (
            <div key={s.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-black text-xl border border-amber-500/20 group-hover:bg-amber-500 group-hover:text-black transition-all">{s.name?.[0] || '؟'}</div>
                <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10">{s.category || 'عام'}</span>
              </div>
              <h3 className="font-bold text-white text-base mb-1 group-hover:text-amber-400 transition">{s.name}</h3>
              <div className="space-y-1">
                <p className="text-gray-500 text-xs flex items-center gap-2">📞 {s.phone || 'غير متوفر'}</p>
                <p className="text-gray-500 text-xs flex items-center gap-2">✉️ {s.email || 'غير متوفر'}</p>
                <p className="text-gray-500 text-xs flex items-center gap-2">📍 {s.address || 'غير محدد'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}