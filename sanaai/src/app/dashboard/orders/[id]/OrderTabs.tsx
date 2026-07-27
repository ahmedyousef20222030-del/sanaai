'use client'

import { useState } from 'react'

type TabId = 'details' | 'production' | 'images'

interface Tab {
  id: TabId
  label: string
  icon: string
}

interface OrderTabsProps {
  children: Record<TabId, React.ReactNode>
}

const TABS: Tab[] = [
  { id: 'details', label: 'تفاصيل الطلب', icon: '📋' },
  { id: 'production', label: 'مراحل الإنتاج', icon: '🏭' },
  { id: 'images', label: 'الصور والمعرض', icon: '🖼️' },
]

export default function OrderTabs({ children }: OrderTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('details')

  return (
    <div className="w-full">
      {/* Tab Navigation - Sticky */}
      <div className="sticky top-0 z-40 bg-[#08090A] border-b border-white/5 mb-6">
        <div className="flex gap-2 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-4 py-3 font-medium text-sm whitespace-nowrap transition-all duration-300 flex items-center gap-2
                border-b-2
                ${
                  activeTab === tab.id
                    ? 'border-[#D4A843] text-[#D4A843]'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }
              `}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content - Smooth Transition */}
      <div className="transition-all duration-300">
        {Object.entries(children).map(([tabId, content]) => (
          <div
            key={tabId}
            className={`transition-all duration-300 ${
              activeTab === tabId ? 'opacity-100' : 'hidden'
            }`}
          >
            {content}
          </div>
        ))}
      </div>
    </div>
  )
}