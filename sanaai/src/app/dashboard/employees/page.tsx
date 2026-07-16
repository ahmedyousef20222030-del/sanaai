'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Employee = { 
  id: string; 
  name: string; 
  phone: string; 
  role: string; 
  salary: number;
}

const roles: Record<string, string> = {
  owner: 'مالك',
  admin: 'مدير',
  sales: 'مبيعات',
  production: 'إنتاج',
  design: 'تصميم',
  shipping: 'شحن',
  accountant: 'محاسب'
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', role: 'production', salary: 0 })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name', { ascending: true })
      
      if (error) throw error
      setEmployees(data || [])
    } catch (err: any) {
      console.error('Error loading employees:', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!form.name) { 
      alert('الاسم مطلوب')
      return 
    }
    setSaving(true)
    try {
      const { data: me, error: meError } = await supabase
        .from('users')
        .select('tenant_id')
        .single()
      
      if (meError) throw meError

      const { error } = await supabase
        .from('employees')
        .insert({ 
          ...form, 
          tenant_id: me?.tenant_id 
        })

      if (error) throw error
      
      setShowForm(false)
      setForm({ name: '', phone: '', role: 'production', salary: 0 })
      load()
    } catch (err: any) { 
      alert('خطأ أثناء الحفظ: ' + err.message) 
    } finally { 
      setSaving(false) 
    }
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">👥 إدارة الموظفين</h1>
          <p className="text-sm text-gray-500 mt-1">قائمة وبيانات موظفي المصنع والورشة</p>
        </div>
        <button 
          onClick={() => setShowForm(true)} 
          className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
        >
          ➕ موظف جديد
        </button>
      </div>

      {showForm && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" 
          onClick={() => setShowForm(false)}
        >
          <div 
            className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl" 
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-amber-400 mb-4">➕ إضافة موظف جديد</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">اسم الموظف *</label>
                <input 
                  type="text"
                  value={form.name} 
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" 
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الهاتف</label>
                <input 
                  type="text"
                  value={form.phone} 
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} 
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" 
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الدور / الوظيفة</label>
                <select 
                  value={form.role} 
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))} 
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/50 outline-none"
                >
                  {Object.entries(roles).map(([key, label]) => (
                    <option key={key} value={key} className="bg-[#0D1B2A]">
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">الراتب الشهري</label>
                <input 
                  type="number" 
                  value={form.salary} 
                  onChange={e => setForm(f => ({ ...f, salary: Number(e.target.value) }))} 
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50" 
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button 
                onClick={handleAdd} 
                disabled={saving} 
                className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : '✅ حفظ الموظف'}
              </button>
              <button 
                onClick={() => setShowForm(false)} 
                className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري تحميل الموظفين...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {employees.map(emp => (
            <div key={emp.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all group">
              <h3 className="font-bold text-white text-base mb-2 group-hover:text-amber-400 transition">{emp.name}</h3>
              <div className="space-y-1">
                <p className="text-gray-500 text-xs">💼 الوظيفة: {roles[emp.role] || emp.role}</p>
                <p className="text-gray-500 text-xs">📞 الهاتف: {emp.phone || 'غير متوفر'}</p>
                <p className="text-amber-500 text-xs font-bold">💵 الراتب: {emp.salary} ج.م</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}