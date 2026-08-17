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
  color: string | null
  color_hex: string | null
  selling_price: number
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
  client_name: string
  client_phone: string
  employee_name: string
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

// نفس قايمة الألوان المستخدمة في شاشة المخزون، عشان الدوائر اللونية تتطابق
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

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// Supabase Postgres unique_violation error code
const UNIQUE_VIOLATION_CODE = '23505'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  const [customDetailOpen, setCustomDetailOpen] = useState<Set<number>>(new Set())

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
      if (!userData?.tenant_id) throw new Error('تعذر تحديد بيانات المنشأة الخاصة بالمستخدم')
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
        .select('id, name, current_stock, unit, color, color_hex, selling_price')
        .eq('tenant_id', userData.tenant_id)

      if (inventoryError) throw inventoryError
      setInventory(inventoryData || [])

      // Fetch Tenant Name
      const { data: tenantData } = await supabase
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

  function calculateStatus(stock: number, qty: number): OrderItem['status'] {
    if (stock >= qty) return 'متاح من المخزون'
    if (stock > 0) return 'مطلوب تصنيع'
    return 'مطلوب شراء'
  }

  function updateItem(index: number, key: keyof OrderItem, value: any) {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item

      const updated = { ...item, [key]: value }

      // اختيار اسم منتج جديد يصفّر اللون المختار قبل كده، عشان السيلز
      // يختار من ألوان المنتج الجديد مش المنتج القديم
      if (key === 'product_name') {
        updated.inventory_id = ''
        updated.color = ''
        updated.color_hex = null
        updated.stock_qty = 0
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

  // اختيار لون معيّن (صف مخزون بعينه) بعد ما السيلز يكون اختار اسم المنتج
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
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
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
  const productNames = Array.from(new Set(inventory.map(p => p.name))).sort((a, b) => a.localeCompare(b, 'ar'))
  const itemsTotal = items.reduce((sum, item) => sum + (item.qty * item.unit_price), 0)
  const manualTotal = (Number(form.quantity) * Number(form.unit_price)) || 0
  const total = items.length > 0 ? itemsTotal : manualTotal
  const remaining = total - (Number(form.deposit_amount) || 0)
  const needProduction = items.filter(x => x.status === 'مطلوب تصنيع')
  const needPurchase = items.filter(x => x.status === 'مطلوب شراء')

  // ─────────────────────────────────────────────────────────────────────────
  // 💾 SUBMIT ORDER
  // ─────────────────────────────────────────────────────────────────────────

  // Inserts the order row. Retries automatically if the database's
  // auto-generated order_number collides with an existing one
  // (Postgres unique_violation / code 23505). The order_number itself
  // is generated server-side (default/trigger on the `orders` table),
  // so a fresh insert attempt typically produces a new value.
  async function insertOrderWithRetry(orderPayload: Record<string, any>, maxAttempts = 3) {
    let lastError: any = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data, error } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id, tenant_id, client_id, assigned_user_id, order_number, order_seq, details, sector, quantity, status, delivery_status, total_amount, deposit_paid, remaining_amount, order_date, expected_delivery, actual_delivery, week_number, created_at, updated_at, attachments')
        .single()

      if (!error) return { data, error: null }

      lastError = error
      const isDuplicateOrderNumber =
        error.code === UNIQUE_VIOLATION_CODE &&
        (error.message?.includes('order_number') || error.details?.includes('order_number'))

      if (!isDuplicateOrderNumber) break

      // Brief backoff before retrying, so a possible concurrent insert has time to finish
      await sleep(150 * attempt)
    }

    return { data: null, error: lastError }
  }

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
    const missingColor = items.find(x => x.product_name && !x.inventory_id)
    if (missingColor) {
      alert(`يرجى اختيار لون لصنف "${missingColor.product_name}"`)
      return
    }
    if (!form.expected_delivery) {
      alert('يرجى تحديد تاريخ التسليم')
      return
    }

    setLoading(true)

    try {
      if (!user) throw new Error('تعذر تحديد المستخدم')

      // Resolve client (create if needed) and keep a local snapshot
      // for the invoice, since a freshly-created client may not be
      // in the `clients` list yet.
      let clientId = form.client_id
      let clientNameSnapshot = clients.find(c => c.id === form.client_id)?.name || '—'
      let clientPhoneSnapshot = clients.find(c => c.id === form.client_id)?.phone || '—'

      if (clientMode === 'new') {
        const { data: newClient, error: newClientError } = await supabase
          .from('clients')
          .insert({
            name: newClientName.trim(),
            phone: newClientPhone.trim() || null,
            address: newClientAddress.trim() || null,
            sector: effectiveSector,
            tenant_id: user.tenant_id,
          })
          .select('id, name, phone')
          .single()

        if (newClientError) throw new Error('فشل إنشاء عميل جديد: ' + newClientError.message)
        clientId = newClient.id
        clientNameSnapshot = newClient.name
        clientPhoneSnapshot = newClient.phone || '—'
      }

      // Create Order (order_number is generated by the database itself)
      const { data: orderData, error: orderError } = await insertOrderWithRetry({
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
        execution_type: items.length === 0 ? form.execution_type : null,
      })

      if (orderError) {
        const isDuplicateOrderNumber =
          orderError.code === UNIQUE_VIOLATION_CODE &&
          (orderError.message?.includes('order_number') || orderError.details?.includes('order_number'))

        if (isDuplicateOrderNumber) {
          throw new Error(
            'تعذر توليد رقم طلب فريد بعد عدة محاولات. يرجى المحاولة مرة أخرى، وإذا تكررت المشكلة يرجى مراجعة إعداد ترقيم الطلبات في قاعدة البيانات.'
          )
        }
        throw new Error('فشل حفظ الطلب: ' + orderError.message)
      }
      if (!orderData) throw new Error('لم يتم استلام بيانات الطلب بعد الحفظ')

      const orderId = orderData.id

      // Upload Files
      let attachmentUrls: string[] = []
      if (files.length > 0) {
        attachmentUrls = await uploadFiles(orderId)
        if (attachmentUrls.length > 0) {
          const { error: updateError } = await supabase
            .from('orders')
            .update({ attachments: attachmentUrls })
            .eq('id', orderId)

          if (updateError) console.error('خطأ في حفظ المرفقات:', updateError)
        }
      }

      // Insert Order Items
      // NOTE: column names below (name, quantity, fulfillment_type, source)
      // must match the actual `order_items` table in Supabase.
      // Verify with: select column_name from information_schema.columns
      // where table_name = 'order_items';
      if (items.length > 0) {
        const orderItems = items.map(item => ({
          order_id: orderId,
          tenant_id: user.tenant_id,
          inventory_id: item.inventory_id || null,
          name: item.product_name,
          color: item.color || null,
          custom_detail: item.custom_detail || null,
          size: item.size,
          quantity: item.qty,
          unit_price: item.unit_price,
          fulfillment_type: item.status,
          execution_type: item.execution_type,
          source: item.inventory_id ? 'مخزون' : 'خارجي',
        }))

        const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
        if (itemsError) throw new Error('فشل حفظ الأصناف: ' + itemsError.message)
      }

      // Deduct Stock for Items Fulfilled from Inventory
      for (const item of items) {
        if (item.inventory_id && item.status === 'متاح من المخزون') {
          const product = inventory.find(p => p.id === item.inventory_id)
          if (product) {
            const { error: stockError } = await supabase
              .from('inventory')
              .update({ current_stock: Math.max(0, product.current_stock - item.qty) })
              .eq('id', item.inventory_id)

            if (stockError) console.error('خطأ في تحديث المخزون:', stockError)
          }
        }
      }

      // Create Production Record if Needed
      if (needProduction.length > 0) {
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
        client_name: clientNameSnapshot,
        client_phone: clientPhoneSnapshot,
        employee_name: user.full_name || '—',
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
  // 🖨️ PDF INVOICE
  // ─────────────────────────────────────────────────────────────────────────

  async function printInvoice() {
    if (!savedOrder) return
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    for (let copy = 0; copy < copies; copy++) {
      if (copy > 0) doc.addPage()

      doc.setFont('helvetica', 'bold')
      doc.setFillColor(13, 27, 42)
      doc.rect(0, 0, 210, 40, 'F')
      doc.setTextColor(200, 150, 62)
      doc.setFontSize(20)
      doc.text(tenantName, 105, 15, { align: 'center' })
      doc.setTextColor(180, 180, 180)
      doc.setFontSize(10)
      doc.text('فاتورة طلب إنتاج', 105, 25, { align: 'center' })
      doc.text(`رقم الطلب: ${savedOrder.order_number || savedOrder.id.slice(0, 8)}`, 105, 33, { align: 'center' })

      doc.setTextColor(50, 50, 50)
      doc.setFontSize(11)
      const infoY = 50
      doc.text(`العميل: ${savedOrder.client_name}`, 190, infoY, { align: 'right' })
      doc.text(`الهاتف: ${savedOrder.client_phone}`, 190, infoY + 8, { align: 'right' })
      doc.text(`القطاع: ${effectiveSector}`, 190, infoY + 16, { align: 'right' })
      doc.text(`تاريخ الطلب: ${new Date().toLocaleDateString('ar-EG')}`, 20, infoY)
      doc.text(`تاريخ التسليم: ${new Date(form.expected_delivery).toLocaleDateString('ar-EG')}`, 20, infoY + 8)
      doc.text(`الموظف: ${savedOrder.employee_name}`, 20, infoY + 16)

      const tableBody = items.length > 0
        ? items.map(item => [
            [item.product_name, item.color].filter(Boolean).join(' - ') || '—',
            item.custom_detail || '—',
            item.size,
            item.execution_type,
            item.qty.toString(),
            `${item.unit_price.toLocaleString()} ج.م`,
            `${(item.qty * item.unit_price).toLocaleString()} ج.م`,
          ])
        : [[
            form.notes || 'طلب إنتاج',
            '—',
            '—',
            form.execution_type,
            form.quantity,
            `${form.unit_price} ج.م`,
            `${total.toLocaleString()} ج.م`,
          ]]

      autoTable(doc, {
        startY: 80,
        head: [['الصنف', 'تفصيل خاص', 'المقاس', 'التنفيذ', 'الكمية', 'سعر الوحدة', 'الإجمالي']],
        body: tableBody,
        styles: { halign: 'center', fontSize: 10, font: 'helvetica' },
        headStyles: { fillColor: [13, 27, 42], textColor: [200, 150, 62] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { left: 14, right: 14 },
      })

      const finalY = (doc as any).lastAutoTable.finalY + 10
      doc.setFillColor(245, 245, 245)
      doc.rect(120, finalY, 76, 38, 'F')
      doc.setTextColor(50, 50, 50)
      doc.setFontSize(11)
      doc.text(`الإجمالي: ${total.toLocaleString()} ج.م`, 192, finalY + 9, { align: 'right' })
      doc.text(`العربون: ${Number(form.deposit_amount || 0).toLocaleString()} ج.م`, 192, finalY + 19, { align: 'right' })
      doc.setDrawColor(200, 150, 62)
      doc.line(122, finalY + 24, 194, finalY + 24)
      doc.setTextColor(200, 150, 62)
      doc.setFontSize(13)
      doc.text(`المتبقي: ${remaining.toLocaleString()} ج.م`, 192, finalY + 33, { align: 'right' })

      if (form.notes) {
        doc.setTextColor(100, 100, 100)
        doc.setFontSize(10)
        doc.text(`ملاحظات: ${form.notes}`, 20, finalY + 50)
      }

      doc.setFillColor(13, 27, 42)
      doc.rect(0, 277, 210, 20, 'F')
      doc.setTextColor(180, 180, 180)
      doc.setFontSize(9)
      doc.text(`${tenantName} — نسخة ${copy + 1} من ${copies}`, 105, 287, { align: 'center' })
    }

    doc.save(`فاتورة-${savedOrder.order_number || savedOrder.id.slice(0, 8)}.pdf`)
  }

  function startNewOrder() {
    setShowInvoice(false)
    setSavedOrder(null)
    setItems([])
    setFiles([])
    setForm(f => ({ ...f, client_id: '', quantity: '', unit_price: '', deposit_amount: '', notes: '' }))
    setClientMode('select')
    setNewClientName('')
    setNewClientPhone('')
    setNewClientAddress('')
    setCopies(1)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ⏳ LOADING VIEW
  // ─────────────────────────────────────────────────────────────────────────

  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#08090A]">
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 📝 MAIN FORM VIEW
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#08090A] p-4" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition text-xl">→</button>
          <div>
            <h1 className="text-3xl font-black text-white">➕ طلب جديد</h1>
            <p className="text-gray-500 text-sm">إنشاء طلب إنتاجي جديد</p>
          </div>
        </div>

        {/* ─── SUCCESS MODAL ─── */}
        {showInvoice && savedOrder && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-[#0D1B2A] border border-amber-500/20 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="text-4xl mb-3 text-center">✅</div>
              <h2 className="text-lg font-black text-white mb-1 text-center">تم حفظ الطلب بنجاح!</h2>
              <p className="text-sm text-gray-400 mb-5 text-center">
                رقم الطلب: <span className="text-amber-400 font-bold">{savedOrder.order_number || savedOrder.id.slice(0, 8)}</span>
              </p>

              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4 space-y-1">
                <p className="text-green-400 text-sm font-bold">
                  الإجمالي: <span className="text-white">{savedOrder.total_amount.toLocaleString('ar-EG')} ج.م</span>
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 mb-5">
                <label className="block text-xs text-gray-500 mb-2 text-center">عدد النسخ المطبوعة</label>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setCopies(c => Math.max(1, c - 1))} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-lg transition">−</button>
                  <span className="text-white font-black text-2xl w-10 text-center">{copies}</span>
                  <button onClick={() => setCopies(c => Math.min(10, c + 1))} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-lg transition">+</button>
                </div>
              </div>

              <div className="flex gap-3 mb-3">
                <button
                  onClick={printInvoice}
                  className="flex-1 py-3 bg-amber-500 text-black font-bold rounded-xl text-sm hover:bg-amber-400 transition flex items-center justify-center gap-2"
                >
                  🖨️ طباعة PDF
                </button>
                <button
                  onClick={() => router.push(`/dashboard/orders/${savedOrder.id}`)}
                  className="flex-1 py-3 border border-white/10 text-gray-300 rounded-xl text-sm hover:bg-white/5 transition"
                >
                  عرض الطلب
                </button>
              </div>
              <button
                onClick={startNewOrder}
                className="w-full py-2.5 text-gray-500 text-sm hover:text-gray-300 transition"
              >
                + إنشاء طلب جديد
              </button>
            </div>
          </div>
        )}

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

                {items.map((item, i) => {
                  const variants = item.product_name ? inventory.filter(p => p.name === item.product_name) : []
                  const isCustomDetailOpen = customDetailOpen.has(i) || !!item.custom_detail
                  return (
                  <div key={i} className="bg-[#0D1B2A] rounded-xl border border-white/5 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">الصنف</label>
                        <select
                          value={item.product_name}
                          onChange={e => updateItem(i, 'product_name', e.target.value)}
                          className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        >
                          <option value="">اختر صنف من المخزن</option>
                          {productNames.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
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
                                  <span
                                    className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                                    style={{ background: colorHex(p.color, p.color_hex) }}
                                  />
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

                    <div className="mt-3">
                      {!isCustomDetailOpen ? (
                        <button
                          type="button"
                          onClick={() => toggleCustomDetail(i)}
                          className="text-[11px] text-amber-400/80 border border-amber-500/20 rounded-lg px-2.5 py-1 hover:bg-amber-500/10 transition"
                        >
                          + تفصيل خاص (لون كم / لياقة / أسورة مختلف)
                        </button>
                      ) : (
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">تفصيل خاص</label>
                          <input
                            placeholder="مثال: كم أحمر × لياقة سوداء"
                            value={item.custom_detail}
                            onChange={e => updateItem(i, 'custom_detail', e.target.value)}
                            className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                          />
                        </div>
                      )}
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
                )})}
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