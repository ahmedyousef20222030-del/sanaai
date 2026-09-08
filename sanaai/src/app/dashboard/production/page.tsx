'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ══════════════════════════════════════════════════════════════════════════
// صفحة "المكن وخطوط الإنتاج" — متوصلة فعليًا بقاعدة البيانات عن طريق:
//   /api/production/lines         (GET, POST)
//   /api/production/lines/[id]    (PATCH, DELETE)
//   /api/production/machines      (GET, POST)
//   /api/production/machines/[id] (PATCH, DELETE)
//   /api/production/logs          (GET, POST)
//   /api/production/logs/[id]     (PATCH, DELETE)
//   /api/employees                (GET, POST)
// نفّذ ملفات الـ SQL المرفقة (production_lines + machines + production_logs
// + employees) والـ Routes المرفقة قبل استخدام الصفحة دي، وإلا هترجع أخطاء
// 404/500 من الـ API.
//
// ⚠️ ملاحظة أمان مهمة (Zero-Trust Multi-Tenancy):
// هذه الصفحة عمدًا لا تستدعي supabase.from(...) مباشرة من الـ Client — كل
// القراءة والكتابة بتمر على الـ API Routes فوق. الشرط الحاكم tenant_id لازم
// يتحقق ويتفرض هناك (في السيرفر) على كل Select/Insert/Update/Delete، مش هنا.
// نفس الكلام على tenant_id بينطبق على سجلات الإنتاج (production_logs) وجدول
// الموظفين (employees) الجداد — أي endpoint بيرجع أو يعدّل فيهم لازم يقفل
// على tenant_id المستخدم الحالي فقط.
// ══════════════════════════════════════════════════════════════════════════

// ── الأنواع ──────────────────────────────────────────────────────────────
type MachineStatus = 'working' | 'idle' | 'maintenance' | 'broken'
type LineStatus = 'active' | 'paused' | 'maintenance'
type OperatorType = 'user' | 'employee'

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

type Employee = {
  id: string
  name: string
  active: boolean
}

type ProductionLog = {
  id: string
  machine_id: string | null
  line_id: string | null
  machine_name_snapshot: string
  line_name_snapshot: string | null
  product_name: string
  quantity: number
  notes: string
  produced_at: string // ISO datetime
  operator_type: OperatorType
  operator_user_id: string | null
  operator_employee_id: string | null
  operator_name: string
}

type LineFormState = {
  name: string
  description: string
  status: LineStatus
  capacity_per_day: number
}

type MachineFormState = {
  name: string
  type: string
  serial_number: string
  status: MachineStatus
  line_id: string
  notes: string
}

type LogFormState = {
  product_name: string
  quantity: number
  notes: string
  operator_mode: 'me' | 'employee'
  operator_employee_id: string
  produced_at: string // قيمة datetime-local
}

// ── تسميات وألوان الحالات ────────────────────────────────────────────────
const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  working: '🟢 تعمل',
  idle: '⚪ متوقفة',
  maintenance: '🟠 صيانة',
  broken: '🔴 عطلانة',
}

const MACHINE_STATUS_COLORS: Record<MachineStatus, string> = {
  working: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
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
  active: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/25',
  paused: 'from-white/5 to-white/0 border-white/10',
  maintenance: 'from-amber-500/10 to-amber-600/5 border-amber-500/25',
}

const LINE_BADGE_COLORS: Record<LineStatus, string> = {
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  maintenance: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  paused: 'bg-white/5 text-gray-400 border-white/10',
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

const EMPTY_LINE_FORM: LineFormState = {
  name: '',
  description: '',
  status: 'active',
  capacity_per_day: 0,
}

const EMPTY_MACHINE_FORM: MachineFormState = {
  name: '',
  type: '',
  serial_number: '',
  status: 'working',
  line_id: '',
  notes: '',
}

const EMPTY_LOG_FORM: LogFormState = {
  product_name: '',
  quantity: 0,
  notes: '',
  operator_mode: 'me',
  operator_employee_id: '',
  produced_at: '',
}

// ── تنسيق وقت للـ <input type="datetime-local"> وبالعكس ─────────────────
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatLogDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ar-EG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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

// ── مكونات مساعدة صغيرة (Spinner / رسالة خطأ مدمجة / تأكيد بدل confirm) ──
function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-3 py-2 mt-3 flex items-start gap-2">
      <span className="shrink-0">⚠️</span>
      <span>{message}</span>
    </div>
  )
}

