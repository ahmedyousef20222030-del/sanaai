'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ═══════════════════════════════════════════════════════════════════════════
// 📋 TYPES & CONSTANTS (نفس منطق orders/new، مع إضافة id + snapshot أصلي لكل صنف)
// ═══════════════════════════════════════════════════════════════════════════

type Client = { id: string; name: string; phone: string }

type InventoryItem = {
  id: string
  name: string
  current_stock: number
  unit: string
  color: string | null
  color_hex: string | null
  selling_price: number
}

const SECTORS = ['مدارس', 'مطاعم وفنادق', 'شركات كوربوريت', 'حكومي', 'أفراد', 'أخرى']
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'فري سايز', 'مقاس خاص']
const EXECUTION_TYPES = ['طباعة', 'تطريز', 'بدون'] as const

type EditItem = {
  id: string | null // null = صنف جديد لسه ما اتحفظش
  inventory_id: string
  product_name: string
  color: string
  color_hex: string | null
  custom_detail: string
  size: string
  qty: number
  unit_price: number
  stock_qty: number
  status: 'متاح من المخزون' | 'مطلوب تصنيع' | 'مطلوب شراء'
  execution_type: typeof EXECUTION_TYPES[number]
}

// نسخة خام زي ما هي في قاعدة البيانات وقت فتح الصفحة، بنستخدمها بس لحساب
// فرق خصم/استرجاع المخزون بشكل صحيح وقت الحفظ - مش بتتغير مع التعديل
type OriginalItemSnapshot = {
  id: string
  inventory_id: string | null
  quantity: number
  fulfillment_type: string | null
}

const STATUS_COLORS: Record<string, string> = {
  'متاح من المخزون': 'bg-green-500/20 text-green-400 border-green-500/30',
  'مطلوب تصنيع': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'مطلوب شراء': 'bg-red-500/20 text-red-400 border-red-500/30',
}

const EXECUTION_COLORS: Record<string, string> = {
  'طباعة': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'تطريز': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'بدون': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'أسود', hex: '#1a1a1a' }, { name: 'أبيض', hex: '#eeeeee' },
  { name: 'أحمر', hex: '#c62828' }, { name: 'أزرق', hex: '#1565c0' },
  { name: 'أصفر', hex: '#f5c400' }, { name: 'بيج', hex: '#e3d2b3' },
  { name: 'رمادي', hex: '#5b5b5b' }, { name: 'أخضر', hex: '#2e7d32' },
  { name: 'كحلي', hex: '#0d1b3e' }, { name: 'بني', hex: '#6d4c31' },
  { name: 'فوشيا', hex: '#e4007c' }, { name: 'وردي', hex: '#f48fb1' },
  { name: 'بنفسجي', hex: '#6a1b9a' }, { name: 'موف', hex: '#b39ddb' },
  { name: 'برتقالي', hex: '#fb8c00' }, { name: 'فضي', hex: '#c0c0c0' },
  { name: 'ذهبي', hex: '#d4af37' }, { name: 'تركواز', hex: '#26c6da' },
  { name: 'فيروزي', hex: '#40e0d0' }, { name: 'عنابي', hex: '#7b1f1f' },
  { name: 'خمري', hex: '#800020' }, { name: 'زيتي', hex: '#808000' },
  { name: 'سماوي', hex: '#87ceeb' }, { name: 'كريمي', hex: '#fff3d6' },
  { name: 'نحاسي', hex: '#b87333' }, { name: 'بترولي', hex: '#0f4c5c' },
]

function colorHex(name: string | null, customHex?: string | null) {
  if (customHex) return customHex
  return COLOR_PRESETS.find(c => c.name === name)?.hex || '#888888'
}

