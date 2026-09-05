'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Branch = {
  id: string
  name: string
  type: 'فرع' | 'معرض'
  address: string | null
  phone: string | null
  is_main: boolean
  is_active: boolean
}

const EMPTY_FORM = { name: '', type: 'فرع' as 'فرع' | 'معرض', address: '', phone: '' }

export default function BranchesPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authUser) throw new Error('يجب تسجيل الدخول أولاً')

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', authUser.id)
        .single()
      if (meError) throw meError
      if (!me?.tenant_id) throw new Error('تعذر تحديد بيانات المنشأة')
      setTenantId(me.tenant_id)

      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('tenant_id', me.tenant_id)
        .order('is_main', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error

      // لو لسه مفيش ولا فرع (منشأة قديمة قبل تفعيل الميزة)، أنشئ الفرع الرئيسي تلقائياً
      if (!data || data.length === 0) {
        const { data: created, error: createError } = await supabase
          .from('branches')
          .insert({ tenant_id: me.tenant_id, name: 'الفرع الرئيسي', type: 'فرع', is_main: true })
          .select('*')
          .single()
        if (createError) throw createError
        setBranches(created ? [created] : [])
      } else {
        setBranches(data)
      }
    } catch (err: any) {
      setLoadError(err.message || 'حدث خطأ أثناء تحميل الفروع')
    } finally {
      setLoading(false)
    }
  }

  function openAddForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
  }

  function openEditForm(b: Branch) {
    setForm({ name: b.name, type: b.type, address: b.address || '', phone: b.phone || '' })
    setEditingId(b.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  async function handleSave() {
    if (!form.name.trim()) { alert('يرجى كتابة اسم الفرع أو المعرض'); return }
    if (!tenantId) return

    setSaving(true)
    try {
      if (editingId) {
        const { error } = await supabase
          .from('branches')
          .update({
            name: form.name.trim(),
            type: form.type,
            address: form.address.trim() || null,
            phone: form.phone.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('branches').insert({
          tenant_id: tenantId,
          name: form.name.trim(),
          type: form.type,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          is_main: false,
          is_active: true,
        })
        if (error) throw error
      }
      closeForm()
      load()
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(b: Branch) {
    setSavingId(b.id)
    try {
      const { error } = await supabase.from('branches').update({ is_active: !b.is_active }).eq('id', b.id)
      if (error) throw error
      setBranches(prev => prev.map(x => x.id === b.id ? { ...x, is_active: !x.is_active } : x))
    } catch (err: any) {
      alert('تعذر تغيير الحالة: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function deleteBranch(b: Branch) {
    if (b.is_main) { alert('لا يمكن حذف الفرع الرئيسي'); return }
    try {
      const [{ count: invCount }, { count: ordCount }] = await Promise.all([
        supabase.from('inventory').select('id', { count: 'exact', head: true }).eq('branch_id', b.id),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('branch_id', b.id),
      ])
      if ((invCount || 0) > 0 || (ordCount || 0) > 0) {
        alert(`لا يمكن حذف "${b.name}" لأنه مرتبط بـ ${invCount || 0} صنف مخزون و ${ordCount || 0} طلب. عطّله بدل حذفه.`)
        return
      }
      if (!confirm(`هل أنت متأكد من حذف "${b.name}"؟`)) return
      const { error } = await supabase.from('branches').delete().eq('id', b.id)
      if (error) throw error
      setBranches(prev => prev.filter(x => x.id !== b.id))
    } catch (err: any) {
      alert('خطأ أثناء الحذف: ' + err.message)
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-600" dir="rtl">جاري التحميل...</div>
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">🏬 الفروع والمعارض</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة فروع ومعارض المنشأة، وربط المخزون والطلبات بكل فرع</p>
        </div>
        <button
          onClick={openAddForm}
          className="px-4 py-2 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm shadow-lg shadow-amber-500/20"
        >
          ➕ إضافة فرع / معرض
        </button>
      </div>

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 text-sm text-red-400">
          ⚠️ {loadError}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={closeForm}>
          <div className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-amber-400 mb-4">{editingId ? '✏️ تعديل فرع' : '➕ إضافة فرع / معرض'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">الاسم *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="مثال: فرع مدينة نصر"
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">النوع</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as 'فرع' | 'معرض' }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                >
                  <option value="فرع">فرع</option>
                  <option value="معرض">معرض</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">العنوان</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الهاتف</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : '✅ حفظ'}
              </button>
              <button onClick={closeForm} className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {branches.map(b => (
          <div key={b.id} className={`bg-[#111927] rounded-2xl border p-5 transition-all ${b.is_active ? 'border-white/5' : 'border-red-500/20 opacity-60'}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  {b.type === 'معرض' ? '🏪' : '🏬'} {b.name}
                  {b.is_main && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">رئيسي</span>
                  )}
                </h3>
                <p className="text-gray-500 text-xs mt-1">{b.type}</p>
              </div>
              {!b.is_active && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">معطّل</span>
              )}
            </div>
            <div className="space-y-1 mb-4">
              {b.address && <p className="text-gray-500 text-xs">📍 {b.address}</p>}
              {b.phone && <p className="text-gray-500 text-xs" dir="ltr">📞 {b.phone}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => openEditForm(b)} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 transition">
                ✏️ تعديل
              </button>
              {!b.is_main && (
                <>
                  <button
                    onClick={() => toggleActive(b)}
                    disabled={savingId === b.id}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition disabled:opacity-50 ${
                      b.is_active
                        ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                        : 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                    }`}
                  >
                    {b.is_active ? '⛔ تعطيل' : '✓ تفعيل'}
                  </button>
                  <button onClick={() => deleteBranch(b)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition">
                    🗑️ حذف
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}