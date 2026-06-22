'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ChangelogPage() {
  const [logs, setLogs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('activity_log')
      .select('*, users(full_name)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { setLogs(data || []); setLoading(false) })
  }, [])

  const actionColor: Record<string, string> = {
    'create': 'bg-green-500/20 text-green-400',
    'update': 'bg-blue-500/20 text-blue-400',
    'delete': 'bg-red-500/20 text-red-400',
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">📋 سجل التغييرات</h1>
        <p className="text-sm text-gray-500 mt-1">آخر {logs.length} نشاط</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري التحميل...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-gray-600">لا يوجد سجل نشاط</div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-[#111927] rounded-xl border border-white/5 px-5 py-3 flex items-center gap-4">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold min-w-[52px] text-center ${actionColor[log.action] || 'bg-gray-500/20 text-gray-400'}`}>
                {log.action === 'create' ? 'إنشاء' : log.action === 'update' ? 'تعديل' : log.action === 'delete' ? 'حذف' : log.action}
              </span>
              <div className="flex-1">
                <span className="text-xs text-white">{log.entity_label || log.entity_type}</span>
                {log.users?.full_name && (
                  <span className="text-[10px] text-gray-600 mr-2">— {log.users.full_name}</span>
                )}
              </div>
              <span className="text-[10px] text-gray-700">
                {new Date(log.created_at).toLocaleString('ar-EG')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}