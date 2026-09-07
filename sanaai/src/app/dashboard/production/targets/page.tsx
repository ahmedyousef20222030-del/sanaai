'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

const departmentRoles: Record<string, string> = {
  owner: 'الإدارة العليا',
  admin: 'المديرين',
  sales: 'المبيعات',
  production: 'الإنتاج',
  design: 'التصميم',
  shipping: 'الشحن',
  hr: 'الموارد البشرية',
  accountant: 'الحسابات'
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

export default function TargetsCenterPage() {
  const [activeTab, setActiveTab] = useState<'financial' | 'operational'>('financial')
  
  // States for Operational Targets
  const [performance, setPerformance] = useState<PerformanceRow[]>([])
  const [machines, setMachines] = useState<Option[]>([])
  const [employees, setEmployees] = useState<Option[]>([])
  const [lines, setLines] = useState<Option[]>([])
  const [loadingOp, setLoadingOp] = useState(true)
  const [savingOp, setSavingOp] = useState(false)
  const [formOp, setFormOp] = useState({ entity_type: 'machine' as EntityType, entity_id: '', target_quantity: 0, period: 'daily' as Period })

  // States for Financial/Department Targets
  const [deptTargets, setDeptTargets] = useState<Record<string, number>>({})
  const [savingDept, setSavingDept] = useState<string | null>(null)
  const [loadingDept, setLoadingDept] = useState(true)
  
  const [error, setError] = useState<string | null>(null)

  const monthStart = new Date()
  monthStart.setDate(1)
  const monthKey = monthStart.toISOString().slice(0, 10)
  const monthLabel = monthStart.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })

  useEffect(() => {
    if (activeTab === 'operational') loadOperational()
    if (activeTab === 'financial') loadFinancial()
  }, [activeTab])

  async function getMyTenantId(): Promise<string> {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('تعذر التحقق من الهوية')
    const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    if (!me?.tenant_id) throw new Error('تعذر تحديد هوية الشركة')
    return me.tenant_id
  }

  // --- Financial Handlers ---
  async function loadFinancial() {
    setLoadingDept(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('department_targets')
        .select('department, target_amount')
        .eq('month', monthKey)

      if (error) throw error
      const map: Record<string, number> = {}
      ;(data || []).forEach(t => { map[t.department] = t.target_amount })
      setDeptTargets(map)
    } catch (err: any) {
      setError('خطأ في تحميل أهداف الأقسام: ' + err.message)
    } finally {
      setLoadingDept(false)
    }
  }

  async function saveDeptTarget(department: string, value: number) {
    setSavingDept(department)
    try {
      const tenantId = await getMyTenantId()
      const { error } = await supabase
        .from('department_targets')
        .upsert({ tenant_id: tenantId, department, month: monthKey, target_amount: value }, { onConflict: 'tenant_id,department,month' })

      if (error) throw error
      setDeptTargets(t => ({ ...t, [department]: value }))
    } catch (err: any) {
      alert('تعذر حفظ الهدف: ' + err.message)
    } finally {
      setSavingDept(null)
    }
  }

  // --- Operational Handlers ---
  async function loadOperational() {
    setLoadingOp(true)
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
      setLoadingOp(false)
    }
  }

  const entityOptions = formOp.entity_type === 'machine' ? machines : formOp.entity_type === 'employee' ? employees : lines
  const entityName = (type: EntityType, id: string) => {
    const list = type === 'machine' ? machines : type === 'employee' ? employees : lines
    return list.find((o) => o.id === id)?.name || '—'
  }

  async function handleSaveOpTarget() {
    if (!formOp.entity_id) return alert('برجاء تحديد المكنة/الموظف/خط الإنتاج')
    if (formOp.target_quantity <= 0) return alert('برجاء إدخال كمية صحيحة أكبر من صفر')

    setSavingOp(true)
    try {
      await apiFetch('/api/production/targets', { method: 'POST', body: JSON.stringify(formOp) })
      setFormOp((f) => ({ ...f, entity_id: '', target_quantity: 0 }))
      await loadOperational()
    } catch (err) {
      alert('تعذر الحفظ: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    } finally {
      setSavingOp(false)
    }
  }

  async function handleEndOpTarget(id: string) {
    if (!confirm('هل أنت متأكد من إنهاء هذا التارجت؟')) return
    try {
      await apiFetch('/api/production/targets', { method: 'DELETE', body: JSON.stringify({ id }) })
      await loadOperational()
    } catch (err) {
      alert('تعذر الإنهاء: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">🎯 مركز إدارة الأهداف (Targets)</h1>
        <p className="text-sm text-gray-500 mt-1">إدارة الأهداف المالية للأقسام والأهداف التشغيلية لخطوط الإنتاج</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('financial')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${activeTab === 'financial' ? 'bg-amber-500 text-black' : 'bg-[#111927] text-gray-400 hover:bg-white/5'}`}
        >
          💰 الأهداف المالية للأقسام (شهري)
        </button>
        <button
          onClick={() => setActiveTab('operational')}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${activeTab === 'operational' ? 'bg-amber-500 text-black' : 'bg-[#111927] text-gray-400 hover:bg-white/5'}`}
        >
          ⚙️ الأهداف التشغيلية للإنتاج
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 mb-6">
          ⚠️ {error}
        </div>
      )}

      {/* ── تبويب: الأهداف المالية للأقسام ── */}
      {activeTab === 'financial' && (
        <div className="bg-[#111927] rounded-2xl border border-white/5 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-amber-400 mb-1">أهداف الأقسام لشهر — {monthLabel}</h2>
            <p className="text-sm text-gray-500">حدد القيم المستهدفة لكل قسم، وستنعكس في تقارير أداء موظفي القسم مباشرة.</p>
          </div>

          {loadingDept ? (
             <div className="text-center py-10 text-gray-600">جاري تحميل البيانات...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(departmentRoles).map(([key, label]) => (
                <div key={key} className="flex flex-col gap-2 bg-[#0D1B2A] rounded-xl p-4 border border-white/5 hover:border-amber-500/30 transition">
                  <span className="text-sm font-bold text-gray-300">{label}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      defaultValue={deptTargets[key] || 0}
                      onBlur={e => {
                        const val = Number(e.target.value) || 0
                        if (val !== (deptTargets[key] || 0)) saveDeptTarget(key, val)
                      }}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500/50 text-left font-mono"
                      dir="ltr"
                    />
                    <span className="text-xs text-gray-500 shrink-0">ج.م</span>
                  </div>
                  {savingDept === key && <span className="text-[10px] text-amber-400 animate-pulse">جاري الحفظ...</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── تبويب: الأهداف التشغيلية ── */}
      {activeTab === 'operational' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* نموذج الإضافة */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-[#111927] border border-white/5 rounded-2xl p-5">
              <h2 className="font-bold text-white mb-4">➕ إسناد تارجت تشغيلي</h2>
              
              <div className="flex bg-[#0D1B2A] rounded-lg p-1 mb-4">
                {(Object.keys(ENTITY_LABELS) as EntityType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFormOp((f) => ({ ...f, entity_type: t, entity_id: '' }))}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${
                      formOp.entity_type === t ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {ENTITY_LABELS[t]}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">الجهة المستهدفة</label>
                  <select
                    value={formOp.entity_id}
                    onChange={(e) => setFormOp((f) => ({ ...f, entity_id: e.target.value }))}
                    className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                  >
                    <option value="">— اختر من القائمة —</option>
                    {entityOptions.map((opt) => (
                      <option key={opt.id} value={opt.id} className="bg-[#08090A]">{opt.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">الكمية (قطعة)</label>
                    <input
                      type="number"
                      min={0}
                      value={formOp.target_quantity || ''}
                      onChange={(e) => setFormOp((f) => ({ ...f, target_quantity: Number(e.target.value) }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">الفترة الزمنية</label>
                    <select
                      value={formOp.period}
                      onChange={(e) => setFormOp((f) => ({ ...f, period: e.target.value as Period }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                    >
                      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                        <option key={p} value={p} className="bg-[#08090A]">{PERIOD_LABELS[p]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleSaveOpTarget}
                  disabled={savingOp}
                  className="w-full mt-2 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {savingOp ? 'جاري الإسناد...' : '✅ حفظ وبدء القياس'}
                </button>
              </div>
            </div>
          </div>

          {/* قائمة الأداء */}
          <div className="lg:col-span-8">
            <div className="bg-[#111927] border border-white/5 rounded-2xl p-5 min-h-[400px]">
              <h2 className="font-bold text-white mb-4 border-b border-white/5 pb-2">📊 تقرير الأداء المباشر</h2>
              {loadingOp ? (
                <div className="text-center py-12 text-gray-600 text-sm">جاري حساب نسب الإنجاز...</div>
              ) : performance.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center">
                  <span className="text-4xl mb-3 opacity-20">📭</span>
                  <p className="text-gray-500 text-sm">لا يوجد أي أهداف تشغيلية مسندة حالياً</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {performance.map((row) => (
                    <div key={row.id} className="bg-[#0D1B2A] border border-white/5 rounded-xl p-4 flex items-center justify-between hover:border-white/10 transition group">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">{ENTITY_LABELS[row.entity_type]}</span>
                          <p className="text-sm font-bold text-white">{entityName(row.entity_type, row.entity_id)}</p>
                        </div>
                        <p className="text-xs text-gray-500 flex items-center gap-2">
                          <span>الهدف: {row.target_quantity}</span>
                          <span className="w-1 h-1 rounded-full bg-white/20"></span>
                          <span>المُنجز: <b className="text-gray-300">{row.actual_quantity}</b></span>
                          <span className="w-1 h-1 rounded-full bg-white/20"></span>
                          <span className="text-amber-500/70">{PERIOD_LABELS[row.period]}</span>
                        </p>
                      </div>
                      
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-1.5 bg-black/50 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${row.achievement_percent >= 100 ? 'bg-[#3ED9C4]' : row.achievement_percent >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(row.achievement_percent, 100)}%` }}
                            />
                          </div>
                          <span className={`text-lg font-black min-w-[50px] text-right ${achievementColor(row.achievement_percent)}`}>
                            {row.achievement_percent}%
                          </span>
                        </div>
                        <button
                          onClick={() => handleEndOpTarget(row.id)}
                          className="text-[10px] px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          إيقاف التارجت
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}