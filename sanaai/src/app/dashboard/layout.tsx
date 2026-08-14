'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type PermissionKey = 'can_edit_production' | 'can_edit_orders' | 'can_manage_sales' | 'can_manage_users' | 'can_view_clients'

type NavItem = {
  label: string
  icon: string
  path: string
  permission?: PermissionKey // لو موجودة، الرابط بيتطلب الصلاحية دي. لو مش موجودة يبقى ظاهر للكل.
  ownerOnly?: boolean        // لو true، ظاهر للـ owner بس بغض النظر عن الصلاحيات
}

// ── القائمة الجانبية مع تحديد الصلاحية المطلوبة لكل رابط ──
const navItems: { section: string; items: NavItem[] }[] = [
  { section: 'الرئيسية', items: [
    { label: 'لوحة التحكم', icon: '🏠', path: '/dashboard' }, // ظاهرة للكل دايمًا
  ]},
  { section: 'المبيعات', items: [
    { label: 'الطلبات',     icon: '📦', path: '/dashboard/orders',     permission: 'can_edit_orders' },
    { label: 'طلب جديد',   icon: '➕', path: '/dashboard/orders/new', permission: 'can_edit_orders' },
    { label: 'العملاء',    icon: '🏢', path: '/dashboard/clients',    permission: 'can_view_clients' },
    { label: 'خط الإنتاج', icon: '🔄', path: '/dashboard/pipeline',   permission: 'can_manage_sales' },
  ]},
  { section: 'التوريدات والمخازن', items: [
    { label: 'الموردين',   icon: '🤝', path: '/dashboard/suppliers',   permission: 'can_edit_production' },
    { label: 'المشتريات',  icon: '🛒', path: '/dashboard/procurement', permission: 'can_edit_production' },
    { label: 'المخزون',    icon: '📦', path: '/dashboard/inventory',   permission: 'can_edit_production' },
  ]},
  { section: 'التشغيل', items: [
    { label: 'الإنتاج',          icon: '⚙️', path: '/dashboard/production', permission: 'can_edit_production' },
    { label: 'الجودة',           icon: '🔍', path: '/dashboard/quality',    permission: 'can_edit_production' },
    { label: 'المعروض على الرف', icon: '🏪', path: '/dashboard/showroom',   permission: 'can_manage_sales' },
    { label: 'الشحن',            icon: '🚚', path: '/dashboard/shipping',   permission: 'can_edit_orders' },
    { label: 'الفواتير',         icon: '🧾', path: '/dashboard/invoices',   permission: 'can_manage_sales' },
  ]},
  { section: 'الإدارة', items: [
    { label: 'الموظفين',      icon: '👥', path: '/dashboard/employees',   permission: 'can_manage_users' },
    { label: 'الشكاوى',       icon: '📢', path: '/dashboard/complaints',  permission: 'can_view_clients' },
    { label: 'الصلاحيات',     icon: '🔑', path: '/dashboard/permissions', permission: 'can_manage_users' },
    { label: 'سجل التغييرات', icon: '📋', path: '/dashboard/changelog',   permission: 'can_manage_users' },
    { label: 'الإعدادات',     icon: '⚙️', path: '/dashboard/settings',    ownerOnly: true },
  ]},
]

// ── نفس الربط بالظبط لكن بشكل مسارات (prefixes) عشان نستخدمه في حماية الصفحات نفسها ──
// أي مسار فرعي تحت البادئة دي (مثلاً /dashboard/orders/123) بياخد نفس الشرط
const ROUTE_PERMISSIONS: { prefix: string; permission?: PermissionKey; ownerOnly?: boolean }[] = [
  { prefix: '/dashboard/orders',      permission: 'can_edit_orders' },
  { prefix: '/dashboard/clients',     permission: 'can_view_clients' },
  { prefix: '/dashboard/pipeline',    permission: 'can_manage_sales' },
  { prefix: '/dashboard/suppliers',   permission: 'can_edit_production' },
  { prefix: '/dashboard/procurement', permission: 'can_edit_production' },
  { prefix: '/dashboard/inventory',   permission: 'can_edit_production' },
  { prefix: '/dashboard/production',  permission: 'can_edit_production' },
  { prefix: '/dashboard/quality',     permission: 'can_edit_production' },
  { prefix: '/dashboard/showroom',    permission: 'can_manage_sales' },
  { prefix: '/dashboard/shipping',    permission: 'can_edit_orders' },
  { prefix: '/dashboard/invoices',    permission: 'can_manage_sales' },
  { prefix: '/dashboard/employees',   permission: 'can_manage_users' },
  { prefix: '/dashboard/complaints',  permission: 'can_view_clients' },
  { prefix: '/dashboard/permissions', permission: 'can_manage_users' },
  { prefix: '/dashboard/changelog',   permission: 'can_manage_users' },
  { prefix: '/dashboard/settings',    ownerOnly: true },
]

