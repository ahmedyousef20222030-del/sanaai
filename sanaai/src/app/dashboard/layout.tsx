'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  PAGE_LIST,
  HOME_PATH,
  SETTINGS_PATH,
  EXTRA_NAV_LINKS,
  canAccessPageKey,
  matchPageKeyForPath,
  PagePermissions,
} from '@/lib/pages'

type MyAccess = {
  role: string
  page_permissions: PagePermissions | null
}

type NavLink = { label: string; icon: string; path: string }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()

  const [me, setMe] = useState<MyAccess | null>(null)
  const [loadingMe, setLoadingMe] = useState(true)

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
        .select('role, page_permissions')
        .eq('id', user.id)
        .single()
      if (error) throw error
      setMe(data as MyAccess)
    } catch (err: any) {
      console.error('Error loading current user access:', err.message)
    } finally {
      setLoadingMe(false)
    }
  }

  const isOwner = me?.role === 'owner'

  // ── بناء القائمة الجانبية من الصفحات المسموحة فعليًا بس ──
  const sections: { section: string; items: NavLink[] }[] = [
    { section: 'الرئيسية', items: [{ label: 'لوحة التحكم', icon: '🏠', path: HOME_PATH }] },
  ]

  if (me) {
    const grouped: Record<string, NavLink[]> = {}
    for (const page of PAGE_LIST) {
      if (!canAccessPageKey(page.key, isOwner, me.page_permissions)) continue
      grouped[page.section] = grouped[page.section] || []
      grouped[page.section].push({ label: page.label, icon: page.icon, path: page.key })
      for (const extra of EXTRA_NAV_LINKS) {
        if (extra.after === page.key) {
          grouped[page.section].push({ label: extra.label, icon: extra.icon, path: extra.path })
        }
      }
    }
    if (isOwner) {
      grouped['الإدارة'] = grouped['الإدارة'] || []
      grouped['الإدارة'].push({ label: 'الإعدادات', icon: '⚙️', path: SETTINGS_PATH })
    }
    for (const [section, items] of Object.entries(grouped)) {
      sections.push({ section, items })
    }
  }

  // ── حارس الصفحات: هل المستخدم مسموح له يفتح الصفحة الحالية أصلاً؟ ──
  function isCurrentRouteAllowed(): boolean {
    if (!me) return false
    if (isOwner) return true
    if (pathname === HOME_PATH) return true
    if (pathname === SETTINGS_PATH || pathname.startsWith(SETTINGS_PATH + '/')) return false

    const pageKey = matchPageKeyForPath(pathname)
    if (!pageKey) return true // مسار مش مسجل في النظام أصلاً (صفحة عامة غير محمية)
    return canAccessPageKey(pageKey, isOwner, me.page_permissions)
  }

  const routeAllowed = !loadingMe && isCurrentRouteAllowed()

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
            sections.map((section) => (
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
          <div className="flex items-center justify-center min-h-screen text-gray-600 text-sm">
            جاري التحقق من الصلاحيات...
          </div>
        ) : routeAllowed ? (
          children
        ) : (
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