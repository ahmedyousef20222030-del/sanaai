'use client'

import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const navItems = [
  { section: 'الرئيسية', items: [
    { label: 'لوحة التحكم', icon: '🏠', path: '/dashboard' },
  ]},
  { section: 'المبيعات', items: [
    { label: 'الطلبات',    icon: '📦', path: '/dashboard/orders' },
    { label: 'طلب جديد',  icon: '➕', path: '/dashboard/orders/new' },
    { label: 'العملاء',   icon: '🏢', path: '/dashboard/clients' },
    { label: 'خط الإنتاج',icon: '🔄', path: '/dashboard/pipeline' },
  ]},
  { section: 'التوريدات والمخازن', items: [ // قسم جديد لتجميع كل ما يخص التوريد
    { label: 'الموردين',     icon: '🤝', path: '/dashboard/suppliers' }, // أضفناه من المجلدات ✅
    { label: 'المشتريات',    icon: '🛒', path: '/dashboard/procurement' }, // أضفناه سابقاً ✅
    { label: 'المخزون',      icon: '📦', path: '/dashboard/inventory' }, // أضفناه من المجلدات ✅
  ]},
  { section: 'التشغيل', items: [
    { label: 'الإنتاج',          icon: '⚙️', path: '/dashboard/production' },
    { label: 'الجودة',           icon: '🔍', path: '/dashboard/quality' },
    { label: 'المعروض على الرف', icon: '🏪', path: '/dashboard/showroom' },
    { label: 'الشحن',            icon: '🚚', path: '/dashboard/shipping' },
    { label: 'الفواتير',         icon: '🧾', path: '/dashboard/invoices' },
  ]},
  { section: 'الإدارة', items: [
    { label: 'الموظفين',      icon: '👥', path: '/dashboard/employees' },
    { label: 'الشكاوى',       icon: '📢', path: '/dashboard/complaints' },
    { label: 'الصلاحيات',     icon: '🔑', path: '/dashboard/permissions' },
    { label: 'سجل التغييرات', icon: '📋', path: '/dashboard/changelog' },
    { label: 'الإعدادات',     icon: '⚙️', path: '/dashboard/settings' },
  ]},
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()

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
          {navItems.map((section) => (
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
          ))}
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
        {children}
      </main>
    </div>
  )
}
