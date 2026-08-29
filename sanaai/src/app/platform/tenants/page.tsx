'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { startImpersonation } from '@/lib/impersonation'

type Tenant = {
  id: string
  name: string
  slug: string
  owner_id: string
  plan: string
  plan_status: string
  max_users: number
  trial_ends_at: string | null
  created_at: string
  suspend_reason: string | null
  deleted_at: string | null
}

type Subscription = {
  id: string
  tenant_id: string
  plan: string
  billing_period: string
  amount: number
  currency: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
}

type OwnerInfo = { id: string; full_name: string; email: string }

type TenantUser = {
  id: string
  tenant_id: string
  full_name: string | null
  email: string | null
  role?: string | null
  is_active?: boolean | null
}

type AdminAction = {
  id: string
  tenant_id: string
  admin_email: string | null
  action: string
  details: Record<string, any> | null
  created_at: string
}

const PLAN_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:    { label: 'نشط',       color: 'bg-green-500/15 text-green-400 border-green-500/30' },
  trial:     { label: 'تجريبي',    color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  suspended: { label: 'موقوف',     color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  cancelled: { label: 'ملغي',      color: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
}

const ACTION_LABELS: Record<string, string> = {
  suspend: '⛔ إيقاف',
  activate: '✅ تفعيل',
  extend_trial: '⏳ تمديد الفترة التجريبية',
  update_plan: '📦 تغيير الباقة',
  update_max_users: '👥 تعديل الحد الأقصى للمستخدمين',
  notify: '📩 إرسال إشعار',
  delete: '🗑️ حذف',
  restore: '♻️ استرجاع',
}

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'الأحدث أولًا' },
  { value: 'created_asc', label: 'الأقدم أولًا' },
  { value: 'users_desc', label: 'الأكثر استخدامًا' },
  { value: 'trial_asc', label: 'الأقرب لانتهاء التجربة' },
  { value: 'name_asc', label: 'الاسم (أ-ي)' },
]

const ROLE_OPTIONS = ['owner', 'employee', 'sales']

// input[type=date] بياخد ويدي بصيغة yyyy-mm-dd، فبنحول من/لـ ISO timestamp
function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

function dateInputToIso(dateStr: string): string | null {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toISOString()
}

