'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ══════════════════════════════════════════════════════════════════════════
// صفحة "تارجت الإنتاج" — صاحب المصنع يحدد تارجت لأي مكنة/موظف/خط إنتاج،
// والتارجت بيتحسب من الكمية الفعلية في production_logs (نفس الجدول اللي
// MachineLogsModal بيسجل فيه). محتاج قبل الاستخدام:
//   - تنفيذ migration_production_targets.sql
//   - الـ routes: /api/production/targets و /api/production/performance
//   - الـ route: /api/production/employees لازم يرجع حقل user_id لكل موظف
//     (بدل الاعتماد على استعلام Supabase مباشر من الكلاينت — Zero-Trust)
// ══════════════════════════════════════════════════════════════════════════

type EntityType = 'machine' | 'employee' | 'production_line'
type Period = 'daily' | 'weekly' | 'monthly'

type Option = { id: string; name: string; user_id?: string | null } // 🔹 مضاف للترابط

type PerformanceRow = {
  id: string
  entity_type: EntityType
  entity_id: string
  target_quantity: number
  period: Period
  actual_quantity: number
  achievement_percent: number
}

// شكل الاستجابة الخام القادمة من الـ API قبل التطبيع (بدون any)
type ApiEntity = { id: string; name: string; user_id?: string | null }

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
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

  const res = await fetch(url, { ...options, headers })

  // 🔹 لو الرد مش JSON صالح (خطأ سيرفر 500 بدون body مثلاً) بنطلع رسالة واضحة
  // بدل ما نسيب "An unexpected error occurred" العامة تظهر للمستخدم بدون سبب حقيقي.
  const rawText = await res.text()
  let json: { data?: unknown; error?: { message?: string }; message?: string } | null = null
  if (rawText) {
    try {
      json = JSON.parse(rawText)
    } catch {
      json = null
    }
  }

  if (!res.ok) {
    const message =
      json?.error?.message ||
      json?.message ||
      `فشل الطلب (كود ${res.status}) — تأكد من تنفيذ الـ migration وربط الـ API الصحيح`
    throw new Error(message)
  }

  return (json?.data ?? json ?? ([] as unknown)) as T
}

function achievementColor(percent: number) {
  if (percent >= 100) return 'text-[#3ED9C4]'
  if (percent >= 70) return 'text-amber-400'
  return 'text-red-400'
}

function normalizeOptions(raw: ApiEntity[] | null | undefined): Option[] {
  return (raw ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    user_id: item.user_id ?? null,
  }))
}

