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
  machine: '🏭 ماكينة تشغيل',
  employee: '👤 موظف / فني',
  production_line: '🔗 خط إنتاج متكامل',
}

const PERIOD_LABELS: Record<Period, string> = { daily: 'تارجت يومي', weekly: 'تارجت أسبوعي', monthly: 'تارجت شهري' }

// الأقسام المستهدفة مالياً
const departmentRoles: Record<string, string> = {
  sales: 'قسم المبيعات والتسويق',
  production: 'إدارة الإنتاج والتشغيل',
  shipping: 'إدارة الشحن والتوزيع',
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string>) }
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

  const res = await fetch(url, { ...options, headers })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message || json?.message || 'خطأ غير متوقع في جلب البيانات')
  return (json?.data ?? json) as T
}

export default function TargetsCenterPage() {
  const [activeTab, setActiveTab] = useState<'operational' | 'financial'>('operational')
  
  // ── States: Operational Targets ──
  const [performance, setPerformance] = useState<PerformanceRow[]>([])
  const [machines, setMachines] = useState<Option[]>([])
  const [employees, setEmployees] = useState<Option[]>([])
  const [lines, setLines] = useState<Option[]>([])
  const [loadingOp, setLoadingOp] = useState(true)
  const [savingOp, setSavingOp] = useState(false)
  const [formOp, setFormOp] = useState({ entity_type: 'employee' as EntityType, entity_id: '', target_quantity: 0, period: 'daily' as Period })

  // ── States: Financial Targets ──
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('يرجى تسجيل الدخول')
    const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    if (!me?.tenant_id) throw new Error('معرف الشركة مفقود')
    return me.tenant_id
  }

  // ── Logic: Financial ──
  async function loadFinancial() {
    setLoadingDept(true); setError(null)
    try {
      const { data, error } = await supabase.from('department_targets').select('department, target_amount').eq('month', monthKey)
      if (error) throw error
      const map: Record<string, number> = {}
      ;(data || []).forEach(t => { map[t.department] = t.target_amount })
      setDeptTargets(map)
    } catch (err: any) {
      setError('خطأ جلب أهداف الأقسام: ' + err.message)
    } finally { setLoadingDept(false) }
  }

  async function saveDeptTarget(department: string, value: number) {
    setSavingDept(department)
    try {
      const tenantId = await getMyTenantId()
      const { error } = await supabase.from('department_targets').upsert({ tenant_id: tenantId, department, month: monthKey, target_amount: value }, { onConflict: 'tenant_id,department,month' })
      if (error) throw error
      setDeptTargets(t => ({ ...t, [department]: value }))
    } catch (err: any) {
      alert('تعذر الحفظ: ' + err.message)
    } finally { setSavingDept(null) }
  }

  // ── Logic: Operational ──
  async function loadOperational() {
    setLoadingOp(true); setError(null)
    try {
      const [perf, machinesData, employeesData, linesData] = await Promise.all([
        apiFetch<PerformanceRow[]>('/api/production/performance'),
        apiFetch<any[]>('/api/production/machines'),
        apiFetch<any[]>('/api/production/employees?active=true'),
        apiFetch<any[]>('/api/production/lines'),
      ])
      setPerformance(perf || [])
      setMachines((machinesData || []).map(m => ({ id: m.id, name: m.name })))
      setEmployees((employeesData || []).map(e => ({ id: e.id, name: e.name })))
      setLines((linesData || []).map(l => ({ id: l.id, name: l.name })))
    } catch (err: any) {
      setError(err.message || 'فشل تحميل البيانات التشغيلية')
    } finally { setLoadingOp(false) }
  }

  const entityOptions = formOp.entity_type === 'machine' ? machines : formOp.entity_type === 'employee' ? employees : lines
  const entityName = (type: EntityType, id: string) => {
    const list = type === 'machine' ? machines : type === 'employee' ? employees : lines
    return list.find(o => o.id === id)?.name || 'غير معروف'
  }

  async function handleSaveOpTarget() {
    if (!formOp.entity_id || formOp.target_quantity <= 0) return alert('الرجاء اختيار الجهة وتحديد كمية أكبر من صفر.')
    setSavingOp(true)
    try {
      await apiFetch('/api/production/targets', { method: 'POST', body: JSON.stringify(formOp) })
      setFormOp(f => ({ ...f, entity_id: '', target_quantity: 0 }))
      await loadOperational()
    } catch (err: any) {
      alert('فشل الإسناد: ' + err.message)
    } finally { setSavingOp(false) }
  }

  async function handleEndOpTarget(id: string) {
    if (!confirm('سيتم إيقاف حساب هذا التارجت، هل توافق؟')) return
    try {
      await apiFetch('/api/production/targets', { method: 'DELETE', body: JSON.stringify({ id }) })
      await loadOperational()
    } catch (err: any) {
      alert('فشل الإيقاف: ' + err.message)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-8">
        <h1 className="text-2xl font-black text-white">🎯 مركز إدارة الأهداف (KPIs)</h1>
        <p className="text-sm text-gray-500 mt-1">لوحة قيادة شاملة لمتابعة الأهداف الكمية لخطوط الإنتاج، والأهداف المالية للأقسام</p>
      </div>

      {/* ── Tabs Navigation ── */}
      <div className="flex bg-[#111927] border border-white/10 rounded-xl p-1 mb-6 w-fit">
        <button onClick={() => setActiveTab('operational')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'operational' ? 'bg-amber-500 text-black shadow-md' : 'text-gray-400 hover:text-white'}`}>
          ⚙️ الأهداف التشغيلية (كميات)
        </button>
        <button onClick={() => setActiveTab('financial')} className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'financial' ? 'bg-amber-500 text-black shadow-md' : 'text-gray-400 hover:text-white'}`}>
          💰 أهداف الأقسام (مالي)
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 mb-6">⚠️ {error}</div>
      )}

      {/* ── Tab Content: Financial Targets ── */}
      {activeTab === 'financial' && (
        <div className="bg-[#111927] rounded-2xl border border-white/5 p-6 animate-in fade-in">
          <div className="mb-6 flex justify-between items-end">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">المستهدف المالي للأقسام</h2>
              <p className="text-sm text-gray-500">مؤشرات قياس الأداء (شهرياً) لشهر: <span className="text-amber-400">{monthLabel}</span></p>
            </div>
          </div>

          {loadingDept ? (
             <div className="text-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Object.entries(departmentRoles).map(([key, label]) => (
                <div key={key} className="bg-[#0D1B2A] rounded-xl p-5 border border-white/5 hover:border-amber-500/30 transition shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-1 h-full bg-amber-500/30 group-hover:bg-amber-500 transition-colors"></div>
                  <label className="block text-sm font-bold text-gray-300 mb-3">{label}</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      defaultValue={deptTargets[key] || 0}
                      onBlur={e => { const val = Number(e.target.value) || 0; if (val !== (deptTargets[key] || 0)) saveDeptTarget(key, val) }}
                      className="w-full bg-black/40 border border-white/10 rounded-lg pr-4 pl-12 py-3 text-lg text-white outline-none focus:border-amber-500/70 font-mono transition-colors"
                      dir="ltr"
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-bold">ج.م</span>
                  </div>
                  {savingDept === key && <span className="text-[10px] text-amber-400 mt-2 block animate-pulse">جاري المزامنة...</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Content: Operational Targets ── */}
      {activeTab === 'operational' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-in fade-in">
          {/* Form */}
          <div className="xl:col-span-4 h-fit">
            <div className="bg-[#111927] border border-white/5 rounded-2xl p-6 sticky top-6 shadow-sm">
              <h2 className="font-bold text-white mb-5 text-lg">➕ إسناد تارجت تشغيلي</h2>
              
              <div className="flex bg-[#0D1B2A] rounded-lg p-1 mb-5">
                {(Object.keys(ENTITY_LABELS) as EntityType[]).map(t => (
                  <button key={t} onClick={() => setFormOp(f => ({ ...f, entity_type: t, entity_id: '' }))} className={`flex-1 py-2 rounded-md text-xs font-bold transition ${formOp.entity_type === t ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'}`}>
                    {ENTITY_LABELS[t].split(' ')[0]} {/* Icon only for small screens if needed, here just keeping first word or icon */}
                    <span className="hidden sm:inline"> {ENTITY_LABELS[t].split(' ')[1]}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">اختر (الموظف / الماكينة)</label>
                  <select value={formOp.entity_id} onChange={e => setFormOp(f => ({ ...f, entity_id: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50">
                    <option value="">— اضغط للاختيار —</option>
                    {entityOptions.map(opt => <option key={opt.id} value={opt.id} className="bg-[#08090A]">{opt.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">الكمية المستهدفة</label>
                    <input type="number" min={0} value={formOp.target_quantity || ''} onChange={e => setFormOp(f => ({ ...f, target_quantity: Number(e.target.value) }))} placeholder="0" className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">المدة</label>
                    <select value={formOp.period} onChange={e => setFormOp(f => ({ ...f, period: e.target.value as Period }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50">
                      {(Object.keys(PERIOD_LABELS) as Period[]).map(p => <option key={p} value={p} className="bg-[#08090A]">{PERIOD_LABELS[p]}</option>)}
                    </select>
                  </div>
                </div>

                <button onClick={handleSaveOpTarget} disabled={savingOp} className="w-full mt-4 py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50 shadow-lg shadow-amber-500/20">
                  {savingOp ? 'جاري التنفيذ...' : '✅ بدء القياس والمتابعة'}
                </button>
              </div>
            </div>
          </div>

          {/* Performance Dashboard */}
          <div className="xl:col-span-8">
            <div className="bg-[#111927] border border-white/5 rounded-2xl p-6 min-h-[400px]">
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/5">
                <h2 className="font-bold text-white text-lg flex items-center gap-2"><span>📊</span> شاشة مراقبة الأداء (Live)</h2>
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-md border border-green-400/20">تحديث تلقائي</span>
              </div>
              
              {loadingOp ? (
                <div className="text-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div></div>
              ) : performance.length === 0 ? (
                <div className="text-center py-20 flex flex-col items-center">
                  <span className="text-5xl mb-4 opacity-20">📭</span>
                  <p className="text-gray-400">لا يوجد أهداف نشطة حالياً. قم بإسناد تارجت للبدء.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {performance.map(row => {
                    const isSuccess = row.achievement_percent >= 100;
                    const isWarning = row.achievement_percent >= 50 && row.achievement_percent < 100;
                    const barColor = isSuccess ? 'bg-[#3ED9C4]' : isWarning ? 'bg-amber-400' : 'bg-red-500';
                    const textColor = isSuccess ? 'text-[#3ED9C4]' : isWarning ? 'text-amber-400' : 'text-red-400';

                    return (
                      <div key={row.id} className="bg-[#0D1B2A] border border-white/5 rounded-xl p-5 hover:border-white/10 transition relative group">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-white/5 mb-2 inline-block">{ENTITY_LABELS[row.entity_type]}</span>
                            <h3 className="text-sm font-bold text-white truncate pr-1">{entityName(row.entity_type, row.entity_id)}</h3>
                            <p className="text-[11px] text-gray-500 mt-1">{PERIOD_LABELS[row.period]}</p>
                          </div>
                          <button onClick={() => handleEndOpTarget(row.id)} className="text-[10px] text-red-400 bg-red-400/10 hover:bg-red-400/20 px-2 py-1 rounded transition opacity-0 group-hover:opacity-100">
                            إيقاف
                          </button>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-gray-400">الإنتاج: <span className="text-white font-bold text-sm">{row.actual_quantity}</span></span>
                            <span className="text-gray-500">الهدف: {row.target_quantity}</span>
                          </div>
                          <div className="relative w-full h-2 bg-black/60 rounded-full overflow-hidden">
                            <div className={`absolute top-0 right-0 h-full rounded-full transition-all duration-1000 ${barColor}`} style={{ width: `${Math.min(row.achievement_percent, 100)}%` }} />
                          </div>
                          <div className={`text-left text-lg font-black font-mono ${textColor}`}>
                            {row.achievement_percent}%
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}