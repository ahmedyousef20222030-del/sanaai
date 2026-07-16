'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Γ£à ╪¬╪¡╪»┘è╪½ ╪º┘ä╪ú┘å┘ê╪º╪╣ ┘ä╪¬╪╖╪º╪¿┘é ╪º┘ä╪│┘â┘è┘à╪º v1.1
type Client  = { id: string; name: string; phone: string }
type InventoryItem = { id: string; name: string; current_stock: number; unit: string }

const baseSectors = ['┘à╪»╪º╪▒╪│', '┘à╪╖╪º╪╣┘à ┘ê┘ü┘å╪º╪»┘é', '╪┤╪▒┘â╪º╪¬ ┘â┘ê╪▒╪¿┘ê╪▒┘è╪¬', '╪¡┘â┘ê┘à┘è', '╪ú┘ü╪▒╪º╪»', '╪ú╪«╪▒┘ë']
const sizes = ['XS','S','M','L','XL','XXL','XXXL','┘ü╪▒┘è ╪│╪º┘è╪▓','┘à┘é╪º╪│ ╪«╪º╪╡']

type OrderItem = {
  inventory_id: string // Γ£à ╪¬╪║┘è┘è╪▒ ┘à┘å product_id ╪Ñ┘ä┘ë inventory_id
  product_name: string
  size: string
  qty: number
  unit_price: number
  stock_qty: number
  status: '┘à╪¬╪º╪¡ ┘à┘å ╪º┘ä┘à╪«╪▓┘ê┘å' | '┘à╪╖┘ä┘ê╪¿ ╪¬╪╡┘å┘è╪╣' | '┘à╪╖┘ä┘ê╪¿ ╪┤╪▒╪º╪í' // Γ£à ╪¬╪╖╪º╪¿┘é ┘à╪╣ fulfillment_type
}

