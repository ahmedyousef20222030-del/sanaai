'use client'

import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const navItems = [
  { section: '╪º┘ä╪▒╪ª┘è╪│┘è╪⌐', items: [
    { label: '┘ä┘ê╪¡╪⌐ ╪º┘ä╪¬╪¡┘â┘à', icon: '≡ƒÅá', path: '/dashboard' },
  ]},
  { section: '╪º┘ä┘à╪¿┘è╪╣╪º╪¬', items: [
    { label: '╪º┘ä╪╖┘ä╪¿╪º╪¬',    icon: '≡ƒôª', path: '/dashboard/orders' },
    { label: '╪╖┘ä╪¿ ╪¼╪»┘è╪»',  icon: 'Γ₧ò', path: '/dashboard/orders/new' },
    { label: '╪º┘ä╪╣┘à┘ä╪º╪í',   icon: '≡ƒÅó', path: '/dashboard/clients' },
    { label: '╪«╪╖ ╪º┘ä╪Ñ┘å╪¬╪º╪¼',icon: '≡ƒöä', path: '/dashboard/pipeline' },
  ]},
  { section: '╪º┘ä╪¬╪┤╪║┘è┘ä', items: [
    { label: '╪º┘ä┘à╪┤╪¬╪▒┘è╪º╪¬',     icon: '≡ƒ¢Æ', path: '/dashboard/procurement' }, // ╪¬┘à ╪Ñ╪╢╪º┘ü╪⌐ ┘ç╪░╪º ╪º┘ä╪│╪╖╪▒ Γ£à
    { label: '╪º┘ä╪Ñ┘å╪¬╪º╪¼',          icon: 'ΓÜÖ∩╕Å', path: '/dashboard/production' },
    { label: '╪º┘ä╪¼┘ê╪»╪⌐',           icon: '≡ƒöì', path: '/dashboard/quality' },
    { label: '╪º┘ä┘à╪╣╪▒┘ê╪╢ ╪╣┘ä┘ë ╪º┘ä╪▒┘ü', icon: '≡ƒÅ¬', path: '/dashboard/showroom' },
    { label: '╪º┘ä╪┤╪¡┘å',            icon: '≡ƒÜÜ', path: '/dashboard/shipping' },
    { label: '╪º┘ä┘ü┘ê╪º╪¬┘è╪▒',         icon: '≡ƒº╛', path: '/dashboard/invoices' },
  ]},
  { section: '╪º┘ä╪Ñ╪»╪º╪▒╪⌐', items: [
    { label: '╪º┘ä┘à┘ê╪╕┘ü┘è┘å',      icon: '≡ƒæÑ', path: '/dashboard/employees' },
    { label: '╪º┘ä╪┤┘â╪º┘ê┘ë',       icon: '≡ƒôó', path: '/dashboard/complaints' },
    { label: '╪º┘ä╪╡┘ä╪º╪¡┘è╪º╪¬',     icon: '≡ƒöæ', path: '/dashboard/permissions' },
    { label: '╪│╪¼┘ä ╪º┘ä╪¬╪║┘è┘è╪▒╪º╪¬', icon: '≡ƒôï', path: '/dashboard/changelog' },
    { label: '╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬',     icon: 'ΓÜÖ∩╕Å', path: '/dashboard/settings' },
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
            ≡ƒÅ¡ ╪╡┘Ä┘å┘Ä╪º╪╣┘è
          </h1>
          <p className="text-xs text-gray-500 mt-1">┘å╪╕╪º┘à ╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä┘à╪╡╪º┘å╪╣</p>
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
            ╪¬╪│╪¼┘è┘ä ╪º┘ä╪«╪▒┘ê╪¼
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
