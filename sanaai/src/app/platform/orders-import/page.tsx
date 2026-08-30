'use client'

// حط الملف ده في: app/platform/orders-import/page.tsx
// ملحوظة: مش محتاج أي تحقق صلاحية جوه الصفحة دي — app/platform/layout.tsx
// أصلاً بيحجب كل حاجة تحت /platform/* عن غير platform_admins. اتحقق من ده
// بإضافة { label: 'استيراد طلبات', icon: '📥', path: '/platform/orders-import' }
// لمصفوفة navItems في layout.tsx عشان يظهر في القايمة الجانبية.

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// npm install xlsx
import * as XLSX from 'xlsx'

const COLUMN_MAP: Record<string, string> = {
  'رقم الطلب': 'import_reference',
  'اسم العميل': 'customer_name',
  'رقم الهاتف': 'customer_phone',
  'العنوان': 'address',
  'تاريخ الطلب': 'order_date',
  'تاريخ التسليم المتوقع': 'expected_delivery',
  'ملخص الأصناف': 'items_summary',
  'الإجمالي (ج.م)': 'total_amount',
  'المدفوع مقدماً (ج.م)': 'deposit_paid',
  'ملاحظات': 'notes',
}
const NUMERIC_FIELDS = ['total_amount', 'deposit_paid']

type Tenant = { id: string; name: string }
type SalesRep = { id: string; full_name: string | null; email: string | null }
type ParsedRow = Record<string, any> & { _sourceRow: number }

