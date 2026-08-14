'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ASSIGNABLE_PAGES, PAGE_SECTIONS } from '@/lib/pages-config'

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

// ── صلاحيات الصفحات الافتراضية المقترحة لكل دور (نقطة بداية فقط، قابلة للتعديل يدوياً بعد كده) ──
// ⚠️ ده افتراض مبدئي مني بناءً على منطق الأدوار، عدّله زي ما يناسب شغلك
const ROLE_DEFAULT_PAGES: Record<string, string[]> = {
  admin:      ASSIGNABLE_PAGES.map(p => p.id),
  sales:      ['orders', 'orders_new', 'clients', 'pipeline', 'showroom', 'invoices'],
  production: ['suppliers', 'procurement', 'inventory', 'production', 'quality'],
  design:     ['production', 'quality'],
  shipping:   ['orders', 'shipping'],
  hr:         ['employees'],
  accountant: ['invoices', 'clients'],
  employee:   [],
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
  is_active: boolean
  last_login_at: string | null
}

type ActivityLogEntry = {
  id: string
  action: string
  entity_label: string | null
  old_value: any
  new_value: any
  created_at: string
  actor: { full_name: string } | null
}

type PagePermCell = { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }
type PagePermMatrix = Record<string, Record<string, PagePermCell>>

const EMPTY_CELL: PagePermCell = { can_view: false, can_create: false, can_edit: false, can_delete: false }
const ACTIONS: { key: keyof PagePermCell; label: string }[] = [
  { key: 'can_view',   label: 'عرض' },
  { key: 'can_create', label: 'إضافة' },
  { key: 'can_edit',   label: 'تعديل' },
  { key: 'can_delete', label: 'حذف' },
]

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

// ── تسجيل تغييرات الصلاحيات/الأدوار في سجل النشاط (activity_log) ──
async function logUserActivity(action: string, entityLabel: string, oldValue: any, newValue: any) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    if (!me?.tenant_id) return

    await supabase.from('activity_log').insert({
      tenant_id: me.tenant_id,
      user_id: user.id,
      action,
      entity_type: 'user',
      entity_label: entityLabel,
      old_value: oldValue,
      new_value: newValue,
    })
  } catch {
    // تسجيل النشاط عملية ثانوية؛ فشلها ما ينفعش يوقف العملية الأساسية
  }
}

