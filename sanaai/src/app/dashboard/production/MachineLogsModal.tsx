'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ══════════════════════════════════════════════════════════════════════════
// Modal: سجل نشاط المكينة
// بيتفتح لمكينة معيّنة، وبيسمح للصنايعي/المشرف يسجّل حاجتين:
//  - تسجيل "سريع": حدث حصل دلوقتي + كمية منتجة (نوع log_type = 'quick')
//  - "شفت": بداية شغل، ويقفل بعدين بتحديد وقت النهاية والكمية النهائية
//           (نوع log_type = 'shift', الشفت "مفتوح" لحد ما يتقفل)
//
// كل تسجيل لازم يتربط بـ: طلب (order) + صنايعي (employee) — إجباري.
//
// ⚠️ الكومبوننت بيفترض إن فيه endpoint موجود بالفعل لجلب الطلبات على
// /api/orders بيرجع مصفوفة فيها { id, ... }. عدّل getOrderLabel() تحت
// عشان يطابق اسم العمود الفعلي عندك (order_number / title / name...).
// ══════════════════════════════════════════════════════════════════════════

type LogType = 'quick' | 'shift'
type EventType = 'production' | 'maintenance' | 'breakdown' | 'idle' | 'other'

type Employee = {
  id: string
  name: string
  role: string
  active: boolean
}

type OrderLite = Record<string, any> & { id: string }

type MachineLog = {
  id: string
  machine_id: string
  order_id: string
  employee_id: string
  log_type: LogType
  event_type: EventType
  quantity_produced: number
  started_at: string
  ended_at: string | null
  notes: string
}

const EVENT_LABELS: Record<EventType, string> = {
  production: '🟢 إنتاج',
  maintenance: '🟠 صيانة',
  breakdown: '🔴 عطل',
  idle: '⚪ توقف',
  other: '📝 أخرى',
}

