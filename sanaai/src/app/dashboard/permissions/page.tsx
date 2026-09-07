'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  PAGE_LIST, PageKey, PagePermissions, PermissionLevel,
  PERMISSION_LEVEL_ORDER, PERMISSION_LEVEL_LABELS,
} from '@/lib/pages'

const roles: Record<string, string> = {
  owner: 'المالك (وصول كامل)',
  admin: 'مدير نظام',
  sales: 'فريق المبيعات',
  production: 'إدارة الإنتاج',
  design: 'فريق التصميم',
  shipping: 'إدارة الشحن',
  hr: 'الموارد البشرية',
  accountant: 'الإدارة المالية',
  employee: 'مستخدم محدود',
}

type PermissionKey = 'can_edit_production' | 'can_edit_orders' | 'can_manage_sales' | 'can_manage_users' | 'can_view_clients'

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_edit_production: '✏️ تعديل الإنتاج',
  can_edit_orders: '📋 تعديل الطلبات',
  can_manage_sales: '💰 إدارة المبيعات',
  can_manage_users: '👤 إدارة المستخدمين',
  can_view_clients: '👁️ عرض العملاء',
}

const PERMISSION_KEYS: PermissionKey[] = ['can_edit_production', 'can_edit_orders', 'can_manage_sales', 'can_manage_users', 'can_view_clients']

// ── قوالب الصلاحيات الاحترافية (RBAC Templates) ──
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

function pagesToPermissions(keys: PageKey[], level: PermissionLevel = 'edit_delete'): PagePermissions {
  const map: PagePermissions = {}
  for (const k of keys) map[k] = level
  return map
}

const ROLE_DEFAULT_PAGES: Record<string, PageKey[]> = {
  owner:      PAGE_LIST.map(p => p.key),
  admin:      PAGE_LIST.map(p => p.key),
  sales:      ['/dashboard/orders', '/dashboard/clients', '/dashboard/pipeline', '/dashboard/showroom', '/dashboard/invoices'],
  production: ['/dashboard/production', '/dashboard/quality', '/dashboard/inventory', '/dashboard/branches', '/dashboard/suppliers', '/dashboard/procurement'],
  design:     ['/dashboard/production', '/dashboard/quality'],
  shipping:   ['/dashboard/orders', '/dashboard/shipping', '/dashboard/clients'],
  hr:         ['/dashboard/employees', '/dashboard/permissions'],
  accountant: ['/dashboard/invoices', '/dashboard/clients'],
  employee:   [],
}

const PAGE_SECTIONS: { section: string; pages: typeof PAGE_LIST }[] = (() => {
  const order: string[] = []
  const map = new Map<string, typeof PAGE_LIST>()
  for (const page of PAGE_LIST) {
    if (!map.has(page.section)) { map.set(page.section, []); order.push(page.section) }
    map.get(page.section)!.push(page)
  }
  return order.map(section => ({ section, pages: map.get(section)! }))
})()

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
  id: string, action: string, entity_label: string | null, created_at: string, actor: { full_name: string } | null
}

