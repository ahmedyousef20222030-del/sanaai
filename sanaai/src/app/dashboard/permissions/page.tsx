'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ── تعريف الأدوار (متطابقة مع users_role_check في قاعدة البيانات) ──
const roles: Record<string, string> = {
  owner: 'مالك',
  admin: 'مدير',
  sales: 'مبيعات',
  production: 'إنتاج',
  design: 'تصميم',
  shipping: 'شحن',
  hr: 'موارد بشرية',
  accountant: 'محاسب',
  employee: 'موظف',
}

type Employee = {
  id: string
  name: string
  phone: string
  role: string
  salary: number
}

type AppUser = {
  id: string
  full_name: string
  email: string
  role: string
}

// ── دالة موحّدة لجلب tenant_id بأمان (بدل تكرارها في كل مكان) ──
async function getMyTenantId(): Promise<string> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('تعذر التحقق من هوية المستخدم، برجاء تسجيل الدخول مرة أخرى')
  }

  const { data: me, error: meError } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (meError) {
    throw new Error(`تعذر تحديد هوية الشركة: ${meError.message}`)
  }
  if (!me?.tenant_id) {
    throw new Error('تعذر تحديد هوية الشركة: لا يوجد tenant_id مرتبط بهذا المستخدم')
  }

  return me.tenant_id
}

export default function PermissionsPage() {
  const [activeTab, setActiveTab] = useState<'employees' | 'roles'>('roles')

  // ── حالة تبويب "صلاحيات المستخدمين" ──
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [rolesError, setRolesError] = useState<string | null>(null)

  // ── حالة تبويب "الموظفين" ──
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', role: 'production', salary: 0 })

  useEffect(() => {
    loadUsers()
    loadEmployees()
  }, [])

  async function loadUsers() {
    setLoadingUsers(true)
    setRolesError(null)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .order('full_name', { ascending: true })
      if (error) throw error
      setAppUsers(data || [])
    } catch (err: any) {
      setRolesError(err.message || 'حدث خطأ أثناء تحميل المستخدمين')
    } finally {
      setLoadingUsers(false)
    }
  }

  async function updateRole(id: string, role: string) {
    setSavingRole(id)
    try {
      const { error } = await supabase.from('users').update({ role }).eq('id', id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))
    } catch (err: any) {
      alert('تعذر تغيير الدور: ' + err.message + '\nملحوظة: تغيير الأدوار مسموح به فقط لصاحب الحساب (owner).')
    } finally {
      setSavingRole(null)
    }
  }

  async function loadEmployees() {
    setLoadingEmployees(true)
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      setEmployees(data || [])
    } catch (err: any) {
      console.error('Error loading employees:', err.message)
    } finally {
      setLoadingEmployees(false)
    }
  }

  async function handleAddEmployee() {
    if (!form.name.trim()) {
      alert('الاسم مطلوب')
      return
    }
    setSaving(true)
    try {
      const tenantId = await getMyTenantId()
      const { error } = await supabase.from('employees').insert({ ...form, tenant_id: tenantId })
      if (error) throw error

      setShowForm(false)
      setForm({ name: '', phone: '', role: 'production', salary: 0 })
      loadEmployees()
    } catch (err: any) {
      alert('خطأ أثناء الحفظ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">🔐 الصلاحيات والموظفون</h1>
        <p className="text-sm text-gray-500 mt-1">إدارة أدوار المستخدمين وقاعدة بيانات الموظفين</p>
      </div>

      {/* التبويبات */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'roles' ? 'bg-amber-500 text-black' : 'bg-[#111927] text-gray-400 border border-white/10'}`}
        >
          🔑 صلاحيات المستخدمين
        </button>
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'employees' ? 'bg-amber-500 text-black' : 'bg-[#111927] text-gray-400 border border-white/10'}`}
        >
          👥 إدارة الموظفين
        </button>
      </div>

      {/* ══════════ تبويب: صلاحيات المستخدمين ══════════ */}
      {activeTab === 'roles' && (
        <div>
          {rolesError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 text-sm text-red-400">
              ⚠️ {rolesError}
            </div>
          )}

          <h2 className="text-sm font-bold text-gray-400 mb-4">تعيين الأدوار لمستخدمي النظام</h2>
          {loadingUsers ? (
            <div className="text-center py-8 text-gray-600">جاري التحميل...</div>
          ) : (
            <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5">
                  <tr>
                    {['المستخدم', 'البريد', 'الدور الحالي', 'تغيير الدور'].map(h => (
                      <th key={h} className="text-right text-xs text-gray-600 font-medium px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appUsers.map(u => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">
                            {u.full_name?.[0] || '?'}
                          </div>
                          <span className="text-xs text-white">{u.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">{u.email}</td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-amber-400 font-bold">{roles[u.role] || u.role}</span>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={u.role}
                          disabled={savingRole === u.id}
                          onChange={e => updateRole(u.id, e.target.value)}
                          className="bg-[#0D1B2A] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                        >
                          {Object.entries(roles).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {appUsers.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-600 text-sm">لا يوجد مستخدمون</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-600 mt-3">
            💡 تغيير دور مستخدم مسموح به فقط لصاحب الحساب الأساسي (owner) داخل نفس المنشأة.
          </p>
        </div>
      )}

      {/* ══════════ تبويب: إدارة الموظفين ══════════ */}
      {activeTab === 'employees' && (
        <div>
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={() => setShowForm(true)}
              className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
            >
              ➕ موظف جديد
            </button>
          </div>

          {showForm && (
            <div
              className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
              onClick={() => setShowForm(false)}
            >
              <div
                className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <h2 className="text-lg font-bold text-amber-400 mb-4">➕ إضافة موظف جديد</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">اسم الموظف *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">الهاتف</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">الدور / الوظيفة</label>
                    <select
                      value={form.role}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                    >
                      {Object.entries(roles).map(([key, label]) => (
                        <option key={key} value={key} className="bg-[#0D1B2A]">{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">الراتب الشهري</label>
                    <input
                      type="number"
                      min={0}
                      value={form.salary}
                      onChange={e => setForm(f => ({ ...f, salary: Number(e.target.value) }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleAddEmployee}
                    disabled={saving}
                    className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
                  >
                    {saving ? 'جاري الحفظ...' : '✅ حفظ الموظف'}
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingEmployees ? (
            <div className="text-center py-16 text-gray-600">جاري تحميل الموظفين...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {employees.map(emp => (
                <div key={emp.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all group">
                  <h3 className="font-bold text-white text-base mb-2 group-hover:text-amber-400 transition">{emp.name}</h3>
                  <div className="space-y-1">
                    <p className="text-gray-500 text-xs">💼 الوظيفة: {roles[emp.role] || emp.role}</p>
                    <p className="text-gray-500 text-xs">📞 الهاتف: {emp.phone || 'غير متوفر'}</p>
                    <p className="text-amber-500 text-xs font-bold">💵 الراتب: {emp.salary} ج.م</p>
                  </div>
                </div>
              ))}
              {employees.length === 0 && (
                <div className="col-span-full text-center py-16 text-gray-600 text-sm">
                  لا يوجد موظفون مسجلون بعد
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}