'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Package, CheckCircle } from 'lucide-react'

type PurchaseOrder = {
  id: string; po_number: string; status: string; expected_date: string | null;
  tenant_id: string | null; supplier_id: string; order_id: string | null;
  suppliers: { name: string } | null; orders: { order_number: string } | null;
}

export default function ProcurementPage() {
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)

  const [form, setForm] = useState({ supplier_id: '', order_id: '', expected_date: '' })
  const [items, setItems] = useState<{ inventory_id: string; name: string; qty: number; price: number }[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data: me } = await supabase.from('users').select('tenant_id').single()
        setTenantId(me?.tenant_id || null)
        const [poRes, supRes, invRes] = await Promise.all([
          supabase.from('purchase_orders').select('*, suppliers(name), orders(order_number)').order('created_at', { ascending: false }),
          supabase.from('suppliers').select('id, name'),
          supabase.from('inventory').select('id, name, unit')
        ])
        setPos(poRes.data || [])
        setSuppliers(supRes.data || [])
        setInventory(invRes.data || [])
      } catch (err) { console.error(err) } finally { setLoading(false) }
    }
    load()
  }, [])

  async function handleSavePO() {
    if (!form.supplier_id || items.length === 0) { alert('يرجى اختيار المورد وإضافة صنف واحد على الأقل'); return }
    setSaving('saving-new')
    try {
      const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
        tenant_id: tenantId, supplier_id: form.supplier_id, order_id: form.order_id || null,
        po_number: `PO-${Date.now().toString().slice(-6)}`, expected_date: form.expected_date, status: 'قيد الانتظار'
      }).select().single()
      if (poErr) throw poErr

      const itemsToInsert = items.map(it => ({
        po_id: po.id, tenant_id: tenantId, inventory_id: it.inventory_id, name: it.name, quantity: it.qty, unit_price: it.price
      }))
      const { error: itemsErr } = await supabase.from('purchase_order_items').insert(itemsToInsert)
      if (itemsErr) throw itemsErr

      setPos(prev => [{ ...po, suppliers: suppliers.find(s => s.id === form.supplier_id) || null, orders: null }, ...prev])
      setShowForm(false); setItems([]); setForm({ supplier_id: '', order_id: '', expected_date: '' })
    } catch (err: any) { alert('خطأ: ' + err.message) } finally { setSaving(null) }
  }

  async function receivePO(poId: string) {
    setSaving(poId)
    try {
      const { error: statusErr } = await supabase.from('purchase_orders').update({ status: 'تم الاستلام' }).eq('id', poId)
      if (statusErr) throw statusErr

      const { data: itemsData } = await supabase.from('purchase_order_items').select('*').eq('po_id', poId)
      if (itemsData) {
        for (const item of itemsData) {
          if (item.inventory_id) {
            const { data: current } = await supabase.from('inventory').select('current_stock').eq('id', item.inventory_id).single()
            const newStock = (current?.current_stock || 0) + (item.quantity || 0)
            await supabase.from('inventory').update({ current_stock: newStock }).eq('id', item.inventory_id)
          }
        }
      }
      setPos(prev => prev.map(p => p.id === poId ? { ...p, status: 'تم الاستلام' } : p))
      alert('تم استلام الشحنة وتحديث المخزون!')
    } catch (err: any) { alert('خطأ: ' + err.message) } finally { setSaving(null) }
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-black text-white">🛒 المشتريات والتوريدات</h1><p className="text-sm text-gray-500 mt-1">إدارة أوامر الشراء وتغذية المخزون</p></div>
        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm">➕ أمر شراء جديد</button>
      </div>

      {showForm && (
        <div className="bg-[#111927] rounded-2xl border border-amber-500/20 p-6 mb-6 shadow-2xl">
          <h2 className="text-sm font-bold text-amber-400 mb-4">إنشاء أمر شراء جديد</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs text-gray-500 mb-1">المورد *</label>
              <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none">
                <option value="">اختر المورد</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">مرتبط بطلب (اختياري)</label>
              <input value={form.order_id} onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))} placeholder="رقم الطلب" className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">تاريخ التسليم المتوقع</label>
              <input type="date" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.//target.value }))} className="w-//full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none" />
            </div>
          </div>
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-400">الأصناف المطلوبة:</span>
              <button onClick={() => setItems(p => [...p, { inventory_id: '', name: '', qty: 1, price: 0 }])} className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded border border-amber-500/30 hover:bg-amber-500/30 transition">➕ إضافة صنف</button>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 bg-white/5 p-2 rounded-lg border border-white/5">
                <select value={item.inventory_id} onChange={e => {
                  const val = e.target.value;
                  const prod = inventory.find(p => p.id === val);
                  setItems(prev => prev.map((it, idx) => idx === i ? { ...it, inventory_id: val, name: prod?.name || '' } : it));
                }} className="bg-[#0D1B2A] border border-white/10 rounded px-2 py-1 text-xs text-white">
                  <option value="">اختر الصنف</option>
                  {inventory.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                </select>
                <input type="number" value={item.qty} onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, qty: Number(e.target.value) } : it))} className="bg-[#0D1B2A] border border-white/10 rounded px-2 py-1 text-xs text-white" />
                <input type="number" value={item.price} onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, price: Number(e.target.value) } : it))} className="bg-[#0D1B2A] border border-white/10 rounded px-2 py-1 text-xs text-white" />
                <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-400 text-sm">إلغاء</button>
            <button onClick={handleSavePO} disabled={!!saving} className="px-6 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition disabled:opacity-50">{saving === 'saving-new' ? <Loader2 size={16} className="animate-spin" /> : '✅ تأكيد أمر الشراء'}</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {loading ? ( <div className="text-center py-10 text-gray-600"><Loader2 className="animate-spin mx-auto mb-2" /> جاري التحميل...</div> ) : pos.length === 0 ? ( <div className="text-center py-10 text-gray-600">لا توجد أوامر شراء حالية</div> ) : (
          pos.map(po => (
            <div key={po.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20"><Package size={20} /></div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-amber-400 font-bold">{po.po_number}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${po.status === 'تم الاستلام' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>{po.status}</span>
                  </div>
                  <div className="text-sm text-white font-medium mt-1">{po.suppliers?.name || 'مورد غير معروف'}</div>
                  <div className="text-xs text-gray-500">التسليم المتوقع: {po.expected_date || 'غير محدد'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {po.status !== 'تم الاستلام' && (
                  <button onClick={() => receivePO(po.id)} disabled={saving === po.id} className="flex items-center gap-2 px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded-xl text-xs font-bold hover:bg-green-600/30 transition">
                    {saving === po.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} تأكيد الاستلام
                  </button>
                )}
                <button onClick={async () => { if(confirm('حذف الأمر؟')) { await supabase.from('purchase_orders').delete().eq('id', po.id); setPos(prev => prev.filter(x => x.id !== po.id)) }}} className="p-2 text-gray-600 hover:text-red-400 transition">🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
