'use client';

// ⚠️ المسار الموصى به لهذا الملف داخل المشروع: src/app/dashboard/materials/transactions/page.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
// ✅ إصلاح: استخدام عميل Supabase الموحّد الفعلي في المشروع بدل مسار غير موجود
import { supabase } from '@/lib/supabase';
import {
  Loader2,
  History,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCcw,
  Undo2,
  Factory,
  XCircle,
  Filter,
  ChevronDown,
} from 'lucide-react';

// ============================================================================
// الأنواع (Types)
// ============================================================================

type TransactionType = 'supply' | 'consumption' | 'waste' | 'adjustment' | 'return';

interface RawMaterialRef {
  id: string;
  name: string;
  unit: string;
}

interface TransactionRow {
  id: string;
  material_id: string;
  transaction_type: TransactionType;
  quantity: number;
  balance_before: number;
  balance_after: number;
  unit_cost_at_time: number;
  order_id: string | null;
  reference_note: string | null;
  created_by: string | null;
  created_at: string;
  raw_materials: RawMaterialRef;
}

interface MaterialOption {
  id: string;
  name: string;
}

interface BannerState {
  type: 'error';
  message: string;
}

const PAGE_SIZE = 30;

const TRANSACTION_TYPE_META: Record<
  TransactionType,
  { label: string; icon: React.ElementType; className: string }
> = {
  supply: { label: 'توريد', icon: ArrowUpCircle, className: 'bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/30' },
  return: { label: 'مرتجع', icon: Undo2, className: 'bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/30' },
  consumption: { label: 'استهلاك تصنيع', icon: Factory, className: 'bg-sky-400/10 text-sky-400 ring-1 ring-sky-400/30' },
  waste: { label: 'هالك', icon: XCircle, className: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30' },
  adjustment: { label: 'تسوية رصيد', icon: RefreshCcw, className: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30' },
};

// ============================================================================
// ثوابت الهوية البصرية
// ============================================================================

const COLORS = {
  bg: '#0D1B2A',
  card: '#111927',
  text: '#F0EDE8',
};

// ============================================================================
// دوال مساعدة
// ============================================================================

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 }).format(Math.abs(value));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

// حساب الكمية الموجّهة للعرض: الاستهلاك يُخزَّن كقيمة موجبة لكنه يمثل نقصاً فعلياً
function getSignedQuantity(row: TransactionRow): number {
  if (row.transaction_type === 'consumption') return -Math.abs(row.quantity);
  return row.quantity;
}

// ============================================================================
// مكوّن: بانر خطأ بسيط
// ============================================================================

function Banner({ banner, onClose }: { banner: BannerState; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      dir="rtl"
      className="fixed top-5 left-1/2 z-[100] flex w-[92%] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/90 px-4 py-3 shadow-2xl backdrop-blur-sm"
    >
      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
      <p className="flex-1 text-sm leading-relaxed text-[#F0EDE8]">{banner.message}</p>
    </div>
  );
}

// ============================================================================
// مكوّن: شارة نوع الحركة
// ============================================================================

