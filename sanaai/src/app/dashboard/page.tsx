'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { ApiErrorHandler } from '@/components/ApiErrorHandler'
import { 
  Loader2, RefreshCw, Search, User, 
  TrendingUp, AlertCircle, CheckCircle2, 
  Clock, DollarSign, Package, Activity 
} from 'lucide-react'

type Order = {
  id: string
  order_number: string
  status: string
  delivery_status: string
  total_amount: number
  deposit_paid: number
  remaining_amount: number
  expected_delivery: string
  clients: { name: string }
}

type DashboardStats = {
  totalOrders: number
  activeOrders: number
  totalRevenue: number
  totalCollected: number
  totalRemaining: number
  delayedOrders: number
  deliveredOrders: number
  completionRate: number
}

function fmt(n: number) {
  return Number(n || 0).toLocaleString('ar-EG') + ' ج.م'
}

function avatar(name: string) {
  return (name || '?')[0]
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    'جديد': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    'تحت الإنتاج': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'فحص الجودة': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    'جاهز للشحن': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    'تم التسليم': 'bg-green-500/20 text-green-300 border-green-500/30',
    'مغلق': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }
  return map[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

function KpiRing({ val, color, stroke, name }: { val: number; color: string; stroke: string; name: string }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const offset = circ - (val / 100) * circ
  return (
    <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
      <div className="relative w-20 h-20 flex-shrink-0">
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>
          {val}%
        </div>
      </div>
      <div className="flex-1">
        <div className="font-bold text-sm text-white">{name}</div>
        <div className={`text-xs mt-1 ${val >= 90 ? 'text-green-400' : val >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
          {val >= 90 ? 'ممتاز 🌟' : val >= 70 ? 'جيد 👍' : 'يحتاج تحسين ⚠️'}
        </div>
        <div className="mt-2 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${val}%`, background: stroke }} />
        </div>
      </div>
    </div>
  )
}

