'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const navItems = [
  { label: 'نظرة عامة', icon: '📊', path: '/platform' },
  { label: 'الشركات',    icon: '🏢', path: '/platform/tenants' },
]

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    checkAccess()
  }, [])

  async function checkAccess() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }

      const { data, error } = await supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error
      setIsAdmin(!!data)
    } catch (err: any) {
      console.error('Error checking platform admin access:', err.message)
      setIsAdmin(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#080C12] text-gray-500 text-sm">
        جاري التحقق من الصلاحية...
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#080C12] text-white gap-4 text-center px-4" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
        <div className="text-5xl">🚫</div>
        <h2 className="text-lg font-bold">هذه اللوحة مخصصة لمدير المنصة فقط</h2>
        <button onClick={() => router.push('/dashboard')}
          className="mt-2 px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition">
          الرجوع للوحة التحكم
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#080C12] text-white" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <aside className="w-64 fixed top-0 right-0 bottom-0 bg-[#0D1B2A] border-l border-purple-600/20 flex flex-col z-50">
        <div className="p-6 border-b border-purple-600/20">
          <h1 className="text-xl font-black text-purple-400" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            👑 لوحة المنصة
          </h1>
          <p className="text-xs text-gray-500 mt-1">إدارة كل الشركات المشتركة</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => {
            const active = pathname === item.path
            return (
              <button key={item.path} onClick={() => router.push(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-right transition
                  ${active ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-purple-600/20 space-y-2">
          <button onClick={() => router.push('/dashboard')}
            className="w-full px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition">
            ← الرجوع لحسابي كـ owner
          </button>
          <button onClick={handleLogout}
            className="w-full px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition">
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="flex-1 mr-64 min-h-screen">
        {children}
      </main>
    </div>
  )
}