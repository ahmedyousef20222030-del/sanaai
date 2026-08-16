'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Stats = {
  totalTenants: number
  activeTenants: number
  trialTenants: number
  suspendedTenants: number
  totalUsers: number
  monthlyRevenue: number
}

export default function PlatformOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    setLoading(true)
    try {
      const { data: tenants, error: tErr } = await supabase
        .from('tenants')
        .select('id, plan_status')
      if (tErr) throw tErr

      const { count: usersCount, error: uErr } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
      if (uErr) throw uErr

      const { data: subs, error: sErr } = await supabase
        .from('subscriptions')
        .select('amount, billing_period, status')
        .eq('status', 'active')
      if (sErr) throw sErr

      const monthlyRevenue = (subs || []).reduce((sum, s) => {
        const monthly = s.billing_period === 'yearly' ? (s.amount || 0) / 12 : (s.amount || 0)
        return sum + monthly
      }, 0)

      setStats({
        totalTenants: tenants?.length || 0,
        activeTenants: tenants?.filter(t => t.plan_status === 'active').length || 0,
        trialTenants: tenants?.filter(t => t.plan_status === 'trial').length || 0,
        suspendedTenants: tenants?.filter(t => t.plan_status === 'suspended').length || 0,
        totalUsers: usersCount || 0,
        monthlyRevenue,
      })
    } catch (err: any) {
      console.error('Error loading platform stats:', err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-600">جاري تحميل الإحصائيات...</div>
  }

  const cards = stats ? [
    { label: 'إجمالي الشركات', val: stats.totalTenants, icon: '🏢', color: '#A78BFA' },
    { label: 'شركات نشطة',     val: stats.activeTenants, icon: '✅', color: '#2ECC71' },
    { label: 'فترة تجريبية',   val: stats.trialTenants, icon: '⏳', color: '#F39C12' },
    { label: 'شركات موقوفة',   val: stats.suspendedTenants, icon: '⛔', color: '#E74C3C' },
    { label: 'إجمالي المستخدمين', val: stats.totalUsers, icon: '👥', color: '#3498DB' },
    { label: 'إيراد شهري تقديري', val: stats.monthlyRevenue.toLocaleString('ar-EG') + ' ج.م', icon: '💰', color: '#C8963E' },
  ] : []

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">📊 نظرة عامة على المنصة</h1>
        <p className="text-sm text-gray-500 mt-1">ملخص سريع لكل الشركات المشتركة في النظام</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="bg-[#111927] rounded-xl p-5 border border-white/5">
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
            <div className="text-xl font-black" style={{ color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}