export default function PlatformOrdersImportPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState('')

  const [salesReps, setSalesReps] = useState<SalesRep[]>([])
  const [selectedSalesRepId, setSelectedSalesRepId] = useState('')
  const [loadingSalesReps, setLoadingSalesReps] = useState(false)

  const [fileName, setFileName] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    inserted: number
    duplicates: number
    failed: { import_reference: string; reason: string }[]
  } | null>(null)

  useEffect(() => {
    loadTenants()
  }, [])

  useEffect(() => {
    setSelectedSalesRepId('')
    setSalesReps([])
    if (selectedTenantId) loadSalesReps(selectedTenantId)
  }, [selectedTenantId])

  async function loadTenants() {
    const { data } = await supabase.from('tenants').select('id, name').order('name')
    setTenants(data || [])
  }

  async function loadSalesReps(tenantId: string) {
    setLoadingSalesReps(true)
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('tenant_id', tenantId)
      .eq('role', 'sales')
      .eq('is_active', true)
    setSalesReps(data || [])
    setLoadingSalesReps(false)
  }

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name)
    setParsedRows([])
    setParseErrors([])
    setImportResult(null)

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheetName = workbook.SheetNames.includes('الطلبات') ? 'الطلبات' : workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })

    if (rows.length === 0) {
      setParseErrors(['الشيت فاضي أو مفيهوش بيانات قابلة للقراءة'])
      return
    }

    const foundColumns = Object.keys(rows[0])
    const requiredColumns = ['رقم الطلب', 'اسم العميل', 'الإجمالي (ج.م)']
    const missing = requiredColumns.filter(c => !foundColumns.includes(c))
    if (missing.length > 0) {
      setParseErrors(missing.map(c => `العمود المطلوب "${c}" غير موجود في الشيت`))
      return
    }

    const errors: string[] = []
    const parsed: ParsedRow[] = []

    rows.forEach((row, index) => {
      const sourceRow = index + 2
      if (!row['رقم الطلب']) { errors.push(`صف ${sourceRow}: رقم الطلب فارغ - تم تجاهله`); return }
      if (!row['اسم العميل']) { errors.push(`صف ${sourceRow}: اسم العميل فارغ - تم تجاهله`); return }

      const mapped: Record<string, any> = {}
      for (const [arabicCol, field] of Object.entries(COLUMN_MAP)) {
        mapped[field] = row[arabicCol] ?? null
      }
      NUMERIC_FIELDS.forEach(f => {
        if (mapped[f] != null) {
          const cleaned = String(mapped[f]).replace(/,/g, '').trim()
          mapped[f] = cleaned === '' ? null : Number(cleaned)
        }
      })
      if (mapped.total_amount == null || Number.isNaN(mapped.total_amount)) {
        errors.push(`صف ${sourceRow}: "الإجمالي (ج.م)" غير رقمية أو فارغة - تم تجاهله`)
        return
      }

      parsed.push({ ...mapped, _sourceRow: sourceRow })
    })

    setParsedRows(parsed)
    setParseErrors(errors)
  }, [])

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function confirmImport() {
    if (!selectedTenantId || !selectedSalesRepId || parsedRows.length === 0) return
    setImporting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('انتهت الجلسة، سجّل الدخول مرة أخرى')

      const rows = parsedRows.map(({ _sourceRow, ...r }) => r)

      const res = await fetch('/api/platform/orders/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tenant_id: selectedTenantId, assigned_user_id: selectedSalesRepId, rows }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result.error?.message || 'فشل الاستيراد')

      setImportResult(result.data)
      setParsedRows([])
      setFileName('')
    } catch (err: any) {
      alert('حصل خطأ أثناء الاستيراد: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">📥 استيراد طلبات بالجملة</h1>
        <p className="text-sm text-gray-500 mt-1">
          اختر الشركة ثم السيلز، وارفع شيت الإكسل. الطلبات هتتسجل باسم السيلز المختار بعلامة
          "تحتاج استكمال" لحد ما يكمّل اللوجو والتفاصيل الناقصة.
        </p>
      </div>

      <div className="bg-[#111927] rounded-2xl border border-white/5 p-5 space-y-5">
        {/* اختيار الشركة */}
        <div>
          <label className="block text-xs text-gray-400 mb-2">الشركة / المصنع</label>
          <select
            value={selectedTenantId}
            onChange={e => setSelectedTenantId(e.target.value)}
            className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500/50"
          >
            <option value="">-- اختر الشركة --</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* اختيار السيلز */}
        <div>
          <label className="block text-xs text-gray-400 mb-2">السيلز المستهدف</label>
          <select
            value={selectedSalesRepId}
            onChange={e => setSelectedSalesRepId(e.target.value)}
            disabled={!selectedTenantId || loadingSalesReps}
            className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500/50 disabled:opacity-50"
          >
            <option value="">{loadingSalesReps ? 'جاري التحميل...' : '-- اختر السيلز --'}</option>
            {salesReps.map(s => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email} {s.email ? `— ${s.email}` : ''}
              </option>
            ))}
          </select>
          {selectedTenantId && !loadingSalesReps && salesReps.length === 0 && (
            <p className="text-[11px] text-amber-400 mt-1">لا يوجد مستخدمين نشطين بدور "sales" في الشركة دي</p>
          )}
        </div>

        {/* رفع الملف */}
        <div>
          <label className="block text-xs text-gray-400 mb-2">ملف الإكسل</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileInputChange}
            disabled={!selectedSalesRepId}
            className="w-full text-sm text-gray-300 file:ml-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-purple-500/15 file:text-purple-300 hover:file:bg-purple-500/25 disabled:opacity-50"
          />
          {!selectedSalesRepId && (
            <p className="text-[11px] text-gray-600 mt-1">اختر الشركة والسيلز أولاً قبل رفع الملف</p>
          )}
        </div>

        {parseErrors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-1">
            {parseErrors.map((e, i) => <p key={i} className="text-[11px] text-red-400">⚠️ {e}</p>)}
          </div>
        )}

        {parsedRows.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2">
              📄 {fileName} — تم تحليل <span className="text-white font-bold">{parsedRows.length}</span> طلب
            </p>
            <div className="max-h-64 overflow-y-auto border border-white/10 rounded-lg">
              <table className="w-full text-[11px]">
                <thead className="bg-[#0D1B2A] text-gray-400 sticky top-0">
                  <tr>
                    <th className="p-2 text-right">رقم الطلب</th>
                    <th className="p-2 text-right">العميل</th>
                    <th className="p-2 text-right">الأصناف</th>
                    <th className="p-2 text-right">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, i) => (
                    <tr key={i} className="border-t border-white/5 text-gray-300">
                      <td className="p-2">{r.import_reference}</td>
                      <td className="p-2">{r.customer_name}</td>
                      <td className="p-2 truncate max-w-[220px]">{r.items_summary}</td>
                      <td className="p-2">{r.total_amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={confirmImport}
              disabled={importing}
              className="mt-4 w-full text-sm px-4 py-2.5 rounded-lg bg-purple-500 text-white font-bold hover:bg-purple-600 transition disabled:opacity-50"
            >
              {importing ? 'جاري الاستيراد...' : `تأكيد استيراد ${parsedRows.length} طلب`}
            </button>
          </div>
        )}

        {importResult && (
          <div className="space-y-2">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <p className="text-xs text-green-400">
                ✅ تم استيراد {importResult.inserted} طلب بنجاح
                {importResult.duplicates > 0 && ` — وتم تجاهل ${importResult.duplicates} طلب مكرر`}
              </p>
            </div>
            {importResult.failed.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-1">
                {importResult.failed.map((f, i) => (
                  <p key={i} className="text-[11px] text-red-400">⚠️ طلب {f.import_reference}: {f.reason}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}