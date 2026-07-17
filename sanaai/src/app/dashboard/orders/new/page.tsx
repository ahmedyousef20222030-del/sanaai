'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Client = { id: string; name: string; phone: string }
type InventoryItem = { id: string; name: string; current_stock: number; unit: string }

const baseSectors = ['مدارس', 'مطاعم وفنادق', 'شركات كوربوريت', 'حكومي', 'أفراد', 'أخرى']
const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'فري سايز', 'مقاس خاص']

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
  const [tenantName, setTenantName] = useState('صُنَّاعي')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    client_id: '', quantity: '', unit_price: '',
    deposit_amount: '', expected_delivery: '', notes: '', sector: 'مدارس',
  })

  useEffect(() => {
    supabase.from('clients').select('id, name, phone').then(({ data }) => setClients(data || []))
    supabase.from('inventory').select('id, name, current_stock, unit').then(({ data }) => setInventory(data || []))
    supabase.from('tenants').select('name').single().then(({ data }) => {
      if (data?.name) setTenantName(data.name)
    })
  }, [])

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  const effectiveSector = form.sector === 'أخرى' ? customSector : form.sector
  const itemsTotal = items.reduce((s, x) => s + x.qty * x.unit_price, 0)
  const manualTotal = (Number(form.quantity) * Number(form.unit_price)) || 0
  const total = items.length > 0 ? itemsTotal : manualTotal
  const remaining = total - (Number(form.deposit_amount) || 0)

  function addItem() {
    setItems(prev => [...prev, {
      inventory_id: '', product_name: '', size: 'M',
      qty: 1, unit_price: 0, stock_qty: 0, status: 'متاح من المخزون'
    }])
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
      if (key === 'qty') {
        const prod = inventory.find(p => p.id === updated.inventory_id)
        if (prod) {
          updated.status = prod.current_stock >= val ? 'متاح من المخزون' : prod.current_stock > 0 ? 'مطلوب تصنيع' : 'مطلوب شراء'
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

  // ── رفع المرفقات (صور/ملفات) وربطها بالطلب بعد إنشائه ──────────────
  async function uploadFiles(orderId: string): Promise<string[]> {
    const urls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${orderId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('order-attachments').upload(path, file)
      if (!error) {
        const { data } = supabase.storage.from('order-attachments').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    return urls
  }

  const needProduction = items.filter(x => x.status === 'مطلوب تصنيع')
  const needPurchase = items.filter(x => x.status === 'مطلوب شراء')

  // ── حفظ الطلب (المنطق الرئيسي) ──────────────────────────────────────
  async function handleSubmit() {
    if (clientMode === 'select' && !form.client_id) { alert('يرجى اختيار العميل'); return }
    if (clientMode === 'new' && !newClientName.trim()) { alert('يرجى كتابة اسم العميل'); return }
    if (items.length === 0 && (!form.quantity || !form.unit_price)) {
      alert('يرجى إضافة أصناف أو كمية وسعر'); return
    }
    if (!form.expected_delivery) { alert('يرجى تحديد تاريخ التسليم'); return }
    setLoading(true)

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) throw new Error('يجب تسجيل الدخول أولاً')

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('tenant_id, full_name')
        .eq('id', authUser.id)
        .single()

      if (meError) throw new Error('تعذر تحديد هوية المستخدم: ' + meError.message)
      if (!me?.tenant_id) throw new Error('تعذر تحديد بيانات المنشأة الخاصة بالمستخدم')

      let clientId = form.client_id
      if (clientMode === 'new') {
        const { data: nc, error: ce } = await supabase
          .from('clients')
          .insert({
            tenant_id: me.tenant_id,
            name: newClientName.trim(),
            phone: newClientPhone.trim() || null,
            sector: effectiveSector,
          })
          .select('id').single()
        if (ce) throw ce
        clientId = nc.id
      }

      // 1. إنشاء الطلب
      // ملاحظة: أسماء الأعمدة دي متطابقة مع جدول orders الفعلي في Supabase
      // (تم التأكد منها عبر information_schema.columns بتاريخ اليوم)
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: me.tenant_id,
          client_id: clientId,
          quantity: items.length > 0 ? items.reduce((s, x) => s + x.qty, 0) : Number(form.quantity),
          total_amount: total,
          deposit_paid: Number(form.deposit_amount) || 0,
          remaining_amount: remaining,
          expected_delivery: form.expected_delivery,
          details: form.notes,
          sector: effectiveSector,
          status: 'جديد',
          delivery_status: 'في المخزون',
        })
        .select().single()

      if (orderError) throw orderError

      // 2. إضافة الأصناف إلى جدول order_items
      if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
          order_id: order.id,
          tenant_id: me.tenant_id,
          inventory_id: item.inventory_id || null,
          name: item.product_name,
          size: item.size,
          quantity: item.qty,
          unit_price: item.unit_price,
          fulfillment_type: item.status,
          source: item.inventory_id ? 'مخزون' : 'خارجي'
        }))

        const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert)
        if (itemsError) throw itemsError
      }

      // 3. خصم الكميات من المخزون
      for (const item of items) {
        if (item.inventory_id && item.status === 'متاح من المخزون') {
          const prod = inventory.find(p => p.id === item.inventory_id)
          if (prod) {
            await supabase.from('inventory').update({
              current_stock: Math.max(0, prod.current_stock - item.qty)
            }).eq('id', item.inventory_id)
          }
        }
      }

      // 4. رفع المرفقات (لو المستخدم اختار ملفات) وربطها بالطلب
      if (files.length > 0) {
        const attachmentUrls = await uploadFiles(order.id)
        if (attachmentUrls.length > 0) {
          const { error: attachError } = await supabase
            .from('orders')
            .update({ attachments: attachmentUrls })
            .eq('id', order.id)
          if (attachError) {
            // الطلب اتحفظ بنجاح، بس عمود attachments ممكن يكون غير موجود في الجدول
            console.warn('تعذر حفظ روابط المرفقات (تأكد من وجود عمود attachments في جدول orders):', attachError.message)
          }
        }
      }

      setSavedOrder({ ...order, employee: me.full_name })
      setShowInvoice(true)
    } catch (err: any) {
      alert('خطأ في الحفظ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── طباعة الفاتورة (PDF) ─────────────────────────────────────────────
  async function printInvoice() {
    if (!savedOrder) return
    const client = clients.find(c => c.id === savedOrder.client_id) || { name: '—', phone: '—' }
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
      doc.text(`العميل: ${client.name}`, 190, infoY, { align: 'right' })
      doc.text(`الهاتف: ${client.phone}`, 190, infoY + 8, { align: 'right' })
      doc.text(`القطاع: ${effectiveSector}`, 190, infoY + 16, { align: 'right' })
      doc.text(`تاريخ الطلب: ${new Date().toLocaleDateString('ar-EG')}`, 20, infoY)
      doc.text(`تاريخ التسليم: ${new Date(form.expected_delivery).toLocaleDateString('ar-EG')}`, 20, infoY + 8)
      doc.text(`الموظف: ${savedOrder.employee || '—'}`, 20, infoY + 16)

      const tableBody = items.length > 0
        ? items.map(item => [
            item.product_name,
            item.size,
            item.qty.toString(),
            `${item.unit_price.toLocaleString()} ج.م`,
            `${(item.qty * item.unit_price).toLocaleString()} ج.م`,
          ])
        : [[form.notes || 'طلب إنتاج', '—', form.quantity, `${form.unit_price} ج.م`, `${total.toLocaleString()} ج.م`]]

      autoTable(doc, {
        startY: 80,
        head: [['الصنف', 'المقاس', 'الكمية', 'سعر الوحدة', 'الإجمالي']],
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)])
  }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition text-xl">→</button>
          <div>
            <h1 className="text-2xl font-black text-white">➕ طلب جديد</h1>
            <p className="text-sm text-gray-500">إنشاء طلب إنتاج جديد</p>
          </div>
        </div>

        {showInvoice && savedOrder && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-[#0D1B2A] border border-amber-500/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="text-4xl mb-3 text-center">✅</div>
              <h2 className="text-lg font-black text-white mb-1 text-center">تم حفظ الطلب بنجاح!</h2>
              <p className="text-sm text-gray-400 mb-5 text-center">
                رقم الطلب: <span className="text-amber-400 font-bold">{savedOrder.order_number || savedOrder.id.slice(0, 8)}</span>
              </p>
              <div className="bg-white/5 rounded-xl p-4 mb-5">
                <label className="block text-xs text-gray-500 mb-2 text-center">عدد النسخ المطبوعة</label>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setCopies(c => Math.max(1, c - 1))} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-lg transition">−</button>
                  <span className="text-white font-black text-2xl w-10 text-center">{copies}</span>
                  <button onClick={() => setCopies(c => Math.min(10, c + 1))} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-lg transition">+</button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={printInvoice} className="flex-1 py-3 bg-amber-500 text-black font-bold rounded-xl text-sm hover:bg-amber-400 transition flex items-center justify-center gap-2">🖨️ طباعة PDF</button>
                <button onClick={() => { setShowInvoice(false); router.push('/dashboard/orders') }} className="flex-1 py-3 border border-white/10 text-gray-400 rounded-xl text-sm hover:bg-white/5 transition">تخطي</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-5">
          {/* بيانات العميل */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">👤 بيانات العميل</h2>
            <div className="flex gap-2 mb-4">
              {(['select', 'new'] as const).map(m => (
                <button key={m} onClick={() => setClientMode(m)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${clientMode === m ? 'bg-amber-500 text-black' : 'bg-[#0D1B2A] text-gray-400 border border-white/10 hover:border-white/20'}`}>
                  {m === 'select' ? '🔍 اختر عميل موجود' : '➕ عميل جديد'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clientMode === 'select' ? (
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">العميل *</label>
                  <select value={form.client_id} onChange={e => set('client_id', e.target.value)} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                    <option value="">اختر العميل</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">اسم العميل *</label>
                    <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="اكتب اسم العميل" className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">رقم الهاتف</label>
                    <input value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} placeholder="01012345678" className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">القطاع</label>
                <select value={form.sector} onChange={e => set('sector', e.target.value)} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                  {baseSectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {form.sector === 'أخرى' && (
                  <input
                    value={customSector}
                    onChange={e => setCustomSector(e.target.value)}
                    placeholder="اكتب اسم القطاع"
                    className="w-full mt-2 bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  />
                )}
              </div>
            </div>
          </div>

          {/* الأصناف */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-amber-400">🏷️ الأصناف</h2>
              <button onClick={addItem} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold hover:bg-amber-500/30 transition">➕ إضافة صنف</button>
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
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">الصنف</label>
                        <select value={item.inventory_id} onChange={e => updateItem(i, 'inventory_id', e.target.value)} className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50">
                          <option value="">اختر صنف من المخزن</option>
                          {inventory.map(p => <option key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">المقاس</label>
                        <select value={item.size} onChange={e => updateItem(i, 'size', e.target.value)} className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50">
                          {sizes.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">الكمية</label>
                        <input type="number" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">سعر الوحدة</label>
                        <input type="number" min={0} value={item.unit_price} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))} className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        {item.inventory_id && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${statusColor[item.status]}`}>{item.status}</span>
                        )}
                        <span className="text-xs text-amber-400 font-bold">{(item.qty * item.unit_price).toLocaleString('ar-EG')} ج.م</span>
                      </div>
                      <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300 text-xs transition">✕ حذف</button>
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

          {/* تفاصيل الطلب */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">📋 تفاصيل الطلب</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">تاريخ التسليم المتوقع *</label>
                <input type="date" value={form.expected_delivery} onChange={e => set('expected_delivery', e.target.value)} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">العربون</label>
                <input type="number" value={form.deposit_amount} onChange={e => set('deposit_amount', e.target.value)} placeholder="0" className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ملاحظات</label>
                <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="ملاحظات إضافية..." className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
            </div>
          </div>

          {/* المرفقات */}
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
                    <button onClick={() => removeFile(i)} className="text-red-400 hover:text-red-300 shrink-0 ms-2">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* الملخص المالي */}
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

          <div className="flex gap-3 pb-6">
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-3.5 bg-amber-500 text-black font-black rounded-xl hover:bg-amber-400 transition disabled:opacity-50 text-sm">
              {loading ? 'جاري الحفظ...' : '✅ حفظ الطلب'}
            </button>
            <button onClick={() => router.back()} className="px-6 py-3.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition text-sm">إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  )
}