export default function NewOrderPage() {
  const router = useRouter()
  const [clients, setClients]   = useState<Client[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([]) // Γ£à ╪¬╪║┘è┘è╪▒ ╪º┘ä╪º╪│┘à
  const [loading, setLoading]   = useState(false)
  const [files, setFiles]       = useState<File[]>([])
  const [clientMode, setClientMode] = useState<'select' | 'new'>('select')
  const [newClientName, setNewClientName]   = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [customSector, setCustomSector]     = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [showInvoice, setShowInvoice] = useState(false)
  const [copies, setCopies]           = useState(1)
  const [savedOrder, setSavedOrder]   = useState<any>(null)
  const [tenantName, setTenantName]   = useState('╪╡┘Ä┘å┘Ä╪º╪╣┘è')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    client_id: '', quantity: '', unit_price: '',
    deposit_amount: '', expected_delivery: '', notes: '', sector: '┘à╪»╪º╪▒╪│',
  })

  useEffect(() => {
    // Γ£à ╪¼┘ä╪¿ ╪º┘ä╪¿┘è╪º┘å╪º╪¬ ┘à┘å ╪º┘ä╪¼╪»╪º┘ê┘ä ╪º┘ä╪╡╪¡┘è╪¡╪⌐
    supabase.from('clients').select('id, name, phone').then(({ data }) => setClients(data || []))
    supabase.from('inventory').select('id, name, current_stock, unit').then(({ data }) => setInventory(data || []))
    supabase.from('tenants').select('name').single().then(({ data }) => {
      if (data?.name) setTenantName(data.name)
    })
  }, [])

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  const effectiveSector = form.sector === '╪ú╪«╪▒┘ë' ? customSector : form.sector
  const itemsTotal = items.reduce((s, x) => s + x.qty * x.unit_price, 0)
  const manualTotal = (Number(form.quantity) * Number(form.unit_price)) || 0
  const total = items.length > 0 ? itemsTotal : manualTotal
  const remaining = total - (Number(form.deposit_amount) || 0)

  function addItem() {
    setItems(prev => [...prev, {
      inventory_id: '', product_name: '', size: 'M',
      qty: 1, unit_price: 0, stock_qty: 0, status: '┘à╪¬╪º╪¡ ┘à┘å ╪º┘ä┘à╪«╪▓┘ê┘å'
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
          // Γ£à ╪¬╪¡╪»┘è╪½ ┘à┘å╪╖┘é ╪º┘ä┘é╪▒╪º╪▒ ╪¿┘å╪º╪í┘ï ╪╣┘ä┘ë ╪º┘ä┘à╪«╪▓┘ê┘å
          updated.status = prod.current_stock >= updated.qty ? '┘à╪¬╪º╪¡ ┘à┘å ╪º┘ä┘à╪«╪▓┘ê┘å' : prod.current_stock > 0 ? '┘à╪╖┘ä┘ê╪¿ ╪¬╪╡┘å┘è╪╣' : '┘à╪╖┘ä┘ê╪¿ ╪┤╪▒╪º╪í'
        }
      }
      if (key === 'qty') {
        const prod = inventory.find(p => p.id === updated.inventory_id)
        if (prod) {
          updated.status = prod.current_stock >= val ? '┘à╪¬╪º╪¡ ┘à┘å ╪º┘ä┘à╪«╪▓┘ê┘å' : prod.current_stock > 0 ? '┘à╪╖┘ä┘ê╪¿ ╪¬╪╡┘å┘è╪╣' : '┘à╪╖┘ä┘ê╪¿ ╪┤╪▒╪º╪í'
        }
      }
      return updated
    }))
  }

  const statusColor: Record<string, string> = {
    '┘à╪¬╪º╪¡ ┘à┘å ╪º┘ä┘à╪«╪▓┘ê┘å': 'bg-green-500/20 text-green-400 border-green-500/30',
    '┘à╪╖┘ä┘ê╪¿ ╪¬╪╡┘å┘è╪╣':    'bg-amber-500/20 text-amber-400 border-amber-500/30',
    '┘à╪╖┘ä┘ê╪¿ ╪┤╪▒╪º╪í':     'bg-red-500/20 text-red-400 border-red-500/30',
  }

  // ΓöÇΓöÇ ╪¡┘ü╪╕ ╪º┘ä╪╖┘ä╪¿ (╪º┘ä┘à┘å╪╖┘é ╪º┘ä┘à╪¡╪»╪½ v1.1) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  async function handleSubmit() {
    if (clientMode === 'select' && !form.client_id) { alert('┘è╪▒╪¼┘ë ╪º╪«╪¬┘è╪º╪▒ ╪º┘ä╪╣┘à┘è┘ä'); return }
    if (clientMode === 'new' && !newClientName.trim()) { alert('┘è╪▒╪¼┘ë ┘â╪¬╪º╪¿╪⌐ ╪º╪│┘à ╪º┘ä╪╣┘à┘è┘ä'); return }
    if (items.length === 0 && (!form.quantity || !form.unit_price)) {
      alert('┘è╪▒╪¼┘ë ╪Ñ╪╢╪º┘ü╪⌐ ╪ú╪╡┘å╪º┘ü ╪ú┘ê ┘â┘à┘è╪⌐ ┘ê╪│╪╣╪▒'); return
    }
    if (!form.expected_delivery) { alert('┘è╪▒╪¼┘ë ╪¬╪¡╪»┘è╪» ╪¬╪º╪▒┘è╪« ╪º┘ä╪¬╪│┘ä┘è┘à'); return }
    setLoading(true)

    try {
      const { data: me } = await supabase.from('users').select('tenant_id, full_name').single()
      if (!me) throw new Error('╪¬╪╣╪░╪▒ ╪¬╪¡╪»┘è╪» ┘ç┘ê┘è╪⌐ ╪º┘ä┘à╪│╪¬╪«╪»┘à')

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

      // 1. ╪Ñ┘å╪┤╪º╪í ╪º┘ä╪╖┘ä╪¿ ╪º┘ä╪▒╪ª┘è╪│┘è (╪º╪│╪¬╪«╪»╪º┘à ┘à╪│┘à┘è╪º╪¬ v1.1)
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        tenant_id: me.tenant_id,
        client_id: clientId,
        quantity: items.length > 0 ? items.reduce((s, x) => s + x.qty, 0) : Number(form.quantity),
        total_price: total, // Γ£à ╪¬╪╡╪¡┘è╪¡
        deposit_paid: Number(form.deposit_amount) || 0, // Γ£à ╪¬╪╡╪¡┘è╪¡
        expected_delivery: form.expected_delivery,
        notes: form.notes,
        sector: effectiveSector,
        status: '╪¼╪»┘è╪»',
        delivery_status: '┘ü┘è ╪º┘ä┘à┘ê╪╣╪»',
      }).select().single()

      if (orderError) throw orderError

      // 2. ╪Ñ╪╢╪º┘ü╪⌐ ╪º┘ä╪ú╪╡┘å╪º┘ü ╪Ñ┘ä┘ë ╪¼╪»┘ê┘ä order_items (╪¿╪»┘ä╪º┘ï ┘à┘å JSON)
      if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
          order_id: order.id,
          tenant_id: me.tenant_id,
          inventory_id: item.inventory_id || null,
          name: item.product_name,
          size: item.size,
          quantity: item.qty,
          unit_price: item.unit_price,
          fulfillment_type: item.status, // Γ£à ╪¡┘ü╪╕ ┘é╪▒╪º╪▒ ┘à╪»┘è╪▒ ╪º┘ä╪¬┘å┘ü┘è╪░
          source: item.inventory_id ? '┘à╪«╪▓┘ê┘å' : '╪«╪º╪▒╪¼┘è'
        }))

        const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert)
        if (itemsError) throw itemsError
      }

      // 3. ╪«╪╡┘à ╪º┘ä┘â┘à┘è╪º╪¬ ┘à┘å ╪º┘ä┘à╪«╪▓┘ê┘å (Inventory)
      for (const item of items) {
        if (item.inventory_id && item.status === '┘à╪¬╪º╪¡ ┘à┘å ╪º┘ä┘à╪«╪▓┘ê┘å') {
          const prod = inventory.find(p => p.id === item.inventory_id)
          if (prod) {
            await supabase.from('inventory').update({
              current_stock: Math.max(0, prod.current_stock - item.qty)
            }).eq('id', item.inventory_id)
          }
        }
      }

      setSavedOrder({ ...order, employee: me.full_name })
      setShowInvoice(true)
    } catch (err: any) {
      alert('╪«╪╖╪ú ┘ü┘è ╪º┘ä╪¡┘ü╪╕: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ΓöÇΓöÇ ╪¿┘é┘è╪⌐ ╪º┘ä╪»┘ê╪º┘ä (PDF, Files) ╪¬╪¿┘é┘ë ┘â┘à╪º ┘ç┘è ┘à╪╣ ╪¬╪╣╪»┘è┘ä ┘à╪│┘à┘è╪º╪¬ ╪º┘ä╪¡┘é┘ê┘ä ΓöÇΓöÇ
  async function printInvoice() {
    if (!savedOrder) return
    const client = clients.find(c => c.id === savedOrder.client_id) || { name: 'ΓÇö', phone: 'ΓÇö' }
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
      doc.text('┘ü╪º╪¬┘ê╪▒╪⌐ ╪╖┘ä╪¿ ╪Ñ┘å╪¬╪º╪¼', 105, 25, { align: 'center' })
      doc.text(`╪▒┘é┘à ╪º┘ä╪╖┘ä╪¿: ${savedOrder.order_number || savedOrder.id.slice(0, 8)}`, 105, 33, { align: 'center' })

      doc.setTextColor(50, 50, 50)
      doc.setFontSize(11)
      const infoY = 50
      doc.text(`╪º┘ä╪╣┘à┘è┘ä: ${client.name}`, 190, infoY, { align: 'right' })
      doc.text(`╪º┘ä┘ç╪º╪¬┘ü: ${client.phone}`, 190, infoY + 8, { align: 'right' })
      doc.text(`╪º┘ä┘é╪╖╪º╪╣: ${effectiveSector}`, 190, infoY + 16, { align: 'right' })
      doc.text(`╪¬╪º╪▒┘è╪« ╪º┘ä╪╖┘ä╪¿: ${new Date().toLocaleDateString('ar-EG')}`, 20, infoY)
      doc.text(`╪¬╪º╪▒┘è╪« ╪º┘ä╪¬╪│┘ä┘è┘à: ${new Date(form.expected_delivery).toLocaleDateString('ar-EG')}`, 20, infoY + 8)
      doc.text(`╪º┘ä┘à┘ê╪╕┘ü: ${savedOrder.employee || 'ΓÇö'}`, 20, infoY + 16)

      const tableBody = items.length > 0
        ? items.map(item => [
            item.product_name,
            item.size,
            item.qty.toString(),
            `${item.unit_price.toLocaleString()} ╪¼.┘à`,
            `${(item.qty * item.unit_price).toLocaleString()} ╪¼.┘à`,
          ])
        : [[form.notes || '╪╖┘ä╪¿ ╪Ñ┘å╪¬╪º╪¼', 'ΓÇö', form.quantity, `${form.unit_price} ╪¼.┘à`, `${total.toLocaleString()} ╪¼.┘à`]]

      autoTable(doc, {
        startY: 80,
        head: [['╪º┘ä╪╡┘å┘ü', '╪º┘ä┘à┘é╪º╪│', '╪º┘ä┘â┘à┘è╪⌐', '╪│╪╣╪▒ ╪º┘ä┘ê╪¡╪»╪⌐', '╪º┘ä╪Ñ╪¼┘à╪º┘ä┘è']],
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
      doc.text(`╪º┘ä╪Ñ╪¼┘à╪º┘ä┘è: ${total.toLocaleString()} ╪¼.┘à`, 192, finalY + 9, { align: 'right' })
      doc.text(`╪º┘ä╪╣╪▒╪¿┘ê┘å: ${Number(form.deposit_amount || 0).toLocaleString()} ╪¼.┘à`, 192, finalY + 19, { align: 'right' })
      doc.setDrawColor(200, 150, 62)
      doc.line(122, finalY + 24, 194, finalY + 24)
      doc.setTextColor(200, 150, 62)
      doc.setFontSize(13)
      doc.text(`╪º┘ä┘à╪¬╪¿┘é┘è: ${remaining.toLocaleString()} ╪¼.┘à`, 192, finalY + 33, { align: 'right' })

      if (form.notes) {
        doc.setTextColor(100, 100, 100)
        doc.setFontSize(10)
        doc.text(`┘à┘ä╪º╪¡╪╕╪º╪¬: ${form.notes}`, 20, finalY + 50)
      }

      doc.setFillColor(13, 27, 42)
      doc.rect(0, 277, 210, 20, 'F')
      doc.setTextColor(180, 180, 180)
      doc.setFontSize(9)
      doc.text(`${tenantName} ΓÇö ┘å╪│╪«╪⌐ ${copy + 1} ┘à┘å ${copies}`, 105, 287, { align: 'center' })
    }
    doc.save(`┘ü╪º╪¬┘ê╪▒╪⌐-${savedOrder.order_number || savedOrder.id.slice(0, 8)}.pdf`)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)])
  }

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

  const needProduction = items.filter(x => x.status === '┘à╪╖┘ä┘ê╪¿ ╪¬╪╡┘å┘è╪╣')
  const needPurchase   = items.filter(x => x.status === '┘à╪╖┘ä┘ê╪¿ ╪┤╪▒╪º╪í')

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition text-xl">ΓåÉ</button>
          <div>
            <h1 className="text-2xl font-black text-white">Γ₧ò ╪╖┘ä╪¿ ╪¼╪»┘è╪»</h1>
            <p className="text-sm text-gray-500">╪Ñ┘å╪┤╪º╪í ╪╖┘ä╪¿ ╪Ñ┘å╪¬╪º╪¼ ╪¼╪»┘è╪»</p>
          </div>
        </div>

        {showInvoice && savedOrder && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-[#0D1B2A] border border-amber-500/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="text-4xl mb-3 text-center">Γ£à</div>
              <h2 className="text-lg font-black text-white mb-1 text-center">╪¬┘à ╪¡┘ü╪╕ ╪º┘ä╪╖┘ä╪¿ ╪¿┘å╪¼╪º╪¡!</h2>
              <p className="text-sm text-gray-400 mb-5 text-center">
                ╪▒┘é┘à ╪º┘ä╪╖┘ä╪¿: <span className="text-amber-400 font-bold">{savedOrder.order_number || savedOrder.id.slice(0, 8)}</span>
              </p>
              <div className="bg-white/5 rounded-xl p-4 mb-5">
                <label className="block text-xs text-gray-500 mb-2 text-center">╪╣╪»╪» ╪º┘ä┘å╪│╪« ╪º┘ä┘à╪╖╪¿┘ê╪╣╪⌐</label>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setCopies(c => Math.max(1, c - 1))} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-lg transition">ΓêÆ</button>
                  <span className="text-white font-black text-2xl w-10 text-center">{copies}</span>
                  <button onClick={() => setCopies(c => Math.min(10, c + 1))} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-lg transition">+</button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={printInvoice} className="flex-1 py-3 bg-amber-500 text-black font-bold rounded-xl text-sm hover:bg-amber-400 transition flex items-center justify-center gap-2">≡ƒû¿∩╕Å ╪╖╪¿╪º╪╣╪⌐ PDF</button>
                <button onClick={() => { setShowInvoice(false); router.push('/dashboard/orders') }} className="flex-1 py-3 border border-white/10 text-gray-400 rounded-xl text-sm hover:bg-white/5 transition">╪¬╪«╪╖┘è</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-5">
          {/* ≡ƒæñ ╪¿┘è╪º┘å╪º╪¬ ╪º┘ä╪╣┘à┘è┘ä */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">≡ƒæñ ╪¿┘è╪º┘å╪º╪¬ ╪º┘ä╪╣┘à┘è┘ä</h2>
            <div className="flex gap-2 mb-4">
              {(['select', 'new'] as const).map(m => (
                <button key={m} onClick={() => setClientMode(m)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${clientMode === m ? 'bg-amber-500 text-black' : 'bg-[#0D1B2A] text-gray-400 border border-white/10 hover:border-white/20'}`}>
                  {m === 'select' ? '≡ƒöì ╪º╪«╪¬╪▒ ╪╣┘à┘è┘ä ┘à┘ê╪¼┘ê╪»' : 'Γ₧ò ╪╣┘à┘è┘ä ╪¼╪»┘è╪»'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clientMode === 'select' ? (
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">╪º┘ä╪╣┘à┘è┘ä *</label>
                  <select value={form.client_id} onChange={e => set('client_id', e.target.value)} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                    <option value="">╪º╪«╪¬╪▒ ╪º┘ä╪╣┘à┘è┘ä</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">╪º╪│┘à ╪º┘ä╪╣┘à┘è┘ä *</label>
                    <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="╪º┘â╪¬╪¿ ╪º╪│┘à ╪º┘ä╪╣┘à┘è┘ä" className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">╪▒┘é┘à ╪º┘ä┘ç╪º╪¬┘ü</label>
                    <input value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} placeholder="01012345678" className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">╪º┘ä┘é╪╖╪º╪╣</label>
                <select value={form.sector} onChange={e => set('sector', e.target.value)} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                  {baseSectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ≡ƒÅ╖∩╕Å ╪º┘ä╪ú╪╡┘å╪º┘ü */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-amber-400">≡ƒÅ╖∩╕Å ╪º┘ä╪ú╪╡┘å╪º┘ü</h2>
              <button onClick={addItem} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold hover:bg-amber-500/30 transition">Γ₧ò ╪Ñ╪╢╪º┘ü╪⌐ ╪╡┘å┘ü</button>
            </div>

            {items.length > 0 ? (
              <div className="space-y-3">
                {needProduction.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
                    ΓÜá∩╕Å <strong>┘à╪╖┘ä┘ê╪¿ ╪¬╪╡┘å┘è╪╣:</strong> {needProduction.map(x => x.product_name).join('╪î ')}
                  </div>
                )}
                {needPurchase.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
                    ≡ƒ¢Æ <strong>┘à╪╖┘ä┘ê╪¿ ╪┤╪▒╪º╪í:</strong> {needPurchase.map(x => x.product_name).join('╪î ')}
                  </div>
                )}

                {items.map((item, i) => (
                  <div key={i} className="bg-[#0D1B2A] rounded-xl border border-white/5 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">╪º┘ä╪╡┘å┘ü</label>
                        <select value={item.inventory_id} onChange={e => updateItem(i, 'inventory_id', e.target.value)} className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50">
                          <option value="">╪º╪«╪¬╪▒ ╪╡┘å┘ü ┘à┘å ╪º┘ä┘à╪«╪▓┘å</option>
                          {inventory.map(p => <option key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">╪º┘ä┘à┘é╪º╪│</label>
                        <select value={item.size} onChange={e => updateItem(i, 'size', e.target.value)} className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50">
                          {sizes.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">╪º┘ä┘â┘à┘è╪⌐</label>
                        <input type="number" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">╪│╪╣╪▒ ╪º┘ä┘ê╪¡╪»╪⌐</label>
                        <input type="number" min={0} value={item.unit_price} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))} className="w-full bg-[#111927] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        {item.inventory_id && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${statusColor[item.status]}`}>{item.status}</span>
                        )}
                        <span className="text-xs text-amber-400 font-bold">{(item.qty * item.unit_price).toLocaleString('ar-EG')} ╪¼.┘à</span>
                      </div>
                      <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300 text-xs transition">Γ£ò ╪¡╪░┘ü</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border-2 border-dashed border-white/5 rounded-xl">
                <p className="text-sm text-gray-600">┘ä┘à ╪¬╪╢┘ü ╪ú╪╡┘å╪º┘ü ╪¿╪╣╪»</p>
              </div>
            )}
          </div>

          {/* ≡ƒôª ╪¬┘ü╪º╪╡┘è┘ä ╪º┘ä╪╖┘ä╪¿ */}
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h2 className="text-sm font-bold text-amber-400 mb-4">≡ƒôª ╪¬┘ü╪º╪╡┘è┘ä ╪º┘ä╪╖┘ä╪¿</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">╪¬╪º╪▒┘è╪« ╪º┘ä╪¬╪│┘ä┘è┘à ╪º┘ä┘à╪¬┘ê┘é╪╣ *</label>
                <input type="date" value={form.expected_delivery} onChange={e => set('expected_delivery', e.target.value)} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">╪º┘ä╪╣╪▒╪¿┘ê┘å</label>
                <input type="number" value={form.deposit_amount} onChange={e => set('deposit_amount', e.target.value)} placeholder="0" className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">┘à┘ä╪º╪¡╪╕╪º╪¬</label>
                <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="┘à┘ä╪º╪¡╪╕╪º╪¬ ╪Ñ╪╢╪º┘ü┘è╪⌐..." className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
            </div>
          </div>

          {/* ≡ƒÆ░ ╪º┘ä┘à┘ä╪«╪╡ ╪º┘ä┘à╪º┘ä┘è */}
          {total > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">╪º┘ä╪Ñ╪¼┘à╪º┘ä┘è</span>
                  <span className="text-white font-bold">{total.toLocaleString('ar-EG')} ╪¼.┘à</span>
                </div>
                <div className="flex justify-between border-t border-amber-500/20 pt-2">
                  <span className="text-gray-400 font-bold">╪º┘ä┘à╪¬╪¿┘é┘è</span>
                  <span className="text-amber-400 font-black text-base">{remaining.toLocaleString('ar-EG')} ╪¼.┘à</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pb-6">
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-3.5 bg-amber-500 text-black font-black rounded-xl hover:bg-amber-400 transition disabled:opacity-50 text-sm">
              {loading ? '╪¼╪º╪▒┘è ╪º┘ä╪¡┘ü╪╕...' : 'Γ£à ╪¡┘ü╪╕ ╪º┘ä╪╖┘ä╪¿'}
            </button>
            <button onClick={() => router.back()} className="px-6 py-3.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition text-sm">╪Ñ┘ä╪║╪º╪í</button>
          </div>
        </div>
      </div>
    </div>
  )
}