export default function PermissionsPage() {
  const [activeTab, setActiveTab] = useState<'permissions' | 'employees'>('permissions')

  // ── هوية وصلاحية المستخدم الحالي (لازمة عشان نقفل الشاشة على غير الـ owner) ──
  const [myId, setMyId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)
  const [loadingMe, setLoadingMe] = useState(true)
  const isOwner = myRole === 'owner'

  // ── حالة تبويب "صلاحيات المستخدمين" ──
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')

  // ── حالة صلاحيات الصفحات (النظام الجديد) ──
  const [pagePerms, setPagePerms] = useState<PagePermMatrix>({})
  const [dirtyUsers, setDirtyUsers] = useState<Set<string>>(new Set())
  const [savingPerms, setSavingPerms] = useState<string | null>(null)
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)

  // ── حالة سجل تغييرات الصلاحيات ──
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [loadingLog, setLoadingLog] = useState(true)
  const [showLog, setShowLog] = useState(false)

  // ── حالة فورم "إضافة مستخدم جديد" ──
  const [showAddUser, setShowAddUser] = useState(false)
  const [addingUser, setAddingUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', full_name: '', role: 'employee' })

  // ── حالة تبويب "الموظفين" ──
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', role: 'production', salary: 0 })

  useEffect(() => {
    loadMe()
    loadUsers()
    loadPagePermissions()
    loadEmployees()
    loadActivityLog()
  }, [])

  // لو مستخدم مش owner لأي سبب لقى نفسه على تبويب الموظفين (state قديم، رابط مباشر...) رجّعه لتبويب الصلاحيات
  useEffect(() => {
    if (!loadingMe && !isOwner && activeTab === 'employees') {
      setActiveTab('permissions')
    }
  }, [loadingMe, isOwner, activeTab])

  async function loadMe() {
    setLoadingMe(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMyId(user.id)
      const { data, error } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (error) throw error
      setMyRole(data?.role || null)
    } catch (err: any) {
      console.error('Error loading current user role:', err.message)
    } finally {
      setLoadingMe(false)
    }
  }

  async function loadUsers() {
    setLoadingUsers(true)
    setRolesError(null)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role, is_active, last_login_at')
        .order('full_name', { ascending: true })
      if (error) throw error
      setAppUsers(data || [])
    } catch (err: any) {
      setRolesError(err.message || 'حدث خطأ أثناء تحميل المستخدمين')
    } finally {
      setLoadingUsers(false)
    }
  }

  async function loadPagePermissions() {
    try {
      const { data, error } = await supabase
        .from('user_page_permissions')
        .select('user_id, page_id, can_view, can_create, can_edit, can_delete')
      if (error) throw error

      const m: PagePermMatrix = {}
      for (const row of data ?? []) {
        if (!m[row.user_id]) m[row.user_id] = {}
        m[row.user_id][row.page_id] = {
          can_view: row.can_view,
          can_create: row.can_create,
          can_edit: row.can_edit,
          can_delete: row.can_delete,
        }
      }
      setPagePerms(m)
    } catch (err: any) {
      console.error('Error loading page permissions:', err.message)
    }
  }

  const filteredUsers = appUsers.filter(u => {
    const term = userSearch.trim().toLowerCase()
    const matchSearch = !term || u.full_name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)
    const matchRole = userRoleFilter === 'all' || u.role === userRoleFilter
    return matchSearch && matchRole
  })

  async function toggleActive(user: AppUser) {
    if (!isOwner) return
    const nextValue = !user.is_active
    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update({ is_active: nextValue }).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: nextValue } : u))
      logUserActivity(nextValue ? 'تفعيل حساب' : 'تعطيل حساب', user.full_name, { is_active: user.is_active }, { is_active: nextValue }).then(loadActivityLog)
    } catch (err: any) {
      alert('تعذر تغيير حالة الحساب: ' + err.message)
    } finally {
      setSavingRole(null)
    }
  }

  async function loadActivityLog() {
    setLoadingLog(true)
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, action, entity_label, old_value, new_value, created_at, actor:users!user_id(full_name)')
        .eq('entity_type', 'user')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      setActivityLog((data as any) || [])
    } catch (err: any) {
      console.error('Error loading activity log:', err.message)
    } finally {
      setLoadingLog(false)
    }
  }

  async function updateRole(id: string, role: string) {
    if (!isOwner) return
    const prevUser = appUsers.find(u => u.id === id)
    setSavingRole(id)
    try {
      const { error } = await supabase.from('users').update({ role }).eq('id', id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))
      if (prevUser) logUserActivity('تغيير الدور', prevUser.full_name, { role: prevUser.role }, { role }).then(loadActivityLog)
    } catch (err: any) {
      alert('تعذر تغيير الدور: ' + err.message + '\nملحوظة: تغيير الأدوار مسموح به فقط لصاحب الحساب (owner).')
    } finally {
      setSavingRole(null)
    }
  }

  // ── تعديل خلية صلاحية صفحة واحدة لمستخدم (محلي، لسه محتاج حفظ) ──
  function togglePageCell(userId: string, pageId: string, action: keyof PagePermCell) {
    setPagePerms(prev => {
      const current = prev[userId]?.[pageId] ?? { ...EMPTY_CELL }
      const nextVal = !current[action]
      const updatedCell: PagePermCell = { ...current, [action]: nextVal }

      if (action === 'can_view' && !nextVal) {
        updatedCell.can_create = false
        updatedCell.can_edit = false
        updatedCell.can_delete = false
      }
      if (action !== 'can_view' && nextVal) {
        updatedCell.can_view = true
      }

      return { ...prev, [userId]: { ...prev[userId], [pageId]: updatedCell } }
    })
    setDirtyUsers(prev => new Set(prev).add(userId))
  }

  function togglePageRow(userId: string, pageId: string, value: boolean) {
    setPagePerms(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [pageId]: value
          ? { can_view: true, can_create: true, can_edit: true, can_delete: true }
          : { ...EMPTY_CELL },
      },
    }))
    setDirtyUsers(prev => new Set(prev).add(userId))
  }

  // ── حفظ صلاحيات الصفحات لمستخدم معين في قاعدة البيانات ──
  async function savePagePermissions(user: AppUser) {
    setSavingPerms(user.id)
    try {
      const tenantId = await getMyTenantId()
      const rows = ASSIGNABLE_PAGES.map(p => {
        const cell = pagePerms[user.id]?.[p.id] ?? EMPTY_CELL
        return {
          user_id: user.id,
          tenant_id: tenantId,
          page_id: p.id,
          can_view: cell.can_view,
          can_create: cell.can_create,
          can_edit: cell.can_edit,
          can_delete: cell.can_delete,
          updated_at: new Date().toISOString(),
        }
      })

      const { error } = await supabase
        .from('user_page_permissions')
        .upsert(rows, { onConflict: 'user_id,page_id' })
      if (error) throw error

      setDirtyUsers(prev => {
        const next = new Set(prev)
        next.delete(user.id)
        return next
      })
      logUserActivity('تعديل صلاحيات الصفحات', user.full_name, null, rows.filter(r => r.can_view)).then(loadActivityLog)
    } catch (err: any) {
      alert('تعذر حفظ صلاحيات الصفحات: ' + err.message)
    } finally {
      setSavingPerms(null)
    }
  }

  // ── تطبيق صلاحيات الصفحات الافتراضية المقترحة لدور المستخدم، وحفظها فورًا ──
  async function applyRoleDefaults(user: AppUser) {
    if (!isOwner) return
    const defaultPageIds = ROLE_DEFAULT_PAGES[user.role] ?? []
    if (!confirm(`سيتم استبدال صلاحيات صفحات "${user.full_name}" بالصلاحيات الافتراضية المقترحة لدور "${roles[user.role]}". هل تريد المتابعة؟`)) return

    const updatedForUser: Record<string, PagePermCell> = {}
    for (const p of ASSIGNABLE_PAGES) {
      updatedForUser[p.id] = defaultPageIds.includes(p.id)
        ? { can_view: true, can_create: true, can_edit: true, can_delete: true }
        : { ...EMPTY_CELL }
    }

    setSavingPerms(user.id)
    try {
      const tenantId = await getMyTenantId()
      const rows = ASSIGNABLE_PAGES.map(p => ({
        user_id: user.id,
        tenant_id: tenantId,
        page_id: p.id,
        ...updatedForUser[p.id],
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase
        .from('user_page_permissions')
        .upsert(rows, { onConflict: 'user_id,page_id' })
      if (error) throw error

      setPagePerms(prev => ({ ...prev, [user.id]: updatedForUser }))
      setDirtyUsers(prev => {
        const next = new Set(prev)
        next.delete(user.id)
        return next
      })
      logUserActivity('تطبيق صلاحيات صفحات افتراضية', user.full_name, null, defaultPageIds).then(loadActivityLog)
    } catch (err: any) {
      alert('تعذر تطبيق الصلاحيات الافتراضية: ' + err.message)
    } finally {
      setSavingPerms(null)
    }
  }

  async function handleAddUser() {
    if (!isOwner) return
    if (!newUserForm.email.trim() || !newUserForm.password || !newUserForm.full_name.trim()) {
      alert('يرجى ملء كل الحقول')
      return
    }
    if (newUserForm.password.length < 6) {
      alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }

    setAddingUser(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('يجب تسجيل الدخول أولاً')

      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(newUserForm),
      })
      const result = await res.json()

      if (!res.ok) throw new Error(result.error || 'تعذر إنشاء المستخدم')

      logUserActivity('إنشاء مستخدم جديد', newUserForm.full_name, null, { email: newUserForm.email, role: newUserForm.role })
      setShowAddUser(false)
      setNewUserForm({ email: '', password: '', full_name: '', role: 'employee' })
      loadUsers()
      loadActivityLog()
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setAddingUser(false)
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
    if (!isOwner) return
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
        <p className="text-sm text-gray-500 mt-1">إدارة أدوار المستخدمين وصلاحيات كل صفحة وقاعدة بيانات الموظفين</p>
      </div>

      {/* التبويبات */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('permissions')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'permissions' ? 'bg-amber-500 text-black' : 'bg-[#111927] text-gray-400 border border-white/10'}`}
        >
          🔑 صلاحيات المستخدمين
        </button>
        {isOwner && (
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'employees' ? 'bg-amber-500 text-black' : 'bg-[#111927] text-gray-400 border border-white/10'}`}
          >
            👥 إدارة الموظفين
          </button>
        )}
      </div>

      {/* ══════════ تبويب: صلاحيات المستخدمين ══════════ */}
      {activeTab === 'permissions' && (
        <div>
          {rolesError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 text-sm text-red-400">
              ⚠️ {rolesError}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-400">
              {isOwner ? 'تعيين الأدوار وصلاحيات كل صفحة لمستخدمي النظام' : 'عرض أدوار وصلاحيات مستخدمي النظام (للقراءة فقط)'}
            </h2>
            {isOwner && (
              <button
                onClick={() => setShowAddUser(true)}
                className="px-4 py-2 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm shadow-lg shadow-amber-500/20"
              >
                ➕ إضافة مستخدم جديد
              </button>
            )}
          </div>

          {isOwner && showAddUser && (
            <div
              className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
              onClick={() => setShowAddUser(false)}
            >
              <div
                className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <h2 className="text-lg font-bold text-amber-400 mb-4">➕ إضافة مستخدم جديد</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">الاسم الكامل *</label>
                    <input
                      type="text"
                      value={newUserForm.full_name}
                      onChange={e => setNewUserForm(f => ({ ...f, full_name: e.target.value }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">البريد الإلكتروني *</label>
                    <input
                      type="email"
                      value={newUserForm.email}
                      onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">كلمة المرور * (6 أحرف على الأقل)</label>
                    <input
                      type="text"
                      value={newUserForm.password}
                      onChange={e => setNewUserForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">الدور</label>
                    <select
                      value={newUserForm.role}
                      onChange={e => setNewUserForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                    >
                      {Object.entries(roles).filter(([k]) => k !== 'owner').map(([key, label]) => (
                        <option key={key} value={key} className="bg-[#0D1B2A]">{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleAddUser}
                    disabled={addingUser}
                    className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
                  >
                    {addingUser ? 'جاري الإنشاء...' : '✅ إنشاء الحساب'}
                  </button>
                  <button
                    onClick={() => setShowAddUser(false)}
                    className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition"
                  >
                    إلغاء
                  </button>
                </div>
                <p className="text-[11px] text-gray-600 mt-3">
                  💡 سيتم إنشاء الحساب مباشرة بكلمة المرور المحددة، ويمكنه تسجيل الدخول فوراً. شارك بيانات الدخول معه بأمان.
                </p>
              </div>
            </div>
          )}

          {(loadingUsers || loadingMe) ? (
            <div className="text-center py-8 text-gray-600">جاري التحميل...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 mb-2">
                <input
                  type="text"
                  placeholder="🔍 بحث بالاسم أو البريد الإلكتروني..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="flex-1 bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-amber-500/50 outline-none"
                />
                <select
                  value={userRoleFilter}
                  onChange={e => setUserRoleFilter(e.target.value)}
                  className="bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-amber-500/50 outline-none"
                >
                  <option value="all">كل الأدوار</option>
                  {Object.entries(roles).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {filteredUsers.map(u => {
                const isDirty = dirtyUsers.has(u.id)
                const isExpanded = expandedUserId === u.id
                const userPerms = pagePerms[u.id] ?? {}

                return (
                  <div key={u.id} className={`bg-[#111927] rounded-2xl border p-5 ${u.is_active === false ? 'border-red-500/20 opacity-70' : 'border-white/5'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">
                          {u.full_name?.[0] || '?'}
                        </div>
                        <div>
                          <div className="text-sm text-white font-bold flex items-center gap-2">
                            {u.full_name}
                            {u.is_active === false && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">معطّل</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                          <div className="text-[10px] text-gray-600 mt-0.5">
                            آخر دخول: {u.last_login_at ? new Date(u.last_login_at).toLocaleString('ar-EG') : 'لم يسجل دخول بعد'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isOwner ? (
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
                        ) : (
                          <span className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 border border-white/10">
                            {roles[u.role] || u.role}
                          </span>
                        )}
                        {isOwner && u.role !== 'owner' && (
                          <button
                            onClick={() => applyRoleDefaults(u)}
                            disabled={savingPerms === u.id}
                            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
                          >
                            ↺ تطبيق صلاحيات الدور الافتراضية
                          </button>
                        )}
                        {isOwner && (
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={savingRole === u.id}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition disabled:opacity-50 ${
                              u.is_active === false
                                ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                            }`}
                          >
                            {u.is_active === false ? '✓ تفعيل الحساب' : '⛔ تعطيل الحساب'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="h-px bg-white/5 mb-4" />

                    {u.role === 'owner' ? (
                      <p className="text-xs text-gray-600">👑 صاحب الحساب — يرى ويتحكم في كل الصفحات تلقائيًا، لا يحتاج تعيين صلاحيات.</p>
                    ) : (
                      <>
                        <button
                          onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                          className="w-full flex items-center justify-between text-xs font-bold text-gray-400 hover:text-amber-400 transition py-1"
                        >
                          <span className="flex items-center gap-2">
                            📄 صلاحيات الصفحات
                            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="تعديلات غير محفوظة" />}
                          </span>
                          <span>{isExpanded ? '▲' : '▼'}</span>
                        </button>

                        {isExpanded && (
                          <div className="mt-3 border border-white/10 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-end gap-2 p-2 bg-white/[0.02] border-b border-white/10">
                              {isOwner && (
                                <button
                                  onClick={() => savePagePermissions(u)}
                                  disabled={!isDirty || savingPerms === u.id}
                                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  {savingPerms === u.id ? 'جاري الحفظ...' : 'حفظ صلاحيات الصفحات'}
                                </button>
                              )}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-white/10 text-gray-500">
                                    <th className="text-right p-2.5 font-medium">الصفحة</th>
                                    {ACTIONS.map(a => (
                                      <th key={a.key} className="p-2.5 font-medium text-center w-16">{a.label}</th>
                                    ))}
                                    <th className="p-2.5 font-medium text-center w-20">الكل</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {PAGE_SECTIONS.map(section => {
                                    const pagesInSection = ASSIGNABLE_PAGES.filter(p => p.section === section)
                                    if (pagesInSection.length === 0) return null
                                    return (
                                      <tbody key={`${u.id}-${section}`}>
                                        <tr className="bg-white/[0.02]">
                                          <td colSpan={ACTIONS.length + 2} className="px-2.5 py-1 text-[10px] text-amber-500/70 font-semibold uppercase tracking-wide">
                                            {section}
                                          </td>
                                        </tr>
                                        {pagesInSection.map(page => {
                                          const cell = userPerms[page.id] ?? EMPTY_CELL
                                          const allOn = cell.can_view && cell.can_create && cell.can_edit && cell.can_delete
                                          return (
                                            <tr key={page.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                                              <td className="p-2.5">
                                                <span className="flex items-center gap-2 text-gray-300">
                                                  <span>{page.icon}</span>
                                                  <span>{page.label}</span>
                                                </span>
                                              </td>
                                              {ACTIONS.map(a => (
                                                <td key={a.key} className="p-2.5 text-center">
                                                  <input
                                                    type="checkbox"
                                                    checked={cell[a.key]}
                                                    disabled={!isOwner}
                                                    onChange={() => isOwner && togglePageCell(u.id, page.id, a.key)}
                                                    className="w-4 h-4 accent-amber-500 cursor-pointer disabled:cursor-default"
                                                  />
                                                </td>
                                              ))}
                                              <td className="p-2.5 text-center">
                                                <input
                                                  type="checkbox"
                                                  checked={allOn}
                                                  disabled={!isOwner}
                                                  onChange={() => isOwner && togglePageRow(u.id, page.id, !allOn)}
                                                  className="w-4 h-4 accent-green-500 cursor-pointer disabled:cursor-default"
                                                  title="تفعيل/إلغاء كل الصلاحيات لهذه الصفحة"
                                                />
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              {filteredUsers.length === 0 && (
                <div className="text-center py-8 text-gray-600 text-sm">لا يوجد مستخدمون مطابقون</div>
              )}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-3">
            {isOwner
              ? '💡 تغيير الدور مسموح به فقط لصاحب الحساب الأساسي (owner). افتح "صلاحيات الصفحات" لكل مستخدم لتحديد أي صفحة يشوفها بالظبط، وماذا يقدر يفعل جواها (عرض/إضافة/تعديل/حذف). زر "تطبيق صلاحيات الدور الافتراضية" يستبدل كل صلاحيات صفحات المستخدم دفعة واحدة بالقيم المقترحة لدوره الحالي، ويمكنك بعدها تعديل أي صلاحية بشكل فردي.'
              : '💡 الأدوار والصلاحيات المعروضة هنا للقراءة فقط، ويتم تعديلها من صاحب الحساب (owner) فقط.'}
          </p>

          {/* ── سجل تغييرات الصلاحيات ── */}
          <div className="mt-8">
            <button
              onClick={() => setShowLog(v => !v)}
              className="text-sm font-bold text-gray-400 hover:text-amber-400 transition flex items-center gap-2"
            >
              📜 سجل تغييرات الصلاحيات {showLog ? '▲' : '▼'}
            </button>

            {showLog && (
              <div className="mt-3 bg-[#111927] rounded-2xl border border-white/5 p-4">
                {loadingLog ? (
                  <div className="text-center py-6 text-gray-600 text-sm">جاري تحميل السجل...</div>
                ) : activityLog.length === 0 ? (
                  <div className="text-center py-6 text-gray-600 text-sm">لا يوجد سجل تغييرات بعد</div>
                ) : (
                  <div className="space-y-2">
                    {activityLog.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between text-xs border-b border-white/5 pb-2 last:border-0">
                        <div>
                          <span className="text-amber-400 font-bold">{entry.action}</span>
                          <span className="text-gray-400"> — {entry.entity_label || '—'}</span>
                          {entry.actor?.full_name && (
                            <span className="text-gray-600"> بواسطة {entry.actor.full_name}</span>
                          )}
                        </div>
                        <span className="text-gray-600 shrink-0 ms-2">
                          {new Date(entry.created_at).toLocaleString('ar-EG')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ تبويب: إدارة الموظفين (owner بس) ══════════ */}
      {activeTab === 'employees' && (
        isOwner ? (
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
        ) : (
          <div className="text-center py-16 text-gray-600 text-sm">
            🚫 هذه الصفحة متاحة فقط لصاحب الحساب (owner)
          </div>
        )
      )}
    </div>
  )
}