'use client';

// ⚠️ المسار الموصى به لهذا الملف داخل المشروع: src/app/dashboard/inventory-linking/page.tsx
//
// الغرض من هذه الشاشة: ربط كل صنف مخزون جاهز (inventory) بمنتج التصنيع
// المقابل له في كتالوج (products)، عشان الترييجر التلقائي يقدر يجيب
// معادلة BOM الصحيحة لأي أوردر عميل حقيقي بدون تدخل يدوي.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Loader2,
  Search,
  Link2,
  Unlink,
  CheckCircle2,
  XCircle,
  X,
  PackageSearch,
  Filter,
} from 'lucide-react';

// ============================================================================
// الأنواع (Types)
// ============================================================================

interface InventoryItem {
  id: string;
  tenant_id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  current_stock: number;
  size: string | null;
  color: string | null;
  product_id: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
}

interface BannerState {
  type: 'success' | 'error';
  message: string;
}

type LinkFilter = 'all' | 'linked' | 'unlinked';

// ============================================================================
// دوال مساعدة
// ============================================================================

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 }).format(value);
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

// دالة مساعدة محلية لجلب معرّف المصنع (Tenant) بشكل آمن من الجلسة
async function getTenantId(): Promise<string | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data, error } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (error || !data?.tenant_id) return null;
  return data.tenant_id;
}

// ============================================================================
// مكوّن: بانر تنبيه (بديل أنيق للـ alert)
// ============================================================================