function MiniChart({ vals, labels }: { vals: number[]; labels: string[] }) {
  const maxV = Math.max(...vals, 1)
  return (
    <div className="w-full">
      <div className="flex items-end gap-1 h-12">
        {vals.map((v, i) => (
          <div key={i} title={`${labels[i]}: ${fmt(v)}`}
            className="flex-1 bg-gradient-to-t from-amber-600 to-amber-400 rounded-t opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            style={{ height: `${(v / maxV) * 100}%` }} />
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {labels.map((d, i) => (
          <span key={i} className="text-[10px] text-gray-500">{d}</span>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading: userLoading, logout } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [deptPerformance, setDeptPerformance] = useState<any[]>([])
  const [weekRevenue, setWeekRevenue] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const { data: ordersData, error: ordErr } = await supabase
        .from('orders')
        .select('*, clients(name)')
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (ordErr) throw ordErr
      setOrders(ordersData || [])

      const total = ordersData?.length || 0
      const active = ordersData?.filter(x => !['تم التسليم', 'مغلق'].includes(x.status)).length || 0
      const revenue = ordersData?.reduce((s: number, x: Order) => s + (x.total_amount || 0), 0) || 0
      const collected = ordersData?.reduce((s: number, x: Order) => s + (x.deposit_paid || 0), 0) || 0
      const remaining = ordersData?.reduce((s: number, x: Order) => s + (x.remaining_amount || 0), 0) || 0
      const delayed = ordersData?.filter(x => x.delivery_status === 'متأخر').length || 0
      const delivered = ordersData?.filter(x => x.status === 'تم التسليم').length || 0
      const completionRate = total > 0 ? Math.round((delivered / total) * 100) : 0

      setStats({ totalOrders: total, activeOrders: active, totalRevenue: revenue, totalCollected: collected, totalRemaining: remaining, delayedOrders: delayed, deliveredOrders: delivered, completionRate })

      const { data: perfData } = await supabase.from('employee_performance').select('*')
      setDeptPerformance(perfData || [])

      const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      }).reverse();

      const revenues = await Promise.all(last7Days.map(async date => {
        const { data } = await supabase.from('orders').select('total_amount').eq('order_date', date)
        return (data || []).reduce((s, x) => s + (x.total_amount || 0), 0)
      }))
      setWeekRevenue(revenues)

    } catch (err) {
      setError(new Error(err instanceof Error ? err.message : 'فشل تحميل البيانات'))
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userLoading) {
      if (!user) router.push('/auth/login')
      else fetchData()
    }
  }, [user, userLoading, router, fetchData])

  async function handleLogout() {
    await logout()
    router.push('/auth/login')
  }

  if (loading || userLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#080C12] gap-3">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">جاري مزامنة البيانات...</p>
      </div>
    )
  }

  const statsData = stats ? [
    { color: '#C8963E', icon: '📦', label: 'إجمالي الطلبات', val: stats.totalOrders, sub: 'إجمالي السجلات', prog: 85 },
    { color: '#2ECC71', icon: '⚡', label: 'طلبات نشطة', val: stats.activeOrders, sub: 'تحت التنفيذ', prog: stats.totalOrders ? (stats.activeOrders / stats.totalOrders) * 100 : 0 },
    { color: '#3498DB', icon: '💰', label: 'إجمالي الإيرادات', val: fmt(stats.totalRevenue), sub: 'قيمة التعاقدات', prog: 70 },
    { color: '#1ABC9C', icon: '💵', label: 'المقبوض', val: fmt(stats.totalCollected), sub: 'مدفوعات مقدمة', prog: stats.totalRevenue ? (stats.totalCollected / stats.totalRevenue) * 100 : 0 },
    { color: '#F39C12', icon: '⏳', label: 'المتبقي', val: fmt(stats.totalRemaining), sub: 'مبالغ مستحقة', prog: stats.totalRevenue ? (stats.totalRemaining / stats.totalRevenue) * 100 : 0 },
    { color: '#E74C3C', icon: '🔴', label: 'طلبات متأخرة', val: stats.delayedOrders, sub: 'تجاوزت الموعد', prog: stats.totalOrders ? (stats.delayedOrders / stats.totalOrders) * 100 : 0 },
    { color: '#0c10df', icon: '✅', label: 'تم التسليم', val: stats.deliveredOrders, sub: 'طلبات مكتملة', prog: stats.completionRate },
    { color: '#C8963E', icon: '📊', label: 'نسبة الإنجاز', val: `${stats.completionRate}%`, sub: 'معدل الإكمال', prog: stats.completionRate },
  ] : []

  const weekLabels = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

  return (
    <div className="min-h-screen bg-[#080C12] text-white" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <header className="sticky top-0 z-50 bg-[#0D1B2A]/90 backdrop-blur border-b border-amber-600/20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center text-black font-black text-xl">ص</div>
            <div>
              <h1 className="text-xl font-black text-amber-400" style={{ fontFamily: "'Tajawal', sans-serif" }}>صَنَاعي</h1>
              <p className="text-xs text-gray-500 mt-0.5">لوحة التحكم المركزية</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} disabled={refreshing} className="px-3 py-1.5 text-xs border border-amber-600/30 text-amber-400 rounded-lg hover:bg-amber-500/10 transition disabled:opacity-50">
              {refreshing ? '⏳ تحديث...' : '🔄 تحديث'}
            </button>
            <button onClick={handleLogout} className="px-4 py-1.5 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition">
              تسجيل الخروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <ApiErrorHandler error={error} isLoading={refreshing} retry={fetchData} />

        {stats && stats.delayedOrders > 0 && (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center gap-3 animate-pulse">
            <span className="text-xl">🔴</span>
            <p className="text-sm text-red-300">
              يوجد <strong className="text-amber-400">{stats.delayedOrders}</strong> طلبات متأخرة تحتاج تدخل فوري لتجنب خسارة العملاء
            </p>
            <button onClick={() => router.push('/dashboard/orders')} className="mr-auto text-xs px-3 py-1 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/20 transition">
              إدارة المتأخرات
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsData.map((s, i) => (
            <div key={i} className="bg-[#111927] rounded-xl p-4 border border-white/5 hover:border-amber-600/30 transition group">
              <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">{s.icon}</div>
              <div className="text-xs text-gray-500 mb-1">{s.label}</div>
              <div className="text-xl font-black mb-1" style={{ color: s.color, fontFamily: "'Tajawal', sans-serif" }}>{s.val}</div>
              <div className="text-[10px] text-gray-600 mb-2">{s.sub}</div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(s.prog || 0, 100)}%`, background: s.color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#111927] rounded-2xl border border-white/5">
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <h2 className="font-bold text-sm">⚡ آخر الطلبات الواردة</h2>
              <button onClick={() => router.push('/dashboard/orders')} className="text-xs text-amber-400 hover:text-amber-300 transition">عرض الكل ←</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.02]">
                  <tr className="border-b border-white/5">
                    <th className="text-right text-xs text-gray-500 font-medium px-5 py-3">العميل</th>
                    <th className="text-right text-xs text-gray-500 font-medium px-3 py-3">الحالة</th>
                    <th className="text-right text-xs text-gray-500 font-medium px-3 py-3">المبلغ</th>
                    <th className="text-right text-xs text-gray-500 font-medium px-3 py-3">التسليم</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 5).map((o, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer" onClick={() => router.push(`/dashboard/orders/${o.id}`)}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">{avatar(o.clients?.name)}</div>
                          <div className="text-xs font-semibold text-white">{o.clients?.name}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(o.status)}`}>{o.status}</span>
                      </td>
                      <td className="px-3 py-3 text-amber-400 font-bold text-xs">{fmt(o.total_amount)}</td>
                      <td className="px-3 py-3 text-gray-500 text-[10px]">{o.expected_delivery ? new Date(o.expected_delivery).toLocaleDateString('ar-EG') : '—'}</td>
                    </tr>
                  ))}
                  {orders.length === 0 && <tr className="text-center py-8 text-gray-600 text-sm"><td colSpan={4}>لا توجد طلبات حالياً</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#111927] rounded-2xl border border-white/5">
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <h2 className="font-bold text-sm">📈 مؤشرات أداء الأقسام</h2>
              <div className="flex items-center gap-1.5 text-xs text-green-400"><span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> بيانات حية</div>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {deptPerformance.map((dept, i) => (
                <KpiRing key={i} name={dept.full_name || dept.role} val={dept.performance_pct || 0} stroke={dept.role === 'production' ? '#3498DB' : '#C8963E'} color={dept.role === 'production' ? '#3498DB' : '#C8963E'} />
              ))}
              {deptPerformance.length === 0 && <div className="col-span-2 text-center py-10 text-gray-600 text-xs">لا توجد بيانات أداء متاحة</div>}
            </div>
          </div>
        </div>

        <div className="bg-[#111927] rounded-2xl border border-white/5">
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <h2 className="font-bold text-sm">💰 تدفق الإيرادات (آخر 7 أيام)</h2>
            <span className="text-amber-400 font-bold text-sm">{fmt(weekRevenue.reduce((a, b) => a + b, 0))}</span>
          </div>
          <div className="p-5">
            <MiniChart vals={weekRevenue} labels={weekLabels} />
          </div>
        </div>
      </main>
    </div>
  )
}