'use client'

import { useState } from 'react'

type TabId = 'details' | 'production' | 'images'

interface Tab {
  id: TabId
  label: string
  icon: string
}

interface OrderTabsProps {
  tabs: Record<TabId, React.ReactNode>
}

const TABS: Tab[] = [
  { id: 'details', label: 'تفاصيل الطلب', icon: '📋' },
  { id: 'production', label: 'مراحل الإنتاج', icon: '🏭' },
  { id: 'images', label: 'الصور والمعرض', icon: '🖼️' },
]

export default function OrderTabs({ tabs }: OrderTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('details')

  return (
    <div className="w-full">
      {/* Tab Navigation */}
      <div className="flex gap-3 overflow-x-auto pb-2 border-b border-white/5 mb-6">
        {TABS.map(tab => (
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

      {/* Tab Content */}
      <div>
        {Object.entries(tabs).map(([tabId, content]) => (
          activeTab === tabId && <div key={tabId}>{content}</div>
        ))}
      </div>
    </div>
  )
}