type MyPermissions = {
  role: string
  can_edit_production: boolean
  can_edit_orders: boolean
  can_manage_sales: boolean
  can_manage_users: boolean
  can_view_clients: boolean
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()

  const [me, setMe] = useState<MyPermissions | null>(null)
  const [loadingMe, setLoadingMe] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    loadMe()
  }, [])

  async function loadMe() {
    setLoadingMe(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/auth/login')
        return
      }
      const { data, error } = await supabase
        .from('users')
        .select('role, can_edit_production, can_edit_orders, can_manage_sales, can_manage_users, can_view_clients')
        .eq('id', user.id)
        .single()
      if (error) throw error
      setMe(data as MyPermissions)
    } catch (err: any) {
      console.error('Error loading current user permissions:', err.message)
    } finally {
      setLoadingMe(false)
      setAuthChecked(true)
    }
  }

  const isOwner = me?.role === 'owner'

  // ── هل المستخدم الحالي يقدر يشوف الرابط ده في القائمة؟ ──
  function canSeeItem(item: NavItem): boolean {
    if (!me) return false
    if (isOwner) return true
    if (item.ownerOnly) return false
    if (!item.permission) return true
    return !!me[item.permission]
  }

  // ── فلترة الأقسام: نبني الأقسام اللي ليها روابط ظاهرة بس ──
  const visibleNavItems = navItems
    .map(section => ({
      section: section.section,
      items: section.items.filter(canSeeItem),
    }))
    .filter(section => section.items.length > 0)

  // ── حارس الصفحات: هل المستخدم مسموح له يفتح الصفحة الحالية أصلاً؟ ──
  function isCurrentRouteAllowed(): boolean {
    if (!me) return false
    if (isOwner) return true

    const rule = ROUTE_PERMISSIONS.find(
      r => pathname === r.prefix || pathname.startsWith(r.prefix + '/')
    )
    if (!rule) return true // مفيش قيد على المسار ده (زي /dashboard الرئيسية)
    if (rule.ownerOnly) return false
    if (!rule.permission) return true
    return !!me[rule.permission]
  }

  const routeAllowed = authChecked && !loadingMe ? isCurrentRouteAllowed() : false

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="flex min-h-screen bg-[#080C12] text-white" dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}>

      {/* Sidebar */}
      <aside className="w-64 fixed top-0 right-0 bottom-0 bg-[#0D1B2A] border-l border-amber-600/20 flex flex-col z-50 overflow-y-auto">

        {/* Logo */}
        <div className="p-6 border-b border-amber-600/20">
          <h1 className="text-xl font-black text-amber-400" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            🏭 صَنَاعي
          </h1>
          <p className="text-xs text-gray-500 mt-1">نظام إدارة المصانع</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-4">
          {loadingMe ? (
            <div className="text-center text-xs text-gray-600 py-6">جاري تحميل القائمة...</div>
          ) : (
            visibleNavItems.map((section) => (
              <div key={section.section}>
                <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest mb-2 px-2">
                  {section.section}
                </p>
                {section.items.map((item) => {
                  const active = pathname === item.path
                  return (
                    <button key={item.path} onClick={() => router.push(item.path)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-right transition mb-1
                        ${active
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                      {active && <span className="mr-auto w-1.5 h-1.5 bg-amber-400 rounded-full" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-amber-600/20">
          <button onClick={handleLogout}
            className="w-full px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition">
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 mr-64 min-h-screen">
        {loadingMe ? (
          // لسه بنتحقق من الصلاحيات، منورّيش أي محتوى للصفحة المحمية لحد ما نتأكد
          <div className="flex items-center justify-center min-h-screen text-gray-600 text-sm">
            جاري التحقق من الصلاحيات...
          </div>
        ) : routeAllowed ? (
          children
        ) : (
          // مفيش صلاحية على الصفحة دي → منعرضش محتواها خالص (الصفحة نفسها متتنفذش)
          <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
            <div className="text-5xl">🚫</div>
            <h2 className="text-lg font-bold text-white">غير مصرح لك بالوصول لهذه الصفحة</h2>
            <p className="text-sm text-gray-500">تواصل مع صاحب الحساب (owner) لو محتاج صلاحية على هذا القسم.</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-2 px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition"
            >
              العودة للوحة التحكم
            </button>
          </div>
        )}
      </main>
    </div>
  )
}