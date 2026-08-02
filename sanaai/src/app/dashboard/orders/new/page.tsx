'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ═══════════════════════════════════════════════════════════════════════════
// 📋 TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

type Client = { 
  id: string
  name: string
  phone: string 
}

type InventoryItem = { 
  id: string
  name: string
  current_stock: number
  unit: string 
}

type Tenant = {
  name: string
}

type User = {
  id: string
  tenant_id: string
  full_name: string
}

const SECTORS = ['مدارس', 'مطاعم وفنادق', 'شركات كوربوريت', 'حكومي', 'أفراد', 'أخرى']
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'فري سايز', 'مقاس خاص']
const EXECUTION_TYPES = ['طباعة', 'تطريز', 'بدون'] as const

type OrderItem = {
  inventory_id: string
  product_name: string
  size: string
  qty: number
  unit_price: number
  stock_qty: number
  status: 'متاح من المخزون' | 'مطلوب تصنيع' | 'مطلوب شراء'
  execution_type: typeof EXECUTION_TYPES[number]
}

type OrderForm = {
  client_id: string
  quantity: string
  unit_price: string
  deposit_amount: string
  expected_delivery: string
  notes: string
  sector: string
  execution_type: typeof EXECUTION_TYPES[number]
}

type SavedOrder = {
  id: string
  order_number: string
  total_amount: number
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 COLOR MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function NewOrderPage() {
  const router = useRouter()
  
  // ─────────────────────────────────────────────────────────────────────────
  // 📌 STATE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  
  // User & Tenant
  const [user, setUser] = useState<User | null>(null)
  const [tenantName, setTenantName] = useState('صُنَّاعي')
  
  // Data Lists
  const [clients, setClients] = useState<Client[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  
  // Loading States
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  
  // Form Data
  const [form, setForm] = useState<OrderForm>({
    client_id: '',
    quantity: '',
    unit_price: '',
    deposit_amount: '',
    expected_delivery: '',
    notes: '',
    sector: 'مدارس',
    execution_type: 'طباعة',
  })
  
  // Client Mode (Select vs New)
  const [clientMode, setClientMode] = useState<'select' | 'new'>('select')
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientAddress, setNewClientAddress] = useState('')
  
  // Custom Sector
  const [customSector, setCustomSector] = useState('')
  
  // Items Management
  const [items, setItems] = useState<OrderItem[]>([])
  
  // Files Management
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Invoice & Results
  const [showInvoice, setShowInvoice] = useState(false)
  const [savedOrder, setSavedOrder] = useState<SavedOrder | null>(null)
  const [copies, setCopies] = useState(1)

  // ─────────────────────────────────────────────────────────────────────────
  // 🔄 EFFECTS
  // ─────────────────────────────────────────────────────────────────────────

  // Initialize Data on Mount
  useEffect(() => {
    initializeData()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // 📡 DATA FETCHING
  // ─────────────────────────────────────────────────────────────────────────

  async function initializeData() {
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authUser) throw new Error('تعذر التحقق من الهوية')

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, tenant_id, full_name')
        .eq('id', authUser.id)
        .single()

      if (userError) throw userError
      setUser(userData as User)

      // Fetch Clients
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, name, phone')
        .eq('tenant_id', userData.tenant_id)

      if (clientsError) throw clientsError
      setClients(clientsData || [])

      // Fetch Inventory
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('inventory')
        .select('id, name, current_stock, unit')
        .eq('tenant_id', userData.tenant_id)

      if (inventoryError) throw inventoryError
      setInventory(inventoryData || [])

      // Fetch Tenant Name
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', userData.tenant_id)
        .single()

      if (tenantData?.name) setTenantName(tenantData.name)
    } catch (err: any) {
      console.error('خطأ في التهيئة:', err.message)
      alert('خطأ في تحميل البيانات. يرجى إعادة تحميل الصفحة.')
    } finally {
      setInitializing(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🛠️ HELPER FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────

  function updateForm(key: keyof OrderForm, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function addItem() {
    setItems(prev => [...prev, {
      inventory_id: '',
      product_name: '',
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

  function updateItem(index: number, key: keyof OrderItem, value: any) {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item

      const updated = { ...item, [key]: value }

      if (key === 'inventory_id') {
        const product = inventory.find(p => p.id === value)
        if (product) {
          updated.product_name = product.name
          updated.stock_qty = product.current_stock || 0
          updated.status = calculateStatus(product.current_stock, updated.qty)
        }
      }

      if (key === 'qty') {
        const product = inventory.find(p => p.id === updated.inventory_id)
        if (product) {
          updated.status = calculateStatus(product.current_stock, value)
        }
      }

      return updated
    }))
  }

  function calculateStatus(stock: number, qty: number): OrderItem['status'] {
    if (stock >= qty) return 'متاح من المخزون'
    if (stock > 0) return 'مطلوب تصنيع'
    return 'مطلوب شراء'
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files || [])])
    }
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 💾 FILE UPLOAD
  // ─────────────────────────────────────────────────────────────────────────

  async function uploadFiles(orderId: string): Promise<string[]> {
    const uploadedUrls: string[] = []

    for (const file of files) {
      try {
        const ext = file.name.split('.').pop()
        const fileName = `${Date.now()}.${ext}`
        const filePath = `${orderId}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('order-attachments')
          .upload(filePath, file)

        if (uploadError) {
          console.error('خطأ في رفع ملف:', uploadError)
          continue
        }

        const { data: publicUrlData } = supabase.storage
          .from('order-attachments')
          .getPublicUrl(filePath)

        uploadedUrls.push(publicUrlData.publicUrl)
      } catch (err) {
        console.error('خطأ في معالجة الملف:', err)
      }
    }

    return uploadedUrls
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 💰 CALCULATIONS
  // ─────────────────────────────────────────────────────────────────────────

  const effectiveSector = form.sector === 'أخرى' ? customSector : form.sector
  const itemsTotal = items.reduce((sum, item) => sum + (item.qty * item.unit_price), 0)
  const manualTotal = (Number(form.quantity) * Number(form.unit_price)) || 0
  const total = items.length > 0 ? itemsTotal : manualTotal
  const remaining = total - (Number(form.deposit_amount) || 0)
  const needProduction = items.filter(x => x.status === 'مطلوب تصنيع')
  const needPurchase = items.filter(x => x.status === 'مطلوب شراء')

  // ─────────────────────────────────────────────────────────────────────────
  // 💾 SUBMIT ORDER
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    // Validation
    if (clientMode === 'select' && !form.client_id) {
      alert('يرجى اختيار العميل')
      return
    }
    if (clientMode === 'new' && !newClientName.trim()) {
      alert('يرجى كتابة اسم العميل')
      return
    }
    if (items.length === 0 && (!form.quantity || !form.unit_price)) {
      alert('يرجى إضافة أصناف أو كمية وسعر')
      return
    }
    if (!form.expected_delivery) {
      alert('يرجى تحديد تاريخ التسليم')
      return
    }

    setLoading(true)

    try {
      if (!user) throw new Error('تعذر تحديد المستخدم')

      // Create new client if needed
      let clientId = form.client_id
      if (clientMode === 'new') {
        const { data: newClient, error: newClientError } = await supabase
          .from('clients')
          .insert({
            name: newClientName,
            phone: newClientPhone,
            address: newClientAddress,
            tenant_id: user.tenant_id,
          })
          .select('id')
          .single()

        if (newClientError) throw new Error('فشل إنشاء عميل جديد: ' + newClientError.message)
        clientId = newClient.id
      }

      // Create Order with Explicit Column Selection
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: user.tenant_id,
          client_id: clientId,
          assigned_user_id: user.id,
          quantity: items.length > 0 ? items.reduce((s, x) => s + x.qty, 0) : Number(form.quantity),
          total_amount: total,
          deposit_paid: Number(form.deposit_amount) || 0,
          expected_delivery: form.expected_delivery,
          details: form.notes,
          sector: effectiveSector,
          status: 'جديد',
          delivery_status: 'في الموعد',
        })
        .select('id, tenant_id, client_id, assigned_user_id, order_number, order_seq, details, sector, quantity, status, delivery_status, total_amount, deposit_paid, remaining_amount, order_date, expected_delivery, actual_delivery, week_number, created_at, updated_at, attachments')
        .single()

      if (orderError) throw new Error('فشل حفظ الطلب: ' + orderError.message)

      const orderId = orderData.id

      // Upload Files
      const attachmentUrls = await uploadFiles(orderId)

      // Update Order with Attachments
      if (attachmentUrls.length > 0) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({ attachments: attachmentUrls })
          .eq('id', orderId)

        if (updateError) console.error('خطأ في حفظ المرفقات:', updateError)
      }

      // Insert Order Items
      if (items.length > 0) {
        const orderItems = items.map(item => ({
          order_id: orderId,
          inventory_id: item.inventory_id || null,
          product_name: item.product_name,
          size: item.size,
          qty: item.qty,
          unit_price: item.unit_price,
          execution_type: item.execution_type,
          tenant_id: user.tenant_id,
        }))

        const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
        if (itemsError) throw new Error('فشل حفظ الأصناف: ' + itemsError.message)
      }

      // Create Production Record if Needed
      if (items.length > 0 && needProduction.length > 0) {
        const { error: prodError } = await supabase.from('production').insert({
          order_id: orderId,
          tenant_id: user.tenant_id,
          supervisor_id: user.id,
          planned_qty: needProduction.reduce((s, x) => s + x.qty, 0),
          status: 'مخطط',
        })

        if (prodError) console.error('خطأ في إنشاء سجل إنتاج:', prodError)
      }

      setSavedOrder({
        id: orderId,
        order_number: orderData.order_number,
        total_amount: orderData.total_amount,
      })
      setShowInvoice(true)
    } catch (error: any) {
      alert(`خطأ: ${error.message}`)
      console.error('خطأ في حفظ الطلب:', error)
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🎉 SUCCESS VIEW
  // ─────────────────────────────────────────────────────────────────────────

  if (showInvoice && savedOrder) {
    return (
      <div className="min-h-screen bg-[#08090A] p-4 flex items-center justify-center" dir="rtl">
        <div className="w-full max-w-2xl bg-[#111927] rounded-2xl border border-white/5 p-6 space-y-6">
          <h1 className="text-2xl font-black text-white">✅ تم إنشاء الطلب بنجاح!</h1>
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-2">
            <p className="text-green-400 text-sm font-bold">✓ رقم الطلب: <span className="text-white">{savedOrder.order_number}</span></p>
            <p className="text-green-400 text-sm font-bold">✓ الإجمالي: <span className="text-white">{savedOrder.total_amount.toLocaleString('ar-EG')} ج.م</span></p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/dashboard/orders/${savedOrder.id}`)}
              className="flex-1 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
            >
              عرض الطلب
            </button>
            <button
              onClick={() => {
                setShowInvoice(false)
                setItems([])
                setFiles([])
                setForm(f => ({ ...f, client_id: '', quantity: '', unit_price: '', deposit_amount: '' }))
                setNewClientName('')
                setNewClientPhone('')
                setNewClientAddress('')
              }}
              className="flex-1 py-3 border border-white/10 text-gray-400 rounded-lg hover:bg-white/5 transition"
            >
              طلب جديد
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 📝 MAIN FORM VIEW
  // ─────────────────────────────────────────────────────────────────────────

  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#08090A]">
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#08090A] p-4" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-black text-white mb-2">➕ طلب جديد</h1>
        <p className="text-gray-500 text-sm mb-6">إنشاء طلب إنتاجي جديد</p>

        <div className="space-y-5">
          {/* ─── CLIENT SECTION ─── */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">👤 العميل</h2>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setClientMode('select')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                  clientMode === 'select'
                    ? 'bg-amber-500 text-black'
                    : 'bg-[#0D1B2A] text-gray-400 hover:bg-[#111927]'
                }`}
              >
                اختر من الموجودين
              </button>
              <button
                onClick={() => setClientMode('new')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                  clientMode === 'new'
                    ? 'bg-amber-500 text-black'
                    : 'bg-[#0D1B2A] text-gray-400 hover:bg-[#111927]'
                }`}
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
                <input
                  placeholder="اسم العميل"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
                <input
                  placeholder="رقم الهاتف"
                  value={newClientPhone}
                  onChange={e => setNewClientPhone(e.target.value)}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
                <input
                  placeholder="العنوان"
                  value={newClientAddress}
                  onChange={e => setNewClientAddress(e.target.value)}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
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
              {SECTORS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {form.sector === 'أخرى' && (
              <input
                placeholder="حدد القطاع"
                value={customSector}
                onChange={e => setCustomSector(e.target.value)}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
              />
            )}
          </div>

          {/* ─── ITEMS SECTION ─── */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold text-amber-400">📦 الأصناف</h2>
              <button
                onClick={addItem}
                className="px-3 py-1 bg-amber-500 text-black rounded-lg text-sm font-bold hover:bg-amber-400 transition"
              >
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

                {items.map((item, i) => (
                  <div key={i} className="bg-[#0D1B2A] rounded-xl border border-white/5 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">الصنف</label>
                        <select
                          value={item.inventory_id}
                          onChange={e => updateItem(i, 'inventory_id', e.target.value)}
                          className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        >
                          <option value="">اختر صنف من المخزن</option>
                          {inventory.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">المقاس</label>
                        <select
                          value={item.size}
                          onChange={e => updateItem(i, 'size', e.target.value)}
                          className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        >
                          {SIZES.map(s => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">التنفيذ</label>
                        <select
                          value={item.execution_type}
                          onChange={e => updateItem(i, 'execution_type', e.target.value)}
                          className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        >
                          {EXECUTION_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">الكمية</label>
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={e => updateItem(i, 'qty', Number(e.target.value))}
                          className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">سعر الوحدة</label>
                        <input
                          type="number"
                          min={0}
                          value={item.unit_price}
                          onChange={e => updateItem(i, 'unit_price', Number(e.target.value))}
                          className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        {item.inventory_id && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${STATUS_COLORS[item.status]}`}>
                            {item.status}
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${EXECUTION_COLORS[item.execution_type]}`}>
                          {item.execution_type}
                        </span>
                        <span className="text-xs text-amber-400 font-bold">
                          {(item.qty * item.unit_price).toLocaleString('ar-EG')} ج.م
                        </span>
                      </div>
                      <button
                        onClick={() => removeItem(i)}
                        className="text-red-400 hover:text-red-300 text-xs transition"
                      >
                        ✕ حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border-2 border-dashed border-white/5 rounded-xl">
                <p className="text-sm text-gray-600">لم تضف أصناف بعد</p>
              </div>
            )}
          </div>

          {/* ─── ORDER DETAILS SECTION ─── */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">📋 تفاصيل الطلب</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.length === 0 && (
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">نوع التنفيذ</label>
                  <select
                    value={form.execution_type}
                    onChange={e => updateForm('execution_type', e.target.value)}
                    className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  >
                    {EXECUTION_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">تاريخ التسليم المتوقع *</label>
                <input
                  type="date"
                  value={form.expected_delivery}
                  onChange={e => updateForm('expected_delivery', e.target.value)}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">العربون</label>
                <input
                  type="number"
                  value={form.deposit_amount}
                  onChange={e => updateForm('deposit_amount', e.target.value)}
                  placeholder="0"
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ملاحظات</label>
                <input
                  value={form.notes}
                  onChange={e => updateForm('notes', e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          </div>

          {/* ─── ATTACHMENTS SECTION ─── */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">📎 المرفقات (صور / ملفات تصميم)</h2>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-white/10 rounded-xl text-sm text-gray-400 hover:border-amber-500/40 hover:text-amber-400 transition"
            >
              ⬆️ اختر ملفات لرفعها
            </button>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-[#0D1B2A] rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-300 truncate">{f.name}</span>
                    <button
                      onClick={() => removeFile(i)}
                      className="text-red-400 hover:text-red-300 shrink-0 ms-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── FINANCIAL SUMMARY ─── */}
          {total > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">الإجمالي</span>
                  <span className="text-white font-bold">{total.toLocaleString('ar-EG')} ج.م</span>
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
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-3.5 bg-amber-500 text-black font-black rounded-xl hover:bg-amber-400 transition disabled:opacity-50 text-sm"
            >
              {loading ? 'جاري الحفظ...' : '✅ حفظ الطلب'}
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-3.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition text-sm"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}