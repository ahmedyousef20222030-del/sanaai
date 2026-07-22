'use client'

import { useState } from 'react'

type Tab = 'details' | 'production' | 'images' | 'gallery'

interface OrderDetailTabsProps {
  children: {
    details: React.ReactNode
    production: React.ReactNode
    images: React.ReactNode
    gallery?: React.ReactNode
  }
}

export default function OrderDetailTabs({ children }: OrderDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('details')

  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'details', label: 'التفاصيل', icon: '📋' },
    { id: 'production', label: 'مراحل الإنتاج', icon: '🏭' },
    { id: 'images', label: 'الصور', icon: '🖼️' },
    { id: 'gallery', label: 'المعرض', icon: '🎨' },
  ]

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mb-2 px-0.5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all duration-300 flex items-center gap-2
              ${
                activeTab === tab.id
                  ? 'bg-[#D4A843] text-[#08090A] shadow-lg shadow-[#D4A843]/20'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
              }
            `}
          >
            <span className="text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="relative">
        {/* Smooth fade transition */}
        <div
          className="transition-all duration-300"
          style={{
            opacity: activeTab === 'details' ? 1 : 0.5,
            pointerEvents: activeTab === 'details' ? 'auto' : 'none',
            position: activeTab === 'details' ? 'static' : 'absolute',
          }}
        >
          {children.details}
        </div>

        <div
          className="transition-all duration-300"
          style={{
            opacity: activeTab === 'production' ? 1 : 0.5,
            pointerEvents: activeTab === 'production' ? 'auto' : 'none',
            position: activeTab === 'production' ? 'static' : 'absolute',
          }}
        >
          {children.production}
        </div>

        <div
          className="transition-all duration-300"
          style={{
            opacity: activeTab === 'images' ? 1 : 0.5,
            pointerEvents: activeTab === 'images' ? 'auto' : 'none',
            position: activeTab === 'images' ? 'static' : 'absolute',
          }}
        >
          {children.images}
        </div>

        {children.gallery && (
          <div
            className="transition-all duration-300"
            style={{
              opacity: activeTab === 'gallery' ? 1 : 0.5,
              pointerEvents: activeTab === 'gallery' ? 'auto' : 'none',
              position: activeTab === 'gallery' ? 'static' : 'absolute',
            }}
          >
            {children.gallery}
          </div>
        )}
      </div>
    </div>
  )
}