'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const roles: Record<string, string> = {
  owner: 'مالك', admin: 'مدير', sales: 'مبيعات',
  production: 'إنتاج', quality: 'جودة', shipping: 'شحن', accountant: 'محاسب',
}

const permissions: Record<string, string[]> = {
  owner:      ['كل الصلاحيات', 'إدارة المستخدمين', 'الإعدادات', 'التقارير المالية', 'حذف البيانات'],
  admin:      ['إدارة المستخدمين', 'الإعدادات', 'التقارير المالية', 'عرض كل الطلبات'],
  sales:      ['إنشاء طلبات', 'عرض العملاء', 'إنشاء فواتير', 'عرض الطلبات'],
  production: ['عرض الطلبات', 'تحديث الإنتاج', 'تحديث مراحل التصنيع'],
  quality:    ['عرض الطلبات', 'إضافة فحوصات الجودة', 'تحديث نتائج الجودة'],
  shipping:   ['عرض الطلبات', 'إنشاء شحنات', 'تحديث حالة الشحن'],
  accountant: ['عرض الفواتير', 'تحديث الفواتير', 'التقارير المالية'],
}

export default function PermissionsPage() {
  const [users, setUsers]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)

  useEffect(() => {
    supabase.from('users').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setUsers(data || []); setLoading(false) })
  }, [])

  async function updateRole(id: string, role: string) {
    setSaving(id)
    await supabase.from('users').update({ role }).eq('id', id)
    setUsers(u => u.map(x => x.id === id ? { ...x, role } : x))
    setSaving(null)
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">🔑 الصلاحيات</h1>
        <p className="text-sm text-gray-500 mt-1">إدارة أدوار المستخدمين</p>
      </div>

      {/* Roles Reference */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {Object.entries(permissions).map(([role, perms]) => (
          <div key={role} className="bg-[#111927] rounded-2xl border border-white/5 p-4">
            <h3 className="font-bold text-amber-400 text-sm mb-3">{roles[role]}</h3>
            <ul className="space-y-1">
              {perms.map(p => (
                <li key={p} className="text-xs text-gray-400 flex items-center gap-2">
                  <span className="text-green-500 text-[10px]">✓</span> {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Users Roles */}
      <h2 className="text-sm font-bold text-gray-400 mb-4">تعيين الأدوار للمستخدمين</h2>
      {loading ? (
        <div className="text-center py-8 text-gray-600">جاري التحميل...</div>
      ) : (
        <div className="bg-[#111927] rounded-2xl border border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5">
              <tr>
                {['المستخدم', 'البريد', 'الدور الحالي', 'تغيير الدور'].map(h => (
                  <th key={h} className="text-right text-xs text-gray-600 font-medium px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">
                        {u.full_name?.[0] || '?'}
                      </div>
                      <span className="text-xs text-white">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs text-amber-400 font-bold">{roles[u.role] || u.role}</span>
                  </td>
                  <td className="px-5 py-3">
                    <select value={u.role} disabled={saving === u.id}
                      onChange={e => updateRole(u.id, e.target.value)}
                      className="bg-[#0D1B2A] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500/50">
                      {Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-gray-600 text-sm">لا يوجد مستخدمين</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}