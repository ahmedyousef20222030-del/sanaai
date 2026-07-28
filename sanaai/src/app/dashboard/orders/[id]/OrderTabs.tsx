'use client'

import { useState } from 'react'

type TabId = 'details' | 'production' | 'images' | 'complaints'

interface Tab {
  id: TabId
  label: string
  icon: string
}

interface OrderTabsProps {
  tabs: Partial<Record<TabId, React.ReactNode>>
}

const TABS: Tab[] = [
  { id: 'details', label: 'تفاصيل الطلب', icon: '📋' },
  { id: 'production', label: 'مراحل الإنتاج', icon: '🏭' },
  { id: 'images', label: 'الصور والمعرض', icon: '🖼️' },
  { id: 'complaints', label: 'الشكاوى', icon: '📢' },
]

export default function OrderTabs({ tabs }: OrderTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('details')

  const visibleTabs = TABS.filter(t => tabs[t.id] !== undefined)

  if (visibleTabs.length === 0) return null

  return (
    <div className="w-full">
      <div className="flex gap-3 overflow-x-auto pb-2 border-b border-white/5 mb-6">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 font-medium text-sm whitespace-nowrap transition-all duration-300 flex items-center gap-2 border-b-2 ${
              activeTab === tab.id
                ? 'border-[#D4A843] text-[#D4A843]'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {Object.entries(tabs).map(([tabId, content]) => (
          activeTab === (tabId as TabId) && <div key={tabId}>{content}</div>
        ))}
      </div>
    </div>
  )
}