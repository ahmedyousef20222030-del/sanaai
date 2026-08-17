'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type EmployeeInfo = {
  name: string
  role: string
  salary: number
}

const roles: Record<string, string> = {
  owner: 'مالك',
  admin: 'مدير',
  sales: 'مبيعات',
  production: 'إنتاج',
  design: 'تصميم',
  shipping: 'شحن',
  accountant: 'محاسب',
}

export default function MyPerformancePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null)
  const [target, setTarget] = useState(0)
  const [achieved, setAchieved] = useState(0)
  const [ordersCount, setOrdersCount] = useState(0)
  const [monthLabel, setMonthLabel] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('يجب تسجيل الدخول أولاً')

      const { data: me, error: meErr } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      if (meErr || !me?.tenant_id) throw new Error('تعذر تحديد بيانات المنشأة')

      const { data: emp, error: empErr } = await supabase
        .from('employees')
        .select('name, role, salary')
        .eq('user_id', user.id)
        .maybeSingle()

      if (empErr) throw empErr
      if (!emp) {
        setError('لسه معملكش صف موظف مرتبط بحسابك. كلم الأدمن يضيفك من صفحة الموظفين.')
        setLoading(false)
        return
      }
      setEmployee(emp)

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const monthKey = monthStart.toISOString().slice(0, 10)
      setMonthLabel(monthStart.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }))

      const { data: targetRow } = await supabase
        .from('department_targets')
        .select('target_amount')
        .eq('tenant_id', me.tenant_id)
        .eq('department', emp.role)
        .eq('month', monthKey)
        .maybeSingle()
      setTarget(targetRow?.target_amount || 0)

      const { data: myOrders, error: ordersErr } = await supabase
        .from('orders')
        .select('total_amount, created_at')
        .eq('assigned_user_id', user.id)
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', nextMonthStart.toISOString())

      if (ordersErr) throw ordersErr
      const sum = (myOrders || []).reduce((s, o) => s + (o.total_amount || 0), 0)
      setAchieved(sum)
      setOrdersCount((myOrders || []).length)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pct = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0
  const remaining = Math.max(0, target - achieved)

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">📊 تقريري الشخصي</h1>
        <p className="text-sm text-gray-500 mt-1">أدائك وهدفك لشهر {monthLabel || '...'}</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري التحميل...</div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-red-300 text-sm">{error}</div>
      ) : (
        <div className="flex flex-col gap-5 max-w-2xl">
          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5">
            <h3 className="font-bold text-white text-base mb-1">{employee?.name}</h3>
            <p className="text-gray-500 text-xs">💼 القسم: {roles[employee?.role || ''] || employee?.role}</p>
          </div>

          <div className="bg-[#111927] rounded-2xl border border-white/5 p-6">
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">المبيعات المحققة</p>
                <p className="text-2xl font-black text-white">{achieved.toLocaleString('ar-EG')} <span className="text-sm text-gray-500">ج.م</span></p>
              </div>
              <div className="text-left">
                <p className="text-xs text-gray-500 mb-1">هدف القسم الشهري</p>
                <p className="text-lg font-bold text-amber-400">{target.toLocaleString('ar-EG')} <span className="text-xs text-gray-500">ج.م</span></p>
              </div>
            </div>

            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">{pct}% من الهدف</span>
              {target > 0 && (
                <span className="text-xs text-gray-500">
                  {pct >= 100 ? '🎉 وصلت للهدف' : `متبقي ${remaining.toLocaleString('ar-EG')} ج.م`}
                </span>
              )}
            </div>
            {target === 0 && (
              <p className="text-xs text-gray-600 mt-3">لسه الأدمن مايحددش هدف لقسمك للشهر ده.</p>
            )}
          </div>

          <div className="bg-[#111927] rounded-2xl border border-white/5 p-5 flex items-center justify-between">
            <span className="text-sm text-gray-400">عدد الطلبات اللي عملتها الشهر ده</span>
            <span className="text-xl font-black text-white">{ordersCount}</span>
          </div>
        </div>
      )}
    </div>
  )
}