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

// ── الصلاحيات الدقيقة المتاحة (أعمدة boolean في جدول users) ──
type PermissionKey = 'can_edit_production' | 'can_edit_orders' | 'can_manage_sales' | 'can_manage_users' | 'can_view_clients'

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_edit_production: '✏️ تعديل الإنتاج',
  can_edit_orders: '📋 تعديل الطلبات',
  can_manage_sales: '💰 إدارة المبيعات',
  can_manage_users: '👤 إدارة المستخدمين',
  can_view_clients: '👁️ عرض العملاء',
}

const PERMISSION_KEYS: PermissionKey[] = ['can_edit_production', 'can_edit_orders', 'can_manage_sales', 'can_manage_users', 'can_view_clients']

// ── الصلاحيات الافتراضية المقترحة لكل دور (نقطة بداية فقط، قابلة للتعديل يدوياً بعد كده) ──
const ROLE_DEFAULT_PERMISSIONS: Record<string, Record<PermissionKey, boolean>> = {
  owner:      { can_edit_production: true,  can_edit_orders: true,  can_manage_sales: true,  can_manage_users: true,  can_view_clients: true  },
  admin:      { can_edit_production: true,  can_edit_orders: true,  can_manage_sales: true,  can_manage_users: true,  can_view_clients: true  },
  sales:      { can_edit_production: false, can_edit_orders: true,  can_manage_sales: true,  can_manage_users: false, can_view_clients: true  },
  production: { can_edit_production: true,  can_edit_orders: false, can_manage_sales: false, can_manage_users: false, can_view_clients: false },
  design:     { can_edit_production: true,  can_edit_orders: false, can_manage_sales: false, can_manage_users: false, can_view_clients: false },
  shipping:   { can_edit_production: false, can_edit_orders: true,  can_manage_sales: false, can_manage_users: false, can_view_clients: true  },
  hr:         { can_edit_production: false, can_edit_orders: false, can_manage_sales: false, can_manage_users: false, can_view_clients: false },
  accountant: { can_edit_production: false, can_edit_orders: false, can_manage_sales: false, can_manage_users: false, can_view_clients: true  },
  employee:   { can_edit_production: false, can_edit_orders: false, can_manage_sales: false, can_manage_users: false, can_view_clients: false },
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
  can_edit_production: boolean
  can_edit_orders: boolean
  can_manage_sales: boolean
  can_manage_users: boolean
  can_view_clients: boolean
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
        .select('id, full_name, email, role, can_edit_production, can_edit_orders, can_manage_sales, can_manage_users, can_view_clients')
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

  async function updatePermission(id: string, key: PermissionKey, value: boolean) {
    setSavingRole(id)
    try {
      const { error } = await supabase.from('users').update({ [key]: value }).eq('id', id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === id ? { ...u, [key]: value } : u))
    } catch (err: any) {
      alert('تعذر تغيير الصلاحية: ' + err.message + '\nملحوظة: تغيير الصلاحيات مسموح به فقط لصاحب الحساب (owner).')
    } finally {
      setSavingRole(null)
    }
  }

  async function applyRoleDefaults(user: AppUser) {
    const defaults = ROLE_DEFAULT_PERMISSIONS[user.role]
    if (!defaults) return
    if (!confirm(`سيتم استبدال صلاحيات "${user.full_name}" بالصلاحيات الافتراضية لدور "${roles[user.role]}". هل تريد المتابعة؟`)) return

    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update(defaults).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...defaults } : u))
    } catch (err: any) {
      alert('تعذر تطبيق الصلاحيات الافتراضية: ' + err.message)
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

          <h2 className="text-sm font-bold text-gray-400 mb-4">تعيين الأدوار والصلاحيات الدقيقة لمستخدمي النظام</h2>
          {loadingUsers ? (
            <div className="text-center py-8 text-gray-600">جاري التحميل...</div>
          ) : (
            <div className="space-y-4">
              {appUsers.map(u => (
                <div key={u.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5">
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">
                        {u.full_name?.[0] || '?'}
                      </div>
                      <div>
                        <div className="text-sm text-white font-bold">{u.full_name}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        disabled={savingRole === u.id}
                        onChange={e => updateRole(u.id, e.target.value)}
                        className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                      >
                        {Object.entries(roles).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => applyRoleDefaults(u)}
                        disabled={savingRole === u.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
                      >
                        ↺ تطبيق صلاحيات الدور الافتراضية
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-white/5 mb-4" />

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {PERMISSION_KEYS.map(key => (
                      <label
                        key={key}
                        className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border cursor-pointer transition ${
                          u[key] ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-white/5 border-white/10 text-gray-500'
                        } ${savingRole === u.id ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={u[key]}
                          onChange={e => updatePermission(u.id, key, e.target.checked)}
                          className="accent-amber-500"
                        />
                        {PERMISSION_LABELS[key]}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {appUsers.length === 0 && (
                <div className="text-center py-8 text-gray-600 text-sm">لا يوجد مستخدمون</div>
              )}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-3">
            💡 تغيير الدور أو الصلاحيات مسموح به فقط لصاحب الحساب الأساسي (owner) داخل نفس المنشأة. زر "تطبيق صلاحيات الدور الافتراضية" يستبدل كل صلاحيات المستخدم دفعة واحدة بالقيم المقترحة لدوره الحالي، ويمكنك بعدها تعديل أي صلاحية بشكل فردي.
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