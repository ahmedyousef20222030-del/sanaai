'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ══════════════════════════════════════════════════════════════════════════
// صفحة "المكن وخطوط الإنتاج" — متوصلة فعليًا بقاعدة البيانات عن طريق:
//   /api/production/lines        (GET, POST)
//   /api/production/lines/[id]   (PATCH, DELETE)
//   /api/production/machines     (GET, POST)
//   /api/production/machines/[id] (PATCH, DELETE)
// نفّذ ملف SQL المرفق (production_lines + machines) والـ Routes المرفقة قبل
// استخدام الصفحة دي، وإلا هترجع أخطاء 404/500 من الـ API.
// ══════════════════════════════════════════════════════════════════════════

// ── الأنواع ──────────────────────────────────────────────────────────────
type MachineStatus = 'working' | 'idle' | 'maintenance' | 'broken'
type LineStatus = 'active' | 'paused' | 'maintenance'

type Machine = {
  id: string
  name: string
  type: string
  serial_number: string
  status: MachineStatus
  line_id: string | null
  notes: string
}

type ProductionLine = {
  id: string
  name: string
  description: string
  status: LineStatus
  capacity_per_day: number
}

// ── تسميات وألوان الحالات ────────────────────────────────────────────────
const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  working: '🟢 تعمل',
  idle: '⚪ متوقفة',
  maintenance: '🟠 صيانة',
  broken: '🔴 عطلانة',
}

const MACHINE_STATUS_COLORS: Record<MachineStatus, string> = {
  working: 'bg-[#1B7A6E]/20 text-[#3ED9C4] border-[#1B7A6E]/40',
  idle: 'bg-white/5 text-gray-400 border-white/10',
  maintenance: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  broken: 'bg-red-500/20 text-red-400 border-red-500/40',
}

const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  active: '🟢 نشط',
  paused: '⏸️ متوقف',
  maintenance: '🟠 صيانة',
}

const LINE_STATUS_COLORS: Record<LineStatus, string> = {
  active: 'from-[#1B7A6E]/10 to-[#1B7A6E]/5 border-[#1B7A6E]/25',
  paused: 'from-white/5 to-white/0 border-white/10',
  maintenance: 'from-amber-500/10 to-amber-600/5 border-amber-500/25',
}

// ── اقتراحات جاهزة لأنواع المكن (الحقل حر ويقبل أي نص) ───────────────────
const MACHINE_TYPE_SUGGESTIONS = [
  'مكينة تطريز',
  'مكينة قص',
  'مكينة طباعة',
  'مكينة خياطة',
  'مكينة أوفرلوك',
  'مكينة سنجر',
  'مكينة كي',
  'مكينة تغليف',
]

// ── دالة موحّدة لاستدعاء الـ API: بترفق توكن الجلسة (Bearer) بنفس نمط
// lib/api/client.ts، وبتستخرج رسالة الخطأ من الاستجابة عند الفشل.
// ⚠️ من غير الهيدر ده، getCurrentUser() في السيرفر بترفض الطلب فورًا
// بـ "Missing authentication token" — وده كان سبب فشل الصفحة بالكامل
// (تحميل وحفظ) قبل التعديل.
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const res = await fetch(url, { ...options, headers })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const message = json?.error?.message || json?.message || 'حدث خطأ غير متوقع'
    throw new Error(message)
  }
  return (json?.data ?? json) as T
}