export default function ProductionTargetsPage() {
  const [performance, setPerformance] = useState<PerformanceRow[]>([])
  const [machines, setMachines] = useState<Option[]>([])
  const [employees, setEmployees] = useState<Option[]>([])
  const [lines, setLines] = useState<Option[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // 🔹 لإدارة تأكيد "إنهاء التارجت" داخل الواجهة بدل confirm() البدائية
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const [form, setForm] = useState({
    entity_type: 'machine' as EntityType,
    entity_id: '',
    target_quantity: 0,
    period: 'daily' as Period,
  })

  // ── تحميل قوائم الكيانات (مكنات/موظفين/خطوط) + الأداء الحالي ──
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [perf, machinesData, employeesData, linesData] = await Promise.all([
        apiFetch<PerformanceRow[]>('/api/production/performance'),
        apiFetch<ApiEntity[]>('/api/production/machines'),
        // 🔹 الموظفين بيرجعوا بحقل user_id جاهز من الـ API نفسه (Server-side)
        // بدل استعلام Supabase مباشر من الكلاينت اللي كان بيكسر عزل الـ tenant
        // ويعتمد فقط على RLS بدون أي تحكم إضافي على السيرفر.
        apiFetch<ApiEntity[]>('/api/production/employees?active=true'),
        apiFetch<ApiEntity[]>('/api/production/lines'),
      ])

      setPerformance(perf ?? [])
      setMachines(normalizeOptions(machinesData))
      setEmployees(normalizeOptions(employeesData))
      setLines(normalizeOptions(linesData))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── إعادة تحميل الأداء فقط بعد الحفظ/الإنهاء (أسرع من إعادة تحميل كل شيء) ──
  const reloadPerformance = useCallback(async () => {
    const perf = await apiFetch<PerformanceRow[]>('/api/production/performance')
    setPerformance(perf ?? [])
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const entityOptions = useMemo<Option[]>(() => {
    if (form.entity_type === 'machine') return machines
    if (form.entity_type === 'employee') return employees
    return lines
  }, [form.entity_type, machines, employees, lines])

  const entityName = useCallback(
    (type: EntityType, id: string) => {
      const list = type === 'machine' ? machines : type === 'employee' ? employees : lines
      return list.find((o) => o.id === id)?.name || '—'
    },
    [machines, employees, lines],
  )

  const employeeIsLinked = useCallback(
    (id: string) => employees.some((e) => e.id === id && !!e.user_id),
    [employees],
  )

  async function handleSaveTarget() {
    setFormError(null)

    if (!form.entity_id) {
      setFormError('اختار المكنة/الموظف/خط الإنتاج المطلوب')
      return
    }
    if (!form.target_quantity || form.target_quantity <= 0) {
      setFormError('حدد كمية تارجت أكبر من صفر')
      return
    }

    setSaving(true)
    try {
      await apiFetch('/api/production/targets', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setForm((f) => ({ ...f, entity_id: '', target_quantity: 0 }))
      await reloadPerformance()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر حفظ التارجت')
    } finally {
      setSaving(false)
    }
  }

  // ── إنهاء تارجت مع Optimistic UI وتراجع تلقائي عند الفشل ──
  async function handleEndTarget(id: string) {
    setConfirmingId(null)
    setRowError(null)
    setEndingId(id)

    const previousPerformance = performance
    setPerformance((rows) => rows.filter((r) => r.id !== id))

    try {
      await apiFetch('/api/production/targets', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      })
    } catch (err) {
      // 🔹 تراجع فوري لو الطلب فشل في السيرفر
      setPerformance(previousPerformance)
      setRowError(err instanceof Error ? err.message : 'تعذر إنهاء التارجت')
    } finally {
      setEndingId(null)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 font-[Cairo]" dir="rtl">
      <h1 className="text-xl font-bold text-amber-400">🎯 تارجت الإنتاج</h1>
      <p className="text-sm text-gray-500">
        حدد تارجت لأي مكنة أو موظف أو خط إنتاج، وبيتحسب أوتوماتيك من الكمية المسجلة فعليًا.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
          ⚠️ {error}
        </div>
      )}

      {rowError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
          <span>⚠️ {rowError}</span>
          <button
            onClick={() => setRowError(null)}
            className="text-[11px] text-red-300 hover:text-red-200 px-2"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* ── فورم إضافة تارجت ── */}
      <div className="bg-[#0D1B2A] border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex gap-2">
          {(Object.keys(ENTITY_LABELS) as EntityType[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setFormError(null)
                setForm((f) => ({ ...f, entity_type: t, entity_id: '' }))
              }}
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
          className="w-full bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50"
        >
          <option value="">— اختر —</option>
          {entityOptions.map((opt) => (
            <option key={opt.id} value={opt.id} className="bg-[#08090A]">
              {opt.name} {opt.user_id ? '(له حساب نظام 🟢)' : ''}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            min={0}
            placeholder="كمية التارجت"
            value={form.target_quantity || ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, target_quantity: Number(e.target.value) || 0 }))
            }
            className="bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50"
          />
          <select
            value={form.period}
            onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as Period }))}
            className="bg-[#08090A] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50"
          >
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <option key={p} value={p} className="bg-[#08090A]">
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        {formError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-3 py-2">
            ⚠️ {formError}
          </div>
        )}

        <button
          onClick={handleSaveTarget}
          disabled={saving}
          className="w-full py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
              جاري الحفظ...
            </>
          ) : (
            '✅ حفظ التارجت'
          )}
        </button>
      </div>

      {/* ── الأداء الحالي ── */}
      <div>
        <h2 className="text-sm font-bold text-gray-400 mb-2">الأداء الحالي</h2>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-600 text-sm">
            <span className="w-4 h-4 border-2 border-gray-600/40 border-t-gray-400 rounded-full animate-spin" />
            جاري التحميل...
          </div>
        ) : performance.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">لا يوجد أي تارجت محدد لسه</div>
        ) : (
          <div className="space-y-2">
            {performance.map((row) => (
              <div
                key={row.id}
                className={`bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between transition-opacity ${
                  endingId === row.id ? 'opacity-50' : ''
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#F0EDE8]">
                      {ENTITY_LABELS[row.entity_type]} · {entityName(row.entity_type, row.entity_id)}
                    </p>
                    {/* 🔹 إظهار شارة الترابط */}
                    {row.entity_type === 'employee' && employeeIsLinked(row.entity_id) && (
                      <span
                        className="text-[10px] text-sky-400 bg-sky-400/10 px-1.5 py-0.5 rounded border border-sky-400/20"
                        title="هذا الموظف متصل بالنظام"
                      >
                        🔗 متصل
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {row.actual_quantity} / {row.target_quantity} قطعة · {PERIOD_LABELS[row.period]}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${achievementColor(row.achievement_percent)}`}>
                    {row.achievement_percent}%
                  </span>

                  {confirmingId === row.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-400">تأكيد؟</span>
                      <button
                        onClick={() => handleEndTarget(row.id)}
                        disabled={endingId === row.id}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500 text-white hover:bg-red-400 disabled:opacity-50"
                      >
                        نعم
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(row.id)}
                      disabled={endingId === row.id}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      إنهاء
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}