// ⚠️ عدّل الدالة دي حسب شكل جدول الطلبات الفعلي عندك
function getOrderLabel(order: OrderLite): string {
  return (
    order.order_number ||
    order.title ||
    order.name ||
    order.code ||
    `طلب #${String(order.id).slice(0, 8)}`
  )
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

  const res = await fetch(url, { ...options, headers })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const message = json?.error?.message || json?.message || 'حدث خطأ غير متوقع'
    throw new Error(message)
  }
  return (json?.data ?? json) as T
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function MachineLogsModal({
  machine,
  onClose,
}: {
  machine: { id: string; name: string }
  onClose: () => void
}) {
  const [logs, setLogs] = useState<MachineLog[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [orders, setOrders] = useState<OrderLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [newEmployeeName, setNewEmployeeName] = useState('')
  const [addingEmployee, setAddingEmployee] = useState(false)

  const [form, setForm] = useState({
    log_type: 'quick' as LogType,
    order_id: '',
    employee_id: '',
    event_type: 'production' as EventType,
    quantity_produced: 0,
    started_at: toDatetimeLocal(new Date().toISOString()),
    closeNow: true, // للـ shift بس: هل بنقفله دلوقتي ولا يفضل مفتوح
    ended_at: toDatetimeLocal(new Date().toISOString()),
    notes: '',
  })

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.id])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [logsData, employeesData, ordersData] = await Promise.all([
        apiFetch<MachineLog[]>(`/api/production/logs?machine_id=${machine.id}`),
        apiFetch<Employee[]>('/api/production/employees?active=true'),
        // ⚠️ عدّل المسار ده لو endpoint الطلبات عندك اسمه مختلف
        apiFetch<OrderLite[]>('/api/orders').catch(() => []),
      ])
      setLogs(logsData || [])
      setEmployees(employeesData || [])
      setOrders(ordersData || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات السجل')
    } finally {
      setLoading(false)
    }
  }

  const openShiftsCount = useMemo(() => logs.filter(l => l.ended_at === null).length, [logs])

  async function handleAddEmployee() {
    if (!newEmployeeName.trim()) return
    setAddingEmployee(true)
    try {
      const created = await apiFetch<Employee>('/api/production/employees', {
        method: 'POST',
        body: JSON.stringify({ name: newEmployeeName.trim() }),
      })
      setEmployees(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setForm(f => ({ ...f, employee_id: created.id }))
      setNewEmployeeName('')
    } catch (err) {
      alert('تعذر إضافة الصنايعي: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    } finally {
      setAddingEmployee(false)
    }
  }

  async function handleSaveLog() {
    if (!form.order_id) return alert('برجاء اختيار الطلب المرتبط')
    if (!form.employee_id) return alert('برجاء اختيار الصنايعي')

    setSaving(true)
    try {
      const payload: any = {
        machine_id: machine.id,
        order_id: form.order_id,
        employee_id: form.employee_id,
        log_type: form.log_type,
        event_type: form.event_type,
        quantity_produced: form.quantity_produced,
        notes: form.notes,
        started_at: new Date(form.started_at).toISOString(),
      }
      if (form.log_type === 'shift') {
        payload.ended_at = form.closeNow ? new Date(form.ended_at).toISOString() : null
      }

      const created = await apiFetch<MachineLog>('/api/production/logs', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setLogs(prev => [created, ...prev])
      setForm(f => ({ ...f, quantity_produced: 0, notes: '' }))
    } catch (err) {
      alert('تعذر حفظ التسجيل: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    } finally {
      setSaving(false)
    }
  }

  async function handleCloseShift(log: MachineLog) {
    const qtyStr = prompt('الكمية النهائية المنتجة في الشفت ده؟', String(log.quantity_produced))
    if (qtyStr === null) return
    const qty = Number(qtyStr)
    if (Number.isNaN(qty) || qty < 0) return alert('كمية غير صالحة')

    try {
      const updated = await apiFetch<MachineLog>(`/api/production/logs/${log.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ended_at: new Date().toISOString(), quantity_produced: qty }),
      })
      setLogs(prev => prev.map(l => (l.id === log.id ? updated : l)))
    } catch (err) {
      alert('تعذر قفل الشفت: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    }
  }

  async function handleDeleteLog(logId: string) {
    if (!confirm('متأكد من حذف التسجيل ده؟')) return
    try {
      await apiFetch(`/api/production/logs/${logId}`, { method: 'DELETE' })
      setLogs(prev => prev.filter(l => l.id !== logId))
    } catch (err) {
      alert('تعذر حذف التسجيل: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    }
  }

  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.name || '—'
  const getOrderName = (id: string) => {
    const o = orders.find(o => o.id === id)
    return o ? getOrderLabel(o) : '—'
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#111318] border border-amber-500/30 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-amber-400">📋 سجل نشاط: {machine.name}</h2>
            {openShiftsCount > 0 && (
              <p className="text-xs text-amber-500 mt-1">⏱️ {openShiftsCount} شفت مفتوح دلوقتي</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 mb-4">
            ⚠️ {error}
          </div>
        )}

        {/* ── فورم إضافة تسجيل جديد ── */}
        <div className="bg-[#0D1B2A] border border-white/10 rounded-xl p-4 mb-5">
          <div className="flex gap-2 mb-3">
            {(['quick', 'shift'] as LogType[]).map(t => (
              <button
                key={t}
                onClick={() => setForm(f => ({ ...f, log_type: t }))}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                  form.log_type === t
                    ? 'bg-amber-500 text-black'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {t === 'quick' ? '⚡ تسجيل سريع' : '⏱️ شفت (بداية/نهاية)'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">الطلب المرتبط *</label>
              <select
                value={form.order_id}
                onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))}
                className="w-full bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
              >
                <option value="">— اختر الطلب —</option>
                {orders.map(o => (
                  <option key={o.id} value={o.id} className="bg-[#08090A]">
                    {getOrderLabel(o)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">الصنايعي *</label>
              <select
                value={form.employee_id}
                onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                className="w-full bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
              >
                <option value="">— اختر الصنايعي —</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id} className="bg-[#08090A]">
                    {e.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 mt-1.5">
                <input
                  type="text"
                  value={newEmployeeName}
                  onChange={e => setNewEmployeeName(e.target.value)}
                  placeholder="+ إضافة صنايعي جديد بالاسم"
                  className="flex-1 bg-transparent border border-white/5 rounded-lg px-2 py-1 text-xs text-gray-300 outline-none focus:border-amber-500/40"
                />
                <button
                  onClick={handleAddEmployee}
                  disabled={addingEmployee || !newEmployeeName.trim()}
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 text-amber-400 hover:bg-white/10 disabled:opacity-40"
                >
                  إضافة
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">نوع الحدث</label>
              <select
                value={form.event_type}
                onChange={e => setForm(f => ({ ...f, event_type: e.target.value as EventType }))}
                className="w-full bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
              >
                {(Object.keys(EVENT_LABELS) as EventType[]).map(k => (
                  <option key={k} value={k} className="bg-[#08090A]">
                    {EVENT_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">الكمية المنتجة</label>
              <input
                type="number"
                min={0}
                value={form.quantity_produced}
                onChange={e => setForm(f => ({ ...f, quantity_produced: Number(e.target.value) }))}
                className="w-full bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {form.log_type === 'shift' ? 'وقت بداية الشفت' : 'وقت الحدث'}
              </label>
              <input
                type="datetime-local"
                value={form.started_at}
                onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))}
                className="w-full bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>

            {form.log_type === 'shift' && (
              <div>
                <label className="flex items-center gap-2 text-xs text-gray-500 mb-1 mt-1">
                  <input
                    type="checkbox"
                    checked={form.closeNow}
                    onChange={e => setForm(f => ({ ...f, closeNow: e.target.checked }))}
                  />
                  قفل الشفت دلوقتي (لو مش متأكد، سيبها فاضية وقفله بعدين)
                </label>
                {form.closeNow && (
                  <input
                    type="datetime-local"
                    value={form.ended_at}
                    onChange={e => setForm(f => ({ ...f, ended_at: e.target.value }))}
                    className="w-full bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                  />
                )}
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">ملاحظات (اختياري)</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          <button
            onClick={handleSaveLog}
            disabled={saving}
            className="w-full mt-4 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
          >
            {saving ? 'جاري الحفظ...' : '✅ حفظ التسجيل'}
          </button>
        </div>

        {/* ── قائمة السجلات السابقة ── */}
        <h3 className="text-sm font-bold text-gray-400 mb-2">السجل السابق</h3>
        {loading ? (
          <div className="text-center py-8 text-gray-600 text-sm">جاري التحميل...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">لا يوجد أي تسجيل على المكينة دي لسه</div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div
                key={log.id}
                className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">{EVENT_LABELS[log.event_type]}</span>
                    {log.ended_at === null && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                        شفت مفتوح
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    🧵 {getOrderName(log.order_id)} • 👤 {getEmployeeName(log.employee_id)}
                  </p>
                  <p className="text-xs text-gray-500">
                    📦 {log.quantity_produced} قطعة • {new Date(log.started_at).toLocaleString('ar-EG')}
                    {log.ended_at && ` → ${new Date(log.ended_at).toLocaleString('ar-EG')}`}
                  </p>
                  {log.notes && <p className="text-xs text-gray-600 mt-1">📝 {log.notes}</p>}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {log.ended_at === null && (
                    <button
                      onClick={() => handleCloseShift(log)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                    >
                      إنهاء الشفت
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteLog(log.id)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
