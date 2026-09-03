'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  PAGE_LIST,
  PageKey,
  PermissionLevel,
  PagePermissions,
  PERMISSION_LEVEL_LABELS,
} from '@/lib/pages'

// ── تعريف الأدوار (متطابقة مع users_role_check في قاعدة البيانات) ──
// دي تصنيف نظامي عريض بس (owner/admin/...)، مش الوظيفة الفعلية للموظف.
// المسمى الوظيفي الحقيقي (مصمم أفلام تطريز، سنجر، أوفر...) بيتكتب حر في
// حقل "المسمى الوظيفي" تحت، ومفيهوش أي تأثير على الصلاحيات.
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

// ── اقتراحات جاهزة للمسمى الوظيفي (قائمة توضيحية فقط — الحقل حر تمامًا ويقبل أي نص) ──
const JOB_TITLE_SUGGESTIONS = [
  'مصمم أفلام تطريز',
  'فنى تطريز',
  'مصمم جرافيك',
  'سنجر',
  'أوفر',
  'مقص دار',
  'أورليه',
]

// ── تجميع صفحات النظام حسب القسم (لعرض شبكة الصلاحيات مبوّبة) ──
const PAGE_SECTIONS: { section: string; pages: typeof PAGE_LIST }[] = (() => {
  const map = new Map<string, typeof PAGE_LIST>()
  for (const page of PAGE_LIST) {
    if (!map.has(page.section)) map.set(page.section, [])
    map.get(page.section)!.push(page)
  }
  return Array.from(map.entries()).map(([section, pages]) => ({ section, pages }))
})()

const ALL_PAGES_EDIT_DELETE: PagePermissions = Object.fromEntries(
  PAGE_LIST.map(p => [p.key, 'edit_delete' as PermissionLevel])
)

// ── الصفحات والصلاحيات الافتراضية المقترحة لكل دور (نقطة بداية فقط، قابلة للتعديل يدوياً بعد كده) ──
const ROLE_DEFAULT_PAGE_PERMISSIONS: Record<string, PagePermissions> = {
  owner: ALL_PAGES_EDIT_DELETE,
  admin: ALL_PAGES_EDIT_DELETE,
  sales: {
    '/dashboard/orders': 'edit',
    '/dashboard/clients': 'edit',
    '/dashboard/pipeline': 'view',
    '/dashboard/showroom': 'view',
    '/dashboard/invoices': 'view',
  },
  production: {
    '/dashboard/production': 'edit',
    '/dashboard/quality': 'view',
    '/dashboard/inventory': 'view',
    '/dashboard/suppliers': 'view',
    '/dashboard/procurement': 'view',
  },
  design: {
    '/dashboard/production': 'edit',
    '/dashboard/quality': 'view',
  },
  shipping: {
    '/dashboard/orders': 'edit',
    '/dashboard/shipping': 'edit',
    '/dashboard/clients': 'view',
  },
  hr: {
    '/dashboard/employees': 'edit',
  },
  accountant: {
    '/dashboard/invoices': 'edit',
    '/dashboard/clients': 'view',
  },
  employee: {},
}

type Employee = {
  id: string
  name: string
  phone: string
  role: string
  job_title: string | null
  salary: number
}

