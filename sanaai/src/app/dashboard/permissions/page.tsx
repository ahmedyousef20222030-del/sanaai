'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PAGE_LIST, PagePermissions } from '@/lib/pages'
import { Loader2, AlertTriangle, CheckCircle2, X, Plus, Search, Trash2 } from 'lucide-react'

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

// ── الصلاحيات الافتراضية المقترحة لكل دور ──
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

function pagesToPermissions(keys: string[]): PagePermissions {
  const map: PagePermissions = {}
  for (const k of keys) map[k] = true
  return map
}

const ROLE_DEFAULT_PAGES: Record<string, string[]> = {
  owner:      PAGE_LIST.map(p => p.key),
  admin:      PAGE_LIST.map(p => p.key),
  sales:      ['/dashboard/orders', '/dashboard/clients', '/dashboard/pipeline', '/dashboard/showroom', '/dashboard/invoices'],
  production: ['/dashboard/production', '/dashboard/inventory/materials', '/dashboard/quality', '/dashboard/inventory', '/dashboard/branches', '/dashboard/suppliers', '/dashboard/restock-decisions'],
  design:     ['/dashboard/production', '/dashboard/quality'],
  shipping:   ['/dashboard/orders', '/dashboard/shipping', '/dashboard/clients'],
  hr:         ['/dashboard/employees'],
  accountant: ['/dashboard/invoices', '/dashboard/clients'],
  employee:   [],
}

const PAGE_SECTIONS: { section: string; pages: typeof PAGE_LIST }[] = (() => {
  const order: string[] = []
  const map = new Map<string, typeof PAGE_LIST>()
  for (const page of PAGE_LIST) {
    if (!map.has(page.section)) {
      map.set(page.section, [])
      order.push(page.section)
    }
    map.get(page.section)!.push(page)
  }
  return order.map(section => ({ section, pages: map.get(section)! }))
})()

type Employee = {
  id: string
  name: string
  phone: string
  role: string
  salary: number
  user_id?: string | null
}

type AppUser = {
  id: string
  full_name: string
  email: string
  role: string
  is_active: boolean
  last_login_at: string | null
  can_edit_production: boolean
  can_edit_orders: boolean
  can_manage_sales: boolean
  can_manage_users: boolean
  can_view_clients: boolean
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
    // تسجيل النشاط عملية ثانوية؛ فشلها لا يوقف العملية الأساسية
  }
}

