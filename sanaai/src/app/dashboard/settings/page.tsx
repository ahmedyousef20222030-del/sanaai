'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Tenant = {
  id: string
  name: string
  phone: string
  address: string
  city: string
  logo_url: string
  currency: string
  order_prefix: string
  timezone: string
}

type User = {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  is_active: boolean
  avatar_url: string
}

const ROLES: Record<string, string> = {
  owner: '👑 مالك',
  admin: '🛡️ مدير',
  sales: '💼 مبيعات',
  production: '🏭 إنتاج',
  design: '🎨 تصميم',
  shipping: '🚚 شحن',
  hr: '👔 موارد بشرية',
  accountant: '💰 محاسب',
  employee: '👤 موظف',
}

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'company' | 'users' | 'notifications' | 'defaults'>('company')
  const [loading, setLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // بيانات الشركة
  const [tenant, setTenant] = useState<Partial<Tenant>>({})

  // المستخدمين
  const [users, setUsers] = useState<User[]>([])

  // الإشعارات
  const [notifSettings, setNotifSettings] = useState({
    order_delayed: true,
    order_ready: true,
    quality_failed: true,
    invoice_due: true,
    complaint_new: true,
    trial_ending: true,
  })

  // البيانات الافتراضية
  const sectors = ['مدارس', 'مطاعم وفنادق', 'شركات كوربوريت', 'حكومي', 'أفراد', 'أخرى']
  const orderStatuses = ['جديد', 'تحت الإنتاج', 'فحص الجودة', 'جاهز للشحن', 'تم التسليم', 'مغلق', 'ملغي']

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: userData } = await supabase.from('users').select('tenant_id').single()
    if (!userData) return

    const { data: tenantData } = await supabase
      .from('tenants').select('*').eq('id', userData.tenant_id).single()
    if (tenantData) setTenant(tenantData)

    const { data: usersData } = await supabase
      .from('users').select('*').eq('tenant_id', userData.tenant_id)
    if (usersData) setUsers(usersData)
  }

  async function saveTenant() {
    setLoading(true)
    const { error } = await supabase
      .from('tenants').update({
        name: tenant.name,
        phone: tenant.phone,
        address: tenant.address,
        city: tenant.city,
        currency: tenant.currency,
        order_prefix: tenant.order_prefix,
      }).eq('id', tenant.id!)

    setLoading(false)
    if (error) { alert('خطأ: ' + error.message); return }
    setSaveMsg('✅ تم الحفظ بنجاح')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  async function toggleUserActive(userId: string, current: boolean) {
    await supabase.from('users').update({ is_active: !current }).eq('id', userId)
    setUsers(u => u.map(x => x.id === userId ? { ...x, is_active: !current } : x))
  }

  async function changeUserRole(userId: string, role: string) {
    await supabase.from('users').update({ role }).eq('id', userId)
    setUsers(u => u.map(x => x.id === userId ? { ...x, role } : x))
  }

  const tabs = [
    { key: 'company', label: '🏢 بيانات الشركة' },
    { key: 'users', label: '👥 المستخدمون' },
    { key: 'notifications', label: '🔔 الإشعارات' },
    { key: 'defaults', label: '⚙️ البيانات الافتراضية' },
  ]

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()}
            className="text-gray-500 hover:text-white transition text-xl">←</button>
          <div>
            <h1 className="text-2xl font-black text-white">⚙️ الإعدادات</h1>
            <p className="text-sm text-gray-500">إدارة إعدادات النظام</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition ${
                activeTab === t.key
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#111927] text-gray-400 border border-white/5 hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══════════════ بيانات الشركة ═══════════════ */}
        {activeTab === 'company' && (
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-6 space-y-4">
            <h2 className="text-sm font-bold text-amber-400 mb-2">🏢 بيانات الشركة / المصنع</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">اسم المصنع</label>
                <input value={tenant.name || ''} onChange={e => setTenant(t => ({ ...t, name: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">رقم الهاتف</label>
                <input value={tenant.phone || ''} onChange={e => setTenant(t => ({ ...t, phone: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">المدينة</label>
                <input value={tenant.city || ''} onChange={e => setTenant(t => ({ ...t, city: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">العنوان</label>
                <input value={tenant.address || ''} onChange={e => setTenant(t => ({ ...t, address: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">بادئة رقم الطلب</label>
                <input value={tenant.order_prefix || ''} onChange={e => setTenant(t => ({ ...t, order_prefix: e.target.value }))}
                  placeholder="مثال: A"
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">العملة</label>
                <select value={tenant.currency || 'EGP'} onChange={e => setTenant(t => ({ ...t, currency: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                  <option value="EGP">جنيه مصري (EGP)</option>
                  <option value="USD">دولار (USD)</option>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="AED">درهم إماراتي (AED)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button onClick={saveTenant} disabled={loading}
                className="px-6 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50">
                {loading ? 'جاري الحفظ...' : '💾 حفظ التغييرات'}
              </button>
              {saveMsg && <span className="text-green-400 text-sm">{saveMsg}</span>}
            </div>
          </div>
        )}

        {/* ═══════════════ المستخدمون ═══════════════ */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            {users.map(user => (
              <div key={user.id}
                className="bg-[#111927] rounded-2xl border border-white/5 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm flex-shrink-0">
                  {user.full_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{user.full_name}</p>
                  <p className="text-gray-500 text-xs truncate">{user.email}</p>
                </div>
                <select
                  value={user.role}
                  onChange={e => changeUserRole(user.id, e.target.value)}
                  className="bg-[#0D1B2A] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50">
                  {Object.entries(ROLES).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={() => toggleUserActive(user.id, user.is_active)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    user.is_active
                      ? 'bg-green-500/20 text-green-400 hover:bg-red-500/20 hover:text-red-400'
                      : 'bg-red-500/20 text-red-400 hover:bg-green-500/20 hover:text-green-400'
                  }`}>
                  {user.is_active ? '✅ نشط' : '❌ موقوف'}
                </button>
              </div>
            ))}
            {users.length === 0 && (
              <div className="text-center text-gray-500 py-10">لا يوجد مستخدمون</div>
            )}
          </div>
        )}

        {/* ═══════════════ الإشعارات ═══════════════ */}
        {activeTab === 'notifications' && (
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-6 space-y-4">
            <h2 className="text-sm font-bold text-amber-400 mb-2">🔔 إعدادات الإشعارات</h2>
            {[
              { key: 'order_delayed', label: 'طلب متأخر', desc: 'إشعار عند تأخر أي طلب عن موعد التسليم' },
              { key: 'order_ready', label: 'طلب جاهز', desc: 'إشعار عند اكتمال الطلب وجاهزيته للشحن' },
              { key: 'quality_failed', label: 'فشل فحص الجودة', desc: 'إشعار عند رسوب أي طلب في فحص الجودة' },
              { key: 'invoice_due', label: 'فاتورة مستحقة', desc: 'إشعار عند اقتراب موعد سداد فاتورة' },
              { key: 'complaint_new', label: 'شكوى جديدة', desc: 'إشعار عند ورود شكوى جديدة من عميل' },
              { key: 'trial_ending', label: 'انتهاء التجربة', desc: 'إشعار قبل انتهاء فترة التجربة المجانية' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-white text-sm font-bold">{item.label}</p>
                  <p className="text-gray-500 text-xs">{item.desc}</p>
                </div>
                <button
                  onClick={() => setNotifSettings(s => ({ ...s, [item.key]: !s[item.key as keyof typeof s] }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    notifSettings[item.key as keyof typeof notifSettings] ? 'bg-amber-500' : 'bg-gray-700'
                  }`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                    notifSettings[item.key as keyof typeof notifSettings] ? 'right-1' : 'left-1'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════ البيانات الافتراضية ═══════════════ */}
        {activeTab === 'defaults' && (
          <div className="space-y-4">
            <div className="bg-[#111927] rounded-2xl border border-white/5 p-6">
              <h2 className="text-sm font-bold text-amber-400 mb-4">🏷️ القطاعات</h2>
              <div className="flex flex-wrap gap-2">
                {sectors.map(s => (
                  <span key={s} className="px-3 py-1.5 bg-[#0D1B2A] border border-white/10 rounded-lg text-sm text-white">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-[#111927] rounded-2xl border border-white/5 p-6">
              <h2 className="text-sm font-bold text-amber-400 mb-4">📋 حالات الطلبات</h2>
              <div className="flex flex-wrap gap-2">
                {orderStatuses.map(s => (
                  <span key={s} className="px-3 py-1.5 bg-[#0D1B2A] border border-white/10 rounded-lg text-sm text-white">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-[#111927] rounded-2xl border border-white/5 p-6">
              <h2 className="text-sm font-bold text-amber-400 mb-4">👔 أدوار المستخدمين</h2>
              <div className="flex flex-wrap gap-2">
                {Object.values(ROLES).map(r => (
                  <span key={r} className="px-3 py-1.5 bg-[#0D1B2A] border border-white/10 rounded-lg text-sm text-white">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}