function TransactionTypeBadge({ type }: { type: TransactionType }) {
  const meta = TRANSACTION_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', meta.className)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

// ============================================================================
// المكوّن الرئيسي: شاشة سجل حركات المخزون
// ============================================================================

export default function MaterialTransactionsLogPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true);

  const [materialOptions, setMaterialOptions] = useState<MaterialOption[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);

  const [materialFilter, setMaterialFilter] = useState<string>('الكل');
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'الكل'>('الكل');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [materialSearch, setMaterialSearch] = useState<string>('');

  const [page, setPage] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const [banner, setBanner] = useState<BannerState | null>(null);

  const showError = useCallback((message: string) => {
    setBanner({ type: 'error', message });
  }, []);

  // --------------------------------------------------------------------------
  // تحميل الجلسة
  // --------------------------------------------------------------------------

  const bootstrapSession = useCallback(async () => {
    setIsBootstrapping(true);
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      showError('تعذر التحقق من جلسة الدخول، الرجاء تسجيل الدخول مرة أخرى');
      setIsBootstrapping(false);
      return;
    }

    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userRow?.tenant_id) {
      showError('تعذر تحديد بيانات المصنع الخاص بحسابك');
      setIsBootstrapping(false);
      return;
    }

    setTenantId(userRow.tenant_id);
    setIsBootstrapping(false);
  }, [showError]);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  // --------------------------------------------------------------------------
  // جلب قائمة الخامات لاستخدامها في الفلتر
  // --------------------------------------------------------------------------

  const fetchMaterialOptions = useCallback(async () => {
    if (!tenantId) return;

    const { data, error } = await supabase
      .from('raw_materials')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      showError('تعذر تحميل قائمة الخامات لأغراض الفلترة');
      return;
    }

    setMaterialOptions((data as MaterialOption[]) ?? []);
  }, [tenantId, showError]);

  useEffect(() => {
    if (tenantId) fetchMaterialOptions();
  }, [tenantId, fetchMaterialOptions]);

  // --------------------------------------------------------------------------
  // جلب الحركات مع الفلاتر والصفحات
  // --------------------------------------------------------------------------

  const fetchTransactions = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!tenantId) return;

      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      let query = supabase
        .from('material_transactions')
        .select('*, raw_materials(id, name, unit)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(targetPage * PAGE_SIZE, targetPage * PAGE_SIZE + PAGE_SIZE - 1);

      if (materialFilter !== 'الكل') {
        query = query.eq('material_id', materialFilter);
      }
      if (typeFilter !== 'الكل') {
        query = query.eq('transaction_type', typeFilter);
      }
      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) {
        showError('تعذر تحميل سجل حركات المخزون');
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      const rows = (data as unknown as TransactionRow[]) ?? [];
      setHasMore(rows.length === PAGE_SIZE);
      setTransactions((prev) => (append ? [...prev, ...rows] : rows));
      setIsLoading(false);
      setIsLoadingMore(false);
    },
    [tenantId, materialFilter, typeFilter, dateFrom, dateTo, showError]
  );

  useEffect(() => {
    if (!tenantId) return;
    setPage(0);
    fetchTransactions(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, materialFilter, typeFilter, dateFrom, dateTo]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTransactions(nextPage, true);
  };

  // --------------------------------------------------------------------------
  // ملخص سريع على النتائج المحمّلة حالياً
  // --------------------------------------------------------------------------

  const loadedSummary = useMemo(() => {
    const totalSupply = transactions
      .filter((t) => t.transaction_type === 'supply' || t.transaction_type === 'return')
      .reduce((sum, t) => sum + t.quantity * t.unit_cost_at_time, 0);

    const totalConsumption = transactions
      .filter((t) => t.transaction_type === 'consumption')
      .reduce((sum, t) => sum + t.quantity * t.unit_cost_at_time, 0);

    const totalWaste = transactions
      .filter((t) => t.transaction_type === 'waste')
      .reduce((sum, t) => sum + Math.abs(t.quantity) * t.unit_cost_at_time, 0);

    return { totalSupply, totalConsumption, totalWaste };
  }, [transactions]);

  const filteredMaterialOptions = useMemo(() => {
    if (!materialSearch.trim()) return materialOptions;
    const term = materialSearch.trim().toLowerCase();
    return materialOptions.filter((m) => m.name.toLowerCase().includes(term));
  }, [materialOptions, materialSearch]);

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
  }

  // --------------------------------------------------------------------------
  // حالة الإقلاع
  // --------------------------------------------------------------------------

  if (isBootstrapping) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: COLORS.bg, fontFamily: "'Cairo', sans-serif" }}
      >
        <div className="flex flex-col items-center gap-3 text-[#F0EDE8]/70">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-sm">جارِ تجهيز سجل الحركات...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen pb-16"
      style={{ backgroundColor: COLORS.bg, fontFamily: "'Cairo', sans-serif", color: COLORS.text }}
    >
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      {/* الرأس */}
      <div className="border-b border-white/5 px-6 py-6 md:px-10">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30">
            <History className="h-5.5 w-5.5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#F0EDE8]">سجل حركات المخزون</h1>
            <p className="text-sm text-[#F0EDE8]/50">تقرير تاريخي كامل لكل حركة توريد أو صرف أو هالك</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-6 md:px-10">
        {/* بطاقات ملخص القيمة (على النتائج المحمّلة) */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: COLORS.card }}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#F0EDE8]/50">إجمالي التوريد والمرتجعات</span>
              <ArrowUpCircle className="h-4.5 w-4.5 text-emerald-400/60" />
            </div>
            <p className="mt-3 text-2xl font-bold text-emerald-400">{formatCurrency(loadedSummary.totalSupply)} ج.م</p>
          </div>

          <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: COLORS.card }}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#F0EDE8]/50">إجمالي استهلاك التصنيع</span>
              <Factory className="h-4.5 w-4.5 text-sky-400/60" />
            </div>
            <p className="mt-3 text-2xl font-bold text-sky-400">{formatCurrency(loadedSummary.totalConsumption)} ج.م</p>
          </div>

          <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: COLORS.card }}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#F0EDE8]/50">إجمالي الهالك</span>
              <XCircle className="h-4.5 w-4.5 text-red-400/60" />
            </div>
            <p className="mt-3 text-2xl font-bold text-red-400">{formatCurrency(loadedSummary.totalWaste)} ج.م</p>
          </div>
        </div>
        <p className="-mt-4 mb-6 text-xs text-[#F0EDE8]/30">* الملخص أعلاه محسوب على الحركات المعروضة حالياً فقط حسب الفلاتر والتحميل التدريجي</p>

        {/* أدوات الفلترة */}
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/5 p-4 md:flex-row md:flex-wrap md:items-end" style={{ backgroundColor: COLORS.card }}>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs text-[#F0EDE8]/50">
              <Filter className="h-3.5 w-3.5" />
              الخامة
            </label>
            <select
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50"
            >
              <option value="الكل">كل الخامات</option>
              {filteredMaterialOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <label className="text-xs text-[#F0EDE8]/50">نوع الحركة</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TransactionType | 'الكل')}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50"
            >
              <option value="الكل">كل الأنواع</option>
              <option value="supply">توريد</option>
              <option value="consumption">استهلاك تصنيع</option>
              <option value="waste">هالك</option>
              <option value="adjustment">تسوية رصيد</option>
              <option value="return">مرتجع</option>
            </select>
          </div>

          <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
            <label className="text-xs text-[#F0EDE8]/50">من تاريخ</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
            <label className="text-xs text-[#F0EDE8]/50">إلى تاريخ</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50"
            />
          </div>

          {(materialFilter !== 'الكل' || typeFilter !== 'الكل' || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setMaterialFilter('الكل');
                setTypeFilter('الكل');
                setDateFrom('');
                setDateTo('');
              }}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-[#F0EDE8]/60 transition hover:bg-white/5"
            >
              مسح الفلاتر
            </button>
          )}
        </div>

        {/* جدول الحركات */}
        <div className="overflow-hidden rounded-2xl border border-white/5" style={{ backgroundColor: COLORS.card }}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#F0EDE8]/50">
              <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
              <p className="text-sm">جارِ تحميل الحركات...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <History className="h-10 w-10 text-[#F0EDE8]/20" />
              <p className="text-sm text-[#F0EDE8]/50">لا توجد حركات مطابقة للفلاتر المحددة</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-right text-xs text-[#F0EDE8]/40">
                      <th className="px-5 py-3.5 font-medium">التاريخ والوقت</th>
                      <th className="px-5 py-3.5 font-medium">الخامة</th>
                      <th className="px-5 py-3.5 font-medium">نوع الحركة</th>
                      <th className="px-5 py-3.5 font-medium">الكمية</th>
                      <th className="px-5 py-3.5 font-medium">الرصيد قبل / بعد</th>
                      <th className="px-5 py-3.5 font-medium">ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((row) => {
                      const signedQty = getSignedQuantity(row);
                      const isPositive = signedQty >= 0;

                      return (
                        <tr
                          key={row.id}
                          className="border-b border-white/[0.03] transition hover:bg-white/[0.02] last:border-0"
                        >
                          <td className="px-5 py-4 text-[#F0EDE8]/70">{formatDateTime(row.created_at)}</td>
                          <td className="px-5 py-4">
                            <p className="font-medium text-[#F0EDE8]">{row.raw_materials.name}</p>
                          </td>
                          <td className="px-5 py-4">
                            <TransactionTypeBadge type={row.transaction_type} />
                          </td>
                          <td className="px-5 py-4">
                            <span className={cn('font-semibold', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                              {isPositive ? '+' : '−'} {formatNumber(signedQty)}
                            </span>
                            <span className="mr-1 text-xs text-[#F0EDE8]/40">{row.raw_materials.unit}</span>
                          </td>
                          <td className="px-5 py-4 text-[#F0EDE8]/60">
                            {formatNumber(row.balance_before)} ← {formatNumber(row.balance_after)}
                          </td>
                          <td className="px-5 py-4 text-[#F0EDE8]/50">{row.reference_note ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {hasMore && (
                <div className="flex items-center justify-center border-t border-white/5 py-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-[#F0EDE8]/70 transition hover:bg-white/5 disabled:opacity-60"
                  >
                    {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                    تحميل المزيد
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