type ConfirmState = {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
}

const EMPTY_CONFIRM: ConfirmState = {
  open: false,
  title: '',
  message: '',
  onConfirm: () => {},
}

function ConfirmDialog({
  state,
  onCancel,
}: {
  state: ConfirmState
  onCancel: () => void
}) {
  if (!state.open) return null
  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-white mb-2">{state.title}</h3>
        <p className="text-sm text-gray-400 mb-5">{state.message}</p>
        <div className="flex gap-3">
          <button
            onClick={state.onConfirm}
            className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-400 transition"
          >
            🗑️ تأكيد الحذف
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MachinesAndLinesPage() {
  const [activeTab, setActiveTab] = useState<'lines' | 'machines' | 'logs'>('lines')

  const [lines, setLines] = useState<ProductionLine[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [productionLogs, setProductionLogs] = useState<ProductionLog[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savingLine, setSavingLine] = useState(false)
  const [savingMachine, setSavingMachine] = useState(false)
  const [savingLog, setSavingLog] = useState(false)

  // ── فورم خط الإنتاج ──
  const [showLineForm, setShowLineForm] = useState(false)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineForm, setLineForm] = useState<LineFormState>(EMPTY_LINE_FORM)
  const [lineFormError, setLineFormError] = useState<string | null>(null)

  // ── فورم المكينة ──
  const [showMachineForm, setShowMachineForm] = useState(false)
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null)
  const [machineForm, setMachineForm] = useState<MachineFormState>(EMPTY_MACHINE_FORM)
  const [machineFormError, setMachineFormError] = useState<string | null>(null)

  // ── فورم تسجيل الإنتاج ──
  const [showLogForm, setShowLogForm] = useState(false)
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [logFormMachineId, setLogFormMachineId] = useState<string>('')
  const [logForm, setLogForm] = useState<LogFormState>(EMPTY_LOG_FORM)
  const [logFormError, setLogFormError] = useState<string | null>(null)

  // ── إضافة موظف سريعة من جوه فورم تسجيل الإنتاج ──
  const [showNewEmployeeInput, setShowNewEmployeeInput] = useState(false)
  const [newEmployeeName, setNewEmployeeName] = useState('')
  const [newEmployeeError, setNewEmployeeError] = useState<string | null>(null)
  const [savingEmployee, setSavingEmployee] = useState(false)

  const [lineFilter, setLineFilter] = useState<'all' | LineStatus>('all')
  const [machineFilter, setMachineFilter] = useState<'all' | MachineStatus>('all')
  const [logsMachineFilter, setLogsMachineFilter] = useState<'all' | string>('all')
  const [search, setSearch] = useState('')

  // ── نافذة تأكيد موحّدة بدل window.confirm() ──
  const [confirmState, setConfirmState] = useState<ConfirmState>(EMPTY_CONFIRM)

  const askConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setConfirmState({ open: true, title, message, onConfirm })
  }, [])

  const closeConfirm = useCallback(() => {
    setConfirmState(EMPTY_CONFIRM)
  }, [])

  // ── جلب البيانات من الـ API ──
  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setLoadError(null)
    try {
      const [linesData, machinesData, logsData, employeesData] = await Promise.all([
        apiFetch<ProductionLine[]>('/api/production/lines', { signal }),
        apiFetch<Machine[]>('/api/production/machines', { signal }),
        apiFetch<ProductionLog[]>('/api/production/logs', { signal }),
        apiFetch<Employee[]>('/api/production/employees', { signal }),
      ])
      setLines(linesData || [])
      setMachines(machinesData || [])
      setProductionLogs(logsData || [])
      setEmployees(employeesData || [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('Error fetching production data:', err)
      setLoadError(err instanceof Error ? err.message : 'تعذر تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchAll(controller.signal)
    return () => controller.abort()
  }, [fetchAll])

  // ── هوية المستخدم الحالي (لخيار "أنا" في تسجيل الإنتاج) ──
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return
      const name =
        (data.user.user_metadata?.full_name as string | undefined) ||
        data.user.email ||
        'المستخدم الحالي'
      setCurrentUser({ id: data.user.id, name })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // ── حسابات مساعدة ──
  const getLineName = useCallback(
    (lineId: string | null) => (lineId ? lines.find(l => l.id === lineId)?.name || '—' : '—'),
    [lines],
  )

  const getMachinesForLine = useCallback(
    (lineId: string) => machines.filter(m => m.line_id === lineId),
    [machines],
  )

  const getMachineDisplayName = useCallback(
    (log: ProductionLog) => machines.find(m => m.id === log.machine_id)?.name || log.machine_name_snapshot || '—',
    [machines],
  )

  const getLogsForMachine = useCallback(
    (machineId: string) =>
      productionLogs
        .filter(l => l.machine_id === machineId)
        .sort((a, b) => new Date(b.produced_at).getTime() - new Date(a.produced_at).getTime()),
    [productionLogs],
  )

  const filteredLines = useMemo(() => {
    const term = search.trim().toLowerCase()
    return lines.filter(l => {
      if (lineFilter !== 'all' && l.status !== lineFilter) return false
      if (term && !l.name.toLowerCase().includes(term)) return false
      return true
    })
  }, [lines, lineFilter, search])

  const filteredMachines = useMemo(() => {
    const term = search.trim().toLowerCase()
    return machines.filter(m => {
      if (machineFilter !== 'all' && m.status !== machineFilter) return false
      if (term && !(m.name + m.type + m.serial_number).toLowerCase().includes(term)) return false
      return true
    })
  }, [machines, machineFilter, search])

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase()
    return productionLogs
      .filter(log => {
        if (logsMachineFilter !== 'all' && log.machine_id !== logsMachineFilter) return false
        if (term) {
          const machineName = getMachineDisplayName(log)
          const haystack = `${log.product_name} ${machineName} ${log.operator_name} ${log.notes}`.toLowerCase()
          if (!haystack.includes(term)) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.produced_at).getTime() - new Date(a.produced_at).getTime())
  }, [productionLogs, logsMachineFilter, search, getMachineDisplayName])

  // مجموعة المكن مبوّبة حسب خط الإنتاج، لاستخدامها في فلتر تبويب السجل
  const machinesGroupedByLine = useMemo(() => {
    const groups: { lineLabel: string; machines: Machine[] }[] = []
    lines.forEach(line => {
      const lineMachines = getMachinesForLine(line.id)
      if (lineMachines.length > 0) groups.push({ lineLabel: line.name, machines: lineMachines })
    })
    const unassigned = machines.filter(m => !m.line_id)
    if (unassigned.length > 0) groups.push({ lineLabel: 'بدون خط', machines: unassigned })
    return groups
  }, [lines, machines, getMachinesForLine])

  const machineCounts = useMemo(() => {
    const counts: Record<MachineStatus, number> = { working: 0, idle: 0, maintenance: 0, broken: 0 }
    machines.forEach(m => counts[m.status]++)
    return counts
  }, [machines])

  // ── فورم خط الإنتاج: فتح / حفظ / حذف ──
  function openNewLineForm() {
    setEditingLineId(null)
    setLineForm(EMPTY_LINE_FORM)
    setLineFormError(null)
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
    setLineFormError(null)
    setShowLineForm(true)
  }

  async function handleSaveLine() {
    const trimmedName = lineForm.name.trim()
    if (!trimmedName) {
      setLineFormError('برجاء إدخال اسم خط الإنتاج')
      return
    }

    setLineFormError(null)
    setSavingLine(true)

    const isEditing = Boolean(editingLineId)
    const previousLines = lines
    const optimisticId = editingLineId ?? `temp-${Date.now()}`
    const optimisticLine: ProductionLine = {
      id: optimisticId,
      name: trimmedName,
      description: lineForm.description,
      status: lineForm.status,
      capacity_per_day: lineForm.capacity_per_day,
    }

    // تحديث محلي فوري (Optimistic UI) — الشبكة تتحدث قبل ما ننتظر رد السيرفر
    setLines(prev =>
      isEditing ? prev.map(l => (l.id === editingLineId ? optimisticLine : l)) : [...prev, optimisticLine],
    )

    try {
      if (isEditing && editingLineId) {
        const updated = await apiFetch<ProductionLine>(`/api/production/lines/${editingLineId}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...lineForm, name: trimmedName }),
        })
        setLines(prev => prev.map(l => (l.id === editingLineId ? updated : l)))
      } else {
        const created = await apiFetch<ProductionLine>('/api/production/lines', {
          method: 'POST',
          body: JSON.stringify({ ...lineForm, name: trimmedName }),
        })
        setLines(prev => prev.map(l => (l.id === optimisticId ? created : l)))
      }
      setShowLineForm(false)
    } catch (err) {
      setLines(previousLines)
      setLineFormError(err instanceof Error ? err.message : 'تعذر حفظ خط الإنتاج')
    } finally {
      setSavingLine(false)
    }
  }

  function handleDeleteLine(lineId: string) {
    const inUse = getMachinesForLine(lineId).length
    const message =
      inUse > 0
        ? `الخط مربوط بـ ${inUse} مكينة، هيتم فك ربطهم تلقائيًا. متأكد من الحذف؟`
        : 'متأكد من حذف خط الإنتاج؟'

    askConfirm('حذف خط إنتاج', message, async () => {
      closeConfirm()
      setActionError(null)
      const previousLines = lines
      const previousMachines = machines

      setLines(prev => prev.filter(l => l.id !== lineId))
      setMachines(prev => prev.map(m => (m.line_id === lineId ? { ...m, line_id: null } : m)))

      try {
        await apiFetch(`/api/production/lines/${lineId}`, { method: 'DELETE' })
      } catch (err) {
        setLines(previousLines)
        setMachines(previousMachines)
        setActionError(err instanceof Error ? err.message : 'تعذر حذف خط الإنتاج')
      }
    })
  }

  // ── فورم المكينة: فتح / حفظ / حذف ──
  function openNewMachineForm() {
    setEditingMachineId(null)
    setMachineForm(EMPTY_MACHINE_FORM)
    setMachineFormError(null)
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
    setMachineFormError(null)
    setShowMachineForm(true)
  }

  async function handleSaveMachine() {
    const trimmedName = machineForm.name.trim()
    if (!trimmedName) {
      setMachineFormError('برجاء إدخال اسم/كود المكينة')
      return
    }

    setMachineFormError(null)
    setSavingMachine(true)

    const isEditing = Boolean(editingMachineId)
    const previousMachines = machines
    const optimisticId = editingMachineId ?? `temp-${Date.now()}`
    const payload = { ...machineForm, name: trimmedName, line_id: machineForm.line_id || null }
    const optimisticMachine: Machine = { id: optimisticId, ...payload }

    setMachines(prev =>
      isEditing ? prev.map(m => (m.id === editingMachineId ? optimisticMachine : m)) : [...prev, optimisticMachine],
    )

    try {
      if (isEditing && editingMachineId) {
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
        setMachines(prev => prev.map(m => (m.id === optimisticId ? created : m)))
      }
      setShowMachineForm(false)
    } catch (err) {
      setMachines(previousMachines)
      setMachineFormError(err instanceof Error ? err.message : 'تعذر حفظ المكينة')
    } finally {
      setSavingMachine(false)
    }
  }

  function handleDeleteMachine(machineId: string) {
    askConfirm('حذف مكينة', 'متأكد من حذف المكينة؟', async () => {
      closeConfirm()
      setActionError(null)
      const previousMachines = machines

      setMachines(prev => prev.filter(m => m.id !== machineId))

      try {
        await apiFetch(`/api/production/machines/${machineId}`, { method: 'DELETE' })
      } catch (err) {
        setMachines(previousMachines)
        setActionError(err instanceof Error ? err.message : 'تعذر حذف المكينة')
      }
    })
  }

  // ── فورم تسجيل الإنتاج: فتح / حفظ / حذف ──
  function openNewLogForm(machineId: string = '') {
    setEditingLogId(null)
    setLogFormMachineId(machineId)
    setLogForm({ ...EMPTY_LOG_FORM, produced_at: toDatetimeLocalValue(new Date()) })
    setLogFormError(null)
    setShowNewEmployeeInput(false)
    setNewEmployeeName('')
    setNewEmployeeError(null)
    setShowLogForm(true)
  }

  function openEditLogForm(log: ProductionLog) {
    setEditingLogId(log.id)
    setLogFormMachineId(log.machine_id || '')
    setLogForm({
      product_name: log.product_name,
      quantity: log.quantity,
      notes: log.notes,
      // ملحوظة: عند التعديل بنسمح باختيار "أنا" (يعني المستخدم اللي بيعدّل
      // دلوقتي) أو موظف من القائمة — مش بالضرورة نفس اللي سجّل الإنتاج
      // أصلاً، خصوصًا لو مدير بيصحح سجل غيره.
      operator_mode: log.operator_type === 'employee' ? 'employee' : 'me',
      operator_employee_id: log.operator_employee_id || '',
      produced_at: toDatetimeLocalValue(new Date(log.produced_at)),
    })
    setLogFormError(null)
    setShowNewEmployeeInput(false)
    setNewEmployeeName('')
    setNewEmployeeError(null)
    setShowLogForm(true)
  }

  async function handleAddEmployee() {
    const trimmed = newEmployeeName.trim()
    if (!trimmed) {
      setNewEmployeeError('برجاء إدخال اسم العامل')
      return
    }
    setNewEmployeeError(null)
    setSavingEmployee(true)
    try {
      const created = await apiFetch<Employee>('/api/production/employees', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })
      setEmployees(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'ar')))
      setLogForm(f => ({ ...f, operator_employee_id: created.id }))
      setNewEmployeeName('')
      setShowNewEmployeeInput(false)
    } catch (err) {
      setNewEmployeeError(err instanceof Error ? err.message : 'تعذر إضافة العامل')
    } finally {
      setSavingEmployee(false)
    }
  }

  async function handleSaveLog() {
    const trimmedProduct = logForm.product_name.trim()
    if (!trimmedProduct) {
      setLogFormError('برجاء إدخال اسم المنتج')
      return
    }
    if (!logFormMachineId) {
      setLogFormError('برجاء اختيار المكينة')
      return
    }
    if (!logForm.produced_at) {
      setLogFormError('برجاء تحديد وقت الإنتاج')
      return
    }
    if (logForm.operator_mode === 'employee' && !logForm.operator_employee_id) {
      setLogFormError('برجاء اختيار اسم العامل')
      return
    }
    if (logForm.operator_mode === 'me' && !currentUser) {
      setLogFormError('تعذر تحديد هوية المستخدم الحالي — برجاء تسجيل الدخول من جديد')
      return
    }

    const machine = machines.find(m => m.id === logFormMachineId)
    if (!machine) {
      setLogFormError('المكينة المختارة غير موجودة')
      return
    }

    setLogFormError(null)
    setSavingLog(true)

    const producedAtIso = new Date(logForm.produced_at).toISOString()
    const line = machine.line_id ? lines.find(l => l.id === machine.line_id) : null

    const operatorFields =
      logForm.operator_mode === 'me'
        ? {
            operator_type: 'user' as OperatorType,
            operator_user_id: currentUser?.id ?? null,
            operator_employee_id: null,
            operator_name: currentUser?.name ?? 'المستخدم الحالي',
          }
        : {
            operator_type: 'employee' as OperatorType,
            operator_user_id: null,
            operator_employee_id: logForm.operator_employee_id,
            operator_name: employees.find(e => e.id === logForm.operator_employee_id)?.name ?? 'موظف',
          }

    const payload = {
      machine_id: machine.id,
      line_id: machine.line_id,
      machine_name_snapshot: machine.name,
      line_name_snapshot: line?.name ?? null,
      product_name: trimmedProduct,
      quantity: logForm.quantity,
      notes: logForm.notes,
      produced_at: producedAtIso,
      ...operatorFields,
    }

    const isEditing = Boolean(editingLogId)
    const previousLogs = productionLogs
    const optimisticId = editingLogId ?? `temp-${Date.now()}`
    const optimisticLog: ProductionLog = { id: optimisticId, ...payload }

    // تحديث محلي فوري (Optimistic UI)
    setProductionLogs(prev =>
      isEditing ? prev.map(l => (l.id === editingLogId ? optimisticLog : l)) : [optimisticLog, ...prev],
    )

    try {
      if (isEditing && editingLogId) {
        const updated = await apiFetch<ProductionLog>(`/api/production/logs/${editingLogId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        setProductionLogs(prev => prev.map(l => (l.id === editingLogId ? updated : l)))
      } else {
        const created = await apiFetch<ProductionLog>('/api/production/logs', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setProductionLogs(prev => prev.map(l => (l.id === optimisticId ? created : l)))
      }
      setShowLogForm(false)
    } catch (err) {
      setProductionLogs(previousLogs)
      setLogFormError(err instanceof Error ? err.message : 'تعذر حفظ تسجيل الإنتاج')
    } finally {
      setSavingLog(false)
    }
  }

  function handleDeleteLog(logId: string) {
    askConfirm('حذف تسجيل إنتاج', 'متأكد من حذف تسجيل الإنتاج ده؟', async () => {
      closeConfirm()
      setActionError(null)
      const previousLogs = productionLogs

      setProductionLogs(prev => prev.filter(l => l.id !== logId))

      try {
        await apiFetch(`/api/production/logs/${logId}`, { method: 'DELETE' })
      } catch (err) {
        setProductionLogs(previousLogs)
        setActionError(err instanceof Error ? err.message : 'تعذر حذف تسجيل الإنتاج')
      }
    })
  }

  function showAllLogsForMachine(machineId: string) {
    setLogsMachineFilter(machineId)
    setSearch('')
    setActiveTab('logs')
  }

  return (
    <div
      className="min-h-screen bg-[#0D1B2A] p-6 text-[#F0EDE8]"
      dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white mb-1">🏭 المكن وخطوط الإنتاج</h1>
          <p className="text-sm text-gray-500">
            {lines.length} خط إنتاج • {machines.length} مكينة • {productionLogs.length} تسجيل إنتاج
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'lines' && (
            <button
              onClick={openNewLineForm}
              className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
            >
              ➕ خط إنتاج جديد
            </button>
          )}
          {activeTab === 'machines' && (
            <button
              onClick={openNewMachineForm}
              className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
            >
              ➕ مكينة جديدة
            </button>
          )}
          {activeTab === 'logs' && (
            <button
              onClick={() => openNewLogForm()}
              disabled={machines.length === 0}
              className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              📋 تسجيل إنتاج جديد
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
          <span>⚠️ {loadError}</span>
          <button onClick={() => fetchAll()} className="text-xs font-bold underline hover:no-underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {actionError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-xs font-bold underline hover:no-underline">
            إغلاق
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {(Object.keys(MACHINE_STATUS_LABELS) as MachineStatus[]).map(status => (
          <div key={status} className="bg-[#111927] border border-white/5 rounded-2xl p-4">
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
          { key: 'logs' as const, label: '📊 سجل الإنتاج' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === tab.key
                ? 'bg-amber-500 text-black'
                : 'text-gray-400 hover:text-amber-400 hover:bg-white/5'
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
          placeholder={
            activeTab === 'lines'
              ? 'ابحث باسم خط الإنتاج...'
              : activeTab === 'machines'
                ? 'ابحث باسم/كود/رقم مسلسل المكينة...'
                : 'ابحث بالمنتج أو اسم اللي سجّل...'
          }
          className="flex-1 min-w-[200px] bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
        />
        {activeTab === 'lines' && (
          <select
            value={lineFilter}
            onChange={e => setLineFilter(e.target.value as 'all' | LineStatus)}
            className="bg-[#111927] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
          >
            <option value="all" className="bg-[#111927]">كل الحالات</option>
            {(Object.keys(LINE_STATUS_LABELS) as LineStatus[]).map(s => (
              <option key={s} value={s} className="bg-[#111927]">{LINE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        )}
        {activeTab === 'machines' && (
          <select
            value={machineFilter}
            onChange={e => setMachineFilter(e.target.value as 'all' | MachineStatus)}
            className="bg-[#111927] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
          >
            <option value="all" className="bg-[#111927]">كل الحالات</option>
            {(Object.keys(MACHINE_STATUS_LABELS) as MachineStatus[]).map(s => (
              <option key={s} value={s} className="bg-[#111927]">{MACHINE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        )}
        {activeTab === 'logs' && (
          <select
            value={logsMachineFilter}
            onChange={e => setLogsMachineFilter(e.target.value)}
            className="bg-[#111927] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50 max-w-[220px]"
          >
            <option value="all" className="bg-[#111927]">كل المكن</option>
            {machinesGroupedByLine.map(group => (
              <optgroup key={group.lineLabel} label={group.lineLabel} className="bg-[#111927]">
                {group.machines.map(m => (
                  <option key={m.id} value={m.id} className="bg-[#111927]">{m.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
          <Spinner className="w-6 h-6 text-amber-500" />
          <span>جاري التحميل...</span>
        </div>
      )}

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
                  <span className={`text-[11px] px-2.5 py-1 rounded-full border shrink-0 ${LINE_BADGE_COLORS[line.status]}`}>
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
          {filteredMachines.map(machine => {
            const recentLogs = getLogsForMachine(machine.id).slice(0, 3)
            return (
              <div
                key={machine.id}
                className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all group"
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

                {recentLogs.length > 0 && (
                  <div className="mb-4 pt-3 border-t border-white/5 space-y-1.5">
                    <p className="text-[10px] text-gray-500 font-bold mb-1">📋 آخر تسجيلات الإنتاج</p>
                    {recentLogs.map(log => (
                      <div key={log.id} className="text-[11px] text-gray-400 flex items-center justify-between gap-2">
                        <span className="truncate">
                          {log.product_name} × {log.quantity} — {log.operator_name}
                        </span>
                        <span className="text-gray-600 shrink-0">{formatLogDateTime(log.produced_at)}</span>
                      </div>
                    ))}
                    <button
                      onClick={() => showAllLogsForMachine(machine.id)}
                      className="text-[11px] text-amber-400 font-bold hover:underline"
                    >
                      عرض كل السجلات ←
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-3 border-t border-white/5">
                  <button
                    onClick={() => openNewLogForm(machine.id)}
                    className="flex-1 py-2 text-xs font-bold rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"
                  >
                    📋 تسجيل إنتاج
                  </button>
                  <button
                    onClick={() => openEditMachineForm(machine)}
                    className="px-3 py-2 text-xs font-bold rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteMachine(machine.id)}
                    className="px-3 py-2 text-xs font-bold rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}

          {filteredMachines.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-600 text-sm">
              لا توجد مكن مسجلة بعد — اضغط "➕ مكينة جديدة" للبدء
            </div>
          )}
        </div>
      )}

      {/* ══════════ تبويب: سجل الإنتاج ══════════ */}
      {!loading && activeTab === 'logs' && (
        <div className="space-y-3">
          {filteredLogs.map(log => (
            <div
              key={log.id}
              className="bg-[#111927] rounded-2xl border border-white/5 p-4 flex flex-wrap items-center gap-4"
            >
              <div className="min-w-[110px] text-xs text-gray-500">{formatLogDateTime(log.produced_at)}</div>

              <div className="min-w-[130px]">
                <p className="text-sm font-bold text-white">{getMachineDisplayName(log)}</p>
                <p className="text-[11px] text-gray-500">{log.line_name_snapshot || getLineName(log.line_id)}</p>
              </div>

              <div className="flex-1 min-w-[160px]">
                <p className="text-sm text-gray-200">
                  {log.product_name} <span className="text-amber-400 font-bold">× {log.quantity}</span>
                </p>
                {log.notes && <p className="text-[11px] text-gray-500 truncate">📝 {log.notes}</p>}
              </div>

              <div className="min-w-[120px] text-xs text-gray-400 flex items-center gap-1.5">
                <span>{log.operator_type === 'user' ? '👤' : '🧑‍🔧'}</span>
                <span>{log.operator_name}</span>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => openEditLogForm(log)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteLog(log.id)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="text-center py-16 text-gray-600 text-sm">
              لا توجد تسجيلات إنتاج بعد — اضغط "📋 تسجيل إنتاج جديد" للبدء
            </div>
          )}
        </div>
      )}

      {/* ══════════ Modal: فورم خط الإنتاج ══════════ */}
      {showLineForm && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={() => !savingLine && setShowLineForm(false)}
        >
          <div
            className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl"
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

            {lineFormError && <InlineError message={lineFormError} />}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveLine}
                disabled={savingLine}
                className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingLine ? (
                  <>
                    <Spinner className="w-4 h-4" /> جاري الحفظ...
                  </>
                ) : (
                  '✅ حفظ'
                )}
              </button>
              <button
                onClick={() => setShowLineForm(false)}
                disabled={savingLine}
                className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition disabled:opacity-50"
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
          onClick={() => !savingMachine && setShowMachineForm(false)}
        >
          <div
            className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl"
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

            {machineFormError && <InlineError message={machineFormError} />}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveMachine}
                disabled={savingMachine}
                className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingMachine ? (
                  <>
                    <Spinner className="w-4 h-4" /> جاري الحفظ...
                  </>
                ) : (
                  '✅ حفظ'
                )}
              </button>
              <button
                onClick={() => setShowMachineForm(false)}
                disabled={savingMachine}
                className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ Modal: فورم تسجيل الإنتاج ══════════ */}
      {showLogForm && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={() => !savingLog && setShowLogForm(false)}
        >
          <div
            className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-amber-400 mb-4">
              {editingLogId ? '✏️ تعديل تسجيل إنتاج' : '📋 تسجيل إنتاج جديد'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">المكينة *</label>
                <select
                  value={logFormMachineId}
                  onChange={e => setLogFormMachineId(e.target.value)}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                >
                  <option value="" className="bg-[#0D1B2A]">— اختر المكينة —</option>
                  {machinesGroupedByLine.map(group => (
                    <optgroup key={group.lineLabel} label={group.lineLabel} className="bg-[#0D1B2A]">
                      {group.machines.map(m => (
                        <option key={m.id} value={m.id} className="bg-[#0D1B2A]">{m.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">اسم المنتج *</label>
                <input
                  type="text"
                  value={logForm.product_name}
                  onChange={e => setLogForm(f => ({ ...f, product_name: e.target.value }))}
                  placeholder="مثال: قميص قطن مقاس L"
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">الكمية *</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={logForm.quantity}
                  onChange={e => setLogForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">تاريخ ووقت الإنتاج *</label>
                <input
                  type="datetime-local"
                  value={logForm.produced_at}
                  onChange={e => setLogForm(f => ({ ...f, produced_at: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">مين اللي عمل الإنتاج؟ *</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setLogForm(f => ({ ...f, operator_mode: 'me' }))}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                      logForm.operator_mode === 'me'
                        ? 'bg-amber-500 text-black border-amber-500'
                        : 'bg-[#0D1B2A] text-gray-400 border-white/10 hover:border-amber-500/30'
                    }`}
                  >
                    👤 أنا ({currentUser?.name ?? 'المستخدم الحالي'})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogForm(f => ({ ...f, operator_mode: 'employee' }))}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                      logForm.operator_mode === 'employee'
                        ? 'bg-amber-500 text-black border-amber-500'
                        : 'bg-[#0D1B2A] text-gray-400 border-white/10 hover:border-amber-500/30'
                    }`}
                  >
                    🧑‍🔧 موظف تاني
                  </button>
                </div>

                {logForm.operator_mode === 'employee' && (
                  <div>
                    {!showNewEmployeeInput ? (
                      <div className="flex gap-2">
                        <select
                          value={logForm.operator_employee_id}
                          onChange={e => setLogForm(f => ({ ...f, operator_employee_id: e.target.value }))}
                          className="flex-1 bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                        >
                          <option value="" className="bg-[#0D1B2A]">— اختر الموظف —</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id} className="bg-[#0D1B2A]">{emp.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowNewEmployeeInput(true)}
                          className="px-3 py-2 text-xs font-bold rounded-lg bg-white/5 text-amber-400 hover:bg-white/10 transition whitespace-nowrap"
                        >
                          ➕ موظف جديد
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newEmployeeName}
                          onChange={e => setNewEmployeeName(e.target.value)}
                          placeholder="اسم العامل الجديد"
                          className="flex-1 bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                        />
                        <button
                          type="button"
                          onClick={handleAddEmployee}
                          disabled={savingEmployee}
                          className="px-3 py-2 text-xs font-bold rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition disabled:opacity-50 whitespace-nowrap"
                        >
                          {savingEmployee ? <Spinner className="w-4 h-4" /> : 'حفظ'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewEmployeeInput(false)
                            setNewEmployeeError(null)
                          }}
                          className="px-3 py-2 text-xs font-bold rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition"
                        >
                          إلغاء
                        </button>
                      </div>
                    )}
                    {newEmployeeError && <InlineError message={newEmployeeError} />}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={logForm.notes}
                  onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {logFormError && <InlineError message={logFormError} />}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveLog}
                disabled={savingLog}
                className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingLog ? (
                  <>
                    <Spinner className="w-4 h-4" /> جاري الحفظ...
                  </>
                ) : (
                  '✅ حفظ التسجيل'
                )}
              </button>
              <button
                onClick={() => setShowLogForm(false)}
                disabled={savingLog}
                className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ نافذة التأكيد الموحّدة (بديل window.confirm) ══════════ */}
      <ConfirmDialog state={confirmState} onCancel={closeConfirm} />
    </div>
  )
}
