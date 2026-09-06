'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ══════════════════════════════════════════════════════════════════════════
// صفحة "تارجت الإنتاج" — صاحب المصنع يحدد تارجت لأي مكنة/موظف/خط إنتاج،
// والتارجت بيتحسب من الكمية الفعلية في production_logs (نفس الجدول اللي
// MachineLogsModal بيسجل فيه). محتاج قبل الاستخدام:
//   - تنفيذ migration_production_targets.sql
//   - الـ routes: /api/production/targets و /api/production/performance
// ══════════════════════════════════════════════════════════════════════════

type EntityType = 'machine' | 'employee' | 'production_line'
type Period = 'daily' | 'weekly' | 'monthly'

type Option = { id: string; name: string }

type PerformanceRow = {
  id: string
  entity_type: EntityType
  entity_id: string
  target_quantity: number
  period: Period
  actual_quantity: number
  achievement_percent: number
}

const ENTITY_LABELS: Record<EntityType, string> = {
  machine: '🏭 مكنة',
  employee: '👤 موظف',
  production_line: '🔗 خط إنتاج',
}

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
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

function achievementColor(percent: number) {
  if (percent >= 100) return 'text-[#3ED9C4]'
  if (percent >= 70) return 'text-amber-400'
  return 'text-red-400'
}

export default function ProductionTargetsPage() {
  const [performance, setPerformance] = useState<PerformanceRow[]>([])
  const [machines, setMachines] = useState<Option[]>([])
  const [employees, setEmployees] = useState<Option[]>([])
  const [lines, setLines] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    entity_type: 'machine' as EntityType,
    entity_id: '',
    target_quantity: 0,
    period: 'daily' as Period,
  })

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [perf, machinesData, employeesData, linesData] = await Promise.all([
        apiFetch<PerformanceRow[]>('/api/production/performance'),
        apiFetch<any[]>('/api/production/machines'),
        apiFetch<any[]>('/api/production/employees?active=true'),
        apiFetch<any[]>('/api/production/lines'),
      ])
      setPerformance(perf || [])
      setMachines((machinesData || []).map((m) => ({ id: m.id, name: m.name })))
      setEmployees((employeesData || []).map((e) => ({ id: e.id, name: e.name })))
      setLines((linesData || []).map((l) => ({ id: l.id, name: l.name })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  const entityOptions =
    form.entity_type === 'machine' ? machines
      : form.entity_type === 'employee' ? employees
      : lines

  function entityName(type: EntityType, id: string) {
    const list = type === 'machine' ? machines : type === 'employee' ? employees : lines
    return list.find((o) => o.id === id)?.name || '—'
  }

  async function handleSaveTarget() {
    if (!form.entity_id) return alert('اختار المكنة/الموظف/خط الإنتاج المطلوب')
    if (form.target_quantity <= 0) return alert('حدد كمية تارجت أكبر من صفر')

    setSaving(true)
    try {
      await apiFetch('/api/production/targets', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setForm((f) => ({ ...f, entity_id: '', target_quantity: 0 }))
      await loadAll()
    } catch (err) {
      alert('تعذر حفظ التارجت: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    } finally {
      setSaving(false)
    }
  }

  async function handleEndTarget(id: string) {
    if (!confirm('إنهاء التارجت ده؟')) return
    try {
      await apiFetch('/api/production/targets', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      })
      await loadAll()
    } catch (err) {
      alert('تعذر إنهاء التارجت: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6" dir="rtl">
      <h1 className="text-xl font-bold text-amber-400">🎯 تارجت الإنتاج</h1>
      <p className="text-sm text-gray-500">
        حدد تارجت لأي مكنة أو موظف أو خط إنتاج، وبيتحسب أوتوماتيك من الكمية المسجلة فعليًا.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
          ⚠️ {error}
        </div>
      )}

      {/* ── فورم إضافة تارجت ── */}
      <div className="bg-[#0D1B2A] border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex gap-2">
          {(Object.keys(ENTITY_LABELS) as EntityType[]).map((t) => (
            <button
              key={t}
              onClick={() => setForm((f) => ({ ...f, entity_type: t, entity_id: '' }))}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                form.entity_type === t
                  ? 'bg-amber-500 text-black'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {ENTITY_LABELS[t]}
            </button>
          ))}
        </div>

        <select
          value={form.entity_id}
          onChange={(e) => setForm((f) => ({ ...f, entity_id: e.target.value }))}
          className="w-full bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
        >
          <option value="">— اختر —</option>
          {entityOptions.map((opt) => (
            <option key={opt.id} value={opt.id} className="bg-[#08090A]">
              {opt.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            min={0}
            placeholder="كمية التارجت"
            value={form.target_quantity || ''}
            onChange={(e) => setForm((f) => ({ ...f, target_quantity: Number(e.target.value) }))}
            className="bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
          />
          <select
            value={form.period}
            onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as Period }))}
            className="bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
          >
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <option key={p} value={p} className="bg-[#08090A]">
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSaveTarget}
          disabled={saving}
          className="w-full py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
        >
          {saving ? 'جاري الحفظ...' : '✅ حفظ التارجت'}
        </button>
      </div>

      {/* ── الأداء الحالي ── */}
      <div>
        <h2 className="text-sm font-bold text-gray-400 mb-2">الأداء الحالي</h2>
        {loading ? (
          <div className="text-center py-8 text-gray-600 text-sm">جاري التحميل...</div>
        ) : performance.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">لا يوجد أي تارجت محدد لسه</div>
        ) : (
          <div className="space-y-2">
            {performance.map((row) => (
              <div
                key={row.id}
                className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-white">
                    {ENTITY_LABELS[row.entity_type]} · {entityName(row.entity_type, row.entity_id)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {row.actual_quantity} / {row.target_quantity} قطعة · {PERIOD_LABELS[row.period]}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${achievementColor(row.achievement_percent)}`}>
                    {row.achievement_percent}%
                  </span>
                  <button
                    onClick={() => handleEndTarget(row.id)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  >
                    إنهاء
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