'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const roles: Record<string, string> = {
  owner: 'مالك', admin: 'مدير', sales: 'مبيعات',
  production: 'إنتاج', quality: 'جودة', shipping: 'شحن', accountant: 'محاسب',
}

const roleColor: Record<string, string> = {
  owner:      'bg-amber-500/20 text-amber-400 border-amber-500/30',
  admin:      'bg-purple-500/20 text-purple-400 border-purple-500/30',
  sales:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
  production: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  quality:    'bg-green-500/20 text-green-400 border-green-500/30',
  shipping:   'bg-orange-500/20 text-orange-400 border-orange-500/30',
  accountant: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
}

const depts = ['المبيعات', 'الإنتاج', 'الجودة', 'الشحن', 'المحاسبة', 'الإدارة']
const targetTypes = ['طلبات', 'إيراد', 'وحدات إنتاج', 'عمليات شحن']

const inputCls = "w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
const thCls = "text-right text-xs text-gray-600 font-medium px-4 py-3"
const tdCls = "px-4 py-3 text-xs"

export default function EmployeesPage() {
  const [tab, setTab]             = useState<'employees' | 'permissions' | 'changelog'>('employees')
  const [employees, setEmployees] = useState<any[]>([])
  const [logs, setLogs]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [tenantId, setTenantId]   = useState<string | null>(null)
  const [copied, setCopied]       = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<string | null>(null)

  // ✅ حذف notes - لا يوجد عمود notes في جدول users
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', role: 'sales',
    phone: '', department: 'المبيعات', job_title: '',
    start_date: new Date().toISOString().split('T')[0],
    monthly_target: '', target_type: 'طلبات',
  })

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const { data: me } = await supabase.from('users').select('tenant_id').single()
        const tid = me?.tenant_id || null
        setTenantId(tid)
        if (!tid) { alert('خطأ في تحديد هوية الشركة'); return }

        const { data: empData } = await supabase
          .from('users').select('*').eq('tenant_id', tid).order('created_at', { ascending: false })
        setEmployees(empData || [])

        const { data: logData } = await supabase
          .from('activity_log').select('*, users(full_name, email)').eq('tenant_id', tid)
          .order('created_at', { ascending: false }).limit(100)
        setLogs(logData || [])
      } catch (err) {
        console.error('Error loading employees:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  function generatePassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#'
    let pass = ''
    for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)]
    setForm(f => ({ ...f, password: pass }))
  }

  async function copyText(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopied(id); setTimeout(() => setCopied(null), 2000)
  }

  async function handleAdd() {
    if (!form.full_name || !form.email || !form.password) { alert('الاسم والبريد وكلمة المرور مطلوبة'); return }
    if (form.password.length < 8) { alert('كلمة المرور ٨ أحرف على الأقل'); return }
    if (!tenantId) { alert('خطأ: لم يتم تحديد الشركة'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/create-employee', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // ✅ بدون notes
        body: JSON.stringify({
          email: form.email, password: form.password, full_name: form.full_name,
          role: form.role, phone: form.phone, tenant_id: tenantId,
          department: form.department, job_title: form.job_title, start_date: form.start_date,
          monthly_target: Number(form.monthly_target) || 0, target_type: form.target_type,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'حدث خطأ أثناء الإنشاء')
      setEmployees(e => [json.user, ...e])
      setShowForm(false)
      setForm({ full_name: '', email: '', password: '', role: 'sales', phone: '',
        department: 'المبيعات', job_title: '', start_date: new Date().toISOString().split('T')[0],
        monthly_target: '', target_type: 'طلبات' })
    } catch (err: any) {
      alert('❌ ' + err.message)
    } finally { setSaving(false) }
  }

  async function toggleActive(id: string, current: boolean) {
    const { error } = await supabase.from('users').update({ is_active: !current }).eq('id', id)
    if (!error) setEmployees(e => e.map(x => x.id === id ? { ...x, is_active: !current } : x))
  }

  // ✅ target_actual بدلاً من actual_performance
  async function updateTarget(id: string, target: number, actual: number) {
    const { error } = await supabase.from('users')
      .update({ monthly_target: target, target_actual: actual }).eq('id', id)
    if (!error) {
      setEmployees(e => e.map(x => x.id === id ? { ...x, monthly_target: target, target_actual: actual } : x))
      setEditTarget(null)
    }
  }

  async function updatePermission(id: string, field: string, value: boolean) {
    const { error } = await supabase.from('users').update({ [field]: value }).eq('id', id)
    if (!error) setEmployees(e => e.map(x => x.id === id ? { ...x, [field]: value } : x))
  }

  function getProgress(actual: number, target: number) {
    if (!target) return 0
    return Math.min(Math.round((actual / target) * 100), 100)
  }
  function getProgressColor(pct: number) {
    if (pct >= 100) return '#2ECC71'
    if (pct >= 70)  return '#C8963E'
    return '#E74C3C'
  }

  const tabs = [
    { key: 'employees',   label: '👥 الموظفون' },
    { key: 'permissions', label: '🔑 الصلاحيات' },
    { key: 'changelog',   label: '📋 سجل التغييرات' },
  ] as const

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">👥 الموظفين</h1>
          <p className="text-sm text-gray-500 mt-1">{employees.length} موظف</p>
        </div>
        {tab === 'employees' && (
          <button onClick={() => setShowForm(!showForm)}
            className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm">
            ➕ موظف جديد
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6 bg-[#111927] p-1.5 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition ${
              tab === t.key ? 'bg-amber-500 text-black' : 'text-gray-500 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ الموظفون ═══ */}
      {tab === 'employees' && (
        <>
          {showForm && (
            <div className="bg-[#111927] rounded-2xl border border-amber-500/20 p-6 mb-6">
              <h2 className="text-sm font-bold text-amber-400 mb-5">إضافة موظف جديد</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                {[
                  { label: 'الاسم الكامل *', key: 'full_name', placeholder: 'محمد أحمد' },
                  { label: 'البريد الإلكتروني *', key: 'email', placeholder: 'emp@factory.com', type: 'email' },
                  { label: 'رقم الهاتف', key: 'phone', placeholder: '01xxxxxxxxx' },
                  { label: 'المسمى الوظيفي', key: 'job_title', placeholder: 'مشرف إنتاج' },
                  { label: 'تاريخ البدء', key: 'start_date', type: 'date' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                    <input className={inputCls} type={f.type || 'text'} placeholder={f.placeholder}
                      value={(form as any)[f.key]} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">القسم</label>
                  <select className={inputCls} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    {depts.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">الدور</label>
                  <select className={inputCls} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">التارجت الشهري</label>
                  <input className={inputCls} type="number" placeholder="مثال: 50" value={form.monthly_target}
                    onChange={e => setForm(f => ({ ...f, monthly_target: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">نوع التارجت</label>
                  <select className={inputCls} value={form.target_type} onChange={e => setForm(f => ({ ...f, target_type: e.target.value }))}>
                    {targetTypes.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-xs text-gray-500 mb-1">كلمة المرور * (٨ أحرف+)</label>
                <div className="flex gap-2">
                  <input className={inputCls} placeholder="اكتب أو اضغط توليد" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  <button onClick={generatePassword} className="px-3 py-2 bg-white/10 text-gray-400 rounded-lg text-xs hover:bg-white/15 transition whitespace-nowrap">🔀 توليد</button>
                  {form.password && (
                    <button onClick={() => copyText(form.password, 'form')} className="px-3 py-2 bg-white/10 text-gray-400 rounded-lg text-xs hover:bg-white/15 transition whitespace-nowrap">
                      {copied === 'form' ? '✅' : '📋 نسخ'}
                    </button>
                  )}
                </div>
                {form.password && (
                  <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
                    ⚠️ ابعت كلمة المرور للموظف: <strong className="font-mono">{form.password}</strong>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={handleAdd} disabled={saving}
                  className="px-6 py-2.5 bg-amber-500 text-black font-bold rounded-xl text-sm hover:bg-amber-400 transition disabled:opacity-50">
                  {saving ? 'جاري الإنشاء...' : '✅ إنشاء الحساب'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-white/10 text-gray-400 rounded-xl text-sm hover:bg-white/5 transition">إلغاء</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-600">جاري تحميل الموظفين...</div>
          ) : (
            <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5">
                  <tr>
                    {['كود','الاسم','القسم','الوظيفة','تاريخ البدء','التارجت','نوع التارجت','الأداء الفعلي','الإنجاز %','الحالة',''].map(h => (
                      <th key={h} className={thCls}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, i) => {
                    // ✅ target_actual بدلاً من actual_performance
                    const pct    = getProgress(emp.target_actual || 0, emp.monthly_target || 0)
                    const pColor = getProgressColor(pct)
                    const code   = `EMP-${String(i + 1).padStart(3, '0')}`
                    return (
                      <tr key={emp.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className={tdCls + ' font-mono text-amber-400'}>{code}</td>
                        <td className={tdCls}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">{emp.full_name?.[0] || '?'}</div>
                            <div>
                              <div className="text-white font-semibold">{emp.full_name}</div>
                              <div className="text-gray-600 text-[10px]">{emp.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className={tdCls + ' text-gray-400'}>{emp.department || '—'}</td>
                        <td className={tdCls + ' text-gray-400'}>{emp.job_title || roles[emp.role] || '—'}</td>
                        <td className={tdCls + ' text-gray-500'}>
                          {emp.start_date ? new Date(emp.start_date).toLocaleDateString('ar-EG') : new Date(emp.created_at).toLocaleDateString('ar-EG')}
                        </td>
                        <td className={tdCls}>
                          {editTarget === emp.id ? (
                            <input type="number" defaultValue={emp.monthly_target || 0}
                              className="w-20 bg-[#0D1B2A] border border-amber-500/30 rounded px-2 py-1 text-xs text-white focus:outline-none"
                              onBlur={e => updateTarget(emp.id, Number(e.target.value), emp.target_actual || 0)} />
                          ) : (
                            <button onClick={() => setEditTarget(emp.id)} className="text-amber-400 font-bold hover:underline">{emp.monthly_target || '—'}</button>
                          )}
                        </td>
                        <td className={tdCls + ' text-gray-500'}>{emp.target_type || '—'}</td>
                        <td className={tdCls}>
                          {editTarget === emp.id ? (
                            <input type="number" defaultValue={emp.target_actual || 0}
                              className="w-20 bg-[#0D1B2A] border border-amber-500/30 rounded px-2 py-1 text-xs text-white focus:outline-none"
                              onBlur={e => updateTarget(emp.id, emp.monthly_target || 0, Number(e.target.value))} />
                          ) : (
                            <span className="text-white font-bold">{emp.target_actual || 0}</span>
                          )}
                        </td>
                        <td className={tdCls}>
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pColor }} />
                            </div>
                            <span style={{ color: pColor }} className="font-bold text-[10px]">{pct}%</span>
                          </div>
                        </td>
                        <td className={tdCls}>
                          <button onClick={() => toggleActive(emp.id, emp.is_active)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition ${emp.is_active ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-500/20 text-gray-500 border-gray-500/30'}`}>
                            {emp.is_active ? 'نشط' : 'غير نشط'}
                          </button>
                        </td>
                        <td className={tdCls}>
                          <button onClick={() => setEditTarget(editTarget === emp.id ? null : emp.id)} className="text-gray-600 hover:text-amber-400 transition text-xs">✏️</button>
                        </td>
                      </tr>
                    )
                  })}
                  {employees.length === 0 && (
                    <tr><td colSpan={11} className="text-center py-12 text-gray-600">لا يوجد موظفين مسجلين</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ الصلاحيات ═══ */}
      {tab === 'permissions' && (
        <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5">
              <tr>
                {['كود','الاسم','الدور','تعديل الإنتاج','تعديل الطلبات','المبيعات','إدارة المستخدمين','عرض العملاء','حالة الحساب','البريد','آخر دخول'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, i) => {
                const code = `EMP-${String(i + 1).padStart(3, '0')}`
                const perms = [
                  { key: 'can_edit_production', label: 'تعديل الإنتاج' },
                  { key: 'can_edit_orders',     label: 'تعديل الطلبات' },
                  { key: 'can_manage_sales',    label: 'المبيعات' },
                  { key: 'can_manage_users',    label: 'إدارة المستخدمين' },
                  { key: 'can_view_clients',    label: 'عرض العملاء' },
                ]
                return (
                  <tr key={emp.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className={tdCls + ' font-mono text-amber-400 text-[10px]'}>{code}</td>
                    <td className={tdCls}><div className="text-white font-semibold text-xs">{emp.full_name}</div></td>
                    <td className={tdCls}>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${roleColor[emp.role] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                        {roles[emp.role] || emp.role}
                      </span>
                    </td>
                    {perms.map(p => (
                      <td key={p.key} className={tdCls + ' text-center'}>
                        <button onClick={() => updatePermission(emp.id, p.key, !emp[p.key])}
                          className={`w-8 h-5 rounded-full transition-all relative ${emp[p.key] ? 'bg-green-500' : 'bg-gray-700'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${emp[p.key] ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                      </td>
                    ))}
                    <td className={tdCls}>
                      <button onClick={() => toggleActive(emp.id, emp.is_active)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${emp.is_active ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                        {emp.is_active ? 'مفعّل' : 'موقوف'}
                      </button>
                    </td>
                    <td className={tdCls + ' text-gray-500 text-[10px]'}>{emp.email}</td>
                    <td className={tdCls + ' text-gray-600 text-[10px]'}>
                      {/* ✅ last_login_at بدلاً من last_sign_in_at */}
                      {emp.last_login_at ? new Date(emp.last_login_at).toLocaleDateString('ar-EG') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ سجل التغييرات ═══ */}
      {tab === 'changelog' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="text-center py-16 text-gray-600">لا يوجد سجل نشاط</div>
          ) : (
            <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5">
                  <tr>
                    {['التاريخ والوقت','البريد الإلكتروني','العملية','نوع العنصر','التفاصيل'].map(h => (
                      <th key={h} className={thCls}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className={tdCls + ' text-gray-500 whitespace-nowrap'}>{new Date(log.created_at).toLocaleString('ar-EG')}</td>
                      <td className={tdCls + ' text-gray-400'}>{log.users?.email || '—'}</td>
                      <td className={tdCls}>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          log.action === 'create' ? 'bg-green-500/20 text-green-400' :
                          log.action === 'update' ? 'bg-blue-500/20 text-blue-400' :
                          log.action === 'delete' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                          {log.action === 'create' ? 'إنشاء' : log.action === 'update' ? 'تعديل' : log.action === 'delete' ? 'حذف' : log.action}
                        </span>
                      </td>
                      {/* ✅ entity_type و entity_label بدلاً من table_name و description */}
                      <td className={tdCls + ' font-mono text-amber-400 text-[10px]'}>{log.entity_type || '—'}</td>
                      <td className={tdCls + ' text-gray-500'}>{log.entity_label || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}