export default function PermissionsPage() {
  const [myRole, setMyRole] = useState<string | null>(null)
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [showLog, setShowLog] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'employee' })

  const isOwner = myRole === 'owner' || myRole === 'admin'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
        setMyRole(me?.role || null)
      }

      const { data: usersData, error } = await supabase
        .from('users')
        .select('*')
        .order('full_name', { ascending: true })
      if (error) throw error
      setAppUsers(usersData || [])

      loadLog()
    } catch (err: any) {
      console.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadLog() {
    const { data } = await supabase
      .from('activity_log')
      .select('id, action, entity_label, created_at, actor:users!user_id(full_name)')
      .eq('entity_type', 'user')
      .order('created_at', { ascending: false })
      .limit(15)
    if (data) setActivityLog(data as any)
  }

  async function logActivity(action: string, entityLabel: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (me?.tenant_id) {
        await supabase.from('activity_log').insert({
          tenant_id: me.tenant_id, user_id: user.id, action, entity_type: 'user', entity_label: entityLabel
        })
        loadLog()
      }
    } catch { /* ignore */ }
  }

  async function applyTemplate(u: AppUser) {
    if (!isOwner) return
    const defaults = ROLE_DEFAULT_PERMISSIONS[u.role]
    if (!defaults) return
    const defaultPages = pagesToPermissions(ROLE_DEFAULT_PAGES[u.role] || [])
    
    if (!confirm(`هل أنت متأكد من تطبيق القالب القياسي لـ "${roles[u.role]}" على هذا الحساب؟ سيتم الكتابة فوق أي صلاحيات مخصصة.`)) return

    setSavingId(u.id)
    try {
      const { error } = await supabase.from('users').update({ ...defaults, page_permissions: defaultPages }).eq('id', u.id)
      if (error) throw error
      setAppUsers(prev => prev.map(user => user.id === u.id ? { ...user, ...defaults, page_permissions: defaultPages } : user))
      logActivity('تطبيق قالب الصلاحيات', u.full_name)
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function toggleActive(u: AppUser) {
    if (!isOwner) return
    const nextValue = !u.is_active
    setSavingId(u.id)
    try {
      const { error } = await supabase.from('users').update({ is_active: nextValue }).eq('id', u.id)
      if (error) throw error
      setAppUsers(prev => prev.map(user => user.id === u.id ? { ...user, is_active: nextValue } : user))
      logActivity(nextValue ? 'تفعيل حساب' : 'تعطيل/إيقاف حساب', u.full_name)
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function updateField(u: AppUser, field: string, value: any) {
    if (!isOwner) return
    setSavingId(u.id)
    try {
      const { error } = await supabase.from('users').update({ [field]: value }).eq('id', u.id)
      if (error) throw error
      setAppUsers(prev => prev.map(user => user.id === u.id ? { ...user, [field]: value } : user))
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleAddUser() {
    if (!isOwner) return
    if (!newUser.email || !newUser.password || !newUser.full_name) return alert('الرجاء إكمال البيانات.')
    if (newUser.password.length < 6) return alert('كلمة المرور 6 أحرف على الأقل.')

    setSavingId('new')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(newUser),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      
      logActivity('إنشاء حساب نظام جديد', newUser.full_name)
      setShowAddModal(false)
      setNewUser({ email: '', password: '', full_name: '', role: 'employee' })
      loadData()
    } catch (err: any) {
      alert('خطأ: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  const filteredUsers = appUsers.filter(u => 
    (u.full_name?.includes(search) || u.email?.includes(search)) &&
    (roleFilter === 'all' || u.role === roleFilter)
  )

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white">🔐 صلاحيات وحسابات النظام</h1>
          <p className="text-sm text-gray-500 mt-1">التحكم الأمني في من يحق له الدخول وما يمكنه رؤيته وتعديله</p>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg whitespace-nowrap"
          >
            ➕ إنشاء حساب نظام
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6 max-w-2xl">
        <input
          type="text"
          placeholder="ابحث بالاسم أو البريد..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-amber-500/50 outline-none"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-amber-500/50 outline-none w-full sm:w-48"
        >
          <option value="all">الكل (الأنظمة)</option>
          {Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div></div>
      ) : (
        <div className="space-y-6">
          {filteredUsers.map(u => (
            <div key={u.id} className={`bg-[#111927] rounded-2xl border ${u.is_active ? 'border-white/5' : 'border-red-500/30 opacity-75'} p-5 transition-all`}>
              {/* Header Info */}
              <div className="flex flex-col lg:flex-row justify-between gap-4 mb-5 pb-5 border-b border-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-black flex items-center justify-center text-amber-400 font-bold text-xl border border-amber-500/20">
                    {u.full_name?.[0] || 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-bold text-lg">{u.full_name}</h3>
                      {!u.is_active && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30">حساب موقوف</span>}
                    </div>
                    <p className="text-sm text-gray-400 font-mono">{u.email}</p>
                    <p className="text-[11px] text-gray-500 mt-1">آخر نشاط: {u.last_login_at ? new Date(u.last_login_at).toLocaleString('ar-EG') : 'لم يدخل أبداً'}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={u.role}
                    disabled={!isOwner || savingId === u.id}
                    onChange={e => updateField(u, 'role', e.target.value)}
                    className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none disabled:opacity-50"
                  >
                    {Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  
                  {isOwner && (
                    <>
                      <button
                        onClick={() => applyTemplate(u)}
                        disabled={savingId === u.id}
                        className="px-4 py-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg text-sm hover:bg-sky-500/20 transition"
                        title="تطبيق الصلاحيات القياسية لهذا الدور تلقائياً"
                      >
                        ⚡ تطبيق القالب الافتراضي
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={savingId === u.id}
                        className={`px-4 py-2 rounded-lg text-sm border transition ${u.is_active ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'}`}
                      >
                        {u.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Toggles (Actions) */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 font-bold mb-3 uppercase tracking-wider">صلاحيات الإجراءات (Actions)</p>
                <div className="flex flex-wrap gap-2">
                  {PERMISSION_KEYS.map(key => (
                    <label key={key} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition cursor-pointer select-none ${u[key] ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-black/40 border-white/5 text-gray-500'}`}>
                      <input type="checkbox" checked={u[key]} disabled={!isOwner} onChange={e => updateField(u, key, e.target.checked)} className="accent-amber-500 w-3.5 h-3.5" />
                      {PERMISSION_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {filteredUsers.length === 0 && <p className="text-center text-gray-500 py-10">لا توجد حسابات مطابقة.</p>}
        </div>
      )}

      {/* ── سجل الأمان (Activity Log) ── */}
      <div className="mt-10 pt-6 border-t border-white/5">
        <button onClick={() => setShowLog(!showLog)} className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-white transition">
          <span className="text-lg">🛡️</span> سجل أمان النظام وحركات الصلاحيات {showLog ? '▲' : '▼'}
        </button>
        {showLog && (
          <div className="mt-4 bg-[#111927] border border-white/5 rounded-2xl p-5">
            {activityLog.length === 0 ? <p className="text-sm text-gray-500 text-center">لا توجد حركات أمنية مسجلة حديثاً.</p> : (
              <div className="space-y-3">
                {activityLog.map(log => (
                  <div key={log.id} className="flex justify-between items-center text-xs py-2 border-b border-white/5 last:border-0">
                    <div>
                      <span className="text-sky-400 font-bold">{log.action}</span>
                      <span className="text-gray-400 mx-2">→</span>
                      <span className="text-white">{log.entity_label}</span>
                      {log.actor && <span className="text-gray-500 ml-2">(بواسطة {log.actor.full_name})</span>}
                    </div>
                    <span className="text-gray-600 font-mono" dir="ltr">{new Date(log.created_at).toLocaleString('en-GB')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── نافذة إضافة حساب جديد ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="bg-[#111927] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-5">➕ إنشاء حساب نظام للموظف</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">الاسم الكامل</label>
                <input type="text" value={newUser.full_name} onChange={e => setNewUser(f => ({...f, full_name: e.target.value}))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-white focus:border-amber-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">البريد الإلكتروني (للدخول)</label>
                <input type="email" dir="ltr" value={newUser.email} onChange={e => setNewUser(f => ({...f, email: e.target.value}))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-white focus:border-amber-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">كلمة المرور الابتدائية (6 أحرف على الأقل)</label>
                <input type="text" dir="ltr" value={newUser.password} onChange={e => setNewUser(f => ({...f, password: e.target.value}))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-white focus:border-amber-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">الدور التقني (القالب)</label>
                <select value={newUser.role} onChange={e => setNewUser(f => ({...f, role: e.target.value}))} className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-white focus:border-amber-500 outline-none">
                  {Object.entries(roles).filter(([k]) => k !== 'owner').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={handleAddUser} disabled={savingId === 'new'} className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition">✅ إنشاء وتفعيل</button>
              <button onClick={() => setShowAddModal(false)} className="px-5 py-2.5 bg-white/5 text-gray-300 rounded-xl hover:bg-white/10">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}