export default function PlatformTenantsPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [owners, setOwners] = useState<Record<string, OwnerInfo>>({})
  const [userCounts, setUserCounts] = useState<Record<string, number>>({})
  const [tenantUsers, setTenantUsers] = useState<Record<string, TenantUser[]>>({})
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({})
  const [actionsLog, setActionsLog] = useState<Record<string, AdminAction[]>>({})
  const [currentAdminEmail, setCurrentAdminEmail] = useState<string>('')

  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all') // all | with_owner | without_owner
  const [sortBy, setSortBy] = useState('created_desc')
  const [showDeleted, setShowDeleted] = useState(false)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)

  // مودالات
  const [suspendModal, setSuspendModal] = useState<{ tenant: Tenant } | null>(null)
  const [suspendReasonInput, setSuspendReasonInput] = useState('')
  const [notifyModal, setNotifyModal] = useState<{ tenant: Tenant } | null>(null)
  const [notifyTitle, setNotifyTitle] = useState('')
  const [notifyMessage, setNotifyMessage] = useState('')
  const [deleteModal, setDeleteModal] = useState<{ tenant: Tenant } | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) setCurrentAdminEmail(user.email)

      const { data: tenantsData, error: tErr } = await supabase
        .from('tenants')
        .select('id, name, slug, owner_id, plan, plan_status, max_users, trial_ends_at, created_at, suspend_reason, deleted_at')
        .order('created_at', { ascending: false })
      if (tErr) throw tErr
      setTenants(tenantsData || [])

      const ownerIds = [...new Set((tenantsData || []).map(t => t.owner_id).filter(Boolean))]
      if (ownerIds.length > 0) {
        const { data: ownersData } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', ownerIds)
        const ownerMap: Record<string, OwnerInfo> = {}
        for (const o of ownersData || []) ownerMap[o.id] = o
        setOwners(ownerMap)
      }

      // نجيب كل المستخدمين ببياناتهم الكاملة عشان نعرض الأسماء والإيميلات ونعدل الدور والتفعيل
      const { data: allUsers, error: uErr } = await supabase
        .from('users')
        .select('id, tenant_id, full_name, email, role, is_active')
      if (uErr) throw uErr

      const counts: Record<string, number> = {}
      const usersByTenant: Record<string, TenantUser[]> = {}
      for (const u of allUsers || []) {
        if (!u.tenant_id) continue
        counts[u.tenant_id] = (counts[u.tenant_id] || 0) + 1
        if (!usersByTenant[u.tenant_id]) usersByTenant[u.tenant_id] = []
        usersByTenant[u.tenant_id].push(u)
      }
      setUserCounts(counts)
      setTenantUsers(usersByTenant)

      const { data: subsData } = await supabase
        .from('subscriptions')
        .select('*')
        .order('current_period_end', { ascending: false })
      const subMap: Record<string, Subscription> = {}
      for (const s of subsData || []) {
        if (!subMap[s.tenant_id]) subMap[s.tenant_id] = s
      }
      setSubscriptions(subMap)

      const { data: actionsData } = await supabase
        .from('admin_actions')
        .select('*')
        .order('created_at', { ascending: false })
      const actionsMap: Record<string, AdminAction[]> = {}
      for (const a of actionsData || []) {
        if (!actionsMap[a.tenant_id]) actionsMap[a.tenant_id] = []
        if (actionsMap[a.tenant_id].length < 10) actionsMap[a.tenant_id].push(a)
      }
      setActionsLog(actionsMap)
    } catch (err: any) {
      console.error('Error loading tenants:', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function logAction(tenantId: string, action: string, details?: Record<string, any>) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('admin_actions')
        .insert({
          tenant_id: tenantId,
          admin_id: user?.id || null,
          admin_email: user?.email || currentAdminEmail || null,
          action,
          details: details || null,
        })
        .select()
        .single()
      if (!error && data) {
        setActionsLog(prev => ({
          ...prev,
          [tenantId]: [data, ...(prev[tenantId] || [])].slice(0, 10),
        }))
      }
    } catch (err) {
      console.error('Error logging action:', err)
    }
  }

  async function updateTenantField(tenantId: string, field: string, value: any, actionMeta?: { action: string; details?: Record<string, any> }) {
    setSavingId(tenantId)
    try {
      const { error } = await supabase.from('tenants').update({ [field]: value }).eq('id', tenantId)
      if (error) throw error
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, [field]: value } : t))
      if (actionMeta) await logAction(tenantId, actionMeta.action, actionMeta.details)
    } catch (err: any) {
      alert('تعذر التحديث: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function updateSubscriptionField(sub: Subscription, field: string, value: any) {
    setSavingId(sub.tenant_id)
    try {
      const { error } = await supabase.from('subscriptions').update({ [field]: value }).eq('id', sub.id)
      if (error) throw error
      setSubscriptions(prev => ({ ...prev, [sub.tenant_id]: { ...sub, [field]: value } }))
    } catch (err: any) {
      alert('تعذر تحديث الاشتراك: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function updateUserField(tenantId: string, userId: string, field: string, value: any) {
    setSavingUserId(userId)
    try {
      const { error } = await supabase.from('users').update({ [field]: value }).eq('id', userId)
      if (error) throw error
      setTenantUsers(prev => ({
        ...prev,
        [tenantId]: (prev[tenantId] || []).map(u => u.id === userId ? { ...u, [field]: value } : u),
      }))
    } catch (err: any) {
      alert('تعذر تحديث المستخدم: ' + err.message)
    } finally {
      setSavingUserId(null)
    }
  }

  async function handleImpersonate(ownerId: string) {
    if (!confirm('هل تريد الدخول كهذا المستخدم؟ ستنتقل لحسابه فورًا وأي تعديل سيؤثر فعليًا على بياناته.')) return
    setImpersonatingId(ownerId)
    try {
      const { error } = await startImpersonation(ownerId)
      if (error) {
        alert(error)
        return
      }
      router.push('/dashboard')
    } finally {
      setImpersonatingId(null)
    }
  }

  // -------------------- إيقاف / تفعيل الشركة --------------------
  function openSuspendModal(t: Tenant) {
    setSuspendReasonInput('')
    setSuspendModal({ tenant: t })
  }

  async function confirmSuspend() {
    if (!suspendModal) return
    const t = suspendModal.tenant
    setSavingId(t.id)
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ plan_status: 'suspended', suspend_reason: suspendReasonInput || null })
        .eq('id', t.id)
      if (error) throw error
      setTenants(prev => prev.map(x => x.id === t.id ? { ...x, plan_status: 'suspended', suspend_reason: suspendReasonInput || null } : x))
      await logAction(t.id, 'suspend', { reason: suspendReasonInput || null })
      setSuspendModal(null)
    } catch (err: any) {
      alert('تعذر إيقاف الشركة: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleActivate(t: Tenant) {
    if (!confirm(`تفعيل شركة "${t.name}" مرة أخرى؟`)) return
    await updateTenantField(t.id, 'plan_status', 'active', { action: 'activate' })
    setTenants(prev => prev.map(x => x.id === t.id ? { ...x, suspend_reason: null } : x))
  }

  // -------------------- تمديد الفترة التجريبية --------------------
  async function extendTrial(t: Tenant, days: number) {
    const base = t.trial_ends_at && new Date(t.trial_ends_at) > new Date() ? new Date(t.trial_ends_at) : new Date()
    base.setDate(base.getDate() + days)
    const newDate = base.toISOString()
    await updateTenantField(t.id, 'trial_ends_at', newDate, { action: 'extend_trial', details: { days, new_date: newDate } })
  }

  // -------------------- إشعار --------------------
  function openNotifyModal(t: Tenant) {
    setNotifyTitle('')
    setNotifyMessage('')
    setNotifyModal({ tenant: t })
  }

  async function confirmSendNotification() {
    if (!notifyModal) return
    if (!notifyTitle.trim() || !notifyMessage.trim()) {
      alert('من فضلك اكتب عنوان ونص الرسالة')
      return
    }
    const t = notifyModal.tenant
    setSavingId(t.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('tenant_notifications').insert({
        tenant_id: t.id,
        title: notifyTitle.trim(),
        message: notifyMessage.trim(),
        sender_id: user?.id || null,
      })
      if (error) throw error
      await logAction(t.id, 'notify', { title: notifyTitle.trim() })
      setNotifyModal(null)
    } catch (err: any) {
      alert('تعذر إرسال الإشعار: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  // -------------------- حذف / استرجاع --------------------
  function openDeleteModal(t: Tenant) {
    setDeleteConfirmText('')
    setDeleteModal({ tenant: t })
  }

  async function confirmDelete() {
    if (!deleteModal) return
    const t = deleteModal.tenant
    if (deleteConfirmText.trim() !== t.name) {
      alert('الاسم المكتوب غير مطابق. من فضلك اكتب اسم الشركة بالضبط للتأكيد.')
      return
    }
    setSavingId(t.id)
    try {
      const nowIso = new Date().toISOString()
      const { error } = await supabase.from('tenants').update({ deleted_at: nowIso }).eq('id', t.id)
      if (error) throw error
      setTenants(prev => prev.map(x => x.id === t.id ? { ...x, deleted_at: nowIso } : x))
      await logAction(t.id, 'delete')
      setDeleteModal(null)
    } catch (err: any) {
      alert('تعذر حذف الشركة: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function handleRestore(t: Tenant) {
    if (!confirm(`استرجاع شركة "${t.name}"؟`)) return
    await updateTenantField(t.id, 'deleted_at', null, { action: 'restore' })
  }

  // -------------------- فلترة وترتيب --------------------
  const filtered = useMemo(() => {
    let list = tenants.filter(t => {
      const term = search.trim().toLowerCase()
      const matchSearch = !term || t.name?.toLowerCase().includes(term) || t.slug?.toLowerCase().includes(term)
      const matchStatus = statusFilter === 'all' || t.plan_status === statusFilter
      const matchPlan = planFilter === 'all' || t.plan === planFilter
      const matchOwner =
        ownerFilter === 'all' ||
        (ownerFilter === 'with_owner' && !!t.owner_id) ||
        (ownerFilter === 'without_owner' && !t.owner_id)
      const matchDeleted = showDeleted ? !!t.deleted_at : !t.deleted_at
      return matchSearch && matchStatus && matchPlan && matchOwner && matchDeleted
    })

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'created_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'users_desc':
          return (userCounts[b.id] || 0) - (userCounts[a.id] || 0)
        case 'trial_asc': {
          const at = a.trial_ends_at ? new Date(a.trial_ends_at).getTime() : Infinity
          const bt = b.trial_ends_at ? new Date(b.trial_ends_at).getTime() : Infinity
          return at - bt
        }
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '', 'ar')
        case 'created_desc':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

    return list
  }, [tenants, search, statusFilter, planFilter, ownerFilter, showDeleted, sortBy, userCounts])

  const availablePlans = useMemo(() => {
    return [...new Set(tenants.map(t => t.plan).filter(Boolean))]
  }, [tenants])

  if (loading) {
    return <div className="p-6 text-center text-gray-600">جاري تحميل الشركات...</div>
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">🏢 إدارة الشركات والاشتراكات</h1>
        <p className="text-sm text-gray-500 mt-1">تحكم كامل في كل شركة مشتركة في المنصة</p>
      </div>

      {/* أدوات الفلترة والترتيب */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="🔍 بحث باسم الشركة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500/50 outline-none"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500/50 outline-none"
          >
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="trial">تجريبي</option>
            <option value="suspended">موقوف</option>
            <option value="cancelled">ملغي</option>
          </select>
          <select
            value={planFilter}
            onChange={e => setPlanFilter(e.target.value)}
            className="bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500/50 outline-none"
          >
            <option value="all">كل الباقات</option>
            {availablePlans.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            className="bg-[#111927] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500/50 outline-none"
          >
            <option value="all">كل الشركات (بمالك أو بدون)</option>
            <option value="with_owner">لها مالك محدد</option>
            <option value="without_owner">بدون مالك (تجريبية)</option>
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-[#111927] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500/50 outline-none"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <button
            onClick={() => setShowDeleted(s => !s)}
            className={`text-xs px-3 py-2 rounded-xl border transition ${
              showDeleted
                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
            }`}
          >
            {showDeleted ? '🗑️ عرض المحذوفة' : '📋 عرض النشطة'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(t => {
          const owner = owners[t.owner_id]
          const sub = subscriptions[t.id]
          const statusInfo = PLAN_STATUS_LABELS[t.plan_status] || { label: t.plan_status, color: 'bg-gray-500/15 text-gray-400 border-gray-500/30' }
          const isExpanded = expandedId === t.id
          const usersUsed = userCounts[t.id] || 0
          const usersList = tenantUsers[t.id] || []
          const actions = actionsLog[t.id] || []
          const isDeleted = !!t.deleted_at

          return (
            <div key={t.id} className={`bg-[#111927] rounded-2xl border overflow-hidden ${isDeleted ? 'border-red-500/20 opacity-70' : 'border-white/5'}`}>
              <div className="p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold">
                    {t.name?.[0] || '?'}
                  </div>
                  <div>
                    <div className="text-white font-bold flex items-center gap-2">
                      {t.name}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusInfo.color}`}>{statusInfo.label}</span>
                      {isDeleted && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30">
                          🗑️ محذوفة
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      {owner ? `${owner.full_name} — ${owner.email}` : 'لا يوجد مالك محدد'}
                      {owner && !isDeleted && (
                        <button
                          onClick={() => handleImpersonate(owner.id)}
                          disabled={impersonatingId === owner.id}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition disabled:opacity-50"
                        >
                          {impersonatingId === owner.id ? '⏳ جاري الدخول...' : '👁️ دخول كـ owner'}
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5">
                      {usersUsed} / {t.max_users || '∞'} مستخدم · باقة {t.plan}
                      {t.plan_status === 'suspended' && t.suspend_reason && (
                        <span className="text-red-400"> · سبب الإيقاف: {t.suspend_reason}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {!isDeleted ? (
                    <>
                      {t.plan_status === 'suspended' ? (
                        <button
                          onClick={() => handleActivate(t)}
                          disabled={savingId === t.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition disabled:opacity-50"
                        >
                          ✅ تفعيل
                        </button>
                      ) : (
                        <button
                          onClick={() => openSuspendModal(t)}
                          disabled={savingId === t.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition disabled:opacity-50"
                        >
                          ⛔ إيقاف فوري
                        </button>
                      )}
                      <button
                        onClick={() => openNotifyModal(t)}
                        disabled={savingId === t.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition disabled:opacity-50"
                      >
                        📩 إشعار
                      </button>
                      <button
                        onClick={() => openDeleteModal(t)}
                        disabled={savingId === t.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-red-400 border border-white/10 hover:bg-red-500/10 transition disabled:opacity-50"
                      >
                        🗑️ حذف
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleRestore(t)}
                      disabled={savingId === t.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition disabled:opacity-50"
                    >
                      ♻️ استرجاع
                    </button>
                  )}
                  <select
                    value={t.plan_status}
                    disabled={savingId === t.id || isDeleted}
                    onChange={e => updateTenantField(t.id, 'plan_status', e.target.value)}
                    className="bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-purple-500/50 disabled:opacity-50"
                  >
                    <option value="active">نشط</option>
                    <option value="trial">تجريبي</option>
                    <option value="suspended">موقوف</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition"
                  >
                    {isExpanded ? 'إخفاء التفاصيل ▲' : 'عرض التفاصيل ▼'}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-white/5 p-5 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* بيانات الشركة */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 mb-3">⚙️ إعدادات الشركة</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">الباقة</label>
                          <input
                            type="text"
                            defaultValue={t.plan}
                            disabled={isDeleted}
                            onBlur={e => e.target.value !== t.plan && updateTenantField(t.id, 'plan', e.target.value, { action: 'update_plan', details: { from: t.plan, to: e.target.value } })}
                            className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">الحد الأقصى للمستخدمين</label>
                          <input
                            type="number"
                            min={1}
                            defaultValue={t.max_users}
                            disabled={isDeleted}
                            onBlur={e => Number(e.target.value) !== t.max_users && updateTenantField(t.id, 'max_users', Number(e.target.value), { action: 'update_max_users', details: { from: t.max_users, to: Number(e.target.value) } })}
                            className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">نهاية الفترة التجريبية</label>
                          <input
                            type="date"
                            disabled={savingId === t.id || isDeleted}
                            defaultValue={toDateInputValue(t.trial_ends_at)}
                            onBlur={e => {
                              const newIso = dateInputToIso(e.target.value)
                              if (newIso !== t.trial_ends_at) {
                                updateTenantField(t.id, 'trial_ends_at', newIso, { action: 'extend_trial', details: { manual: true, new_date: newIso } })
                              }
                            }}
                            className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50 disabled:opacity-50 [color-scheme:dark]"
                          />
                          <div className="flex gap-1.5 mt-2">
                            {[7, 14, 30].map(days => (
                              <button
                                key={days}
                                disabled={savingId === t.id || isDeleted}
                                onClick={() => extendTrial(t, days)}
                                className="text-[10px] px-2 py-1 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition disabled:opacity-50"
                              >
                                +{days} يوم
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">تاريخ الإنشاء</label>
                          <p className="text-xs text-gray-400 px-1 py-1.5">
                            {new Date(t.created_at).toLocaleDateString('ar-EG')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* بيانات الاشتراك */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 mb-3">💳 الاشتراك</h3>
                      {sub ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] text-gray-500 mb-1">حالة الاشتراك</label>
                            <select
                              value={sub.status}
                              disabled={savingId === t.id || isDeleted}
                              onChange={e => updateSubscriptionField(sub, 'status', e.target.value)}
                              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50 disabled:opacity-50"
                            >
                              <option value="active">نشط</option>
                              <option value="past_due">متأخر السداد</option>
                              <option value="cancelled">ملغي</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-1">القيمة</label>
                              <p className="text-xs text-amber-400 font-bold px-1 py-1.5">
                                {sub.amount?.toLocaleString('ar-EG')} {sub.currency}
                              </p>
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-1">دورة الفوترة</label>
                              <p className="text-xs text-gray-400 px-1 py-1.5">
                                {sub.billing_period === 'yearly' ? 'سنوي' : 'شهري'}
                              </p>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] text-gray-500 mb-1">نهاية الفترة الحالية</label>
                            <input
                              type="date"
                              disabled={savingId === t.id || isDeleted}
                              defaultValue={toDateInputValue(sub.current_period_end)}
                              onBlur={e => {
                                const newIso = dateInputToIso(e.target.value)
                                if (newIso !== sub.current_period_end) updateSubscriptionField(sub, 'current_period_end', newIso)
                              }}
                              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50 disabled:opacity-50 [color-scheme:dark]"
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600">لا يوجد سجل اشتراك لهذه الشركة</p>
                      )}
                    </div>

                    {/* المستخدمين المسجلين */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 mb-3">
                        👥 المستخدمين المسجلين ({usersList.length})
                      </h3>
                      {usersList.length > 0 ? (
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                          {usersList.map(u => {
                            const isUserSaving = savingUserId === u.id
                            const isActive = u.is_active !== false
                            return (
                              <div
                                key={u.id}
                                className={`bg-[#0D1B2A] rounded-lg px-3 py-2 border border-white/5 ${isUserSaving ? 'opacity-50' : ''} ${!isActive ? 'opacity-60' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="min-w-0">
                                    <div className="text-xs text-white truncate">{u.full_name || 'بدون اسم'}</div>
                                    <div className="text-[10px] text-gray-500 truncate">{u.email || '—'}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={u.role || ''}
                                    disabled={isUserSaving || isDeleted}
                                    onChange={e => updateUserField(t.id, u.id, 'role', e.target.value)}
                                    className="flex-1 bg-[#111927] border border-white/10 rounded-md px-2 py-1 text-[10px] text-purple-300 outline-none focus:border-purple-500/50 disabled:opacity-50"
                                  >
                                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                  <button
                                    disabled={isUserSaving || isDeleted}
                                    onClick={() => updateUserField(t.id, u.id, 'is_active', !isActive)}
                                    className={`shrink-0 text-[10px] px-2 py-1 rounded-md border transition disabled:opacity-50 ${
                                      isActive
                                        ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                                        : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30'
                                    }`}
                                    title={isActive ? 'إيقاف المستخدم' : 'تفعيل المستخدم'}
                                  >
                                    {isActive ? 'نشط' : 'موقوف'}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600">لا يوجد مستخدمين مسجلين تحت هذه الشركة</p>
                      )}
                    </div>
                  </div>

                  {/* سجل النشاط */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 mb-3">📜 آخر الإجراءات على هذه الشركة</h3>
                    {actions.length > 0 ? (
                      <div className="space-y-1.5">
                        {actions.map(a => (
                          <div key={a.id} className="flex items-center justify-between text-[11px] bg-[#0D1B2A] rounded-lg px-3 py-2 border border-white/5">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-300">{ACTION_LABELS[a.action] || a.action}</span>
                              {a.details?.reason && <span className="text-gray-500">— {a.details.reason}</span>}
                              {a.details?.title && <span className="text-gray-500">— {a.details.title}</span>}
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <span>{a.admin_email || 'غير معروف'}</span>
                              <span>·</span>
                              <span>{new Date(a.created_at).toLocaleString('ar-EG')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">لا يوجد سجل نشاط بعد لهذه الشركة</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-600 text-sm">لا توجد شركات مطابقة</div>
        )}
      </div>

      {/* مودال الإيقاف */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSuspendModal(null)}>
          <div className="bg-[#111927] rounded-2xl border border-white/10 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-1">⛔ إيقاف شركة "{suspendModal.tenant.name}"</h3>
            <p className="text-xs text-gray-500 mb-4">هيتم منع الشركة من استخدام النظام فورًا. اكتب سبب الإيقاف (اختياري لكن مستحسن).</p>
            <textarea
              value={suspendReasonInput}
              onChange={e => setSuspendReasonInput(e.target.value)}
              placeholder="مثال: تأخر في السداد، مخالفة سياسة الاستخدام..."
              rows={3}
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/50 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSuspendModal(null)} className="text-xs px-4 py-2 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10">
                إلغاء
              </button>
              <button onClick={confirmSuspend} disabled={savingId === suspendModal.tenant.id} className="text-xs px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                {savingId === suspendModal.tenant.id ? 'جاري الإيقاف...' : 'تأكيد الإيقاف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال الإشعار */}
      {notifyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setNotifyModal(null)}>
          <div className="bg-[#111927] rounded-2xl border border-white/10 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-1">📩 إرسال إشعار لشركة "{notifyModal.tenant.name}"</h3>
            <p className="text-xs text-gray-500 mb-4">هيظهر الإشعار لصاحب الشركة داخل الداشبورد بتاعه.</p>
            <input
              type="text"
              value={notifyTitle}
              onChange={e => setNotifyTitle(e.target.value)}
              placeholder="عنوان الرسالة"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500/50 mb-3"
            />
            <textarea
              value={notifyMessage}
              onChange={e => setNotifyMessage(e.target.value)}
              placeholder="نص الرسالة..."
              rows={4}
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500/50 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNotifyModal(null)} className="text-xs px-4 py-2 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10">
                إلغاء
              </button>
              <button onClick={confirmSendNotification} disabled={savingId === notifyModal.tenant.id} className="text-xs px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                {savingId === notifyModal.tenant.id ? 'جاري الإرسال...' : 'إرسال'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال الحذف */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDeleteModal(null)}>
          <div className="bg-[#111927] rounded-2xl border border-red-500/30 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-red-400 font-bold mb-1">🗑️ حذف شركة "{deleteModal.tenant.name}"</h3>
            <p className="text-xs text-gray-500 mb-4">
              هيتم إخفاء الشركة من النظام (حذف ناعم — تقدر تسترجعها لاحقًا). للتأكيد، اكتب اسم الشركة بالضبط:
              <span className="text-white font-bold"> {deleteModal.tenant.name}</span>
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="اكتب اسم الشركة هنا"
              className="w-full bg-[#0D1B2A] border border-red-500/30 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500/60 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteModal(null)} className="text-xs px-4 py-2 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10">
                إلغاء
              </button>
              <button
                onClick={confirmDelete}
                disabled={savingId === deleteModal.tenant.id || deleteConfirmText.trim() !== deleteModal.tenant.name}
                className="text-xs px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
              >
                {savingId === deleteModal.tenant.id ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}