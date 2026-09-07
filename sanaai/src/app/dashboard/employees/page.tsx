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

// المسميات الوظيفية القياسية في المنظومة
const roles: Record<string, string> = {
  owner: 'مالك',
  admin: 'إدارة عليا',
  sales: 'مبيعات',
  production: 'إنتاج وتشغيل',
  design: 'تصميم وجرافيك',
  shipping: 'شحن وتوصيل',
  hr: 'موارد بشرية',
  accountant: 'حسابات ومالية',
  employee: 'عامل / موظف عام'
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
    loadEmployees()
  }, [])

  async function loadEmployees() {
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
    if (authError || !user) throw new Error('تعذر التحقق من الهوية، يرجى إعادة تسجيل الدخول.')

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (meError || !me?.tenant_id) throw new Error('تعذر الوصول لمعرف الشركة (Tenant ID).')
    return me.tenant_id
  }

  async function handleSave() {
    if (!form.name.trim()) {
      alert('اسم الموظف مطلوب!')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const { error } = await supabase.from('employees').update(form).eq('id', editingId)
        if (error) throw error
      } else {
        const tenantId = await getMyTenantId()
        const { error } = await supabase.from('employees').insert({ ...form, tenant_id: tenantId })
        if (error) throw error
      }

      setShowForm(false)
      setEditingId(null)
      loadEmployees()
    } catch (err: any) {
      alert('خطأ أثناء حفظ البيانات: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (emp.phone && emp.phone.includes(searchQuery)) ||
    (roles[emp.role] && roles[emp.role].includes(searchQuery))
  )

  return (
    <div className="p-6 min-h-screen" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {/* ── الترويسة ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white">👥 إدارة فريق العمل</h1>
          <p className="text-sm text-gray-500 mt-1">قاعدة البيانات المركزية لجميع موظفي وعمال المنظومة</p>
        </div>
        <button
          onClick={openAddForm}
          className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 whitespace-nowrap flex items-center gap-2"
        >
          <span className="text-lg">➕</span> إضافة موظف جديد
        </button>
      </div>

      {/* ── شريط البحث ── */}
      <div className="mb-6 relative max-w-md">
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="text"
          placeholder="ابحث بالاسم، رقم الهاتف، أو الوظيفة..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#111927] border border-white/10 rounded-xl pr-10 pl-4 py-3 text-sm text-white focus:border-amber-500/50 outline-none transition-all shadow-sm"
        />
      </div>

      {/* ── نافذة الإضافة / التعديل ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-[#111927] border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-5 pb-3 border-b border-white/5">
              {editingId ? '✏️ تعديل بيانات الموظف' : '📝 تسجيل موظف جديد'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1.5">الاسم الكامل *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
                  placeholder="مثال: أحمد محمد"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">رقم الهاتف</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50"
                  dir="ltr"
                  placeholder="01xxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">القسم / الدور الوظيفي</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-amber-500/50 outline-none"
                >
                  {Object.entries(roles).map(([key, label]) => (
                    <option key={key} value={key} className="bg-[#0D1B2A]">{label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1.5">الراتب الأساسي (ج.م)</label>
                <input
                  type="number"
                  min={0}
                  value={form.salary || ''}
                  onChange={e => setForm(f => ({ ...f, salary: Number(e.target.value) }))}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/50 font-mono"
                  dir="ltr"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8 pt-4 border-t border-white/5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
              >
                {saving ? 'جاري المعالجة...' : '✅ حفظ البيانات'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null) }}
                className="px-6 py-2.5 bg-white/5 text-gray-300 rounded-xl hover:bg-white/10 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── شبكة عرض الموظفين ── */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredEmployees.map(emp => (
            <div key={emp.id} className="bg-[#111927] rounded-2xl border border-white/5 p-5 hover:border-white/20 transition-all group relative overflow-hidden flex flex-col h-full shadow-sm">
              <div className="absolute top-0 right-0 w-1 h-full bg-amber-500/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-white text-base truncate pr-2">{emp.name}</h3>
                  <span className="inline-block mt-1.5 px-2.5 py-1 bg-[#0D1B2A] border border-white/5 rounded-md text-[10px] text-amber-400 font-bold tracking-wide">
                    {roles[emp.role] || emp.role}
                  </span>
                </div>
                <button
                  onClick={() => openEditForm(emp)}
                  className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-amber-500 hover:text-black transition-colors"
                  title="تعديل البيانات"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </button>
              </div>

              <div className="mt-auto pt-4 border-t border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">الهاتف:</span>
                  <span className="text-gray-300 font-mono" dir="ltr">{emp.phone || '—'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">الراتب الأساسي:</span>
                  <span className="text-white font-bold font-mono bg-white/5 px-2 py-0.5 rounded">{emp.salary.toLocaleString()} ج.م</span>
                </div>
              </div>
            </div>
          ))}
          {filteredEmployees.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 bg-[#111927] rounded-2xl border border-dashed border-white/10">
              <span className="text-4xl mb-3 opacity-30">📭</span>
              <p className="text-gray-400 text-sm">لا يوجد موظفون مسجلون أو لم يتم العثور على نتائج للبحث.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}