type AppUser = {
  id: string
  full_name: string
  email: string
  role: string
  job_title: string | null
  is_active: boolean
  last_login_at: string | null
  page_permissions: PagePermissions | null
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
  const [activeTab, setActiveTab] = useState<'employees' | 'roles'>('roles')

  // ── هوية وصلاحية المستخدم الحالي (لازمة عشان نقفل الشاشة على غير الـ owner) ──
  const [myRole, setMyRole] = useState<string | null>(null)
  const [myPagePermissions, setMyPagePermissions] = useState<PagePermissions | null>(null)
  const [loadingMe, setLoadingMe] = useState(true)
  const isOwner = myRole === 'owner'
  // صلاحية المستخدم الحالي على صفحة "الموظفين" — تتحكم في ظهور تبويب "إدارة الموظفين"
  // وقدرته على التعديل فيه، حتى لو مش owner (بدل القفل الثابت على owner بس زي الأول)
  const myEmployeesLevel = isOwner ? 'edit_delete' : myPagePermissions?.['/dashboard/employees'] || null
  const canViewEmployeesTab = isOwner || !!myEmployeesLevel
  const canEditEmployeesTab = isOwner || myEmployeesLevel === 'edit' || myEmployeesLevel === 'edit_delete'

  // ── حالة تبويب "صلاحيات المستخدمين" ──
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')

  // ── حالة سجل تغييرات الصلاحيات ──
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [loadingLog, setLoadingLog] = useState(true)
  const [showLog, setShowLog] = useState(false)

  // ── حالة فورم "إضافة مستخدم جديد" ──
  const [showAddUser, setShowAddUser] = useState(false)
  const [addingUser, setAddingUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', full_name: '', role: 'employee', job_title: '' })

  // ── حالة تبويب "الموظفين" ──
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', role: 'production', job_title: '', salary: 0 })

  useEffect(() => {
    loadMe()
    loadUsers()
    loadEmployees()
    loadActivityLog()
  }, [])

  // لو مستخدم مالوش صلاحية على صفحة الموظفين لأي سبب لقى نفسه على تبويب الموظفين رجّعه لتبويب الصلاحيات
  useEffect(() => {
    if (!loadingMe && !canViewEmployeesTab && activeTab === 'employees') {
      setActiveTab('roles')
    }
  }, [loadingMe, canViewEmployeesTab, activeTab])

  async function loadMe() {
    setLoadingMe(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase.from('users').select('role, page_permissions').eq('id', user.id).single()
      if (error) throw error
      setMyRole(data?.role || null)
      setMyPagePermissions((data?.page_permissions as PagePermissions) || null)
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
        .select('id, full_name, email, role, job_title, is_active, last_login_at, page_permissions')
        .order('full_name', { ascending: true })
      if (error) throw error
      setAppUsers((data as unknown as AppUser[]) || [])
    } catch (err: any) {
      setRolesError(err.message || 'حدث خطأ أثناء تحميل المستخدمين')
    } finally {
      setLoadingUsers(false)
    }
  }

  const filteredUsers = appUsers.filter(u => {
    const term = userSearch.trim().toLowerCase()
    const matchSearch = !term || u.full_name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.job_title?.toLowerCase().includes(term)
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

  // ── تعديل المسمى الوظيفي الحر (لا يتحكم في أي صلاحية، عرضي بحت) ──
  async function updateJobTitle(user: AppUser, jobTitle: string) {
    if (!isOwner) return
    const trimmed = jobTitle.trim()
    if (trimmed === (user.job_title || '')) return
    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update({ job_title: trimmed || null }).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, job_title: trimmed || null } : u))
      logUserActivity('تعديل المسمى الوظيفي', user.full_name, { job_title: user.job_title }, { job_title: trimmed || null }).then(loadActivityLog)
    } catch (err: any) {
      alert('تعذر تعديل المسمى الوظيفي: ' + err.message)
    } finally {
      setSavingRole(null)
    }
  }

  // ── تعديل مستوى صلاحية صفحة واحدة لمستخدم معيّن (بدون وصول / قراءة فقط / تعديل / تعديل وحذف) ──
  async function updatePageLevel(user: AppUser, pageKey: PageKey, level: PermissionLevel | '') {
    if (!isOwner) return
    const current = user.page_permissions || {}
    const next: PagePermissions = { ...current }
    if (level) next[pageKey] = level
    else delete next[pageKey]
    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update({ page_permissions: next }).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, page_permissions: next } : u))
      logUserActivity(
        'تعديل صلاحية صفحة',
        `${user.full_name} — ${pageKey}`,
        { level: current[pageKey] || null },
        { level: level || null }
      ).then(loadActivityLog)
    } catch (err: any) {
      alert('تعذر تعديل صلاحية الصفحة: ' + err.message)
    } finally {
      setSavingRole(null)
    }
  }

  // ── تحديد/إلغاء مستوى واحد لكل الصفحات لمستخدم معيّن دفعة واحدة ──
  async function setAllPagesLevel(user: AppUser, level: PermissionLevel | '') {
    if (!isOwner) return
    const next: PagePermissions = {}
    if (level) {
      for (const page of PAGE_LIST) next[page.key] = level
    }
    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update({ page_permissions: next }).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, page_permissions: next } : u))
      logUserActivity(
        level ? `تحديد الكل (${PERMISSION_LEVEL_LABELS[level]})` : 'إلغاء كل الصفحات',
        user.full_name,
        { page_permissions: user.page_permissions },
        { page_permissions: next }
      ).then(loadActivityLog)
    } catch (err: any) {
      alert('تعذر تعديل الصفحات: ' + err.message)
    } finally {
      setSavingRole(null)
    }
  }

  async function applyRoleDefaults(user: AppUser) {
    if (!isOwner) return
    const defaultPages = ROLE_DEFAULT_PAGE_PERMISSIONS[user.role] || {}
    if (!confirm(`سيتم استبدال صلاحيات صفحات "${user.full_name}" بالإعدادات الافتراضية لدور "${roles[user.role]}". هل تريد المتابعة؟`)) return

    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update({ page_permissions: defaultPages }).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, page_permissions: defaultPages } : u))
      logUserActivity('تطبيق إعدادات افتراضية', user.full_name, { page_permissions: user.page_permissions }, { page_permissions: defaultPages }).then(loadActivityLog)
    } catch (err: any) {
      alert('تعذر تطبيق الإعدادات الافتراضية: ' + err.message)
    } finally {
      setSavingRole(null)
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

      // ملحوظة: /api/admin/create-user لازم يتحدّث عشان يستقبل ويخزّن
      // job_title، ويحط page_permissions افتراضية مناسبة للدور المختار
      // (مثلاً من نفس منطق ROLE_DEFAULT_PAGE_PERMISSIONS في هذا الملف).
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

      logUserActivity('إنشاء مستخدم جديد', newUserForm.full_name, null, { email: newUserForm.email, role: newUserForm.role, job_title: newUserForm.job_title || null })
      setShowAddUser(false)
      setNewUserForm({ email: '', password: '', full_name: '', role: 'employee', job_title: '' })
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
      setEmployees((data as unknown as Employee[]) || [])
    } catch (err: any) {
      console.error('Error loading employees:', err.message)
    } finally {
      setLoadingEmployees(false)
    }
  }

  async function handleAddEmployee() {
    if (!canEditEmployeesTab) return
    if (!form.name.trim()) {
      alert('الاسم مطلوب')
      return
    }
    setSaving(true)
    try {
      const tenantId = await getMyTenantId()
      const { error } = await supabase.from('employees').insert({
        name: form.name,
        phone: form.phone,
        role: form.role,
        job_title: form.job_title.trim() || null,
        salary: form.salary,
        tenant_id: tenantId,
      })
      if (error) throw error

      setShowForm(false)
      setForm({ name: '', phone: '', role: 'production', job_title: '', salary: 0 })
      loadEmployees()
    } catch (err: any) {
      alert('خطأ أثناء الحفظ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <datalist id="job-title-suggestions">
        {JOB_TITLE_SUGGESTIONS.map(title => <option key={title} value={title} />)}
      </datalist>

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
        {canViewEmployeesTab && (
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'employees' ? 'bg-amber-500 text-black' : 'bg-[#111927] text-gray-400 border border-white/10'}`}
          >
            👥 إدارة الموظفين
          </button>
        )}
      </div>

      {/* ══════════ تبويب: صلاحيات المستخدمين ══════════ */}
      {activeTab === 'roles' && (
        <div>
          {rolesError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 text-sm text-red-400">
              ⚠️ {rolesError}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-400">
              {isOwner ? 'تعيين الأدوار والمسميات الوظيفية وصلاحيات الصفحات لمستخدمي النظام' : 'عرض أدوار وصلاحيات مستخدمي النظام (للقراءة فقط)'}
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
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">المسمى الوظيفي (اختياري — حر تمامًا)</label>
                    <input
                      type="text"
                      value={newUserForm.job_title}
                      onChange={e => setNewUserForm(f => ({ ...f, job_title: e.target.value }))}
                      list="job-title-suggestions"
                      placeholder="مثال: مصمم أفلام تطريز، فنى تطريز، سنجر، أوفر، مقص دار، أورليه..."
                      className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                    />
                    <p className="text-[10px] text-gray-600 mt-1">
                      يمكنك كتابة أي مسمى وظيفي تريده، وهو مجرد وصف يظهر بجانب اسم الموظف — صلاحياته الفعلية تُحدَّد أدناه بعد إنشاء الحساب من قسم "الصفحات والصلاحيات".
                    </p>
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
                  placeholder="🔍 بحث بالاسم أو البريد الإلكتروني أو المسمى الوظيفي..."
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

              {filteredUsers.map(u => (
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
                        <input
                          type="text"
                          key={u.id + '-job-title'}
                          defaultValue={u.job_title || ''}
                          onBlur={e => updateJobTitle(u, e.target.value)}
                          list="job-title-suggestions"
                          placeholder="💼 المسمى الوظيفي"
                          disabled={savingRole === u.id}
                          className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50 w-40"
                        />
                      ) : (
                        u.job_title && (
                          <span className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 border border-white/10">
                            💼 {u.job_title}
                          </span>
                        )
                      )}
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
                      {isOwner && (
                        <button
                          onClick={() => applyRoleDefaults(u)}
                          disabled={savingRole === u.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
                        >
                          ↺ تطبيق الإعدادات الافتراضية للدور
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

                  {/* ── الصفحات والصلاحيات: مستوى مستقل لكل صفحة (بدون وصول / قراءة فقط / تعديل / تعديل وحذف) ── */}
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-gray-600 font-semibold">📄 الصفحات والصلاحيات</p>
                    {isOwner && u.role !== 'owner' && (
                      <div className="flex gap-3 flex-wrap">
                        <button onClick={() => setAllPagesLevel(u, 'edit_delete')} disabled={savingRole === u.id} className="text-[11px] text-red-400 hover:underline disabled:opacity-50">تعديل وحذف للكل</button>
                        <button onClick={() => setAllPagesLevel(u, 'edit')} disabled={savingRole === u.id} className="text-[11px] text-amber-400 hover:underline disabled:opacity-50">تعديل للكل</button>
                        <button onClick={() => setAllPagesLevel(u, 'view')} disabled={savingRole === u.id} className="text-[11px] text-sky-400 hover:underline disabled:opacity-50">قراءة فقط للكل</button>
                        <button onClick={() => setAllPagesLevel(u, '')} disabled={savingRole === u.id} className="text-[11px] text-gray-500 hover:underline disabled:opacity-50">إلغاء الكل</button>
                      </div>
                    )}
                  </div>
                  {u.role === 'owner' ? (
                    <p className="text-[11px] text-gray-600">صاحب الحساب يشوف كل صفحة بأعلى صلاحية (تعديل وحذف) دايمًا، مفيش داعي لتحديدها.</p>
                  ) : (
                    <div className="space-y-3">
                      {PAGE_SECTIONS.map(({ section, pages }) => (
                        <div key={section}>
                          <p className="text-[10px] text-gray-600 font-semibold mb-1">{section}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {pages.map(page => {
                              const level = u.page_permissions?.[page.key] || ''
                              return (
                                <div
                                  key={page.key}
                                  className={`flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-lg border transition ${
                                    level ? 'bg-sky-500/10 border-sky-500/30 text-sky-300' : 'bg-white/5 border-white/10 text-gray-500'
                                  } ${savingRole === u.id ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                  <span className="flex items-center gap-1 truncate">{page.icon} {page.label}</span>
                                  {isOwner ? (
                                    <select
                                      value={level}
                                      onChange={e => updatePageLevel(u, page.key, e.target.value as PermissionLevel | '')}
                                      className="bg-[#0D1B2A] border border-white/10 rounded px-1.5 py-1 text-[10px] text-white outline-none shrink-0"
                                    >
                                      <option value="">🚫 بدون وصول</option>
                                      <option value="view">👁️ قراءة فقط</option>
                                      <option value="edit">✏️ تعديل</option>
                                      <option value="edit_delete">🗑️ تعديل وحذف</option>
                                    </select>
                                  ) : (
                                    <span className="shrink-0 text-[10px]">
                                      {level ? PERMISSION_LEVEL_LABELS[level] : '🚫 بدون وصول'}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div className="text-center py-8 text-gray-600 text-sm">لا يوجد مستخدمون مطابقون</div>
              )}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-3">
            {isOwner
              ? '💡 لكل صفحة مستوى صلاحية مستقل: 🚫 بدون وصول، 👁️ قراءة فقط، ✏️ تعديل، أو 🗑️ تعديل وحذف. "المسمى الوظيفي" حقل وصفي حر (زي مصمم أفلام تطريز، فنى تطريز، سنجر، أوفر، مقص دار، أورليه أو أي وظيفة تانية) ومالوش أي تأثير على الصلاحيات. زر "تطبيق الإعدادات الافتراضية للدور" يستبدل صلاحيات كل الصفحات دفعة واحدة بالقيم المقترحة لدوره الحالي، ويمكنك بعدها تعديل أي صفحة بشكل فردي.'
              : '💡 الأدوار والصلاحيات المعروضة هنا للقراءة فقط، ويتم تعديلها من صاحب الحساب (owner) أو من له صلاحية "تعديل" على صفحة الصلاحيات فقط.'}
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

      {/* ══════════ تبويب: إدارة الموظفين ══════════ */}
      {activeTab === 'employees' && (
        canViewEmployeesTab ? (
          <div>
            {canEditEmployeesTab && (
              <div className="flex items-center justify-end mb-4">
                <button
                  onClick={() => setShowForm(true)}
                  className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
                >
                  ➕ موظف جديد
                </button>
              </div>
            )}

            {canEditEmployeesTab && showForm && (
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
                      <label className="block text-xs text-gray-500 mb-1">التصنيف العام</label>
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
                      <label className="block text-xs text-gray-500 mb-1">الوظيفة الفعلية (اختياري — حر تمامًا)</label>
                      <input
                        type="text"
                        value={form.job_title}
                        onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))}
                        list="job-title-suggestions"
                        placeholder="مثال: مصمم أفلام تطريز، فنى تطريز، سنجر، أوفر، مقص دار، أورليه..."
                        className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                      />
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
                      <p className="text-gray-500 text-xs">💼 الوظيفة: {emp.job_title || roles[emp.role] || emp.role}</p>
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
            🚫 لا تملك صلاحية الوصول لهذه الصفحة
          </div>
        )
      )}
    </div>
  )
}
