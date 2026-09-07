'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Employee = {
  id: string
  name: string
  phone: string
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
  hr: 'موارد بشرية',
  accountant: 'محاسب',
  employee: 'موظف'
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', role: 'production', salary: 0 })
  const [searchQuery, setSearchQuery] = useState('')

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

  function openAddForm() {
    setForm({ name: '', phone: '', role: 'production', salary: 0 })
    setEditingId(null)
    setShowForm(true)
  }

  function openEditForm(emp: Employee) {
    setForm({ name: emp.name, phone: emp.phone || '', role: emp.role, salary: emp.salary })
    setEditingId(emp.id)
    setShowForm(true)
  }

  async function getMyTenantId(): Promise<string> {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('تعذر التحقق من هوية المستخدم، برجاء تسجيل الدخول مرة أخرى')
    }

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (meError || !me?.tenant_id) {
      throw new Error('تعذر تحديد هوية الشركة')
    }

    return me.tenant_id
  }

  async function handleSave() {
    if (!form.name.trim()) {
      alert('الاسم مطلوب')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const { error } = await supabase
          .from('employees')
          .update(form)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const tenantId = await getMyTenantId()
        const { error } = await supabase
          .from('employees')
          .insert({
            ...form,
            tenant_id: tenantId,
          })
        if (error) throw error
      }

      setShowForm(false)
      setEditingId(null)
      setForm({ name: '', phone: '', role: 'production', salary: 0 })
      load()
    } catch (err: any) {
      alert('خطأ أثناء الحفظ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (emp.phone && emp.phone.includes(searchQuery))
  )

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">👥 إدارة الموظفين</h1>
          <p className="text-sm text-gray-500 mt-1">قائمة وبيانات الموظفين والعمال في المنظومة</p>
        </div>
        <button
          onClick={openAddForm}
          className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 whitespace-nowrap"
        >
          ➕ إضافة موظف
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="🔍 ابحث بالاسم أو رقم الهاتف..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md bg-[#111927] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-amber-500/50 outline-none"
        />
      </div>

      {showForm && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={() => { setShowForm(false); setEditingId(null) }}
        >
          <div
            className="bg-[#111927] border border-amber-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-amber-400 mb-4">{editingId ? '✏️ تعديل بيانات الموظف' : '➕ إضافة موظف جديد'}</h2>
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
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">القسم / الإدارة</label>
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
                <label className="block text-xs text-gray-500 mb-1">الراتب الأساسي (ج.م)</label>
                <input
                  type="number"
                  value={form.salary || ''}
                  onChange={e => setForm(f => ({ ...f, salary: Number(e.target.value) }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : editingId ? '✅ حفظ التعديلات' : '✅ تسجيل الموظف'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null) }}
                className="px-5 py-2.5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/5 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-600">جاري تحميل البيانات...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEmployees.map(emp => (
            <div key={emp.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-amber-500/30 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-1 h-full bg-amber-500/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-white text-base group-hover:text-amber-400 transition">{emp.name}</h3>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-gray-400">
                    {roles[emp.role] || emp.role}
                  </span>
                </div>
                <button
                  onClick={() => openEditForm(emp)}
                  className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-amber-500/20 hover:text-amber-400 transition"
                  title="تعديل البيانات"
                >
                  ✏️
                </button>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">الهاتف:</span>
                  <span className="text-gray-300" dir="ltr">{emp.phone || '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">الراتب:</span>
                  <span className="text-amber-400 font-bold">{emp.salary.toLocaleString()} ج.م</span>
                </div>
              </div>
            </div>
          ))}
          {filteredEmployees.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-600 text-sm bg-[#111927] rounded-2xl border border-white/5">
              لا يوجد موظفون مطابقون لبحثك
            </div>
          )}
        </div>
      )}
    </div>
  )
}