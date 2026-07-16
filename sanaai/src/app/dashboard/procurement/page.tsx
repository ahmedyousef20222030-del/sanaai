'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Package, CheckCircle } from 'lucide-react'

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
    </div>
  )
}