'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Item = {
  id: string; name: string; sku: string | null; category: string | null;
  section: string | null; size: string | null; color: string | null;
  color_hex: string | null;
  custom_detail: string | null; image_url: string | null;
  unit: string; current_stock: number; selling_price: number; min_stock: number;
}

// ألوان جاهزة عشان التجميع يبقى متسق - لو اللون مش في القايمة، اختار "لون آخر"
// وحدد لونه بالظبط من منتقي الألوان، وهيتسجل ويتعرض صح برضو
const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'أسود', hex: '#1a1a1a' },
  { name: 'أبيض', hex: '#eeeeee' },
  { name: 'أحمر', hex: '#c62828' },
  { name: 'أزرق', hex: '#1565c0' },
  { name: 'أصفر', hex: '#f5c400' },
  { name: 'بيج', hex: '#e3d2b3' },
  { name: 'رمادي', hex: '#5b5b5b' },
  { name: 'أخضر', hex: '#2e7d32' },
  { name: 'كحلي', hex: '#0d1b3e' },
  { name: 'بني', hex: '#6d4c31' },
  { name: 'فوشيا', hex: '#e4007c' },
  { name: 'وردي', hex: '#f48fb1' },
  { name: 'بنفسجي', hex: '#6a1b9a' },
  { name: 'موف', hex: '#b39ddb' },
  { name: 'برتقالي', hex: '#fb8c00' },
  { name: 'فضي', hex: '#c0c0c0' },
  { name: 'ذهبي', hex: '#d4af37' },
  { name: 'تركواز', hex: '#26c6da' },
  { name: 'فيروزي', hex: '#40e0d0' },
  { name: 'عنابي', hex: '#7b1f1f' },
  { name: 'خمري', hex: '#800020' },
  { name: 'زيتي', hex: '#808000' },
  { name: 'سماوي', hex: '#87ceeb' },
  { name: 'كريمي', hex: '#fff3d6' },
  { name: 'نحاسي', hex: '#b87333' },
  { name: 'بترولي', hex: '#0f4c5c' },
]

// بياخد لون العنصر: لو له لون مخصص محدد بالضبط (color_hex) يستخدمه،
// وإلا يدور على اسمه في القايمة الجاهزة، وإلا رمادي افتراضي
function colorHex(name: string | null, customHex?: string | null) {
  if (customHex) return customHex
  return COLOR_PRESETS.find(c => c.name === name)?.hex || '#888888'
}

type FormMode = 'add' | 'addColor' | 'edit'