function calculateStatus(stock: number, qty: number): EditItem['status'] {
  if (stock >= qty) return 'متاح من المخزون'
  if (stock > 0) return 'مطلوب تصنيع'
  return 'مطلوب شراء'
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function EditOrderClient({ orderId }: { orderId: string }) {
  const router = useRouter()

  const [tenantId, setTenantId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [initializing, setInitializing] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [clients, setClients] = useState<Client[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])

  const [orderNumber, setOrderNumber] = useState<string>('')
  const [depositPaid, setDepositPaid] = useState<number>(0)

  const [clientMode, setClientMode] = useState<'select' | 'new'>('select')
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientAddress, setNewClientAddress] = useState('')

  const [form, setForm] = useState({
    client_id: '',
    sector: 'مدارس',
    expected_delivery: '',
    deposit_amount: '',
    notes: '',
    quantity: '',
    unit_price: '',
    execution_type: 'طباعة' as typeof EXECUTION_TYPES[number],
  })
  const [customSector, setCustomSector] = useState('')

  const [items, setItems] = useState<EditItem[]>([])
  const [originalItems, setOriginalItems] = useState<OriginalItemSnapshot[]>([])
  const [customDetailOpen, setCustomDetailOpen] = useState<Set<number>>(new Set())

  // ───────────────────────────────────────────────────────────────────────
  // 📡 LOAD ORDER
  // ───────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function loadAll() {
    setInitializing(true)
    setLoadError(null)
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authUser) throw new Error('تعذر التحقق من الهوية')

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('id, tenant_id')
        .eq('id', authUser.id)
        .single()
      if (meError) throw meError
      if (!me?.tenant_id) throw new Error('تعذر تحديد بيانات المنشأة')
      setTenantId(me.tenant_id)
      setUserId(me.id)

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, client_id, sector, expected_delivery, deposit_paid, details, quantity, total_amount, execution_type, order_number')
        .eq('id', orderId)
        .eq('tenant_id', me.tenant_id)
        .single()
      if (orderError) throw orderError
      if (!order) throw new Error('الطلب غير موجود')

      const [{ data: clientsData, error: clientsError }, { data: inventoryData, error: inventoryError }, { data: itemsData, error: itemsError }] =
        await Promise.all([
          supabase.from('clients').select('id, name, phone').eq('tenant_id', me.tenant_id),
          supabase.from('inventory').select('id, name, current_stock, unit, color, color_hex, selling_price').eq('tenant_id', me.tenant_id),
          supabase.from('order_items').select('*').eq('order_id', orderId).eq('tenant_id', me.tenant_id),
        ])
      if (clientsError) throw clientsError
      if (inventoryError) throw inventoryError
      if (itemsError) throw itemsError

      setClients(clientsData || [])
      setInventory(inventoryData || [])
      setOrderNumber(order.order_number || '')
      setDepositPaid(Number(order.deposit_paid) || 0)

      const knownSector = SECTORS.includes(order.sector)
      setForm({
        client_id: order.client_id || '',
        sector: knownSector ? order.sector : (order.sector ? 'أخرى' : 'مدارس'),
        expected_delivery: order.expected_delivery ? String(order.expected_delivery).split('T')[0] : '',
        deposit_amount: String(order.deposit_paid ?? 0),
        notes: order.details || '',
        quantity: String(order.quantity ?? ''),
        unit_price: order.quantity ? String(Math.round((Number(order.total_amount) || 0) / order.quantity)) : '',
        execution_type: (order.execution_type as any) || 'طباعة',
      })
      if (!knownSector && order.sector) setCustomSector(order.sector)

      const loadedItems: EditItem[] = (itemsData || []).map((it: any) => ({
        id: it.id,
        inventory_id: it.inventory_id || '',
        product_name: it.name || '',
        color: it.color || '',
        color_hex: colorHex(it.color, null),
        custom_detail: it.custom_detail || '',
        size: it.size || 'M',
        qty: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        stock_qty: 0,
        status: (it.fulfillment_type as any) || 'متاح من المخزون',
        execution_type: (it.execution_type as any) || 'بدون',
      }))
      setItems(loadedItems)
      setOriginalItems(
        (itemsData || []).map((it: any) => ({
          id: it.id,
          inventory_id: it.inventory_id || null,
          quantity: Number(it.quantity) || 0,
          fulfillment_type: it.fulfillment_type || null,
        }))
      )

      // refresh stock_qty display لكل صنف مرتبط بمخزون
      if (inventoryData && loadedItems.length > 0) {
        setItems(prev =>
          prev.map(item => {
            const product = inventoryData.find((p: any) => p.id === item.inventory_id)
            return product ? { ...item, stock_qty: product.current_stock || 0 } : item
          })
        )
      }
    } catch (err: any) {
      setLoadError(err.message || 'خطأ في تحميل بيانات الطلب')
    } finally {
      setInitializing(false)
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 🛠️ ITEM HELPERS (نفس منطق orders/new)
  // ───────────────────────────────────────────────────────────────────────

  function updateForm(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function addItem() {
    setItems(prev => [...prev, {
      id: null,
      inventory_id: '',
      product_name: '',
      color: '',
      color_hex: null,
      custom_detail: '',
      size: 'M',
      qty: 1,
      unit_price: 0,
      stock_qty: 0,
      status: 'متاح من المخزون',
      execution_type: 'طباعة',
    }])
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function toggleCustomDetail(index: number) {
    setCustomDetailOpen(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function updateItem(index: number, key: keyof EditItem, value: any) {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      const updated = { ...item, [key]: value }
      if (key === 'product_name') {
        updated.inventory_id = ''
        updated.color = ''
        updated.color_hex = null
        updated.stock_qty = 0
      }
      if (key === 'qty') {
        const product = inventory.find(p => p.id === updated.inventory_id)
        if (product) updated.status = calculateStatus(product.current_stock, value)
      }
      return updated
    }))
  }

  function selectVariant(index: number, product: InventoryItem) {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      return {
        ...item,
        inventory_id: product.id,
        color: product.color || '',
        color_hex: product.color_hex,
        stock_qty: product.current_stock || 0,
        unit_price: product.selling_price || item.unit_price,
        status: calculateStatus(product.current_stock, item.qty),
      }
    }))
  }

  // ───────────────────────────────────────────────────────────────────────
  // 💰 CALCULATIONS
  // ───────────────────────────────────────────────────────────────────────

  const effectiveSector = form.sector === 'أخرى' ? customSector : form.sector
  const productNames = Array.from(new Set(inventory.map(p => p.name))).sort((a, b) => a.localeCompare(b, 'ar'))
  const itemsTotal = items.reduce((sum, item) => sum + (item.qty * item.unit_price), 0)
  const manualTotal = (Number(form.quantity) * Number(form.unit_price)) || 0
  const total = items.length > 0 ? itemsTotal : manualTotal
  const remaining = total - (Number(form.deposit_amount) || 0)
  const needProduction = items.filter(x => x.status === 'مطلوب تصنيع')
  const needPurchase = items.filter(x => x.status === 'مطلوب شراء')

  // ───────────────────────────────────────────────────────────────────────
  // 💾 SAVE
  // ───────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!tenantId || !userId) return
    if (clientMode === 'select' && !form.client_id) { alert('يرجى اختيار العميل'); return }
    if (clientMode === 'new' && !newClientName.trim()) { alert('يرجى كتابة اسم العميل'); return }
    if (items.length === 0 && (!form.quantity || !form.unit_price)) { alert('يرجى إضافة أصناف أو كمية وسعر'); return }
    const missingColor = items.find(x => x.product_name && !x.inventory_id)
    if (missingColor) { alert(`يرجى اختيار لون لصنف "${missingColor.product_name}"`); return }
    if (!form.expected_delivery) { alert('يرجى تحديد تاريخ التسليم'); return }

    setSaving(true)
    setSaveError(null)
    try {
      // 1) العميل: تحديث بيانات العميل الحالي، أو إنشاء عميل جديد وربط الطلب بيه
      let clientId = form.client_id
      if (clientMode === 'new') {
        const { data: newClient, error: newClientError } = await supabase
          .from('clients')
          .insert({
            name: newClientName.trim(),
            phone: newClientPhone.trim() || null,
            address: newClientAddress.trim() || null,
            sector: effectiveSector,
            tenant_id: tenantId,
          })
          .select('id')
          .single()
        if (newClientError) throw new Error('فشل إنشاء عميل جديد: ' + newClientError.message)
        clientId = newClient.id
      }

      const newQuantity = items.length > 0 ? items.reduce((s, x) => s + x.qty, 0) : Number(form.quantity)

      // 2) تحديث صف الطلب نفسه
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          client_id: clientId,
          sector: effectiveSector,
          expected_delivery: form.expected_delivery,
          deposit_paid: Number(form.deposit_amount) || 0,
          // remaining_amount: عمود GENERATED محسوب تلقائيًا في قاعدة البيانات (total_amount - deposit_paid)
          // مينفعش نبعته في الـ update، وإلا Postgres يرمي: "column can only be updated to DEFAULT"
          details: form.notes,
          quantity: newQuantity,
          total_amount: total,
          execution_type: items.length === 0 ? form.execution_type : null,
        })
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
      if (orderError) throw new Error('فشل تحديث الطلب: ' + orderError.message)

      // 3) تسوية الأصناف + حساب فرق خصم/استرجاع المخزون
      const currentIds = items.map(it => it.id).filter(Boolean) as string[]
      const removedItems = originalItems.filter(orig => !currentIds.includes(orig.id))

      const restoreMap = new Map<string, number>() // inventory_id -> كمية ترجع للمخزون
      const deductMap = new Map<string, number>()  // inventory_id -> كمية تتخصم من المخزون

      function addTo(map: Map<string, number>, key: string, qty: number) {
        map.set(key, (map.get(key) || 0) + qty)
      }

      // الأصناف المحذوفة بالكامل: لو كانت مخصومة من المخزون، ترجع
      for (const orig of removedItems) {
        if (orig.inventory_id && orig.fulfillment_type === 'متاح من المخزون') {
          addTo(restoreMap, orig.inventory_id, orig.quantity)
        }
      }
      if (removedItems.length > 0) {
        const { error: delErr } = await supabase.from('order_items').delete().in('id', removedItems.map(r => r.id))
        if (delErr) throw new Error('فشل حذف أصناف: ' + delErr.message)
      }

      // الأصناف الموجودة (تعديل): قارن كل صنف بأصله عشان نحسب فرق الخصم
      const existingItems = items.filter(it => it.id)
      for (const it of existingItems) {
        const orig = originalItems.find(o => o.id === it.id)
        if (orig?.inventory_id && orig.fulfillment_type === 'متاح من المخزون') {
          addTo(restoreMap, orig.inventory_id, orig.quantity)
        }
        if (it.inventory_id && it.status === 'متاح من المخزون') {
          addTo(deductMap, it.inventory_id, it.qty)
        }

        const { error: updErr } = await supabase
          .from('order_items')
          .update({
            inventory_id: it.inventory_id || null,
            name: it.product_name,
            color: it.color || null,
            custom_detail: it.custom_detail || null,
            size: it.size,
            quantity: it.qty,
            unit_price: it.unit_price,
            total_price: it.qty * it.unit_price,
            fulfillment_type: it.status,
            execution_type: it.execution_type,
            source: it.inventory_id ? 'مخزون' : 'خارجي',
          })
          .eq('id', it.id as string)
        if (updErr) throw new Error('فشل تحديث صنف: ' + updErr.message)
      }

      // الأصناف الجديدة (إضافة)
      const newItems = items.filter(it => !it.id)
      if (newItems.length > 0) {
        const payload = newItems.map(it => ({
          order_id: orderId,
          tenant_id: tenantId,
          inventory_id: it.inventory_id || null,
          name: it.product_name,
          color: it.color || null,
          custom_detail: it.custom_detail || null,
          size: it.size,
          quantity: it.qty,
          unit_price: it.unit_price,
          total_price: it.qty * it.unit_price,
          fulfillment_type: it.status,
          execution_type: it.execution_type,
          source: it.inventory_id ? 'مخزون' : 'خارجي',
        }))
        const { error: insErr } = await supabase.from('order_items').insert(payload)
        if (insErr) throw new Error('فشل حفظ أصناف جديدة: ' + insErr.message)

        for (const it of newItems) {
          if (it.inventory_id && it.status === 'متاح من المخزون') addTo(deductMap, it.inventory_id, it.qty)
        }
      }

      // 4) تطبيق صافي فرق المخزون (استرجاع - خصم) لكل صنف مخزون اتأثر
      const affectedInventoryIds = new Set([...restoreMap.keys(), ...deductMap.keys()])
      for (const invId of affectedInventoryIds) {
        const product = inventory.find(p => p.id === invId)
        if (!product) continue
        const net = (restoreMap.get(invId) || 0) - (deductMap.get(invId) || 0)
        if (net === 0) continue
        const newStock = Math.max(0, product.current_stock + net)
        const { error: stockErr } = await supabase.from('inventory').update({ current_stock: newStock }).eq('id', invId)
        if (stockErr) console.error('خطأ في تحديث المخزون:', stockErr)
      }

      // 5) تحديث خطة الإنتاج المطلوبة، لو فيه أصناف محتاجة تصنيع
      if (needProduction.length > 0) {
        const plannedQty = needProduction.reduce((s, x) => s + x.qty, 0)
        const { data: existingProd } = await supabase
          .from('production')
          .select('id')
          .eq('order_id', orderId)
          .eq('tenant_id', tenantId)
          .maybeSingle()

        if (existingProd?.id) {
          await supabase.from('production').update({ planned_qty: plannedQty, updated_at: new Date().toISOString() }).eq('id', existingProd.id)
        } else {
          await supabase.from('production').insert({
            order_id: orderId,
            tenant_id: tenantId,
            supervisor_id: userId,
            planned_qty: plannedQty,
            status: 'مخطط',
          })
        }
      }

      router.push(`/dashboard/orders/${orderId}`)
    } catch (err: any) {
      setSaveError(err.message || 'فشل حفظ التعديلات')
    } finally {
      setSaving(false)
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 🖼️ RENDER
  // ───────────────────────────────────────────────────────────────────────

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#08090A] flex items-center justify-center" dir="rtl">
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#08090A] flex items-center justify-center p-4" dir="rtl">
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center text-red-400 max-w-md">
          <div className="text-3xl mb-2">⚠️</div>
          {loadError}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#08090A] p-4" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition text-xl">→</button>
          <div>
            <h1 className="text-3xl font-black text-white">✏️ تعديل الطلب</h1>
            <p className="text-gray-500 text-sm">
              {orderNumber ? `رقم الطلب: ${orderNumber}` : `#${orderId.slice(0, 8)}`}
            </p>
          </div>
        </div>

        {saveError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-5 text-sm text-red-400">
            ⚠️ {saveError}
          </div>
        )}

        <div className="space-y-5">
          {/* ─── CLIENT SECTION ─── */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">👤 العميل</h2>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setClientMode('select')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${clientMode === 'select' ? 'bg-amber-500 text-black' : 'bg-[#0D1B2A] text-gray-400 hover:bg-[#111927]'}`}
              >
                اختر من الموجودين
              </button>
              <button
                onClick={() => setClientMode('new')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${clientMode === 'new' ? 'bg-amber-500 text-black' : 'bg-[#0D1B2A] text-gray-400 hover:bg-[#111927]'}`}
              >
                عميل جديد
              </button>
            </div>

            {clientMode === 'select' ? (
              <select
                value={form.client_id}
                onChange={e => updateForm('client_id', e.target.value)}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-amber-500/50"
              >
                <option value="">اختر عميل</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
                ))}
              </select>
            ) : (
              <div className="space-y-3">
                <input placeholder="اسم العميل" value={newClientName} onChange={e => setNewClientName(e.target.value)}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
                <input placeholder="رقم الهاتف" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
                <input placeholder="العنوان" value={newClientAddress} onChange={e => setNewClientAddress(e.target.value)}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
            )}
          </div>

          {/* ─── SECTOR SECTION ─── */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">🏷️ القطاع</h2>
            <select
              value={form.sector}
              onChange={e => updateForm('sector', e.target.value)}
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-amber-500/50 mb-3"
            >
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {form.sector === 'أخرى' && (
              <input placeholder="حدد القطاع" value={customSector} onChange={e => setCustomSector(e.target.value)}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
            )}
          </div>

          {/* ─── ITEMS SECTION ─── */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold text-amber-400">📦 الأصناف</h2>
              <button onClick={addItem} className="px-3 py-1 bg-amber-500 text-black rounded-lg text-sm font-bold hover:bg-amber-400 transition">
                ➕ إضافة صنف
              </button>
            </div>

            {items.length > 0 ? (
              <div className="space-y-3">
                {needProduction.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
                    ⚠️ <strong>مطلوب تصنيع:</strong> {needProduction.map(x => x.product_name).join('، ')}
                  </div>
                )}
                {needPurchase.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
                    🛑 <strong>مطلوب شراء:</strong> {needPurchase.map(x => x.product_name).join('، ')}
                  </div>
                )}

                {items.map((item, i) => {
                  const variants = item.product_name ? inventory.filter(p => p.name === item.product_name) : []
                  const isCustomDetailOpen = customDetailOpen.has(i) || !!item.custom_detail
                  return (
                    <div key={item.id ?? `new-${i}`} className="bg-[#0D1B2A] rounded-xl border border-white/5 p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">الصنف</label>
                          <select
                            value={item.product_name}
                            onChange={e => updateItem(i, 'product_name', e.target.value)}
                            className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                          >
                            <option value="">اختر صنف من المخزن</option>
                            {productNames.map(name => <option key={name} value={name}>{name}</option>)}
                          </select>
                        </div>

                        {item.product_name && (
                          <div className="col-span-2 sm:col-span-4">
                            <label className="block text-xs text-gray-600 mb-1">اللون</label>
                            <div className="flex flex-wrap gap-1.5">
                              {variants.length === 0 ? (
                                <span className="text-[11px] text-gray-600">مفيش ألوان متسجلة للمنتج ده</span>
                              ) : variants.map(p => {
                                const outOfStock = p.current_stock <= 0
                                const selected = item.inventory_id === p.id
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => selectVariant(i, p)}
                                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] transition
                                      ${selected ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-white/10 text-gray-300 hover:border-white/30'}`}
                                  >
                                    <span className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ background: colorHex(p.color, p.color_hex) }} />
                                    {p.color || 'بدون لون'}
                                    {outOfStock && <span className="text-amber-500">(المخزون 0)</span>}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-gray-600 mb-1">المقاس</label>
                          <select
                            value={item.size}
                            onChange={e => updateItem(i, 'size', e.target.value)}
                            className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                          >
                            {SIZES.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">التنفيذ</label>
                          <select
                            value={item.execution_type}
                            onChange={e => updateItem(i, 'execution_type', e.target.value)}
                            className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                          >
                            {EXECUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">الكمية</label>
                          <input type="number" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))}
                            className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">سعر الوحدة</label>
                          <input type="number" min={0} value={item.unit_price} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))}
                            className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
                        </div>
                      </div>

                      <div className="mt-3">
                        {!isCustomDetailOpen ? (
                          <button type="button" onClick={() => toggleCustomDetail(i)}
                            className="text-[11px] text-amber-400/80 border border-amber-500/20 rounded-lg px-2.5 py-1 hover:bg-amber-500/10 transition">
                            + تفصيل خاص (لون كم / لياقة / أسورة مختلف)
                          </button>
                        ) : (
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">تفصيل خاص</label>
                            <input placeholder="مثال: كم أحمر × لياقة سوداء" value={item.custom_detail} onChange={e => updateItem(i, 'custom_detail', e.target.value)}
                              className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          {item.inventory_id && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${STATUS_COLORS[item.status]}`}>{item.status}</span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${EXECUTION_COLORS[item.execution_type]}`}>{item.execution_type}</span>
                          <span className="text-xs text-amber-400 font-bold">{(item.qty * item.unit_price).toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300 text-xs transition">✕ حذف</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-6 border-2 border-dashed border-white/5 rounded-xl">
                <p className="text-sm text-gray-600">لا يوجد أصناف مرتبطة بهذا الطلب</p>
              </div>
            )}
          </div>

          {/* ─── ORDER DETAILS SECTION ─── */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">📋 تفاصيل الطلب</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.length === 0 && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">الكمية</label>
                    <input type="number" min={1} value={form.quantity} onChange={e => updateForm('quantity', e.target.value)}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">سعر الوحدة</label>
                    <input type="number" min={0} value={form.unit_price} onChange={e => updateForm('unit_price', e.target.value)}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">نوع التنفيذ</label>
                    <select value={form.execution_type} onChange={e => updateForm('execution_type', e.target.value)}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                      {EXECUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">تاريخ التسليم المتوقع *</label>
                <input type="date" value={form.expected_delivery} onChange={e => updateForm('expected_delivery', e.target.value)}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">العربون المدفوع</label>
                <input type="number" value={form.deposit_amount} onChange={e => updateForm('deposit_amount', e.target.value)} placeholder="0"
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ملاحظات</label>
                <input value={form.notes} onChange={e => updateForm('notes', e.target.value)} placeholder="ملاحظات إضافية..."
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
            </div>
          </div>

          {/* ─── FINANCIAL SUMMARY ─── */}
          {total > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">الإجمالي</span>
                  <span className="text-white font-bold">{total.toLocaleString('ar-EG')} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">العربون المدفوع</span>
                  <span className="text-green-400 font-bold">{(Number(form.deposit_amount) || 0).toLocaleString('ar-EG')} ج.م</span>
                </div>
                <div className="flex justify-between border-t border-amber-500/20 pt-2">
                  <span className="text-gray-400 font-bold">المتبقي</span>
                  <span className="text-amber-400 font-black text-base">{remaining.toLocaleString('ar-EG')} ج.م</span>
                </div>
              </div>
            </div>
          )}

          {/* ─── ACTION BUTTONS ─── */}
          <div className="flex gap-3 pb-6">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3.5 bg-amber-500 text-black font-black rounded-xl hover:bg-amber-400 transition disabled:opacity-50 text-sm">
              {saving ? 'جاري الحفظ...' : '✅ حفظ التعديلات'}
            </button>
            <button onClick={() => router.back()} className="px-6 py-3.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition text-sm">
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}