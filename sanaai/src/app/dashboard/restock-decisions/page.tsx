'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Factory, ShoppingCart, CheckCircle2, PackageX } from 'lucide-react'

type InventoryItem = {
  id: string
  name: string
  sku: string | null
  color: string | null
  size: string | null
  unit: string
  current_stock: number
  min_stock: number
}

type Supplier = { id: string; name: string }

type Decision = {
  id: string
  inventory_id: string
  decision: 'manufacture' | 'purchase'
  quantity_needed: number
  supplier_id: string | null
  po_id: string | null
  notes: string | null
  status: 'قيد التنفيذ' | 'مكتمل'
  created_at: string
  suppliers: { name: string } | null
}

// حالة الفورم المؤقت المفتوح لكل صنف وهو بيقرر (قبل ما يتأكد القرار)
type DraftState = {
  quantity: string
  notes: string
  supplierId: string
  unitPrice: string
  expectedDate: string
}

const EMPTY_DRAFT: DraftState = {
  quantity: '', notes: '', supplierId: '', unitPrice: '', expectedDate: '',
}

export default function RestockDecisionsPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // أي صنف مفتوح دلوقتي على وضع "شراء من مورد" (بيدي التفاصيل)
  const [purchaseFormFor, setPurchaseFormFor] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => { load() }, [])

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  function getDraft(itemId: string): DraftState {
    return drafts[itemId] || EMPTY_DRAFT
  }

  function setDraft(itemId: string, patch: Partial<DraftState>) {
    setDrafts(prev => ({ ...prev, [itemId]: { ...getDraft(itemId), ...patch } }))
  }

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('يجب تسجيل الدخول أولاً')
      setUserId(user.id)

      const { data: me, error: meErr } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (meErr || !me?.tenant_id) throw new Error('تعذر تحديد بيانات المنشأة')
      setTenantId(me.tenant_id)

      const [invRes, supRes, decRes] = await Promise.all([
        supabase
          .from('inventory')
          .select('id, name, sku, color, size, unit, current_stock, min_stock')
          .lte('current_stock', 0)
          .order('name', { ascending: true }),
        supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
        supabase
          .from('inventory_restock_decisions')
          .select('*, suppliers(name)')
          .order('created_at', { ascending: false }),
      ])

      if (invRes.error) throw invRes.error
      if (supRes.error) throw supRes.error
      if (decRes.error) throw decRes.error

      setItems(invRes.data || [])
      setSuppliers(supRes.data || [])
      setDecisions((decRes.data as any) || [])
    } catch (err: any) {
      setLoadError(err.message || 'حدث خطأ أثناء تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  // آخر قرار "قيد التنفيذ" لكل صنف، عشان نعرضه كـ badge فوق الكارت
  const openDecisionByItem = useMemo(() => {
    const map: Record<string, Decision> = {}
    for (const d of decisions) {
      if (d.status !== 'قيد التنفيذ') continue
      if (!map[d.inventory_id]) map[d.inventory_id] = d // decisions already sorted desc بالأحدث
    }
    return map
  }, [decisions])

  async function decideManufacture(item: InventoryItem) {
    if (!tenantId || !userId) return
    const draft = getDraft(item.id)
    const qty = Number(draft.quantity) || item.min_stock || 1

    setSaving(item.id)
    try {
      const { data, error } = await supabase
        .from('inventory_restock_decisions')
        .insert({
          tenant_id: tenantId,
          inventory_id: item.id,
          decision: 'manufacture',
          quantity_needed: qty,
          notes: draft.notes.trim() || null,
          decided_by: userId,
        })
        .select('*, suppliers(name)')
        .single()

      if (error) throw error

      setDecisions(prev => [data as any, ...prev])
      setDrafts(prev => ({ ...prev, [item.id]: EMPTY_DRAFT }))
      showMessage('success', `تم تسجيل قرار التصنيع الداخلي لصنف "${item.name}"`)
    } catch (err: any) {
      showMessage('error', 'خطأ: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  async function decidePurchase(item: InventoryItem) {
    if (!tenantId || !userId) return
    const draft = getDraft(item.id)
    const qty = Number(draft.quantity) || item.min_stock || 1
    const price = Number(draft.unitPrice) || 0

    if (!draft.supplierId) { showMessage('error', 'يرجى اختيار المورد'); return }
    if (qty <= 0) { showMessage('error', 'يرجى إدخال كمية صحيحة'); return }

    setSaving(item.id)
    try {
      // 1. إنشاء أمر شراء (بنفس منطق صفحة المشتريات) عشان يظهر فورًا هناك للمتابعة
      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({
          tenant_id: tenantId,
          supplier_id: draft.supplierId,
          po_number: `PO-${Date.now().toString().slice(-6)}`,
          expected_date: draft.expectedDate || null,
          status: 'قيد الانتظار',
        })
        .select()
        .single()
      if (poErr) throw poErr

      const { error: itemErr } = await supabase.from('purchase_order_items').insert({
        po_id: po.id,
        tenant_id: tenantId,
        inventory_id: item.id,
        name: item.name,
        quantity: qty,
        unit_price: price,
      })
      if (itemErr) {
        await supabase.from('purchase_orders').delete().eq('id', po.id)
        throw itemErr
      }

      // 2. تسجيل القرار نفسه وربطه بأمر الشراء
      const { data: decision, error: decErr } = await supabase
        .from('inventory_restock_decisions')
        .insert({
          tenant_id: tenantId,
          inventory_id: item.id,
          decision: 'purchase',
          quantity_needed: qty,
          supplier_id: draft.supplierId,
          po_id: po.id,
          notes: draft.notes.trim() || null,
          decided_by: userId,
        })
        .select('*, suppliers(name)')
        .single()
      if (decErr) throw decErr

      setDecisions(prev => [decision as any, ...prev])
      setDrafts(prev => ({ ...prev, [item.id]: EMPTY_DRAFT }))
      setPurchaseFormFor(null)
      showMessage('success', `تم إنشاء أمر شراء لصنف "${item.name}" — تقدري تتابعيه من صفحة المشتريات`)
    } catch (err: any) {
      showMessage('error', 'خطأ: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  async function markDecisionComplete(decisionId: string) {
    setSaving(decisionId)
    try {
      const { error } = await supabase
        .from('inventory_restock_decisions')
        .update({ status: 'مكتمل' })
        .eq('id', decisionId)
      if (error) throw error
      setDecisions(prev => prev.map(d => d.id === decisionId ? { ...d, status: 'مكتمل' } : d))
    } catch (err: any) {
      showMessage('error', 'خطأ: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {message && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-bold border ${
          message.type === 'success' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'
        }`}>
          {message.type === 'success' ? '✅ ' : '❌ '}{message.text}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">⚖️ قرارات التوريد — الأصناف المنتهية</h1>
        <p className="text-sm text-gray-500 mt-1">{items.length} صنف محتاج قرار: تصنيع داخلي ولا شراء من مورد</p>
      </div>

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 text-sm text-red-400">
          ⚠️ {loadError}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-600"><Loader2 className="animate-spin mx-auto mb-2" /> جاري التحميل...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-600 bg-[#111927] rounded-3xl border border-white/5">
          <div className="text-4xl mb-3">🎉</div>
          <p>مفيش أصناف منتهية حاليًا</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
          {items.map(item => {
            const openDecision = openDecisionByItem[item.id]
            const draft = getDraft(item.id)
            const showPurchaseForm = purchaseFormFor === item.id

            return (
              <div key={item.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 border border-red-500/20">
                      <PackageX size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{item.name}</div>
                      <div className="text-xs text-gray-500">
                        {[item.color, item.size, item.sku].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 font-bold whitespace-nowrap">
                    مخزون: {item.current_stock} {item.unit}
                  </span>
                </div>

                {openDecision && (
                  <div className="mb-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl px-3 py-2 text-xs text-cyan-300 flex items-center justify-between">
                    <span>
                      {openDecision.decision === 'manufacture'
                        ? `🏭 قرار سابق: تصنيع داخلي (${openDecision.quantity_needed} ${item.unit})`
                        : `🛒 قرار سابق: شراء من ${openDecision.suppliers?.name || 'مورد'} (${openDecision.quantity_needed} ${item.unit})`}
                    </span>
                    <button
                      onClick={() => markDecisionComplete(openDecision.id)}
                      disabled={saving === openDecision.id}
                      className="text-[10px] px-2 py-1 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/10 transition disabled:opacity-50"
                    >
                      {saving === openDecision.id ? '...' : 'تحديد كمكتمل'}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">الكمية المطلوبة</label>
                    <input
                      type="number"
                      min="1"
                      placeholder={String(item.min_stock || 1)}
                      value={draft.quantity}
                      onChange={e => setDraft(item.id, { quantity: e.target.value })}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">ملاحظات (اختياري)</label>
                    <input
                      value={draft.notes}
                      onChange={e => setDraft(item.id, { notes: e.target.value })}
                      placeholder="مثلاً: عاجل لطلب عميل"
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>

                {showPurchaseForm && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3 space-y-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">المورد *</label>
                      <select
                        value={draft.supplierId}
                        onChange={e => setDraft(item.id, { supplierId: e.target.value })}
                        className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="">اختر المورد</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">سعر الوحدة</label>
                        <input
                          type="number"
                          min="0"
                          value={draft.unitPrice}
                          onChange={e => setDraft(item.id, { unitPrice: e.target.value })}
                          className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">تاريخ التسليم المتوقع</label>
                        <input
                          type="date"
                          value={draft.expectedDate}
                          onChange={e => setDraft(item.id, { expectedDate: e.target.value })}
                          className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => decideManufacture(item)}
                    disabled={saving === item.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-50"
                  >
                    {saving === item.id ? <Loader2 size={14} className="animate-spin" /> : <Factory size={14} />} تصنيع داخلي
                  </button>

                  {!showPurchaseForm ? (
                    <button
                      onClick={() => setPurchaseFormFor(item.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition"
                    >
                      <ShoppingCart size={14} /> شراء من مورد
                    </button>
                  ) : (
                    <button
                      onClick={() => decidePurchase(item)}
                      disabled={saving === item.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 transition disabled:opacity-50"
                    >
                      {saving === item.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} تأكيد أمر الشراء
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* سجل القرارات */}
      <div>
        <h2 className="text-sm font-bold text-gray-400 mb-3">📋 سجل القرارات الأخيرة</h2>
        {decisions.length === 0 ? (
          <div className="text-center py-8 text-gray-600 bg-[#111927] rounded-2xl border border-white/5 text-sm">
            لا يوجد قرارات مسجلة بعد
          </div>
        ) : (
          <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right border-b border-white/5">
                  {['الصنف', 'القرار', 'الكمية', 'التفاصيل', 'الحالة', 'التاريخ'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decisions.map(d => {
                  const item = items.find(i => i.id === d.inventory_id)
                  return (
                    <tr key={d.id} className="border-t border-white/5">
                      <td className="px-4 py-3 text-white text-xs font-bold">{item?.name || '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        {d.decision === 'manufacture' ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">🏭 تصنيع داخلي</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">🛒 شراء</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{d.quantity_needed}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {d.decision === 'purchase' ? (d.suppliers?.name || '—') : (d.notes || '—')}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`px-2 py-0.5 rounded-full border ${d.status === 'مكتمل' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-white/5 text-gray-400 border-white/10'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                        {new Date(d.created_at).toLocaleDateString('ar-EG')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}