'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Package, CheckCircle, X, Plus, Trash2 } from 'lucide-react'

type PurchaseOrder = {
  id: string;
  po_number: string;
  status: string;
  expected_date: string | null;
  tenant_id: string | null;
  supplier_id: string;
  order_id: string | null;
  suppliers: { name: string } | null;
  orders: { order_number: string } | null;
}

type Supplier = { id: string; name: string }
type InventoryItem = { id: string; name: string; unit: string }
type OrderOption = { id: string; order_number: string }
type POLineItem = { inventory_id: string; name: string; qty: number; price: number }
// صف صنف فعلي محفوظ في purchase_order_items (يُستخدم في مودال فتح الفاتورة)
type POItemRow = { id: string; inventory_id: string; name: string; quantity: number; unit_price: number }
// أوردر مرتبط بأمر الشراء عن طريق جدول الربط purchase_order_links
type LinkedOrder = { id: string; order_id: string; order_number: string }

const EMPTY_FORM = { supplier_id: '', order_id: '', expected_date: '' }

export default function ProcurementPage() {
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [orders, setOrders] = useState<OrderOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [items, setItems] = useState<POLineItem[]>([])

  // ---- مودال فتح الفاتورة (عرض/تعديل/إضافة/حذف بنود أمر شراء موجود) ----
  const [openPO, setOpenPO] = useState<PurchaseOrder | null>(null)
  const [modalItems, setModalItems] = useState<POItemRow[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [itemSaving, setItemSaving] = useState<string | null>(null)
  const [headerSaving, setHeaderSaving] = useState(false)

  // ---- الأوردرات المرتبطة بأمر الشراء (علاقة متعدد-لمتعدد عن طريق purchase_order_links) ----
  const [linkedOrders, setLinkedOrders] = useState<LinkedOrder[]>([])
  const [linkedOrdersLoading, setLinkedOrdersLoading] = useState(false)
  const [orderToLink, setOrderToLink] = useState('')
  const [linkSaving, setLinkSaving] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('يجب تسجيل الدخول أولاً')

      const { data: me, error: meErr } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (meErr || !me?.tenant_id) throw new Error('تعذر تحديد بيانات المنشأة')
      setTenantId(me.tenant_id)

      const [poRes, supRes, invRes, orderRes] = await Promise.all([
        supabase.from('purchase_orders').select('*, suppliers(name), orders(order_number)').order('created_at', { ascending: false }),
        supabase.from('suppliers').select('id, name'),
        supabase.from('inventory').select('id, name, unit'),
        supabase.from('orders').select('id, order_number').order('created_at', { ascending: false }),
      ])

      if (poRes.error) throw poRes.error
      if (supRes.error) throw supRes.error
      if (invRes.error) throw invRes.error
      if (orderRes.error) throw orderRes.error

      setPos(poRes.data || [])
      setSuppliers(supRes.data || [])
      setInventory(invRes.data || [])
      setOrders(orderRes.data || [])
    } catch (err: any) {
      setLoadError(err.message || 'حدث خطأ أثناء تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setItems([])
  }

  async function handleSavePO() {
    if (!tenantId) { alert('تعذر تحديد بيانات المنشأة'); return }
    if (!form.supplier_id) { alert('يرجى اختيار المورد'); return }
    if (items.length === 0) { alert('يرجى إضافة صنف واحد على الأقل'); return }

    const invalidItem = items.find(it => !it.inventory_id || it.qty <= 0)
    if (invalidItem) {
      alert('يرجى اختيار كل صنف وإدخال كمية أكبر من صفر')
      return
    }

    setSaving('saving-new')
    try {
      const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
        tenant_id: tenantId,
        supplier_id: form.supplier_id,
        order_id: form.order_id || null,
        po_number: `PO-${Date.now().toString().slice(-6)}`,
        expected_date: form.expected_date || null,
        status: 'قيد الانتظار'
      }).select().single()

      if (poErr) throw poErr

      const itemsToInsert = items.map(it => ({
        po_id: po.id,
        tenant_id: tenantId,
        inventory_id: it.inventory_id,
        name: it.name,
        quantity: it.qty,
        unit_price: it.price
      }))
      const { error: itemsErr } = await supabase.from('purchase_order_items').insert(itemsToInsert)
      if (itemsErr) {
        // Roll back the PO header so we don't leave an order with no items
        await supabase.from('purchase_orders').delete().eq('id', po.id)
        throw itemsErr
      }

      const linkedOrder = form.order_id ? orders.find(o => o.id === form.order_id) : null
      setPos(prev => [{
        ...po,
        suppliers: suppliers.find(s => s.id === form.supplier_id) || null,
        orders: linkedOrder ? { order_number: linkedOrder.order_number } : null,
      }, ...prev])
      setShowForm(false)
      resetForm()
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  async function receivePO(poId: string) {
    setSaving(poId)
    try {
      // Runs as a single DB transaction (see receive_purchase_order.sql):
      // status + inventory stock are updated together or not at all.
      const { error } = await supabase.rpc('receive_purchase_order', { p_po_id: poId })
      if (error) throw error

      setPos(prev => prev.map(p => p.id === poId ? { ...p, status: 'تم الاستلام' } : p))
      alert('تم استلام الشحنة وتحديث المخزون!')
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  async function deletePO(poId: string) {
    if (!confirm('حذف الأمر؟')) return
    setDeletingId(poId)
    try {
      // Remove line items first so we never leave orphaned rows if the
      // schema doesn't have ON DELETE CASCADE configured.
      const { error: itemsErr } = await supabase.from('purchase_order_items').delete().eq('po_id', poId)
      if (itemsErr) throw itemsErr

      const { error: poErr } = await supabase.from('purchase_orders').delete().eq('id', poId)
      if (poErr) throw poErr

      setPos(prev => prev.filter(x => x.id !== poId))
    } catch (err: any) {
      alert('تعذر حذف الأمر: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  // ---------- فتح الفاتورة (أمر الشراء) ----------
  async function handleOpen(po: PurchaseOrder) {
    setOpenPO(po)
    setModalLoading(true)
    setLinkedOrdersLoading(true)
    setOrderToLink('')
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('id, inventory_id, name, quantity, unit_price')
        .eq('po_id', po.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setModalItems(data || [])
    } catch (err: any) {
      alert('خطأ في تحميل بنود أمر الشراء: ' + err.message)
    } finally {
      setModalLoading(false)
    }

    try {
      const { data, error } = await supabase
        .from('purchase_order_links')
        .select('id, order_id, orders(order_number)')
        .eq('po_id', po.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setLinkedOrders((data || []).map((l: any) => ({
        id: l.id,
        order_id: l.order_id,
        order_number: l.orders?.order_number || '—',
      })))
    } catch (err: any) {
      // لو جدول purchase_order_links لسه ملموش الـ migration، منعرضش error يمنع فتح الفاتورة كلها
      console.error('تعذر تحميل الأوردرات المرتبطة:', err.message)
      setLinkedOrders([])
    } finally {
      setLinkedOrdersLoading(false)
    }
  }

  function closeModal() {
    setOpenPO(null)
    setModalItems([])
    setLinkedOrders([])
    setOrderToLink('')
  }

  // ربط أوردر جديد بأمر الشراء
  async function linkOrder() {
    if (!openPO || !orderToLink) return
    if (linkedOrders.some(l => l.order_id === orderToLink)) return
    setLinkSaving('new')
    try {
      const { data, error } = await supabase
        .from('purchase_order_links')
        .insert({ po_id: openPO.id, order_id: orderToLink, tenant_id: openPO.tenant_id })
        .select('id, order_id, orders(order_number)')
        .single()
      if (error) throw error
      const linked = data as any
      setLinkedOrders(prev => [...prev, { id: linked.id, order_id: linked.order_id, order_number: linked.orders?.order_number || '—' }])
      setOrderToLink('')
    } catch (err: any) {
      alert('خطأ في ربط الأوردر: ' + err.message)
    } finally {
      setLinkSaving(null)
    }
  }

  // فك ربط أوردر عن أمر الشراء
  async function unlinkOrder(linkId: string) {
    setLinkSaving(linkId)
    try {
      const { error } = await supabase.from('purchase_order_links').delete().eq('id', linkId)
      if (error) throw error
      setLinkedOrders(prev => prev.filter(l => l.id !== linkId))
    } catch (err: any) {
      alert('خطأ في فك ربط الأوردر: ' + err.message)
    } finally {
      setLinkSaving(null)
    }
  }

  // تعديل حالة أمر الشراء أو تاريخ التسليم المتوقع
  async function updateHeaderField(field: 'status' | 'expected_date', value: string) {
    if (!openPO) return
    if (field === 'status' && isReceived) return
    setHeaderSaving(true)
    try {
      const { error } = await supabase.from('purchase_orders').update({ [field]: value }).eq('id', openPO.id)
      if (error) throw error
      setOpenPO(prev => prev ? { ...prev, [field]: value } : prev)
      setPos(prev => prev.map(p => p.id === openPO.id ? { ...p, [field]: value } : p))
    } catch (err: any) {
      alert('خطأ في تحديث أمر الشراء: ' + err.message)
    } finally {
      setHeaderSaving(false)
    }
  }

  function editModalItemLocal(id: string, field: 'quantity' | 'unit_price', value: number) {
    setModalItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))
  }

  // حفظ تعديل كمية/سعر صنف محفوظ بالفعل
  async function saveModalItem(item: POItemRow) {
    if (isReceived) return
    setItemSaving(item.id)
    try {
      const { error } = await supabase
        .from('purchase_order_items')
        .update({ quantity: item.quantity, unit_price: item.unit_price })
        .eq('id', item.id)
      if (error) throw error
    } catch (err: any) {
      alert('خطأ في حفظ الصنف: ' + err.message)
    } finally {
      setItemSaving(null)
    }
  }

  // إضافة صنف جديد: نضيف صف مؤقت فاضي، ولما يتم اختيار الصنف من المخزون نحفظه في قاعدة البيانات فورًا
  function addDraftItem() {
    if (isReceived) return
    setModalItems(prev => [...prev, { id: `draft-${Date.now()}`, inventory_id: '', name: '', quantity: 1, unit_price: 0 }])
  }

  async function chooseInventoryForItem(rowId: string, inventoryId: string) {
    if (isReceived) return
    const prod = inventory.find(p => p.id === inventoryId)
    if (!prod) return

    // صف مؤقت لسه مش محفوظ في قاعدة البيانات → ننشئه الآن
    if (rowId.startsWith('draft-')) {
      if (!openPO) return
      setItemSaving(rowId)
      try {
        const { data, error } = await supabase
          .from('purchase_order_items')
          .insert({
            po_id: openPO.id,
            tenant_id: openPO.tenant_id,
            inventory_id: inventoryId,
            name: prod.name,
            quantity: 1,
            unit_price: 0,
          })
          .select('id, inventory_id, name, quantity, unit_price')
          .single()
        if (error) throw error
        setModalItems(prev => prev.map(it => it.id === rowId ? data : it))
      } catch (err: any) {
        alert('خطأ في إضافة الصنف: ' + err.message)
      } finally {
        setItemSaving(null)
      }
      return
    }

    // صف محفوظ بالفعل وبيتغير فيه الصنف المختار من المخزون
    setModalItems(prev => prev.map(it => it.id === rowId ? { ...it, inventory_id: inventoryId, name: prod.name } : it))
    setItemSaving(rowId)
    try {
      const { error } = await supabase
        .from('purchase_order_items')
        .update({ inventory_id: inventoryId, name: prod.name })
        .eq('id', rowId)
      if (error) throw error
    } catch (err: any) {
      alert('خطأ في تعديل الصنف: ' + err.message)
    } finally {
      setItemSaving(null)
    }
  }

  async function deleteModalItem(id: string) {
    if (isReceived) return
    // صف مؤقت لسه مش محفوظ → احذفه محليًا بس
    if (id.startsWith('draft-')) {
      setModalItems(prev => prev.filter(it => it.id !== id))
      return
    }
    if (!confirm('متأكد من حذف هذا الصنف من أمر الشراء؟')) return
    setItemSaving(id)
    try {
      const { error } = await supabase.from('purchase_order_items').delete().eq('id', id)
      if (error) throw error
      setModalItems(prev => prev.filter(it => it.id !== id))
    } catch (err: any) {
      alert('خطأ في حذف الصنف: ' + err.message)
    } finally {
      setItemSaving(null)
    }
  }

  const modalTotal = modalItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
  // بمجرد ما أمر الشراء يتم استلامه، المخزون بيكون اتحدث بالفعل (عبر receive_purchase_order) —
  // فمينفعش نسمح بتعديل/إضافة/حذف بنوده بعد كده عشان ميحصلش تعارض مع أرصدة المخزون
  const isReceived = openPO?.status === 'تم الاستلام'

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">🛒 المشتريات والتوريدات</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة أوامر الشراء وتغذية المخزون</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm">
          ➕ أمر شراء جديد
        </button>
      </div>

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 text-sm text-red-400">
          ⚠️ {loadError}
        </div>
      )}

      {showForm && (
        <div className="bg-[#111927] rounded-2xl border border-amber-500/20 p-6 mb-6 shadow-2xl">
          <h2 className="text-sm font-bold text-amber-400 mb-4">إنشاء أمر شراء جديد</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label htmlFor="po-supplier" className="block text-xs text-gray-500 mb-1">المورد *</label>
              <select
                id="po-supplier"
                value={form.supplier_id}
                onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
              >
                <option value="">اختر المورد</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="po-order" className="block text-xs text-gray-500 mb-1">مرتبط بطلب (اختياري)</label>
              <select
                id="po-order"
                value={form.order_id}
                onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
              >
                <option value="">بدون طلب مرتبط</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="po-date" className="block text-xs text-gray-500 mb-1">تاريخ التسليم المتوقع</label>
              <input
                id="po-date"
                type="date"
                value={form.expected_date}
                onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
              />
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-400">الأصناف المطلوبة:</span>
              <button
                onClick={() => setItems(p => [...p, { inventory_id: '', name: '', qty: 1, price: 0 }])}
                className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded border border-amber-500/30 hover:bg-amber-500/30 transition"
              >
                ➕ إضافة صنف
              </button>
            </div>
            {items.length === 0 && (
              <p className="text-xs text-gray-600">لم تتم إضافة أي أصناف بعد</p>
            )}
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 bg-white/5 p-2 rounded-lg border border-white/5">
                <select
                  value={item.inventory_id}
                  onChange={e => {
                    const val = e.target.value
                    const prod = inventory.find(p => p.id === val)
                    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, inventory_id: val, name: prod?.name || '' } : it))
                  }}
                  className="bg-[#0D1B2A] border border-white/10 rounded px-2 py-1 text-xs text-white"
                >
                  <option value="">اختر الصنف</option>
                  {inventory.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="الكمية"
                  value={item.qty}
                  onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, qty: Number(e.target.value) } : it))}
                  className="bg-[#0D1B2A] border border-white/10 rounded px-2 py-1 text-xs text-white"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="السعر"
                  value={item.price}
                  onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, price: Number(e.target.value) } : it))}
                  className="bg-[#0D1B2A] border border-white/10 rounded px-2 py-1 text-xs text-white"
                />
                <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 text-xs" aria-label="حذف الصنف">✕</button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowForm(false); resetForm() }} className="px-4 py-2 text-gray-400 text-sm">إلغاء</button>
            <button
              onClick={handleSavePO}
              disabled={!!saving}
              className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving === 'saving-new' ? <Loader2 size={16} className="animate-spin" /> : '✅ تأكيد أمر الشراء'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="text-center py-10 text-gray-600"><Loader2 className="animate-spin mx-auto mb-2" /> جاري التحميل...</div>
        ) : pos.length === 0 ? (
          <div className="text-center py-10 text-gray-600">لا توجد أوامر شراء حالية</div>
        ) : (
          pos.map(po => (
            <div key={po.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
                  <Package size={20} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-amber-400 font-bold">{po.po_number}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${po.status === 'تم الاستلام' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                      {po.status}
                    </span>
                    {po.orders?.order_number && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white/5 text-gray-400 border-white/10">
                        طلب {po.orders.order_number}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-white font-medium mt-1">{po.suppliers?.name || 'مورد غير معروف'}</div>
                  <div className="text-xs text-gray-500">التسليم المتوقع: {po.expected_date || 'غير محدد'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleOpen(po)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold hover:bg-amber-500/20 transition"
                >
                  <Package size={14} /> فتح الفاتورة
                </button>
                {po.status !== 'تم الاستلام' && (
                  <button
                    onClick={() => receivePO(po.id)}
                    disabled={saving === po.id}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded-xl text-xs font-bold hover:bg-green-600/30 transition disabled:opacity-50"
                  >
                    {saving === po.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} تأكيد الاستلام
                  </button>
                )}
                <button
                  onClick={() => deletePO(po.id)}
                  disabled={deletingId === po.id}
                  aria-label="حذف أمر الشراء"
                  className="p-2 text-gray-600 hover:text-red-400 transition disabled:opacity-40"
                >
                  {deletingId === po.id ? <Loader2 size={14} className="animate-spin" /> : '🗑️'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ---------- مودال فتح الفاتورة (أمر الشراء) ---------- */}
      {openPO && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div
            className="bg-[#0D1B2A] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Package size={18} className="text-amber-400" /> {openPO.po_number}
                </h2>
                <p className="text-xs text-gray-500 mt-1">المورد: {openPO.suppliers?.name || 'مورد غير معروف'}</p>
              </div>
              <button onClick={closeModal} className="text-gray-500 hover:text-white transition">
                <X size={20} />
              </button>
            </div>

            {/* Header fields */}
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-white/10">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">الحالة</label>
                <select
                  value={openPO.status || ''}
                  disabled={headerSaving || isReceived}
                  onChange={e => updateHeaderField('status', e.target.value)}
                  className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                >
                  <option value="قيد الانتظار">قيد الانتظار</option>
                  <option value="تم الاستلام">تم الاستلام</option>
                </select>
                {isReceived && (
                  <p className="text-[10px] text-gray-600 mt-1">لا يمكن التراجع عن حالة "تم الاستلام" يدويًا لتفادي ازدواج تحديث المخزون.</p>
                )}
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">تاريخ التسليم المتوقع</label>
                <input
                  type="date"
                  value={openPO.expected_date ? openPO.expected_date.slice(0, 10) : ''}
                  disabled={headerSaving}
                  onChange={e => updateHeaderField('expected_date', e.target.value)}
                  className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* الأوردرات المرتبطة */}
            <div className="p-5 border-b border-white/10">
              <h3 className="text-sm font-bold text-white mb-3">الأوردرات المرتبطة</h3>

              {linkedOrdersLoading ? (
                <div className="flex items-center gap-2 text-gray-600 text-xs">
                  <Loader2 size={14} className="animate-spin" /> جاري التحميل...
                </div>
              ) : (
                <>
                  {linkedOrders.length === 0 ? (
                    <p className="text-xs text-gray-600 mb-3">لا يوجد أوردرات مرتبطة بأمر الشراء ده حاليًا</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {linkedOrders.map(l => (
                        <span key={l.id} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border bg-white/5 text-gray-300 border-white/10">
                          طلب {l.order_number}
                          <button
                            onClick={() => unlinkOrder(l.id)}
                            disabled={linkSaving === l.id}
                            className="text-red-400 hover:text-red-300 transition"
                            title="فك الربط"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <select
                      value={orderToLink}
                      onChange={e => setOrderToLink(e.target.value)}
                      className="flex-1 bg-[#111927] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="">اختر أوردر لربطه بالفاتورة</option>
                      {orders
                        .filter(o => !linkedOrders.some(l => l.order_id === o.id))
                        .map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
                    </select>
                    <button
                      onClick={linkOrder}
                      disabled={!orderToLink || linkSaving === 'new'}
                      className="px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition disabled:opacity-40 flex items-center gap-1"
                    >
                      {linkSaving === 'new' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} ربط
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Items */}
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">بنود أمر الشراء</h3>
                <button
                  onClick={addDraftItem}
                  disabled={isReceived}
                  className="px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold hover:bg-green-500/20 transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={12} /> إضافة صنف
                </button>
              </div>

              {isReceived && (
                <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 mb-3 text-[11px] text-gray-400">
                  🔒 تم استلام هذا الأمر بالفعل وتحديث المخزون بناءً عليه، فلا يمكن تعديل أو إضافة أو حذف بنوده.
                </div>
              )}

              {modalLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-600">
                  <Loader2 size={22} className="animate-spin text-amber-500" />
                </div>
              ) : modalItems.length === 0 ? (
                <p className="text-center text-gray-600 text-xs py-6">لا توجد أصناف في أمر الشراء ده</p>
              ) : (
                <div className="space-y-2">
                  {modalItems.map(it => (
                    <div key={it.id} className="bg-[#111927] border border-white/5 rounded-xl p-3 flex flex-wrap items-center gap-2">
                      <select
                        value={it.inventory_id}
                        disabled={isReceived}
                        onChange={e => chooseInventoryForItem(it.id, e.target.value)}
                        className="flex-1 min-w-[140px] bg-[#0D1B2A] border border-white/10 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        <option value="">اختر الصنف</option>
                        {inventory.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={it.quantity}
                        disabled={isReceived}
                        onChange={e => editModalItemLocal(it.id, 'quantity', Number(e.target.value))}
                        onBlur={() => !it.id.startsWith('draft-') && saveModalItem(it)}
                        className="w-20 bg-[#0D1B2A] border border-white/10 rounded px-2 py-1 text-xs text-white text-center disabled:opacity-50"
                        placeholder="الكمية"
                      />
                      <input
                        type="number"
                        min="0"
                        value={it.unit_price}
                        disabled={isReceived}
                        onChange={e => editModalItemLocal(it.id, 'unit_price', Number(e.target.value))}
                        onBlur={() => !it.id.startsWith('draft-') && saveModalItem(it)}
                        className="w-24 bg-[#0D1B2A] border border-white/10 rounded px-2 py-1 text-xs text-white text-center disabled:opacity-50"
                        placeholder="سعر الوحدة"
                      />
                      <span className="w-24 text-xs text-amber-400 font-bold text-left">
                        {Number((it.quantity || 0) * (it.unit_price || 0)).toLocaleString('ar-EG')} ج.م
                      </span>
                      {itemSaving === it.id && <Loader2 size={14} className="animate-spin text-gray-500" />}
                      <button
                        onClick={() => deleteModalItem(it.id)}
                        disabled={itemSaving === it.id || isReceived}
                        className="text-red-400 hover:text-red-300 transition p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="حذف الصنف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
                <span className="text-xs text-gray-500">إجمالي أمر الشراء</span>
                <span className="text-lg font-black text-amber-400">{modalTotal.toLocaleString('ar-EG')} ج.م</span>
              </div>
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-white/5 text-gray-300 border border-white/10 rounded-lg text-xs font-bold hover:bg-white/10 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}