export default function PermissionsPage() {
  const [activeTab, setActiveTab] = useState<'employees' | 'roles'>('roles')

  const [myRole, setMyRole] = useState<string | null>(null)
  const [loadingMe, setLoadingMe] = useState(true)
  const isOwner = myRole === 'owner'

  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')

  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [loadingLog, setLoadingLog] = useState(true)
  const [showLog, setShowLog] = useState(false)

  const [showAddUser, setShowAddUser] = useState(false)
  const [addingUser, setAddingUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', full_name: '', role: 'employee' })

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', role: 'production', salary: 0 })

  // ── رسائل النظام (بديل alert) ──
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function showMessage(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 5000)
  }

  useEffect(() => {
    loadMe()
    loadUsers()
    loadEmployees()
    loadActivityLog()
  }, [])

  useEffect(() => {
    if (!loadingMe && !isOwner && activeTab === 'employees') {
      setActiveTab('roles')
    }
  }, [loadingMe, isOwner, activeTab])

  async function loadMe() {
    setLoadingMe(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
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
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role, is_active, last_login_at, can_edit_production, can_edit_orders, can_manage_sales, can_manage_users, can_view_clients, page_permissions')
        .order('full_name', { ascending: true })
      if (error) throw error
      setAppUsers(data || [])
    } catch (err: any) {
      showMessage('error', err.message || 'حدث خطأ أثناء تحميل المستخدمين')
    } finally {
      setLoadingUsers(false)
    }
  }

  const filteredUsers = appUsers.filter(u => {
    const term = userSearch.trim().toLowerCase()
    const matchSearch = !term || u.full_name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)
    const matchRole = userRoleFilter === 'all' || u.role === userRoleFilter
    return matchSearch && matchRole
  })

  // 🔹 دوال الربط الذكي
  async function linkEmployeeToUser(employeeId: string, user: AppUser) {
    if (!isOwner || !employeeId) return
    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('employees').update({ user_id: user.id }).eq('id', employeeId)
      if (error) throw error
      setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, user_id: user.id } : e))
      logUserActivity('ربط إداري', user.full_name, null, `تم الربط مع موظف ID: ${employeeId}`)
      showMessage('success', 'تم ربط الموظف بالحساب بنجاح')
    } catch (err: any) {
      showMessage('error', 'تعذر الربط: ' + err.message)
    } finally { 
      setSavingRole(null) 
    }
  }

  async function unlinkEmployeeFromUser(employeeId: string, user: AppUser) {
    if (!isOwner) return
    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('employees').update({ user_id: null }).eq('id', employeeId)
      if (error) throw error
      setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, user_id: null } : e))
      logUserActivity('فك ربط إداري', user.full_name, null, 'تم فصل الربط')
      showMessage('success', 'تم فك ارتباط الموظف بنجاح')
    } catch (err: any) {
      showMessage('error', 'تعذر الفصل: ' + err.message)
    } finally { 
      setSavingRole(null) 
    }
  }

  async function toggleActive(user: AppUser) {
    if (!isOwner) return
    const nextValue = !user.is_active
    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update({ is_active: nextValue }).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: nextValue } : u))
      logUserActivity(nextValue ? 'تفعيل حساب' : 'تعطيل حساب', user.full_name, { is_active: user.is_active }, { is_active: nextValue }).then(loadActivityLog)
      showMessage('success', nextValue ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب')
    } catch (err: any) {
      showMessage('error', 'تعذر تغيير حالة الحساب: ' + err.message)
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
      showMessage('success', 'تم تغيير دور المستخدم بنجاح')
    } catch (err: any) {
      showMessage('error', 'تعذر تغيير الدور: ' + err.message)
    } finally {
      setSavingRole(null)
    }
  }

  async function updatePermission(id: string, key: PermissionKey, value: boolean) {
    if (!isOwner) return
    const prevUser = appUsers.find(u => u.id === id)
    setSavingRole(id)
    try {
      const { error } = await supabase.from('users').update({ [key]: value }).eq('id', id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === id ? { ...u, [key]: value } : u))
      if (prevUser) logUserActivity('تغيير صلاحية', prevUser.full_name, { [key]: prevUser[key] }, { [key]: value }).then(loadActivityLog)
    } catch (err: any) {
      showMessage('error', 'تعذر تغيير الصلاحية: ' + err.message)
    } finally {
      setSavingRole(null)
    }
  }

  // 🔹 تحديث صلاحية الصفحة لتعتمد على boolean
  async function updatePagePermission(user: AppUser, pageKey: string, hasAccess: boolean) {
    if (!isOwner) return
    const current = user.page_permissions || {}
    const next: PagePermissions = { ...current }
    
    if (hasAccess) {
      next[pageKey] = true
    } else {
      delete next[pageKey]
    }

    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update({ page_permissions: next }).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, page_permissions: next } : u))
      logUserActivity('تعديل صلاحية صفحة', user.full_name, { page_permissions: current }, { page_permissions: next }).then(loadActivityLog)
    } catch (err: any) {
      showMessage('error', 'تعذر تعديل صلاحية الصفحة: ' + err.message)
    } finally {
      setSavingRole(null)
    }
  }

  // 🔹 منح أو سحب جميع الصفحات
  async function setAllPages(user: AppUser, hasAccess: boolean) {
    if (!isOwner) return
    const next: PagePermissions = hasAccess ? Object.fromEntries(PAGE_LIST.map(p => [p.key, true])) : {}
    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update({ page_permissions: next }).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, page_permissions: next } : u))
      logUserActivity(hasAccess ? 'منح كل الصفحات' : 'إلغاء كل الصفحات', user.full_name, { page_permissions: user.page_permissions }, { page_permissions: next }).then(loadActivityLog)
      showMessage('success', hasAccess ? 'تم منح وصول لجميع الصفحات' : 'تم سحب الوصول من جميع الصفحات')
    } catch (err: any) {
      showMessage('error', 'تعذر تعديل الصفحات: ' + err.message)
    } finally {
      setSavingRole(null)
    }
  }

  async function applyRoleDefaults(user: AppUser) {
    if (!isOwner) return
    const defaults = ROLE_DEFAULT_PERMISSIONS[user.role]
    if (!defaults) return
    const defaultPagePermissions = pagesToPermissions(ROLE_DEFAULT_PAGES[user.role] || [])
    
    // تصميم نافذة التأكيد (مستقبلاً استبدل confirm بنافذة Modal مخصصة)
    if (!confirm(`سيتم استبدال صلاحيات وصفحات "${user.full_name}" بالإعدادات الافتراضية لدور "${roles[user.role]}". هل تريد المتابعة؟`)) return

    setSavingRole(user.id)
    try {
      const { error } = await supabase.from('users').update({ ...defaults, page_permissions: defaultPagePermissions }).eq('id', user.id)
      if (error) throw error
      setAppUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...defaults, page_permissions: defaultPagePermissions } : u))
      logUserActivity('تطبيق إعدادات افتراضية', user.full_name, null, { ...defaults, page_permissions: defaultPagePermissions }).then(loadActivityLog)
      showMessage('success', 'تم تطبيق الصلاحيات الافتراضية بنجاح')
    } catch (err: any) {
      showMessage('error', 'تعذر تطبيق الإعدادات الافتراضية: ' + err.message)
    } finally {
      setSavingRole(null)
    }
  }

  async function handleAddUser() {
    if (!isOwner) return
    if (!newUserForm.email.trim() || !newUserForm.password || !newUserForm.full_name.trim()) {
      showMessage('error', 'يرجى ملء كل الحقول')
      return
    }
    if (newUserForm.password.length < 6) {
      showMessage('error', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')
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
      showMessage('success', 'تم إنشاء الحساب بنجاح')
    } catch (err: any) {
      showMessage('error', 'خطأ: ' + err.message)
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
      showMessage('error', 'الاسم مطلوب')
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
      showMessage('success', 'تم إضافة الموظف بنجاح')
    } catch (err: any) {
      showMessage('error', 'خطأ أثناء الحفظ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 min-h-screen bg-[#0D1B2A]" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      
      {/* ── نظام الإشعارات المدمج (Banner) ── */}
      {banner && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex w-[90%] max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm transition-all ${banner.type === 'success' ? 'bg-emerald-950/90 border-emerald-400/30' : 'bg-red-950/90 border-red-500/30'}`}>
          {banner.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />}
          <p className="flex-1 text-sm text-white leading-relaxed">{banner.message}</p>
          <button onClick={() => setBanner(null)} className="text-white/50 hover:text-white transition"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">🔐 الصلاحيات والموظفون</h1>
        <p className="text-sm text-gray-500 mt-1">إدارة أدوار المستخدمين وقاعدة بيانات الموظفين</p>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'roles' ? 'bg-amber-500 text-black' : 'bg-[#111927] text-gray-400 border border-white/10 hover:bg-white/5'}`}
        >
          🔑 صلاحيات المستخدمين
        </button>
        {isOwner && (
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'employees' ? 'bg-amber-500 text-black' : 'bg-[#111927] text-gray-400 border border-white/10 hover:bg-white/5'}`}
          >
            👥 إدارة الموظفين
          </button>
        )}
      </div>

      {/* ══════════ تبويب: صلاحيات المستخدمين ══════════ */}
      {activeTab === 'roles' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-400">
              {isOwner ? 'تعيين الأدوار والصلاحيات والصفحات المسموحة لمستخدمي النظام' : 'عرض أدوار وصلاحيات مستخدمي النظام (للقراءة فقط)'}
            </h2>
            {isOwner && (
              <button
                onClick={() => setShowAddUser(true)}
                className="px-4 py-2 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition text-sm flex items-center gap-2"
              >
                <Plus size={16} /> إضافة مستخدم جديد
              </button>
            )}
          </div>

          {isOwner && showAddUser && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowAddUser(false)}>
              <div className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold text-amber-400 mb-4">➕ إضافة مستخدم جديد</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">الاسم الكامل *</label>
                    <input type="text" value={newUserForm.full_name} onChange={e => setNewUserForm(f => ({ ...f, full_name: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">البريد الإلكتروني *</label>
                    <input type="email" value={newUserForm.email} onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" dir="ltr" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">كلمة المرور * (6 أحرف على الأقل)</label>
                    <input type="text" value={newUserForm.password} onChange={e => setNewUserForm(f => ({ ...f, password: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" dir="ltr" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">الدور</label>
                    <select value={newUserForm.role} onChange={e => setNewUserForm(f => ({ ...f, role: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none">
                      {Object.entries(roles).filter(([k]) => k !== 'owner').map(([key, label]) => (
                        <option key={key} value={key} className="bg-[#0D1B2A]">{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={handleAddUser} disabled={addingUser} className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition flex items-center justify-center gap-2 disabled:opacity-50">
                    {addingUser ? <Loader2 size={16} className="animate-spin" /> : '✅ إنشاء الحساب'}
                  </button>
                  <button onClick={() => setShowAddUser(false)} className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition">إلغاء</button>
                </div>
                <p className="text-[11px] text-gray-600 mt-3 text-center">💡 سيتم إنشاء الحساب مباشرة بكلمة المرور المحددة، ويمكنه تسجيل الدخول فوراً.</p>
              </div>
            </div>
          )}

          {(loadingUsers || loadingMe) ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
              <Loader2 size={32} className="animate-spin text-amber-500" />
              <p className="text-sm font-medium">جاري تحميل البيانات...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="بحث بالاسم أو البريد الإلكتروني..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="w-full bg-[#111927] border border-white/10 rounded-xl pr-11 pl-4 py-2.5 text-sm text-white focus:border-amber-500/50 outline-none"
                  />
                </div>
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
                const linkedEmployee = employees.find(e => e.user_id === u.id)
                return (
                  <div key={u.id} className={`bg-[#111927] rounded-2xl border p-5 transition ${u.is_active === false ? 'border-red-500/20 opacity-70' : 'border-white/5 hover:border-amber-500/20'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4 border-b border-white/5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg font-bold shrink-0">
                          {u.full_name?.[0] || '?'}
                        </div>
                        <div>
                          <div className="text-base text-white font-bold flex items-center gap-2">
                            {u.full_name}
                            {u.is_active === false && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">معطّل</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 font-mono mt-0.5">{u.email}</div>
                          <div className="text-[10px] text-gray-500 mt-1">
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

                        {isOwner && (
                          <>
                            <button
                              onClick={() => applyRoleDefaults(u)}
                              disabled={savingRole === u.id}
                              className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
                            >
                              ↺ تهيئة الصلاحيات الافتراضية للدور
                            </button>
                            <button
                              onClick={() => toggleActive(u)}
                              disabled={savingRole === u.id}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition disabled:opacity-50 ${
                                u.is_active === false
                                  ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                                  : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                              }`}
                            >
                              {u.is_active === false ? 'تفعيل الحساب' : 'تعطيل الحساب'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 🔹 الربط الإداري بملف الموظف */}
                    <div className="bg-black/20 p-3 rounded-xl border border-white/5 mb-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 font-bold mb-1">🔗 الربط الإداري بملف الموظف (HR Link)</p>
                        {linkedEmployee ? (
                          <p className="text-sm text-green-400 font-bold">👔 مرتبط بـ: {linkedEmployee.name}</p>
                        ) : (
                          <p className="text-xs text-amber-500/70">⚠️ هذا الحساب غير مرتبط بأي موظف في الإدارة.</p>
                        )}
                      </div>
                      {isOwner && (
                        <div>
                          {linkedEmployee ? (
                            <button onClick={() => unlinkEmployeeFromUser(linkedEmployee.id, u)} disabled={savingRole === u.id} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition">فك الربط ❌</button>
                          ) : (
                            <select value="" onChange={e => linkEmployeeToUser(e.target.value, u)} disabled={savingRole === u.id} className="bg-[#0D1B2A] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500/50">
                              <option value="">— ربط الحساب بموظف —</option>
                              {employees.filter(e => !e.user_id).map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── صلاحيات الأفعال المحددة ── */}
                    <p className="text-xs text-gray-400 font-bold mb-3 border-b border-white/5 pb-2">🛠️ صلاحيات الأفعال (النظام ككل)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                      {PERMISSION_KEYS.map(key => (
                        <label
                          key={key}
                          className={`flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl border transition ${
                            u[key] ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-white/5 border-white/10 text-gray-500'
                          } ${isOwner ? 'cursor-pointer hover:bg-white/10' : 'cursor-default'} ${savingRole === u.id ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={u[key]}
                            disabled={!isOwner}
                            onChange={e => isOwner && updatePermission(u.id, key, e.target.checked)}
                            className="accent-amber-500 w-3.5 h-3.5"
                          />
                          {PERMISSION_LABELS[key]}
                        </label>
                      ))}
                    </div>

                    {/* ── صلاحية الوصول للصفحات ── */}
                    <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                      <p className="text-xs text-gray-400 font-bold">📄 صلاحية الدخول لصفحات القائمة الجانبية</p>
                      {isOwner && u.role !== 'owner' && (
                        <div className="flex gap-3">
                          <button onClick={() => setAllPages(u, true)} disabled={savingRole === u.id} className="text-xs text-sky-400 hover:text-sky-300 transition disabled:opacity-50">تفعيل الكل</button>
                          <button onClick={() => setAllPages(u, false)} disabled={savingRole === u.id} className="text-xs text-gray-500 hover:text-gray-400 transition disabled:opacity-50">إلغاء الكل</button>
                        </div>
                      )}
                    </div>
                    {u.role === 'owner' ? (
                      <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-center text-sm text-gray-400">
                        👑 صاحب الحساب يمتلك صلاحية الدخول لجميع الصفحات والأقسام تلقائياً.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {PAGE_SECTIONS.map(({ section, pages }) => (
                          <div key={section} className="bg-black/10 p-4 rounded-xl border border-white/5">
                            <p className="text-[11px] text-gray-500 font-bold mb-3 tracking-wide uppercase">{section}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              {pages.map(page => {
                                const hasAccess = !!u.page_permissions?.[page.key]
                                return (
                                  <div
                                    key={page.key}
                                    className={`flex items-center justify-between gap-3 text-xs px-3 py-2.5 rounded-lg border transition ${
                                      hasAccess ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' : 'bg-white/5 border-white/10 text-gray-500'
                                    } ${savingRole === u.id ? 'opacity-50 pointer-events-none' : ''}`}
                                  >
                                    <span className="truncate">{page.icon} {page.label}</span>
                                    {/* 🔹 مفتاح التفعيل Toggle بدلاً من القائمة المنسدلة */}
                                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                      <input
                                        type="checkbox"
                                        checked={hasAccess}
                                        disabled={!isOwner}
                                        onChange={e => isOwner && updatePagePermission(u, page.key, e.target.checked)}
                                        className="sr-only peer"
                                      />
                                      <div className="w-8 h-4 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-500 opacity-80 peer-disabled:opacity-40"></div>
                                    </label>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredUsers.length === 0 && (
                <div className="text-center py-16 bg-[#111927] rounded-2xl border border-white/5 text-gray-500 text-sm">
                  لا يوجد مستخدمون مطابقون للبحث
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-4 text-center">
            {isOwner
              ? '💡 زر التفعيل/التعطيل لكل صفحة يمنح الموظف حق رؤية الشاشة. الحذف النهائي للبيانات محصور برتبة الإدارة (Admin / Owner).'
              : '💡 الأدوار والصلاحيات المعروضة هنا للقراءة فقط، ويتم تعديلها بواسطة المالك (Owner) حصرياً.'}
          </p>

          {/* ── سجل تغييرات الصلاحيات ── */}
          <div className="mt-8 border-t border-white/5 pt-6">
            <button
              onClick={() => setShowLog(v => !v)}
              className="text-sm font-bold text-gray-400 hover:text-amber-400 transition flex items-center gap-2 bg-[#111927] px-4 py-2 rounded-xl border border-white/5"
            >
              📜 سجل الحركات وتغييرات الصلاحيات {showLog ? '▲' : '▼'}
            </button>

            {showLog && (
              <div className="mt-3 bg-[#111927] rounded-2xl border border-white/5 p-5 shadow-lg">
                {loadingLog ? (
                  <div className="text-center py-8 text-gray-600 text-sm">جاري تحميل السجل...</div>
                ) : activityLog.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 text-sm">لا يوجد سجل تغييرات مسجل في النظام</div>
                ) : (
                  <div className="space-y-3">
                    {activityLog.map(entry => (
                      <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs border-b border-white/5 pb-3 last:border-0">
                        <div className="mb-2 sm:mb-0">
                          <span className="text-amber-400 font-bold bg-amber-500/10 px-2 py-1 rounded-md">{entry.action}</span>
                          <span className="text-gray-400 ml-2"> للمستخدم: <span className="text-white">{entry.entity_label || '—'}</span></span>
                          {entry.actor?.full_name && (
                            <span className="text-gray-500 block sm:inline sm:ml-2 mt-1 sm:mt-0">بواسطة: {entry.actor.full_name}</span>
                          )}
                        </div>
                        <span className="text-gray-500 font-mono bg-black/20 px-2 py-1 rounded-md shrink-0">
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

      {/* ══════════ تبويب: إدارة الموظفين (للمالك فقط) ══════════ */}
      {activeTab === 'employees' && (
        isOwner ? (
          <div>
            <div className="flex items-center justify-end mb-4">
              <button
                onClick={() => setShowForm(true)}
                className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 flex items-center gap-2"
              >
                <Plus size={16} /> موظف جديد
              </button>
            </div>

            {showForm && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowForm(false)}>
                <div className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                  <h2 className="text-lg font-bold text-amber-400 mb-4">➕ إضافة بيانات موظف جديد</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">اسم الموظف بالكامل *</label>
                      <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">الهاتف</label>
                      <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50 text-left font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">الدور / القسم</label>
                      <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none">
                        {Object.entries(roles).map(([key, label]) => (
                          <option key={key} value={key} className="bg-[#0D1B2A]">{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">الراتب الشهري المتفق عليه (ج.م)</label>
                      <input type="number" min={0} value={form.salary} onChange={e => setForm(f => ({ ...f, salary: Number(e.target.value) }))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50 font-mono" />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button onClick={handleAddEmployee} disabled={saving} className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center gap-2">
                      {saving ? <Loader2 size={16} className="animate-spin" /> : '✅ حفظ بيانات الموظف'}
                    </button>
                    <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition">إلغاء</button>
                  </div>
                </div>
              </div>
            )}

            {loadingEmployees ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3 bg-[#111927] rounded-2xl border border-white/5">
                <Loader2 size={32} className="animate-spin text-amber-500" />
                <p className="text-sm font-medium">جاري تحميل سجلات الموظفين...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {employees.map(emp => (
                  <div key={emp.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 shadow-lg hover:border-amber-500/30 transition-all group">
                    <div className="flex justify-between items-start mb-3 border-b border-white/5 pb-3">
                      <h3 className="font-bold text-white text-base group-hover:text-amber-400 transition">{emp.name}</h3>
                      {emp.user_id ? (
                        <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/30 font-bold" title="تم ربطه بحساب مستخدم لدخول النظام">متصل بالنظام 🟢</span>
                      ) : (
                        <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10 font-bold" title="مجرد سجل HR بدون حساب لدخول النظام">سجل فقط ⚪</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-gray-400 text-xs flex justify-between"><span>💼 القسم:</span> <span className="text-white font-bold">{roles[emp.role] || emp.role}</span></p>
                      <p className="text-gray-400 text-xs flex justify-between"><span>📞 الهاتف:</span> <span className="text-white font-mono">{emp.phone || '—'}</span></p>
                      <p className="text-gray-400 text-xs flex justify-between"><span>💵 الراتب الأساسي:</span> <span className="text-amber-400 font-bold font-mono">{emp.salary.toLocaleString('ar-EG')} ج.م</span></p>
                    </div>
                  </div>
                ))}
                {employees.length === 0 && (
                  <div className="col-span-full text-center py-16 bg-[#111927] rounded-2xl border border-white/5 text-gray-500 text-sm">
                    لا يوجد ملفات موظفين مسجلة في الإدارة (HR) بعد.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 bg-[#111927] rounded-2xl border border-white/5 text-gray-500 text-sm flex flex-col items-center gap-3">
            <AlertTriangle size={32} className="text-amber-500 opacity-50" />
            <p>🚫 عذراً، قسم إدارة شؤون الموظفين (HR) متاح فقط لصاحب الحساب المالك (Owner).</p>
          </div>
        )
      )}
    </div>
  )
}