const EMPTY_FORM = {
  name: '', sku: '', category: '', section: 'يونيفورم',
  size: '', color: '', customColor: '', customColorHex: '#888888', custom_detail: '', image_url: '',
  unit: 'قطعة', current_stock: '', selling_price: '', min_stock: '',
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('add')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('inventory').select('*').order('name', { ascending: true })
    if (error) {
      alert('خطأ في تحميل المخزون: ' + error.message)
      setLoading(false)
      return
    }
    setItems(data || [])
    setLoading(false)
  }

  function openAddForm() {
    setForm(EMPTY_FORM)
    setFormMode('add')
    setEditingId(null)
    setShowForm(true)
  }

  function openAddColorForm(groupName: string, sampleImage: string | null) {
    setForm({ ...EMPTY_FORM, name: groupName, image_url: sampleImage || '' })
    setFormMode('addColor')
    setEditingId(null)
    setShowForm(true)
  }

  function openEditForm(item: Item) {
    const isPreset = COLOR_PRESETS.some(c => c.name === item.color)
    setForm({
      name: item.name,
      sku: item.sku || '',
      category: item.category || '',
      section: item.section || 'يونيفورم',
      size: item.size || '',
      color: item.color ? (isPreset ? item.color : '__custom__') : '',
      customColor: item.color && !isPreset ? item.color : '',
      customColorHex: item.color_hex || '#888888',
      custom_detail: item.custom_detail || '',
      image_url: item.image_url || '',
      unit: item.unit || 'قطعة',
      current_stock: String(item.current_stock ?? ''),
      selling_price: String(item.selling_price ?? ''),
      min_stock: String(item.min_stock ?? ''),
    })
    setFormMode('edit')
    setEditingId(item.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setForm(EMPTY_FORM)
    setFormMode('add')
    setEditingId(null)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.current_stock) { alert('يرجى ملء اسم المنتج والكمية'); return }

    const stock = Number(form.current_stock)
    const price = Number(form.selling_price) || 0
    const minStock = Number(form.min_stock) || 0

    if (stock < 0 || price < 0 || minStock < 0) {
      alert('لا يمكن أن تكون القيم سالبة')
      return
    }

    const finalColor = form.color === '__custom__' ? form.customColor.trim() : form.color
    const finalColorHex = form.color === '__custom__' ? form.customColorHex : null

    setSaving(true)
    try {
      if (formMode === 'edit' && editingId) {
        const { error } = await supabase.from('inventory').update({
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          category: form.category.trim() || null,
          section: form.section,
          size: form.size || null,
          color: finalColor || null,
          color_hex: finalColorHex,
          custom_detail: form.custom_detail.trim() || null,
          image_url: form.image_url.trim() || null,
          unit: form.unit,
          current_stock: stock,
          selling_price: price,
          min_stock: minStock,
        }).eq('id', editingId)
        if (error) throw error
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('يجب تسجيل الدخول أولاً')

        const { data: me, error: meErr } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .single()

        if (meErr || !me?.tenant_id) throw new Error('تعذر تحديد بيانات المنشأة')

        // ملاحظة: اسم الصنف هنا هو اسم المنتج الأساسي بدون اللون (مثال: "تيشيرت نص كم")
        // واللون بيتسجل في عموده الخاص، عشان التجميع في الجدول يشتغل صح
        const { error } = await supabase.from('inventory').insert({
          tenant_id: me.tenant_id,
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          category: form.category.trim() || null,
          section: form.section,
          size: form.size || null,
          color: finalColor || null,
          color_hex: finalColorHex,
          custom_detail: form.custom_detail.trim() || null,
          image_url: form.image_url.trim() || null,
          unit: form.unit,
          current_stock: stock,
          selling_price: price,
          min_stock: minStock,
        })
        if (error) throw error
      }

      closeForm()
      load()
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateQuantity(id: string, newQty: number) {
    if (newQty < 0) return
    const prevItems = items
    setItems(v => v.map(x => x.id === id ? { ...x, current_stock: newQty } : x))

    const { error } = await supabase.from('inventory').update({ current_stock: newQty }).eq('id', id)
    if (error) {
      setItems(prevItems)
      alert('تعذر تحديث الكمية: ' + error.message)
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الصنف؟')) return
    setDeletingId(id)
    const { error } = await supabase.from('inventory').delete().eq('id', id)
    setDeletingId(null)
    if (error) { alert('خطأ في الحذف: ' + error.message); return }
    setItems(v => v.filter(x => x.id !== id))
  }

  const lowStock = items.filter(i => i.current_stock <= i.min_stock)

  // تجميع الأصناف حسب اسم المنتج الأساسي، وكل لون بيبقى صف فرعي جواه
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    let filtered = q ? items.filter(i => i.name.toLowerCase().includes(q)) : items

    const map = new Map<string, Item[]>()
    filtered.forEach(i => {
      const key = i.name.trim()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(i)
    })

    let result = Array.from(map.entries()).map(([name, variants]) => ({
      name,
      variants,
      totalStock: variants.reduce((s, v) => s + v.current_stock, 0),
      hasLowStock: variants.some(v => v.current_stock <= v.min_stock),
      image: variants.find(v => v.image_url)?.image_url || null,
    }))

    if (lowStockOnly) result = result.filter(g => g.hasLowStock)

    // المنتجات اللي فيها مخزون منخفض تطلع فوق، وبعدين ترتيب أبجدي
    result.sort((a, b) => {
      if (a.hasLowStock !== b.hasLowStock) return a.hasLowStock ? -1 : 1
      return a.name.localeCompare(b.name, 'ar')
    })

    return result
  }, [items, search, lowStockOnly])

  function toggleGroup(name: string) {
    setOpenGroups(v => ({ ...v, [name]: !v[name] }))
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">📦 إدارة المخزون</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} صنف مسجل في المخزن · {groups.length} منتج</p>
        </div>
        <button onClick={openAddForm} className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20">
          ➕ إضافة صنف جديد
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 animate-pulse">
          <h3 className="text-sm font-bold text-red-400 mb-2">⚠️ تنبيه: أصناف وصلت للحد الأدنى ({lowStock.length})</h3>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => (
              <span key={i.id} className="text-xs bg-red-500/20 text-red-300 px-3 py-1 rounded-full border border-red-500/20">
                {i.name} {i.color ? `(${i.color})` : ''} — {i.current_stock} {i.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="ابحث عن منتج..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 bg-[#111927] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
        />
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={e => setLowStockOnly(e.target.checked)}
            className="accent-amber-500"
          />
          اظهار المخزون المنخفض فقط
        </label>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={closeForm}>
          <div className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-2xl w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-amber-400 mb-4">
              {formMode === 'edit' ? '✏️ تعديل الصنف' : formMode === 'addColor' ? `🎨 إضافة لون جديد لـ "${form.name}"` : '➕ إضافة صنف للمخزن'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="item-name" className="block text-xs text-gray-500 mb-1">اسم المنتج الأساسي (بدون اللون) *</label>
                <input
                  id="item-name"
                  placeholder="مثال: تيشيرت نص كم"
                  value={form.name}
                  disabled={formMode === 'addColor'}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="item-sku" className="block text-xs text-gray-500 mb-1">SKU</label>
                <input
                  id="item-sku"
                  value={form.sku}
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>
              <div>
                <label htmlFor="item-section" className="block text-xs text-gray-500 mb-1">القسم</label>
                <select
                  id="item-section"
                  value={form.section}
                  onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                >
                  {['رجالي', 'حريمي', 'أطفال', 'يونيفورم', 'أخرى'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="item-size" className="block text-xs text-gray-500 mb-1">المقاس</label>
                <input
                  id="item-size"
                  value={form.size}
                  onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>
              <div>
                <label htmlFor="item-color" className="block text-xs text-gray-500 mb-1">اللون</label>
                <div className="flex items-center gap-2">
                  {form.color && (
                    <span
                      className="w-6 h-6 rounded-full border border-white/20 shrink-0"
                      style={{ background: form.color === '__custom__' ? form.customColorHex : colorHex(form.color) }}
                    />
                  )}
                  <select
                    id="item-color"
                    value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                  >
                    <option value="">اختر لون</option>
                    {COLOR_PRESETS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    <option value="__custom__">لون آخر...</option>
                  </select>
                </div>
                {form.color === '__custom__' && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="color"
                      value={form.customColorHex}
                      onChange={e => setForm(f => ({ ...f, customColorHex: e.target.value }))}
                      className="w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                      aria-label="حدد لون الصنف بالضبط"
                    />
                    <input
                      placeholder="اكتب اسم اللون"
                      value={form.customColor}
                      onChange={e => setForm(f => ({ ...f, customColor: e.target.value }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                    />
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="item-unit" className="block text-xs text-gray-500 mb-1">وحدة القياس *</label>
                <select
                  id="item-unit"
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                >
                  {['قطعة', 'متر', 'كجم', 'لفة', 'طقم'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="item-stock" className="block text-xs text-gray-500 mb-1">الكمية الحالية *</label>
                <input
                  id="item-stock"
                  type="number"
                  min="0"
                  value={form.current_stock}
                  onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>
              <div>
                <label htmlFor="item-price" className="block text-xs text-gray-500 mb-1">سعر البيع</label>
                <input
                  id="item-price"
                  type="number"
                  min="0"
                  value={form.selling_price}
                  onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>
              <div>
                <label htmlFor="item-min-stock" className="block text-xs text-gray-500 mb-1">حد التنبيه</label>
                <input
                  id="item-min-stock"
                  type="number"
                  min="0"
                  value={form.min_stock}
                  onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="item-custom" className="block text-xs text-gray-500 mb-1">
                  تفصيل خاص (اختياري) — مثال: لون كم مختلف، لون لياقة، أسورة
                </label>
                <input
                  id="item-custom"
                  placeholder="مثال: كم أحمر × لياقة سوداء"
                  value={form.custom_detail}
                  onChange={e => setForm(f => ({ ...f, custom_detail: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="item-image" className="block text-xs text-gray-500 mb-1">
                  رابط صورة المنتج (اختياري، بتتعرض جنب اسم المنتج في القايمة)
                </label>
                <input
                  id="item-image"
                  placeholder="https://..."
                  value={form.image_url}
                  onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50">
                {saving ? 'جاري الحفظ...' : formMode === 'edit' ? '✅ حفظ التعديلات' : '✅ حفظ الصنف'}
              </button>
              <button
                onClick={closeForm}
                className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="bg-[#111927] rounded-2xl border border-white/5 px-5 py-10 text-center text-gray-500 text-sm">
            جاري التحميل...
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-[#111927] rounded-2xl border border-white/5 px-5 py-10 text-center text-gray-500 text-sm">
            لا توجد أصناف مطابقة
          </div>
        ) : (
          groups.map(group => {
            const isOpen = !!openGroups[group.name]
            return (
              <div key={group.name} className="bg-[#111927] rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
                <div className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition">
                  <button onClick={() => toggleGroup(group.name)} className="flex items-center gap-3 text-right flex-1">
                    <span className={`text-gray-500 text-xs transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}>▼</span>
                    {group.image ? (
                      <img src={group.image} alt={group.name} className="w-9 h-9 rounded-lg object-cover border border-white/10" />
                    ) : (
                      <span className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-sm">👕</span>
                    )}
                    <span className="font-bold text-white">{group.name}</span>
                    <span className="text-[11px] bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/20">
                      {group.variants.length} لون
                    </span>
                    {group.hasLowStock && (
                      <span className="text-[11px] bg-red-500/10 text-red-400 px-2.5 py-1 rounded-full border border-red-500/20">
                        مخزون منخفض
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">إجمالي المخزون: {group.totalStock}</span>
                    <button
                      onClick={() => openAddColorForm(group.name, group.image)}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition"
                    >
                      + لون جديد
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-white/5 px-5 py-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-right">
                          {['اللون', 'المقاس', 'تفصيل خاص', 'الكمية', 'سعر البيع', 'حد التنبيه', 'إجراءات'].map(h => (
                            <th key={h} className="pb-2 text-xs text-gray-500 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.variants.map(item => (
                          <tr key={item.id} className="border-t border-white/5">
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                                  style={{ background: colorHex(item.color, item.color_hex) }}
                                />
                                <span className="text-white">{item.color || '—'}</span>
                              </div>
                            </td>
                            <td className="py-3 text-xs text-gray-400">{item.size || '—'}</td>
                            <td className="py-3 text-xs text-gray-400">{item.custom_detail || '—'}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => updateQuantity(item.id, item.current_stock - 1)}
                                  aria-label={`إنقاص كمية ${item.name} ${item.color || ''}`}
                                  className="w-6 h-6 rounded bg-white/5 text-gray-400 hover:bg-white/10 text-xs"
                                >
                                  −
                                </button>
                                <span className={`text-sm font-bold ${item.current_stock <= item.min_stock ? 'text-red-400' : 'text-white'}`}>
                                  {item.current_stock} {item.unit}
                                </span>
                                <button
                                  onClick={() => updateQuantity(item.id, item.current_stock + 1)}
                                  aria-label={`زيادة كمية ${item.name} ${item.color || ''}`}
                                  className="w-6 h-6 rounded bg-white/5 text-gray-400 hover:bg-white/10 text-xs"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-3 text-amber-400 text-xs font-bold">
                              {Number(item.selling_price || 0).toLocaleString('en-US')} ج.م
                            </td>
                            <td className="py-3 text-gray-500 text-xs">{item.min_stock} {item.unit}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => openEditForm(item)}
                                  aria-label={`تعديل ${item.name} ${item.color || ''}`}
                                  className="text-gray-400 hover:text-amber-400 text-xs"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  disabled={deletingId === item.id}
                                  aria-label={`حذف ${item.name} ${item.color || ''}`}
                                  className="text-red-400 hover:text-red-300 text-xs disabled:opacity-40"
                                >
                                  {deletingId === item.id ? '...' : '🗑️'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}