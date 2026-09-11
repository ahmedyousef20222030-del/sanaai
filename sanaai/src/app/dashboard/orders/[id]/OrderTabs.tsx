'use client'

import { useState } from 'react'

// 1. أضفنا 'materials' هنا ليتعرف عليها TypeScript كخاصية مسموحة
type TabId = 'details' | 'materials' | 'production' | 'images' | 'complaints'

interface Tab {
  id: TabId
  label: string
  icon: string
}

interface OrderTabsProps {
  tabs: Partial<Record<TabId, React.ReactNode>>
}

// 2. تحديث قائمة التبويبات لتشمل "اعتماد الخامات"
const TABS: Tab[] = [
  { id: 'details', label: 'تفاصيل الطلب', icon: '📋' },
  { id: 'materials', label: 'اعتماد الخامات', icon: '🧵' },
  { id: 'production', label: 'مراحل الإنتاج', icon: '🏭' },
  { id: 'images', label: 'الصور والمرفقات', icon: '🖼️' },
  { id: 'complaints', label: 'الشكاوى', icon: '📢' },
]

export default function OrderTabs({ tabs }: OrderTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('details')

  // تصفية التبويبات لعرض فقط التبويبات التي تم تمرير محتوى لها من الشاشة الأب
  const visibleTabs = TABS.filter(t => tabs[t.id] !== undefined)

  if (visibleTabs.length === 0) return null

  return (
    <div className="w-full mt-4">
      {/* ── شريط أزرار التبويبات ── */}
      <div className="flex gap-2 overflow-x-auto pb-3 border-b border-white/5 mb-6 hide-scrollbar" style={{ scrollBehavior: 'smooth' }}>
        {visibleTabs.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-[#D4A843]/10 text-[#D4A843] border border-[#D4A843]/30 shadow-lg shadow-[#D4A843]/5'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className={`text-base transition-opacity ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── محتوى التبويب النشط ── */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {Object.entries(tabs).map(([tabId, content]) => (
          activeTab === (tabId as TabId) && <div key={tabId}>{content}</div>
        ))}
      </div>
    </div>
  )
}