export default function MachinesAndLinesPage() {
  const [activeTab, setActiveTab] = useState<'lines' | 'machines'>('lines')

  const [lines, setLines] = useState<ProductionLine[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingLine, setSavingLine] = useState(false)
  const [savingMachine, setSavingMachine] = useState(false)

  // ── فورم خط الإنتاج ──
  const [showLineForm, setShowLineForm] = useState(false)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineForm, setLineForm] = useState({
    name: '',
    description: '',
    status: 'active' as LineStatus,
    capacity_per_day: 0,
  })

  // ── فورم المكينة ──
  const [showMachineForm, setShowMachineForm] = useState(false)
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null)
  const [machineForm, setMachineForm] = useState({
    name: '',
    type: '',
    serial_number: '',
    status: 'working' as MachineStatus,
    line_id: '' as string,
    notes: '',
  })

  const [lineFilter, setLineFilter] = useState<'all' | LineStatus>('all')
  const [machineFilter, setMachineFilter] = useState<'all' | MachineStatus>('all')
  const [search, setSearch] = useState('')

  // ── جلب البيانات من الـ API ──
  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    setLoadError(null)
    try {
      const [linesData, machinesData] = await Promise.all([
        apiFetch<ProductionLine[]>('/api/production/lines'),
        apiFetch<Machine[]>('/api/production/machines'),
      ])
      setLines(linesData || [])
      setMachines(machinesData || [])
    } catch (err) {
      console.error('Error fetching lines/machines:', err)
      setLoadError(err instanceof Error ? err.message : 'تعذر تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  // ── حسابات مساعدة ──
  const getLineName = (lineId: string | null) =>
    lineId ? lines.find(l => l.id === lineId)?.name || '—' : '—'

  const getMachinesForLine = (lineId: string) => machines.filter(m => m.line_id === lineId)

  const filteredLines = useMemo(() => {
    return lines.filter(l => {
      if (lineFilter !== 'all' && l.status !== lineFilter) return false
      if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [lines, lineFilter, search])

  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      if (machineFilter !== 'all' && m.status !== machineFilter) return false
      if (search && !(m.name + m.type + m.serial_number).toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [machines, machineFilter, search])

  // ── فورم خط الإنتاج: فتح / حفظ / حذف ──
  function openNewLineForm() {
    setEditingLineId(null)
    setLineForm({ name: '', description: '', status: 'active', capacity_per_day: 0 })
    setShowLineForm(true)
  }

  function openEditLineForm(line: ProductionLine) {
    setEditingLineId(line.id)
    setLineForm({
      name: line.name,
      description: line.description,
      status: line.status,
      capacity_per_day: line.capacity_per_day,
    })
    setShowLineForm(true)
  }

  async function handleSaveLine() {
    if (!lineForm.name.trim()) {
      alert('برجاء إدخال اسم خط الإنتاج')
      return
    }
    setSavingLine(true)
    try {
      if (editingLineId) {
        const updated = await apiFetch<ProductionLine>(`/api/production/lines/${editingLineId}`, {
          method: 'PATCH',
          body: JSON.stringify(lineForm),
        })
        setLines(prev => prev.map(l => (l.id === editingLineId ? updated : l)))
      } else {
        const created = await apiFetch<ProductionLine>('/api/production/lines', {
          method: 'POST',
          body: JSON.stringify(lineForm),
        })
        setLines(prev => [...prev, created])
      }
      setShowLineForm(false)
    } catch (err) {
      alert('تعذر حفظ خط الإنتاج: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    } finally {
      setSavingLine(false)
    }
  }

  async function handleDeleteLine(lineId: string) {
    const inUse = getMachinesForLine(lineId).length
    if (inUse > 0 && !confirm(`الخط مربوط بـ ${inUse} مكينة، هيتم فك ربطهم تلقائيًا. متأكد من الحذف؟`)) return
    if (inUse === 0 && !confirm('متأكد من حذف خط الإنتاج؟')) return
    try {
      await apiFetch(`/api/production/lines/${lineId}`, { method: 'DELETE' })
      setLines(prev => prev.filter(l => l.id !== lineId))
      setMachines(prev => prev.map(m => (m.line_id === lineId ? { ...m, line_id: null } : m)))
    } catch (err) {
      alert('تعذر حذف خط الإنتاج: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    }
  }

  // ── فورم المكينة: فتح / حفظ / حذف ──
  function openNewMachineForm() {
    setEditingMachineId(null)
    setMachineForm({ name: '', type: '', serial_number: '', status: 'working', line_id: '', notes: '' })
    setShowMachineForm(true)
  }

  function openEditMachineForm(machine: Machine) {
    setEditingMachineId(machine.id)
    setMachineForm({
      name: machine.name,
      type: machine.type,
      serial_number: machine.serial_number,
      status: machine.status,
      line_id: machine.line_id || '',
      notes: machine.notes,
    })
    setShowMachineForm(true)
  }

  async function handleSaveMachine() {
    if (!machineForm.name.trim()) {
      alert('برجاء إدخال اسم/كود المكينة')
      return
    }
    setSavingMachine(true)
    const payload = { ...machineForm, line_id: machineForm.line_id || null }
    try {
      if (editingMachineId) {
        const updated = await apiFetch<Machine>(`/api/production/machines/${editingMachineId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        setMachines(prev => prev.map(m => (m.id === editingMachineId ? updated : m)))
      } else {
        const created = await apiFetch<Machine>('/api/production/machines', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setMachines(prev => [...prev, created])
      }
      setShowMachineForm(false)
    } catch (err) {
      alert('تعذر حفظ المكينة: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    } finally {
      setSavingMachine(false)
    }
  }

  async function handleDeleteMachine(machineId: string) {
    if (!confirm('متأكد من حذف المكينة؟')) return
    try {
      await apiFetch(`/api/production/machines/${machineId}`, { method: 'DELETE' })
      setMachines(prev => prev.filter(m => m.id !== machineId))
    } catch (err) {
      alert('تعذر حذف المكينة: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    }
  }

  // ── ملخصات سريعة ──
  const machineCounts = useMemo(() => {
    const counts: Record<MachineStatus, number> = { working: 0, idle: 0, maintenance: 0, broken: 0 }
    machines.forEach(m => counts[m.status]++)
    return counts
  }, [machines])

  return (
    <div
      className="min-h-screen bg-[#08090A] p-6 text-[#F0EDE8]"
      dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white mb-1">🏭 المكن وخطوط الإنتاج</h1>
          <p className="text-sm text-gray-500">
            {lines.length} خط إنتاج • {machines.length} مكينة
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'lines' && (
            <button
              onClick={openNewLineForm}
              className="px-5 py-2.5 bg-[#D4A843] text-black font-bold rounded-xl hover:bg-[#E8C06A] transition shadow-lg shadow-amber-500/20"
            >
              ➕ خط إنتاج جديد
            </button>
          )}
          {activeTab === 'machines' && (
            <button
              onClick={openNewMachineForm}
              className="px-5 py-2.5 bg-[#D4A843] text-black font-bold rounded-xl hover:bg-[#E8C06A] transition shadow-lg shadow-amber-500/20"
            >
              ➕ مكينة جديدة
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
          <span>⚠️ {loadError}</span>
          <button onClick={fetchAll} className="text-xs font-bold underline hover:no-underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {(Object.keys(MACHINE_STATUS_LABELS) as MachineStatus[]).map(status => (
          <div key={status} className="bg-[#111318] border border-white/5 rounded-2xl p-4">
            <p className="text-xs text-gray-500 mb-1">{MACHINE_STATUS_LABELS[status]}</p>
            <p className="text-2xl font-black text-white">{machineCounts[status]}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-2">
        {[
          { key: 'lines' as const, label: '🧵 خطوط الإنتاج' },
          { key: 'machines' as const, label: '⚙️ المكن' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === tab.key
                ? 'bg-[#D4A843] text-black'
                : 'text-gray-400 hover:text-[#D4A843] hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={activeTab === 'lines' ? 'ابحث باسم خط الإنتاج...' : 'ابحث باسم/كود/رقم مسلسل المكينة...'}
          className="flex-1 min-w-[200px] bg-[#111318] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#D4A843]/50"
        />
        {activeTab === 'lines' ? (
          <select
            value={lineFilter}
            onChange={e => setLineFilter(e.target.value as any)}
            className="bg-[#111318] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#D4A843]/50"
          >
            <option value="all" className="bg-[#111318]">كل الحالات</option>
            {(Object.keys(LINE_STATUS_LABELS) as LineStatus[]).map(s => (
              <option key={s} value={s} className="bg-[#111318]">{LINE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        ) : (
          <select
            value={machineFilter}
            onChange={e => setMachineFilter(e.target.value as any)}
            className="bg-[#111318] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#D4A843]/50"
          >
            <option value="all" className="bg-[#111318]">كل الحالات</option>
            {(Object.keys(MACHINE_STATUS_LABELS) as MachineStatus[]).map(s => (
              <option key={s} value={s} className="bg-[#111318]">{MACHINE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        )}
      </div>

      {loading && <div className="text-center py-16 text-gray-600">جاري التحميل...</div>}

      {/* ══════════ تبويب: خطوط الإنتاج ══════════ */}
      {!loading && activeTab === 'lines' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredLines.map(line => {
            const lineMachines = getMachinesForLine(line.id)
            return (
              <div
                key={line.id}
                className={`rounded-2xl border p-5 bg-gradient-to-br ${LINE_STATUS_COLORS[line.status]}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white text-lg mb-1">{line.name}</h3>
                    {line.description && <p className="text-xs text-gray-500">{line.description}</p>}
                  </div>
                  <span
                    className={`text-[11px] px-2.5 py-1 rounded-full border shrink-0 ${
                      line.status === 'active'
                        ? 'bg-[#1B7A6E]/20 text-[#3ED9C4] border-[#1B7A6E]/40'
                        : line.status === 'maintenance'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-white/5 text-gray-400 border-white/10'
                    }`}
                  >
                    {LINE_STATUS_LABELS[line.status]}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                  <span>⚙️ {lineMachines.length} مكينة مربوطة</span>
                  {line.capacity_per_day > 0 && <span>📦 طاقة يومية: {line.capacity_per_day}</span>}
                </div>

                {lineMachines.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {lineMachines.map(m => (
                      <span
                        key={m.id}
                        className={`text-[10px] px-2 py-1 rounded-full border ${MACHINE_STATUS_COLORS[m.status]}`}
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-3 border-t border-white/5">
                  <button
                    onClick={() => openEditLineForm(line)}
                    className="flex-1 py-2 text-xs font-bold rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition"
                  >
                    ✏️ تعديل
                  </button>
                  <button
                    onClick={() => handleDeleteLine(line.id)}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                  >
                    🗑️ حذف
                  </button>
                </div>
              </div>
            )
          })}

          {filteredLines.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-600 text-sm">
              لا توجد خطوط إنتاج بعد — اضغط "➕ خط إنتاج جديد" للبدء
            </div>
          )}
        </div>
      )}

      {/* ══════════ تبويب: المكن ══════════ */}
      {!loading && activeTab === 'machines' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMachines.map(machine => (
            <div
              key={machine.id}
              className="bg-[#111318] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold text-white text-base group-hover:text-amber-400 transition">
                  {machine.name}
                </h3>
                <span className={`text-[10px] px-2 py-1 rounded-full border shrink-0 ${MACHINE_STATUS_COLORS[machine.status]}`}>
                  {MACHINE_STATUS_LABELS[machine.status]}
                </span>
              </div>

              <div className="space-y-1 mb-4">
                <p className="text-gray-500 text-xs">🔧 النوع: {machine.type || 'غير محدد'}</p>
                <p className="text-gray-500 text-xs">🔢 رقم مسلسل: {machine.serial_number || '—'}</p>
                <p className="text-gray-500 text-xs">🧵 خط الإنتاج: {getLineName(machine.line_id)}</p>
                {machine.notes && <p className="text-gray-600 text-xs">📝 {machine.notes}</p>}
              </div>

              <div className="flex gap-2 pt-3 border-t border-white/5">
                <button
                  onClick={() => openEditMachineForm(machine)}
                  className="flex-1 py-2 text-xs font-bold rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition"
                >
                  ✏️ تعديل
                </button>
                <button
                  onClick={() => handleDeleteMachine(machine.id)}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                >
                  🗑️ حذف
                </button>
              </div>
            </div>
          ))}

          {filteredMachines.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-600 text-sm">
              لا توجد مكن مسجلة بعد — اضغط "➕ مكينة جديدة" للبدء
            </div>
          )}
        </div>
      )}

      {/* ══════════ Modal: فورم خط الإنتاج ══════════ */}
      {showLineForm && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={() => setShowLineForm(false)}
        >
          <div
            className="bg-[#111318] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-amber-400 mb-4">
              {editingLineId ? '✏️ تعديل خط إنتاج' : '➕ إضافة خط إنتاج جديد'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">اسم خط الإنتاج *</label>
                <input
                  type="text"
                  value={lineForm.name}
                  onChange={e => setLineForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="مثال: خط التطريز الأول"
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">الوصف (اختياري)</label>
                <input
                  type="text"
                  value={lineForm.description}
                  onChange={e => setLineForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الحالة</label>
                <select
                  value={lineForm.status}
                  onChange={e => setLineForm(f => ({ ...f, status: e.target.value as LineStatus }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                >
                  {(Object.keys(LINE_STATUS_LABELS) as LineStatus[]).map(s => (
                    <option key={s} value={s} className="bg-[#0D1B2A]">{LINE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الطاقة اليومية (قطعة/يوم)</label>
                <input
                  type="number"
                  min={0}
                  value={lineForm.capacity_per_day}
                  onChange={e => setLineForm(f => ({ ...f, capacity_per_day: Number(e.target.value) }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveLine}
                disabled={savingLine}
                className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
              >
                {savingLine ? 'جاري الحفظ...' : '✅ حفظ'}
              </button>
              <button
                onClick={() => setShowLineForm(false)}
                className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ Modal: فورم المكينة ══════════ */}
      {showMachineForm && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={() => setShowMachineForm(false)}
        >
          <div
            className="bg-[#111318] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-amber-400 mb-4">
              {editingMachineId ? '✏️ تعديل مكينة' : '➕ إضافة مكينة جديدة'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">اسم/كود المكينة *</label>
                <input
                  type="text"
                  value={machineForm.name}
                  onChange={e => setMachineForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="مثال: مكينة تطريز 1"
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">نوع المكينة</label>
                <input
                  type="text"
                  value={machineForm.type}
                  onChange={e => setMachineForm(f => ({ ...f, type: e.target.value }))}
                  list="machine-type-suggestions"
                  placeholder="مثال: مكينة تطريز، مكينة قص، مكينة خياطة..."
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
                <datalist id="machine-type-suggestions">
                  {MACHINE_TYPE_SUGGESTIONS.map(t => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الرقم المسلسل</label>
                <input
                  type="text"
                  value={machineForm.serial_number}
                  onChange={e => setMachineForm(f => ({ ...f, serial_number: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الحالة</label>
                <select
                  value={machineForm.status}
                  onChange={e => setMachineForm(f => ({ ...f, status: e.target.value as MachineStatus }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                >
                  {(Object.keys(MACHINE_STATUS_LABELS) as MachineStatus[]).map(s => (
                    <option key={s} value={s} className="bg-[#0D1B2A]">{MACHINE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">خط الإنتاج المربوطة به</label>
                <select
                  value={machineForm.line_id}
                  onChange={e => setMachineForm(f => ({ ...f, line_id: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                >
                  <option value="" className="bg-[#0D1B2A]">— بدون خط —</option>
                  {lines.map(l => (
                    <option key={l.id} value={l.id} className="bg-[#0D1B2A]">{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={machineForm.notes}
                  onChange={e => setMachineForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveMachine}
                disabled={savingMachine}
                className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
              >
                {savingMachine ? 'جاري الحفظ...' : '✅ حفظ'}
              </button>
              <button
                onClick={() => setShowMachineForm(false)}
                className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