function Banner({ banner, onClose }: { banner: BannerState; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const isSuccess = banner.type === 'success';

  return (
    <div
      dir="rtl"
      className={cn(
        'fixed top-5 left-1/2 z-[100] flex w-[92%] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm transition-all duration-300 animate-in slide-in-from-top-4',
        isSuccess ? 'border-emerald-400/30 bg-emerald-950/90' : 'border-red-500/30 bg-red-950/90'
      )}
    >
      {isSuccess ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
      )}
      <p className="flex-1 text-sm leading-relaxed text-[#F0EDE8]">{banner.message}</p>
      <button onClick={onClose} className="text-[#F0EDE8]/50 transition hover:text-[#F0EDE8]">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================================================
// المكوّن الرئيسي: شاشة ربط المخزون بالمنتجات
// ============================================================================

export default function InventoryProductLinkingPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(true);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');

  const [banner, setBanner] = useState<BannerState | null>(null);

  const showBanner = useCallback((type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
  }, []);

  // --------------------------------------------------------------------------
  // تحميل الجلسة (tenant_id)
  // --------------------------------------------------------------------------

  const bootstrapSession = useCallback(async () => {
    setIsBootstrapping(true);
    const id = await getTenantId();
    
    if (!id) {
      showBanner('error', 'تعذر تحديد بيانات المصنع الخاص بحسابك. يرجى تسجيل الدخول مجدداً.');
      setIsBootstrapping(false);
      return;
    }

    setTenantId(id);
    setIsBootstrapping(false);
  }, [showBanner]);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  // --------------------------------------------------------------------------
  // جلب أصناف المخزون وكتالوج المنتجات
  // --------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setIsLoadingItems(true);

    const [itemsRes, productsRes] = await Promise.all([
      supabase
        .from('inventory')
        .select('id, tenant_id, sku, name, category, unit, current_stock, size, color, product_id')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true }),
      supabase
        .from('products')
        .select('id, name, sku')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ]);

    if (itemsRes.error || productsRes.error) {
      showBanner('error', 'تعذر تحميل بيانات المخزون أو كتالوج المنتجات');
      setIsLoadingItems(false);
      return;
    }

    setItems((itemsRes.data as InventoryItem[]) ?? []);
    setProducts((productsRes.data as ProductOption[]) ?? []);
    setIsLoadingItems(false);
  }, [tenantId, showBanner]);

  useEffect(() => {
    if (tenantId) fetchData();
  }, [tenantId, fetchData]);

  // --------------------------------------------------------------------------
  // التحديث اللحظي للربط (Optimistic UI Update)
  // --------------------------------------------------------------------------

  const handleLinkChange = async (itemId: string, productId: string) => {
    if (!tenantId) return;
    
    setSavingRowId(itemId);
    const targetProductId = productId || null;
    
    // 1. أخذ نسخة من الحالة القديمة للتراجع (Rollback) في حالة الخطأ
    const previousItems = [...items];

    // 2. تحديث الواجهة فوراً لتجربة مستخدم فائقة السرعة
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, product_id: targetProductId } : item))
    );

    // 3. الاتصال بقاعدة البيانات (مع فرض العزل)
    const { error } = await supabase
      .from('inventory')
      .update({ product_id: targetProductId })
      .eq('id', itemId)
      .eq('tenant_id', tenantId);

    // 4. معالجة النتيجة
    if (error) {
      setItems(previousItems); // Rollback
      showBanner('error', 'تعذر حفظ الربط، الرجاء المحاولة مرة أخرى');
    }
    
    setSavingRowId(null);
  };

  // --------------------------------------------------------------------------
  // الفلترة والبحث
  // --------------------------------------------------------------------------

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (linkFilter === 'linked' && !item.product_id) return false;
      if (linkFilter === 'unlinked' && item.product_id) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.trim().toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.sku ?? '').toLowerCase().includes(q) ||
        (item.category ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, searchTerm, linkFilter]);

  const unlinkedCount = useMemo(() => items.filter((i) => !i.product_id).length, [items]);

  // --------------------------------------------------------------------------
  // حالة الإقلاع
  // --------------------------------------------------------------------------

  if (isBootstrapping) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-[#0D1B2A] font-['Cairo',sans-serif]"
      >
        <div className="flex flex-col items-center gap-3 text-[#F0EDE8]/70">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-sm">جارِ تجهيز شاشة ربط المخزون بالمنتجات...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen pb-16 bg-[#0D1B2A] text-[#F0EDE8] font-['Cairo',sans-serif]"
    >
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      {/* الرأس */}
      <div className="border-b border-white/5 px-6 py-6 md:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30">
              <Link2 className="h-5.5 w-5.5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#F0EDE8]">ربط المخزون بمنتجات التصنيع</h1>
              <p className="mt-0.5 text-sm text-[#F0EDE8]/50">
                اربط كل صنف بمنتج، ليتم حساب خامات الأوردرات آلياً بناءً على معادلة التصنيع (BOM)
              </p>
            </div>
          </div>

          {unlinkedCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
              <Unlink className="h-4 w-4" />
              <span>
                <span className="font-bold">{formatNumber(unlinkedCount)}</span> صنف لسه مش مربوط بمنتج
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
        {/* أدوات البحث والفلترة */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#F0EDE8]/30" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم أو الكود أو الفئة..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pr-10 pl-4 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-1 overflow-x-auto">
            {(
              [
                { key: 'all', label: 'الكل' },
                { key: 'unlinked', label: 'غير مربوط' },
                { key: 'linked', label: 'مربوط' },
              ] as { key: LinkFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setLinkFilter(opt.key)}
                className={cn(
                  'rounded-lg px-3.5 py-1.5 text-xs font-medium transition shrink-0',
                  linkFilter === opt.key
                    ? 'bg-amber-500 text-[#0D1B2A]'
                    : 'text-[#F0EDE8]/60 hover:bg-white/5'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* جدول الأصناف */}
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#111927]">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-4.5 w-4.5 text-[#F0EDE8]/40" />
              <h2 className="text-sm font-semibold text-[#F0EDE8]">أصناف المخزون</h2>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-[#F0EDE8]/40">
              <Filter className="h-3.5 w-3.5" />
              {formatNumber(filteredItems.length)} من {formatNumber(items.length)}
            </span>
          </div>

          {isLoadingItems ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#F0EDE8]/50">
              <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
              <p className="text-sm">جارِ تحميل أصناف المخزون...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <PackageSearch className="h-10 w-10 text-[#F0EDE8]/20" />
              <p className="text-sm text-[#F0EDE8]/50">لا توجد أصناف مطابقة لبحثك أو للفلتر المختار</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-right text-xs text-[#F0EDE8]/40">
                    <th className="px-5 py-3.5 font-medium">الصنف</th>
                    <th className="px-5 py-3.5 font-medium">الفئة</th>
                    <th className="px-5 py-3.5 font-medium">المقاس / اللون</th>
                    <th className="px-5 py-3.5 font-medium">المنتج المرتبط</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-white/[0.03] transition hover:bg-white/[0.02] last:border-0"
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-[#F0EDE8]">{item.name}</p>
                        {item.sku && <p className="mt-0.5 text-xs text-[#F0EDE8]/40">{item.sku}</p>}
                      </td>
                      <td className="px-5 py-4 text-[#F0EDE8]/70">{item.category ?? '—'}</td>
                      <td className="px-5 py-4 text-[#F0EDE8]/70">
                        {[item.size, item.color].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={item.product_id ?? ''}
                            onChange={(e) => handleLinkChange(item.id, e.target.value)}
                            disabled={savingRowId === item.id}
                            className={cn(
                              'w-full max-w-[220px] rounded-lg border bg-white/[0.03] px-3 py-1.5 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50 disabled:opacity-50 transition-colors',
                              item.product_id ? 'border-emerald-400/30' : 'border-amber-500/30'
                            )}
                          >
                            <option value="" className="bg-[#111927] text-gray-400">— بدون ربط —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id} className="bg-[#111927] text-[#F0EDE8]">
                                {p.name}
                                {p.sku ? ` (${p.sku})` : ''}
                              </option>
                            ))}
                          </select>
                          {savingRowId === item.id && (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!isLoadingItems && products.length === 0 && (
          <p className="mt-4 text-center text-xs text-amber-500/70">
            لا يوجد منتجات نشطة في الكتالوج بعد — أضف منتجات أولاً من شاشة كتالوج المنتجات قبل الربط.
          </p>
        )}
      </div>
    </div>
  );
}