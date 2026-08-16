'use client'

import { useEffect, useState } from 'react'
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

const PLAN_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:    { label: 'نشط',       color: 'bg-green-500/15 text-green-400 border-green-500/30' },
  trial:     { label: 'تجريبي',    color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  suspended: { label: 'موقوف',     color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  cancelled: { label: 'ملغي',      color: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
}

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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: tenantsData, error: tErr } = await supabase
        .from('tenants')
        .select('id, name, slug, owner_id, plan, plan_status, max_users, trial_ends_at, created_at')
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

      // نجيب كل المستخدمين ببياناتهم الكاملة (مش بس tenant_id) عشان نعرض الأسماء والإيميلات ونعدل الدور والتفعيل
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
        if (!subMap[s.tenant_id]) subMap[s.tenant_id] = s // أحدث سجل لكل شركة بس
      }
      setSubscriptions(subMap)
    } catch (err: any) {
      console.error('Error loading tenants:', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function updateTenantField(tenantId: string, field: string, value: any) {
    setSavingId(tenantId)
    try {
      const { error } = await supabase.from('tenants').update({ [field]: value }).eq('id', tenantId)
      if (error) throw error
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, [field]: value } : t))
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

  const filtered = tenants.filter(t => {
    const term = search.trim().toLowerCase()
    const matchSearch = !term || t.name?.toLowerCase().includes(term) || t.slug?.toLowerCase().includes(term)
    const matchStatus = statusFilter === 'all' || t.plan_status === statusFilter
    return matchSearch && matchStatus
  })

  if (loading) {
    return <div className="p-6 text-center text-gray-600">جاري تحميل الشركات...</div>
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">🏢 إدارة الشركات والاشتراكات</h1>
        <p className="text-sm text-gray-500 mt-1">تحكم كامل في كل شركة مشتركة في المنصة</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
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
      </div>

      <div className="space-y-3">
        {filtered.map(t => {
          const owner = owners[t.owner_id]
          const sub = subscriptions[t.id]
          const statusInfo = PLAN_STATUS_LABELS[t.plan_status] || { label: t.plan_status, color: 'bg-gray-500/15 text-gray-400 border-gray-500/30' }
          const isExpanded = expandedId === t.id
          const usersUsed = userCounts[t.id] || 0
          const usersList = tenantUsers[t.id] || []

          return (
            <div key={t.id} className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold">
                    {t.name?.[0] || '?'}
                  </div>
                  <div>
                    <div className="text-white font-bold flex items-center gap-2">
                      {t.name}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusInfo.color}`}>{statusInfo.label}</span>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      {owner ? `${owner.full_name} — ${owner.email}` : 'لا يوجد مالك محدد'}
                      {owner && (
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
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={t.plan_status}
                    disabled={savingId === t.id}
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
                <div className="border-t border-white/5 p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* بيانات الشركة */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 mb-3">⚙️ إعدادات الشركة</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">الباقة</label>
                        <input
                          type="text"
                          defaultValue={t.plan}
                          onBlur={e => e.target.value !== t.plan && updateTenantField(t.id, 'plan', e.target.value)}
                          className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">الحد الأقصى للمستخدمين</label>
                        <input
                          type="number"
                          min={1}
                          defaultValue={t.max_users}
                          onBlur={e => Number(e.target.value) !== t.max_users && updateTenantField(t.id, 'max_users', Number(e.target.value))}
                          className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-1">نهاية الفترة التجريبية</label>
                        <input
                          type="date"
                          disabled={savingId === t.id}
                          defaultValue={toDateInputValue(t.trial_ends_at)}
                          onBlur={e => {
                            const newIso = dateInputToIso(e.target.value)
                            if (newIso !== t.trial_ends_at) updateTenantField(t.id, 'trial_ends_at', newIso)
                          }}
                          className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50 disabled:opacity-50 [color-scheme:dark]"
                        />
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
                            disabled={savingId === t.id}
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
                            disabled={savingId === t.id}
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
                          const isActive = u.is_active !== false // نعتبره نشط لو القيمة مش موجودة أصلاً
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
                                  disabled={isUserSaving}
                                  onChange={e => updateUserField(t.id, u.id, 'role', e.target.value)}
                                  className="flex-1 bg-[#111927] border border-white/10 rounded-md px-2 py-1 text-[10px] text-purple-300 outline-none focus:border-purple-500/50 disabled:opacity-50"
                                >
                                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <button
                                  disabled={isUserSaving}
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
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-600 text-sm">لا توجد شركات مطابقة</div>
        )}
      </div>
    </div>
  )
}