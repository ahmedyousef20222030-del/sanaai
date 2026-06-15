'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Client = {
  id: string
  name: string
  phone: string
  sector: string
  city: string
  rating: number
  total_orders: number
  total_spent: number
}

// ✅ تم تحديث القطاعات لتطابق الـ CHECK Constraint في قاعدة البيانات v1.1
const sectorColor: Record<string, string> = {
  'مدارس':              'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'مطاعم وفنادق':       'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'شركات كوربوريت':     'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'حكومي':              'bg-green-500/20 text-green-300 border-green-500/30',
  'أفراد':              'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'أخرى':              'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

export default function ClientsPage() {
  const [clients, setClients]   = useState<Client[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ name: '', phone: '', sector: 'مدارس', city: '' })
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    setLoading(true)
    // جلب العملاء مرتبين حسب الأكثر إنفاقاً
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('total_spent', { ascending: false })
    
    if (!error) setClients(data || [])
    setLoading(false)
  }

  const filtered = clients.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  )

  async function handleAdd() {
    if (!form.name || !form.phone) { 
      alert('الاسم والهاتف مطلوبان'); 
      return 
    }
    
    setSaving(true)
    try {
      // 1. جلب tenant_id للمستخدم الحالي لضمان عزل البيانات
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('tenant_id')
        .single()

      if (userError || !user) throw new Error('تعذر تحديد هوية المصنع')

      // 2. إضافة العميل الجديد
      const { data, error: insertError } = await supabase
        .from('clients')
        .insert({ ...form, tenant_id: user.tenant_id })
        .select()
        .single()

      if (insertError) throw insertError

      if (data) { 
        setClients(c => [data, ...c]) 
        setShowForm(false) 
        setForm({ name: '', phone: '', sector: 'مدارس', city: '' }) 
      }
    } catch (err: any) {
      alert(`خطأ في الحفظ: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 min-h-screen text-right" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">🏢 إدارة العملاء</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة قاعدة بيانات العملاء والمبيعات</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm shadow-lg shadow-amber-500/20">
          {showForm ? '❌ إغلاق' : '➕ عميل جديد'}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-[#111927] rounded-2xl border border-amber-500/30 p-6 mb-6 shadow-2xl animate-in fade-in slide-in-from-top-4">
          <h2 className="text-sm font-bold text-amber-400 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
            إضافة عميل جديد للنظام
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 mr-1">اسم العميل *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: شركة النور"
                className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 mr-1">رقم الهاتف *</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="01xxxxxxxxx"
                className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 transition" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 mr-1">القطاع</label>
              <select value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
                className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 transition">
                {['مدارس', 'مطاعم وفنادق', 'شركات كوربوريت', 'حكومي', 'أفراد', 'أخرى'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 mr-1">المدينة</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder="القاهرة"
                className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 transition" />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={handleAdd} disabled={saving}
              className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition disabled:opacity-50 shadow-lg shadow-amber-500/20">
              {saving ? 'جاري الحفظ...' : 'حفظ البيانات'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-6 py-2 border border-white/10 text-gray-400 rounded-lg text-sm hover:bg-white/5 transition">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600">🔍</span>
        <input type="text" placeholder="بحث باسم العميل أو رقم الهاتف..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#111927] border border-white/10 rounded-xl px-11 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 transition" />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-600 gap-3">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p>جاري جلب بيانات العملاء...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(c => (
            <div key={c.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all duration-300 hover:-translate-y-1 group">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-black text-xl border border-amber-500/20 group-hover:bg-amber-500 group-hover:text-black transition-all">
                  {c.name?.[0] || '?'}
                </div>
                <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${sectorColor[c.sector] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                  {c.sector}
                </span>
              </div>
              <h3 className="font-bold text-white text-base mb-1 group-hover:text-amber-400 transition">{c.name}</h3>
              <p className="text-gray-500 text-xs mb-4 flex items-center gap-2">
                <span>📞 {c.phone}</span>
                <span className="text-gray-700">|</span>
                <span>📍 {c.city || 'غير محدد'}</span>
              </p>
              <div className="flex justify-between items-center text-xs border-t border-white/5 pt-4 bg-white/[0.02] -mx-5 -mb-5 px-5 py-3 rounded-b-2xl">
                <div className="text-center">
                  <div className="text-gray-600 mb-1">الطلبات</div>
                  <div className="text-white font-bold">{c.total_orders || 0}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-600 mb-1">إجمالي المبيعات</div>
                  <div className="text-amber-400 font-bold">{Number(c.total_spent || 0).toLocaleString('ar-EG')} ج.م</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-600 mb-1">التقييم</div>
                  <div className="text-yellow-400 flex justify-center">{'⭐'.repeat(c.rating || 0)}</div>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-20">
              <div className="text-4xl mb-3">🏜️</div>
              <p className="text-gray-600">لا يوجد عملاء يطابقون بحثك</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}