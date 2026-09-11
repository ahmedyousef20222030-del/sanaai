'use client';

// ⚠️ المسار الموصى به لهذا الملف داخل المشروع: src/app/dashboard/bom/page.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
// ✅ إصلاح: استخدام عميل Supabase الموحّد الفعلي في المشروع بدل مسار غير موجود
import { supabase } from '@/lib/supabase';
import {
  Loader2,
  Layers,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  XCircle,
  Search,
  Wallet,
  Package,
  Boxes,
} from 'lucide-react';

// ============================================================================
// الأنواع (Types)
// ============================================================================

interface Product {
  id: string;
  tenant_id: string;
  name: string;
  sku: string | null;
  is_active: boolean;
}

interface RawMaterialOption {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
  current_stock: number;
}

interface BomRow {
  id: string;
  tenant_id: string;
  product_id: string;
  material_id: string;
  quantity_required: number;
  notes: string | null;
  raw_materials: RawMaterialOption;
}

interface BannerState {
  type: 'success' | 'error';
  message: string;
}

interface BomFormState {
  id: string | null;
  material_id: string;
  quantity_required: string;
  notes: string;
}

const EMPTY_BOM_FORM: BomFormState = {
  id: null,
  material_id: '',
  quantity_required: '',
  notes: '',
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
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

// ============================================================================
// مكوّن: بانر تنبيه (بديل alert())
// ============================================================================

function Banner({ banner, onClose }: { banner: BannerState; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);

  const isSuccess = banner.type === 'success';

  return (
    <div
      dir="rtl"
      className={cn(
        'fixed top-5 left-1/2 z-[100] flex w-[92%] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm',
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
// مكوّن: غلاف مودال عام
// ============================================================================

function ModalShell({
  title,
  onClose,
  children,
  maxWidth = 'max-w-md',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn('w-full animate-[fadeIn_0.15s_ease-out] rounded-2xl border border-white/5 shadow-2xl', maxWidth)}
        style={{ backgroundColor: COLORS.card }}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h3 className="text-base font-semibold text-[#F0EDE8]">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#F0EDE8]/50 transition hover:bg-white/5 hover:text-[#F0EDE8]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ============================================================================
// المكوّن الرئيسي: شاشة إدارة معادلة التصنيع (BOM)
// ============================================================================

export default function ProductBomPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');

  const [materialOptions, setMaterialOptions] = useState<RawMaterialOption[]>([]);
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [isLoadingBom, setIsLoadingBom] = useState<boolean>(false);

  const [banner, setBanner] = useState<BannerState | null>(null);

  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [bomForm, setBomForm] = useState<BomFormState>(EMPTY_BOM_FORM);
  const [isSavingBom, setIsSavingBom] = useState<boolean>(false);

  const [rowToDelete, setRowToDelete] = useState<BomRow | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const showBanner = useCallback((type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
  }, []);

  // --------------------------------------------------------------------------
  // تحميل الجلسة
  // --------------------------------------------------------------------------

  const bootstrapSession = useCallback(async () => {
    setIsBootstrapping(true);
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      showBanner('error', 'تعذر التحقق من جلسة الدخول، الرجاء تسجيل الدخول مرة أخرى');
      setIsBootstrapping(false);
      return;
    }

    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userRow?.tenant_id) {
      showBanner('error', 'تعذر تحديد بيانات المصنع الخاص بحسابك');
      setIsBootstrapping(false);
      return;
    }

    setTenantId(userRow.tenant_id);
    setIsBootstrapping(false);
  }, [showBanner]);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  // --------------------------------------------------------------------------
  // جلب المنتجات والخامات المتاحة
  // --------------------------------------------------------------------------

  const fetchProducts = useCallback(async () => {
    if (!tenantId) return;

    const { data, error } = await supabase
      .from('products')
      .select('id, tenant_id, name, sku, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      showBanner('error', 'تعذر تحميل قائمة المنتجات');
      return;
    }

    const list = (data as Product[]) ?? [];
    setProducts(list);
    if (list.length > 0 && !selectedProductId) {
      setSelectedProductId(list[0].id);
    }
  }, [tenantId, showBanner, selectedProductId]);

  const fetchMaterialOptions = useCallback(async () => {
    if (!tenantId) return;

    const { data, error } = await supabase
      .from('raw_materials')
      .select('id, name, unit, unit_cost, current_stock')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      showBanner('error', 'تعذر تحميل قائمة الخامات المتاحة');
      return;
    }

    setMaterialOptions((data as RawMaterialOption[]) ?? []);
  }, [tenantId, showBanner]);

  useEffect(() => {
    if (tenantId) {
      fetchProducts();
      fetchMaterialOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // --------------------------------------------------------------------------
  // جلب معادلة BOM الخاصة بالمنتج المختار
  // --------------------------------------------------------------------------

  const fetchBomForProduct = useCallback(async () => {
    if (!tenantId || !selectedProductId) {
      setBomRows([]);
      return;
    }

    setIsLoadingBom(true);

    const { data, error } = await supabase
      .from('product_bom')
      .select('*, raw_materials(id, name, unit, unit_cost, current_stock)')
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId)
      .order('created_at', { ascending: true });

    if (error) {
      showBanner('error', 'تعذر تحميل معادلة التصنيع لهذا المنتج');
      setIsLoadingBom(false);
      return;
    }

    setBomRows((data as unknown as BomRow[]) ?? []);
    setIsLoadingBom(false);
  }, [tenantId, selectedProductId, showBanner]);

  useEffect(() => {
    fetchBomForProduct();
  }, [fetchBomForProduct]);

  // --------------------------------------------------------------------------
  // حسابات مساعدة
  // --------------------------------------------------------------------------

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const term = productSearch.trim().toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term)
    );
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const estimatedUnitCost = useMemo(
    () => bomRows.reduce((sum, row) => sum + row.quantity_required * row.raw_materials.unit_cost, 0),
    [bomRows]
  );

  const materialsAlreadyInBom = useMemo(() => new Set(bomRows.map((r) => r.material_id)), [bomRows]);

  const availableMaterialsForNewRow = useMemo(
    () => materialOptions.filter((m) => !materialsAlreadyInBom.has(m.id) || m.id === bomForm.material_id),
    [materialOptions, materialsAlreadyInBom, bomForm.material_id]
  );

  // --------------------------------------------------------------------------
  // فتح مودال الإضافة / التعديل
  // --------------------------------------------------------------------------

  const openAddModal = () => {
    setBomForm(EMPTY_BOM_FORM);
    setShowFormModal(true);
  };

  const openEditModal = (row: BomRow) => {
    setBomForm({
      id: row.id,
      material_id: row.material_id,
      quantity_required: String(row.quantity_required),
      notes: row.notes ?? '',
    });
    setShowFormModal(true);
  };

  // --------------------------------------------------------------------------
  // حفظ صف BOM (إضافة / تعديل)
  // --------------------------------------------------------------------------

  const handleSaveBomRow = async () => {
    if (!tenantId || !selectedProductId) return;

    if (!bomForm.material_id) {
      showBanner('error', 'الرجاء اختيار الخامة');
      return;
    }

    const quantity = Number(bomForm.quantity_required);
    if (Number.isNaN(quantity) || quantity <= 0) {
      showBanner('error', 'الرجاء إدخال كمية صحيحة أكبر من صفر');
      return;
    }

    setIsSavingBom(true);

    if (bomForm.id) {
      const { error } = await supabase
        .from('product_bom')
        .update({
          material_id: bomForm.material_id,
          quantity_required: quantity,
          notes: bomForm.notes.trim() || null,
        })
        .eq('id', bomForm.id)
        .eq('tenant_id', tenantId);

      if (error) {
        showBanner(
          'error',
          error.code === '23505' ? 'هذه الخامة مضافة بالفعل لمعادلة هذا المنتج' : 'تعذر تحديث بيانات المعادلة'
        );
        setIsSavingBom(false);
        return;
      }
      showBanner('success', 'تم تحديث معادلة التصنيع بنجاح');
    } else {
      const { error } = await supabase.from('product_bom').insert({
        tenant_id: tenantId,
        product_id: selectedProductId,
        material_id: bomForm.material_id,
        quantity_required: quantity,
        notes: bomForm.notes.trim() || null,
      });

      if (error) {
        showBanner(
          'error',
          error.code === '23505' ? 'هذه الخامة مضافة بالفعل لمعادلة هذا المنتج' : 'تعذر إضافة الخامة للمعادلة'
        );
        setIsSavingBom(false);
        return;
      }
      showBanner('success', 'تمت إضافة الخامة إلى معادلة التصنيع');
    }

    setIsSavingBom(false);
    setShowFormModal(false);
    fetchBomForProduct();
  };

  // --------------------------------------------------------------------------
  // حذف صف BOM
  // --------------------------------------------------------------------------

  const handleDeleteBomRow = async () => {
    if (!rowToDelete || !tenantId) return;
    setIsDeleting(true);

    const { error } = await supabase
      .from('product_bom')
      .delete()
      .eq('id', rowToDelete.id)
      .eq('tenant_id', tenantId);

    if (error) {
      showBanner('error', 'تعذر حذف هذه الخامة من المعادلة');
      setIsDeleting(false);
      return;
    }

    showBanner('success', 'تم حذف الخامة من معادلة التصنيع');
    setIsDeleting(false);
    setRowToDelete(null);
    fetchBomForProduct();
  };

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
          <p className="text-sm">جارِ تجهيز شاشة معادلة التصنيع...</p>
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
            <Layers className="h-5.5 w-5.5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#F0EDE8]">معادلة التصنيع (BOM)</h1>
            <p className="text-sm text-[#F0EDE8]/50">تحديد الخامات المطلوبة لتصنيع وحدة واحدة من كل منتج</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 pt-6 md:grid-cols-[280px_1fr] md:px-10">
        {/* عمود اختيار المنتج */}
        <div className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: COLORS.card }}>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#F0EDE8]/30" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="ابحث عن منتج..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pr-9 pl-3 text-sm text-[#F0EDE8] placeholder:text-[#F0EDE8]/30 outline-none focus:border-amber-500/50"
            />
          </div>

          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Package className="h-8 w-8 text-[#F0EDE8]/20" />
              <p className="text-xs text-[#F0EDE8]/40">لا توجد منتجات مسجلة بعد</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProductId(product.id)}
                  className={cn(
                    'rounded-xl px-3 py-2.5 text-right text-sm transition',
                    product.id === selectedProductId
                      ? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30'
                      : 'text-[#F0EDE8]/70 hover:bg-white/5'
                  )}
                >
                  <p className="font-medium">{product.name}</p>
                  {product.sku && <p className="mt-0.5 text-xs text-[#F0EDE8]/40">{product.sku}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* عمود معادلة BOM للمنتج المختار */}
        <div className="flex flex-col gap-4">
          {!selectedProduct ? (
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 py-16 text-center"
              style={{ backgroundColor: COLORS.card }}
            >
              <Boxes className="h-10 w-10 text-[#F0EDE8]/20" />
              <p className="text-sm text-[#F0EDE8]/50">اختر منتجًا من القائمة لعرض أو تعديل معادلة تصنيعه</p>
            </div>
          ) : (
            <>
              {/* بطاقة ملخص المنتج */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: COLORS.card }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#F0EDE8]/50">عدد الخامات في المعادلة</span>
                    <Package className="h-4.5 w-4.5 text-[#F0EDE8]/30" />
                  </div>
                  <p className="mt-3 text-2xl font-bold text-[#F0EDE8]">{formatNumber(bomRows.length)}</p>
                </div>

                <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: COLORS.card }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#F0EDE8]/50">التكلفة التقديرية للوحدة الواحدة</span>
                    <Wallet className="h-4.5 w-4.5 text-emerald-400/60" />
                  </div>
                  <p className="mt-3 text-2xl font-bold text-emerald-400">{formatCurrency(estimatedUnitCost)} ج.م</p>
                </div>
              </div>

              {/* جدول معادلة BOM */}
              <div className="overflow-hidden rounded-2xl border border-white/5" style={{ backgroundColor: COLORS.card }}>
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                  <h2 className="text-sm font-semibold text-[#F0EDE8]">معادلة تصنيع: {selectedProduct.name}</h2>
                  <button
                    onClick={openAddModal}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-[#0D1B2A] transition hover:bg-amber-400"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة خامة للمعادلة
                  </button>
                </div>

                {isLoadingBom ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-14 text-[#F0EDE8]/50">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                    <p className="text-sm">جارِ تحميل المعادلة...</p>
                  </div>
                ) : bomRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                    <Layers className="h-9 w-9 text-[#F0EDE8]/20" />
                    <p className="text-sm text-[#F0EDE8]/50">
                      لا توجد خامات في معادلة هذا المنتج بعد، ابدأ بإضافة أول خامة
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-white/5 text-right text-xs text-[#F0EDE8]/40">
                          <th className="px-5 py-3.5 font-medium">الخامة</th>
                          <th className="px-5 py-3.5 font-medium">الكمية اللازمة للوحدة</th>
                          <th className="px-5 py-3.5 font-medium">تكلفة الخامة بالوحدة</th>
                          <th className="px-5 py-3.5 font-medium">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bomRows.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-white/[0.03] transition hover:bg-white/[0.02] last:border-0"
                          >
                            <td className="px-5 py-4">
                              <p className="font-medium text-[#F0EDE8]">{row.raw_materials.name}</p>
                              {row.notes && <p className="mt-0.5 text-xs text-[#F0EDE8]/40">{row.notes}</p>}
                            </td>
                            <td className="px-5 py-4">
                              <span className="font-semibold text-[#F0EDE8]">{formatNumber(row.quantity_required)}</span>
                              <span className="mr-1 text-xs text-[#F0EDE8]/40">{row.raw_materials.unit}</span>
                            </td>
                            <td className="px-5 py-4 text-[#F0EDE8]/70">
                              {formatCurrency(row.quantity_required * row.raw_materials.unit_cost)} ج.م
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1">
                                <button
                                  title="تعديل"
                                  onClick={() => openEditModal(row)}
                                  className="rounded-lg p-2 text-[#F0EDE8]/60 transition hover:bg-white/10 hover:text-[#F0EDE8]"
                                >
                                  <Pencil className="h-4.5 w-4.5" />
                                </button>
                                <button
                                  title="حذف"
                                  onClick={() => setRowToDelete(row)}
                                  className="rounded-lg p-2 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400"
                                >
                                  <Trash2 className="h-4.5 w-4.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ====================================================================== */}
      {/* مودال إضافة / تعديل خامة في المعادلة */}
      {/* ====================================================================== */}
      {showFormModal && (
        <ModalShell
          title={bomForm.id ? 'تعديل خامة في المعادلة' : 'إضافة خامة إلى المعادلة'}
          onClose={() => !isSavingBom && setShowFormModal(false)}
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs text-[#F0EDE8]/50">الخامة</label>
              <select
                value={bomForm.material_id}
                onChange={(e) => setBomForm((f) => ({ ...f, material_id: e.target.value }))}
                disabled={!!bomForm.id}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50 disabled:opacity-50"
              >
                <option value="">اختر الخامة...</option>
                {availableMaterialsForNewRow.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </select>
              {bomForm.id && (
                <p className="mt-1.5 text-xs text-[#F0EDE8]/40">
                  لتغيير الخامة نفسها، احذف هذا الصف وأضف خامة جديدة بدلاً منه.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-[#F0EDE8]/50">الكمية اللازمة لتصنيع وحدة واحدة</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={bomForm.quantity_required}
                onChange={(e) => setBomForm((f) => ({ ...f, quantity_required: e.target.value }))}
                placeholder="0.000"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-[#F0EDE8]/50">ملاحظات (اختياري)</label>
              <textarea
                value={bomForm.notes}
                onChange={(e) => setBomForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[#F0EDE8] outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="mt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowFormModal(false)}
                disabled={isSavingBom}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-[#F0EDE8]/60 transition hover:bg-white/5 disabled:opacity-40"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveBomRow}
                disabled={isSavingBom}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-[#0D1B2A] transition hover:bg-amber-400 disabled:opacity-60"
              >
                {isSavingBom && <Loader2 className="h-4 w-4 animate-spin" />}
                {bomForm.id ? 'حفظ التعديلات' : 'إضافة إلى المعادلة'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ====================================================================== */}
      {/* مودال تأكيد الحذف */}
      {/* ====================================================================== */}
      {rowToDelete && (
        <ModalShell title="تأكيد الحذف من المعادلة" onClose={() => !isDeleting && setRowToDelete(null)} maxWidth="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/30">
              <Trash2 className="h-6 w-6 text-red-400" />
            </div>
            <p className="text-sm text-[#F0EDE8]/70">
              هل أنت متأكد من حذف
              <span className="mx-1 font-bold text-[#F0EDE8]">"{rowToDelete.raw_materials.name}"</span>
              من معادلة تصنيع هذا المنتج؟
            </p>

            <div className="mt-2 flex w-full items-center justify-center gap-3">
              <button
                onClick={() => setRowToDelete(null)}
                disabled={isDeleting}
                className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-[#F0EDE8]/70 transition hover:bg-white/5 disabled:opacity-40"
              >
                تراجع
              </button>
              <button
                onClick={handleDeleteBomRow}
                disabled={isDeleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                نعم، احذف
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
