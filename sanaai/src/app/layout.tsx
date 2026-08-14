'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SYSTEM_PAGES, findPageByPath, type PageAction } from '@/lib/pages-config'

type PagePermission = {
  page_id: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

type Me = { role: string }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const [me, setMe] = useState<Me | null>(null)
  const [perms, setPerms] = useState<Record<string, PagePermission>>({})
  const [loadingMe, setLoadingMe] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => { loadMe() }, [])

  async function loadMe() {
    setLoadingMe(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }

      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
      if (userErr) throw userErr
      setMe(userRow as Me)

      if (userRow.role !== 'owner') {
        const { data: permRows, error: permErr } = await supabase
          .from('user_page_permissions')
          .select('page_id, can_view, can_create, can_edit, can_delete')
          .eq('user_id', user.id)
        if (permErr) throw permErr

        const map: Record<string, PagePermission> = {}
        for (const row of permRows ?? []) map[row.page_id] = row as PagePermission
        setPerms(map)
      }
    } catch (err: any) {
      console.error('Error loading current user permissions:', err.message)
    } finally {
      setLoadingMe(false)
      setAuthChecked(true)
    }
  }

  const isOwner = me?.role === 'owner'

  function can(pageId: string, action: PageAction = 'can_view'): boolean {
    if (isOwner) return true
    return !!perms[pageId]?.[action]
  }

  const visibleNavItems = useMemo(() => {
    const sections = new Map<string, typeof SYSTEM_PAGES>()
    for (const page of SYSTEM_PAGES) {
      if (page.ownerOnly && !isOwner) continue
      if (!page.alwaysVisible && !can(page.id, 'can_view')) continue
      if (!sections.has(page.section)) sections.set(page.section, [])
      sections.get(page.section)!.push(page)
    }
    return Array.from(sections.entries()).map(([section, items]) => ({ section, items }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms, isOwner])

  function isCurrentRouteAllowed(): boolean {
    if (isOwner) return true
    const page = findPageByPath(pathname)
    if (!page) return true
    if (page.alwaysVisible) return true
    if (page.ownerOnly) return false
    return can(page.id, 'can_view')
  }

  const routeAllowed = authChecked && !loadingMe ? isCurrentRouteAllowed() : false

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="flex min-h-screen bg-[#080C12] text-white" dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}>

      <aside className="w-64 fixed top-0 right-0 bottom-0 bg-[#0D1B2A] border-l border-amber-600/20 flex flex-col z-50 overflow-y-auto">
        <div className="p-6 border-b border-amber-600/20">
          <h1 className="text-xl font-black text-amber-400" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            🏭 صَنَاعي
          </h1>
          <p className="text-xs text-gray-500 mt-1">نظام إدارة المصانع</p>
        </div>

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

        <div className="p-4 border-t border-amber-600/20">
          <button onClick={handleLogout}
            className="w-full px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition">
            تسجيل الخروج
          </button>
        </div>
      </aside>

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
            <button onClick={() => router.push('/dashboard')}
              className="mt-2 px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition">
              العودة للوحة التحكم
            </button>
          </div>
        )}
      </main>
    </div>
  )
}