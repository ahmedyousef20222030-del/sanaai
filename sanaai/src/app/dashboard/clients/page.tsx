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

const sectorColor: Record<string, string> = {
  'مدارس':              'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'مطاعم وفنادق':       'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'شركات كوربوريت':     'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'حكومي':              'bg-green-500/20 text-green-300 border-green-500/30',
  'أفراد':              'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'أخرى':               'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

type Order = {
  id: string
  order_number: string
  status: string
  delivery_status: string
  quantity: number
  total_amount: number
  order_date: string
}

const orderStatusColor: Record<string, string> = {
  'جديد':          'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'قيد التنفيذ':    'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'جاهز':           'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'تم التسليم':     'bg-green-500/20 text-green-300 border-green-500/30',
  'ملغي':           'bg-red-500/20 text-red-300 border-red-500/30',
}

const emptyForm = { name: '', phone: '', sector: 'مدارس', city: '' }

export default function ClientsPage() {
  // هوية المصنع (tenant) الحالي - بيتحمل مرة واحدة عند فتح الصفحة
  // وبيتم استخدامه كفلتر صريح في كل استعلام، وده اللي بيمنع أي عميل
  // من مصنع تاني إنه يظهر أو يتعدل حتى لو الـ RLS اتظبط غلط
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  const [clients, setClients] = useState<Client[]>([])
  const [orderStats, setOrderStats] = useState<Record<string, { count: number; total: number }>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // إضافة عميل جديد
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // تعديل عميل
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [updating, setUpdating] = useState(false)
  const [clientOrders, setClientOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // حذف عميل
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => { init() }, [])

  async function getMyTenantId(): Promise<string> {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('تعذر التحقق من هوية المستخدم، برجاء تسجيل الدخول مرة أخرى')
    }

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (meError) {
      throw new Error(`تعذر تحديد هوية المصنع: ${meError.message}`)
    }
    if (!me?.tenant_id) {
      throw new Error('تعذر تحديد هوية المصنع: لا يوجد tenant_id مرتبط بهذا المستخدم')
    }

    return me.tenant_id
  }

  // بيتنفذ مرة واحدة عند فتح الصفحة: بيجيب tenant_id الحالي الأول،
  // وبعدين يجيب العملاء بتوع نفس المصنع بس
  async function init() {
    setLoading(true)
    setInitError(null)
    try {
      const tid = await getMyTenantId()
      setTenantId(tid)
      await fetchClients(tid)
    } catch (err: any) {
      console.error('Error initializing tenant:', err.message)
      setInitError(err.message)
      setClients([])
      setLoading(false)
    }
  }

  // دايمًا بتاخد tenantId كـ parameter صريح بدل ما تعتمد على الـ state
  // (عشان تتجنب مشاكل الـ stale closure وتضمن إنها متفلترة صح من أول استدعاء)
  async function fetchClients(tid: string) {
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tid)
      .order('total_spent', { ascending: false })

    if (error) {
      console.error('Error loading clients:', error.message)
      setClients([])
    } else {
      setClients(data || [])
      fetchOrderStats((data || []).map(c => c.id), tid)
    }
    setLoading(false)
  }

  async function fetchOrderStats(clientIds: string[], tid: string) {
    if (clientIds.length === 0) {
      setOrderStats({})
      return
    }
    const { data, error } = await supabase
      .from('orders')
      .select('client_id, total_amount')
      .eq('tenant_id', tid)
      .in('client_id', clientIds)

    if (error) {
      console.error('Error loading order stats:', error.message)
      return
    }

    const stats: Record<string, { count: number; total: number }> = {}
    for (const row of data || []) {
      if (!row.client_id) continue
      if (!stats[row.client_id]) stats[row.client_id] = { count: 0, total: 0 }
      stats[row.client_id].count += 1
      stats[row.client_id].total += Number(row.total_amount || 0)
    }
    setOrderStats(stats)
  }

  const filtered = clients.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  )

  async function handleAdd() {
    if (!form.name || !form.phone) {
      alert('الاسم والهاتف مطلوبان')
      return
    }
    if (!tenantId) {
      alert('تعذر تحديد هوية المصنع، برجاء إعادة تحميل الصفحة')
      return
    }
    setSaving(true)
    try {
      const { data, error: insertError } = await supabase
        .from('clients')
        .insert({
          ...form,
          tenant_id: tenantId,
        })
        .select()
        .single()

      if (insertError) throw insertError

      setClients(c => [data, ...c])
      setShowForm(false)
      setForm(emptyForm)
    } catch (err: any) {
      alert(`خطأ في الحفظ: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  function openEdit(c: Client) {
    setEditingClient(c)
    setEditForm({ name: c.name || '', phone: c.phone || '', sector: c.sector || 'مدارس', city: c.city || '' })
    fetchClientOrders(c.id)
  }

  function closeEdit() {
    setEditingClient(null)
    setEditForm(emptyForm)
    setClientOrders([])
  }

  async function fetchClientOrders(clientId: string) {
    if (!tenantId) {
      setClientOrders([])
      return
    }
    setOrdersLoading(true)
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, delivery_status, quantity, total_amount, order_date')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .order('order_date', { ascending: false })

      if (error) throw error
      setClientOrders(data || [])
    } catch (err: any) {
      console.error('Error loading client orders:', err.message)
      setClientOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }

  async function handleUpdate() {
    if (!editingClient) return
    if (!editForm.name || !editForm.phone) {
      alert('الاسم والهاتف مطلوبان')
      return
    }
    if (!tenantId) {
      alert('تعذر تحديد هوية المصنع، برجاء إعادة تحميل الصفحة')
      return
    }
    setUpdating(true)
    try {
      const { data, error: updateError } = await supabase
        .from('clients')
        .update({
          name: editForm.name,
          phone: editForm.phone,
          sector: editForm.sector,
          city: editForm.city,
        })
        .eq('id', editingClient.id)
        .eq('tenant_id', tenantId) // يمنع تعديل عميل مش تابع لنفس المصنع
        .select()
        .single()

      if (updateError) throw updateError

      setClients(list => list.map(c => (c.id === editingClient.id ? { ...c, ...data } : c)))
      closeEdit()
    } catch (err: any) {
      alert(`خطأ في التعديل: ${err.message}`)
    } finally {
      setUpdating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!tenantId) {
      alert('تعذر تحديد هوية المصنع، برجاء إعادة تحميل الصفحة')
      return
    }
    if (!confirm('هل أنت متأكد من حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء.')) return
    setDeletingId(id)
    try {
      const { error: deleteError } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId) // يمنع حذف عميل مش تابع لنفس المصنع

      if (deleteError) throw deleteError

      setClients(list => list.filter(c => c.id !== id))
    } catch (err: any) {
      alert(`خطأ في الحذف: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6 min-h-screen text-right" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">🏢 إدارة العملاء</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة قاعدة بيانات العملاء والمبيعات</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} disabled={!tenantId} className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
          {showForm ? '❌ إغلاق' : '➕ عميل جديد'}
        </button>
      </div>

      {initError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-5 py-4 mb-6 flex items-center justify-between gap-4">
          <span>⚠️ {initError}</span>
          <button onClick={init} className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs font-bold whitespace-nowrap transition">إعادة المحاولة</button>
        </div>
      )}

      {showForm && (
        <div className="bg-[#111927] rounded-2xl border border-amber-500/30 p-6 mb-6">
          <h2 className="text-sm font-bold text-amber-400 mb-4">إضافة عميل جديد</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500">اسم العميل *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500">رقم الهاتف *</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500">القطاع</label>
              <select value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none">
                {['مدارس', 'مطاعم وفنادق', 'شركات كوربوريت', 'حكومي', 'أفراد', 'أخرى'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500">المدينة</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={handleAdd} disabled={saving} className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition disabled:opacity-50">{saving ? 'جاري الحفظ...' : 'حفظ البيانات'}</button>
            <button onClick={() => setShowForm(false)} className="px-6 py-2 border border-white/10 text-gray-400 rounded-lg text-sm hover:bg-white/5 transition">إلغاء</button>
          </div>
        </div>
      )}

      {/* مودال التعديل */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closeEdit}>
          <div className="bg-[#111927] rounded-2xl border border-amber-500/30 p-6 w-full max-w-2xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-amber-400 mb-4">تعديل بيانات العميل</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-500">اسم العميل *</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-500">رقم الهاتف *</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-500">القطاع</label>
                <select value={editForm.sector} onChange={e => setEditForm(f => ({ ...f, sector: e.target.value }))} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none">
                  {['مدارس', 'مطاعم وفنادق', 'شركات كوربوريت', 'حكومي', 'أفراد', 'أخرى'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-500">المدينة</label>
                <input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
              </div>
            </div>

            {/* طلبات العميل */}
            <div className="mt-6 pt-5 border-t border-white/5">
              <h3 className="text-sm font-bold text-amber-400 mb-3">
                طلبات العميل {clientOrders.length > 0 && <span className="text-gray-500 font-normal">({clientOrders.length})</span>}
              </h3>

              {ordersLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-xs py-4">
                  <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  جاري جلب الطلبات...
                </div>
              ) : clientOrders.length === 0 ? (
                <p className="text-gray-600 text-xs py-4">لا يوجد طلبات لهذا العميل</p>
              ) : (
                <div className="max-h-56 overflow-y-auto flex flex-col gap-2 pr-1">
                  {clientOrders.map(o => (
                    <div key={o.id} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-white text-sm font-bold">طلب رقم {o.order_number}</span>
                        <span className="text-gray-500 text-[11px]">
                          {o.order_date ? new Date(o.order_date).toLocaleDateString('ar-EG') : 'بدون تاريخ'} • الكمية: {o.quantity ?? 0}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium whitespace-nowrap ${orderStatusColor[o.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                          {o.status}
                        </span>
                        <span className="text-amber-400 text-xs font-bold">
                          {Number(o.total_amount || 0).toLocaleString('ar-EG')} ج.م
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={handleUpdate} disabled={updating} className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition disabled:opacity-50">{updating ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
              <button onClick={closeEdit} className="px-6 py-2 border border-white/10 text-gray-400 rounded-lg text-sm hover:bg-white/5 transition">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative mb-6">
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600">🔍</span>
        <input type="text" placeholder="بحث باسم العميل أو رقم الهاتف..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-[#111927] border border-white/10 rounded-xl px-11 py-3 text-sm text-white outline-none focus:border-amber-500/50 transition" />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-600 gap-3">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p>جاري جلب بيانات العملاء...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(c => (
            <div key={c.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all group relative">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-black text-xl border border-amber-500/20 group-hover:bg-amber-500 group-hover:text-black transition-all">
                  {c.name?.[0] || '?'}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${sectorColor[c.sector] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>{c.sector}</span>
                  <button
                    onClick={() => openEdit(c)}
                    title="تعديل"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 hover:bg-amber-500/20 hover:text-amber-400 transition text-xs"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    title="حذف"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition text-xs disabled:opacity-50"
                  >
                    {deletingId === c.id ? '...' : '🗑️'}
                  </button>
                </div>
              </div>
              <h3 className="font-bold text-white text-base mb-1 group-hover:text-amber-400 transition">{c.name}</h3>
              <p className="text-gray-500 text-xs mb-4 flex items-center gap-2">
                <span>📞 {c.phone}</span><span className="text-gray-700">|</span><span>📍 {c.city || 'غير محدد'}</span>
              </p>
              <div className="flex justify-between items-center text-xs border-t border-white/5 pt-4 bg-white/[0.02] -mx-5 -mb-5 px-5 py-3 rounded-b-2xl">
                <div className="text-center"><div className="text-gray-600 mb-1">الطلبات</div><div className="text-white font-bold">{orderStats[c.id]?.count ?? c.total_orders ?? 0}</div></div>
                <div className="text-center"><div className="text-gray-600 mb-1">إجمالي المبيعات</div><div className="text-amber-400 font-bold">{Number(orderStats[c.id]?.total ?? c.total_spent ?? 0).toLocaleString('ar-EG')} ج.م</div></div>
                <div className="text-center"><div className="text-gray-600 mb-1">التقييم</div><div className="text-yellow-400 flex justify-center">{'⭐'.repeat(c.rating || 0)}</div></div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-600 text-sm">
              لا يوجد عملاء يطابقون بحثك
            </div>
          )}
        </div>
      )}
    </div>
  )
}