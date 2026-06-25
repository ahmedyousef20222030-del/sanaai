'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Client = { id: string; name: string; phone: string }
type InventoryItem = { id: string; name: string; current_stock: number; unit: string }

const baseSectors = ['مدارس', 'مطاعم وفنادق', 'شركات كوربوريت', 'حكومي', 'أفراد', 'أخرى']
const sizes = ['XS','S','M','L','XL','XXL','XXXL','فري سايز','مقاس خاص']

type OrderItem = {
  inventory_id: string
  product_name: string
  size: string
  qty: number
  unit_price: number
  stock_qty: number
  status: 'متاح من المخزون' | 'مطلوب تصنيع' | 'مطلوب شراء'
}

export default function NewOrderPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [clientMode, setClientMode] = useState<'select' | 'new'>('select')
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [customSector, setCustomSector] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [showInvoice, setShowInvoice] = useState(false)
  const [copies, setCopies] = useState(1)
  const [savedOrder, setSavedOrder] = useState<any>(null)
  const [tenantName, setTenantName] = useState('صَنَاعي')

  const [form, setForm] = useState({
    client_id: '', quantity: '', unit_price: '',
    deposit_amount: '', expected_delivery: '', notes: '', sector: 'مدارس',
  })

  useEffect(() => {
    supabase.from('clients').select('id, name, phone').then(({ data }) => setClients(data || []))
    supabase.from('inventory').select('id, name, current_stock, unit').then(({ data }) => setInventory(data || []))
    supabase.from('tenants').select('name').single().then(({ data }) => { if (data?.name) setTenantName(data.name) })
  }, [])

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  const effectiveSector = form.sector === 'أخرى' ? customSector : form.sector
  const itemsTotal = items.reduce((s, x) => s + x.qty * x.unit_price, 0)
  const manualTotal = (Number(form.quantity) * Number(//form.unit_price)) || 0
  const total = items.length > 0 ? itemsTotal : manualTotal
  const remaining = total - (Number(form.deposit_amount) || 0)

  function addItem() {
    setItems(prev => [...prev, { inventory_id: '', product_name: '', size: 'M', qty: 1, unit_price: 0, stock_qty: 0, status: 'متاح من المخزون' }])
  }

  function removeItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }

  function updateItem(i: number, key: keyof OrderItem, val: any) {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [key]: val }
      if (key === 'inventory_id') {
        const prod = inventory.find(p => p.id === val)
        if (prod) {
          updated.product_name = prod.name
          updated.stock_qty = prod.current_stock || 0
          updated.status = prod.current_stock >= updated.qty ? 'متاح من المخزون' : prod.current_stock > 0 ? 'مطلوب تصنيع' : 'مطلوب شراء'
        }
      }
      return updated
    }))
  }

  const statusColor: Record<string, string> = {
    'متاح من المخزون': 'bg-green-500/20 text-green-400 border-green-500/30',
    'مطلوب تصنيع': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'مطلوب شراء': 'bg-red-500/20 text-red-400 border-red-500/30',
  }

  // ✅ وظيفة رفع المرفقات (لوجو، مقاسات، ألوان)
  async function uploadAttachments(orderId: string): Promise<string[]> {
    const urls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `attachments/${orderId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('order-attachments').upload(path, file)
      if (!error) {
        const { data } = supabase.storage.from('order-attachments').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    return urls
  }

  async function handleSubmit() {
    if (clientMode === 'select' && !form.client_id) { alert('يرجى اختيار العميل'); return }
    if (clientMode === 'new' && !newClientName.trim()) { alert('يرجى كتابة اسم العميل'); return }
    if (items.length === 0 && (!form.quantity || !form.unit_price)) { alert('يرجى إضافة أصناف'); return }
    if (!//form.expected_delivery) { alert('يرجى تحديد تاريخ التسليم'); return }
    setLoading(true)

    try {
      const { data: me } = await supabase.from('users').select('tenant_id, full_name').single()
      if (!me) throw new Error('تعذر تحديد هوية المستخدم')

      let clientId = form.client_id
      if (clientMode === 'new') {
        const { data: nc, error: ce } = await supabase.from('clients').insert({
          tenant_id: me.tenant_id, name: newClientName.trim(), phone: newClientPhone.trim() || null, sector: effectiveSector,
        }).select('id').single()
        if (ce) throw ce
        clientId = nc.id
      }

      // 1. رفع المرفقات أولاً
      const attachmentUrls = await uploadAttachments(crypto.randomUUID())

      // 2. إنشاء الطلب (مطابق للسكيما v1.1)
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        tenant_id: me.tenant_id,
        client_id: clientId,
        quantity: items.length > 0 ? items.reduce((s, x) => s + x.qty, 0) : Number(form.quantity),
        total_amount: total, // ✅ تصحيح
        deposit_paid: Number(form.deposit_amount) || 0, // ✅ تصحيح
        expected_delivery: form.expected_//delivery,
        notes: form.notes,
        sector: effectiveSector,
        status: 'جديد',
        attachments: attachmentUrls, // ✅ حفظ روابط الصور
      }).select().single()

      if (orderError) throw orderError

      // 3. إضافة الأصناف
      if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
          order_id: order.id,
          tenant_id: me.tenant_id,
          inventory_id: item.inventory_id || null,
          name: item.product_//name,
          size: item.size,
          quantity: item.qty,
          unit_price: item.unit_price,
          fulfillment_type: item.status,
          source: item.inventory_id ? 'مخزون' : 'خارجي'
        }))
        const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert)
        if (itemsError) throw itemsError
      }

      setSavedOrder({ ...order, employee: me.full_name })
      setShowInvoice(true)
    } catch (err: any) {
      alert('خطأ في الحفظ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function printInvoice() {
    if (!savedOrder) return
    const client = clients.find(c => c.id === savedOrder.client_id) || { name: '—', phone: '—' }
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    for (let copy = 0; copy < copies; copy++) {
      if (copy > 0) doc.addPage()
      doc.setFillColor(13, 27, 42); doc.rect(0, 0, 210, 40, 'F')
      doc.setTextColor(200, 150, 62); doc.setFontSize(20); doc.text(tenantName, 105, 15, { align: 'center' })
      doc.setTextColor(180, 180, 180); doc.setFontSize(10); doc.text('فاتورة طلب إنتاج', 105, 25, { align: 'center' })
      doc.text(`رقم الطلب: ${savedOrder.order_number || savedOrder.id.slice(0, 8)}`, 105, 33, { align: 'center' })

      doc.setTextColor(50, 50, 50); doc.setFontSize(11)
      doc.text(`العميل: ${client.name}`, 190, 50, { align: 'right' })
      doc.text(`تاريخ التسليم: ${new Date(form.expected_delivery).toLocaleDateString('ar-EG')}`, 20, 58)

      const tableBody = items.length > 0 
        ? items.map(item => [item.product_name, item.size, item.qty.toString(), `${item.unit_price} ج.م`, `${(item.qty * item.//unit_price)} ج.م`])
        : [[form.notes || 'طلب إنتاج', '—', form.quantity, `${form.unit_price} ج.م`, `${total} ج.م`]]

      autoTable(doc, {
        startY: 80,
        head: [['الصنف', 'المقاس', 'الكمية', 'سعر الوحدة', 'الإجمالي']],
        body: tableBody,
        headStyles: { fillColor: [13, 27, 42], textColor: [200, 150, 62] },
      })

      const finalY = (doc as any).lastAutoTable.finalY + 10
      doc.text(`الإجمالي: ${total.toLocaleString()} ج.م`, 192, finalY + 9, { align: 'right' })
      doc.text(`العربون: ${Number(form.deposit_amount || 0).toLocaleString()} ج.م`, 192, finalY + 19, { align: 'right' })
      doc.text(`المتبقي: ${remaining.toLocaleString()} ج.م`, 192, finalY + 33, { align: 'right' })
    }
    doc.save(`invoice.pdf`)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)])
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition text-xl">←</button>
          <div><h1 className="text-2xl font-black text-white">➕ طلب جديد</h1><p className="text-sm text-gray-500">إنشاء طلب إنتاج جديد</p></div>
        </div>

        {showInvoice && savedOrder && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-[#0D1B2A] border border-amber-500/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
              <div className="text-4xl mb-3">✅</div>
              <h2 className="text-lg font-black text-white mb-1">تم حفظ الطلب بنجاح!</h2>
              <p className="text-sm text-gray-400 mb-5">رقم الطلب: {savedOrder.order_number}</p>
              <div className="flex gap-3">
                <button onClick={printInvoice} className="flex-1 py-3 bg-amber-500 text-black font-bold rounded-xl text-sm">🖨️ طباعة PDF</button>
                <button onClick={() => { setShowInvoice(false); router.push('/dashboard/orders') }} className="flex-1 py-3 border border-white/10 text-gray-400 rounded-xl text-sm">تخطي</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-5">
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">👤 بيانات العميل</h2>
            <div className="flex gap-2 mb-4">
              {(['select', 'new'] as const).map(m => (
                <button key={m} onClick={() => setClientMode(m)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${clientMode === m ? 'bg-amber-500 text-black' : 'bg-[#0D1B2A] text-gray-400 border border-white/10'}`}>{m === 'select' ? '🔍 اختر عميل' : '➕ عميل جديد'}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clientMode === 'select' ? (
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">العميل *</label>
                  <select value={//form.client_id} onChange={e => set('client_id', e.target.value)} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50">
                    <option value="">اختر العميل</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <>
                  <div><label className="block text-xs text-gray-500 mb-1">اسم العميل *</label><input value={newClientName} onChange={e => setNewClientName(e.target.value)} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">رقم الهاتف</label><input value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none" /></div>
                </>
              )}
            </div>
          </div>

          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-amber-400">🏷️ الأصناف</h2>
              <button onClick={addItem} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold">➕ إضافة صنف</button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="bg-[#0D1B2A] rounded-xl border border-white/5 p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                    <div className="sm:col-span-2">
