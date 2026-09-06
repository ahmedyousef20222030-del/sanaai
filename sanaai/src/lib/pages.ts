// ── تعريف موحّد لكل صفحات لوحة التحكم ──
// أي صفحة جديدة تضيفها للنظام سجّلها هنا عشان: (1) تظهر في شاشة الصلاحيات كخيار،
// و(2) تتحمي تلقائيًا في layout.tsx. الصفحة اللي معندهاش تسجيل هنا بتفضل ظاهرة للكل
// (زي لوحة التحكم الرئيسية) إلا لو معمول لها استثناء يدوي زي "الإعدادات".

export type PageKey =
  | '/dashboard/orders'
  | '/dashboard/clients'
  | '/dashboard/pipeline'
  | '/dashboard/production'
  | '/dashboard/production/targets'
  | '/dashboard/quality'
  | '/dashboard/inventory'
  | '/dashboard/showroom'
  | '/dashboard/restock-decisions'
  | '/dashboard/suppliers'
  | '/dashboard/procurement'
  | '/dashboard/shipping'
  | '/dashboard/branches'
  | '/dashboard/invoices'
  | '/dashboard/employees'
  | '/dashboard/complaints'
  | '/dashboard/permissions'
  | '/dashboard/changelog'

export type PageDef = {
  key: PageKey
  label: string
  icon: string
  section: string
}

// كل الصفحات القابلة لمنح/سحب صلاحية عرضها لكل مستخدم على حدة
// (الترتيب هنا = ترتيب ظهور الأقسام والعناصر في القائمة الجانبية)
export const PAGE_LIST: PageDef[] = [
  { key: '/dashboard/orders',            label: 'الطلبات',           icon: '📦', section: 'العملاء والطلبات' },
  { key: '/dashboard/clients',           label: 'العملاء',           icon: '🏢', section: 'العملاء والطلبات' },

  { key: '/dashboard/pipeline',          label: 'تتبع مراحل الطلبات', icon: '🔄', section: 'الإنتاج' },
  { key: '/dashboard/production',        label: ' المكن وخطوط الإنتاج', icon: '🏭', section: 'الإنتاج' },
  { key: '/dashboard/quality',           label: 'الجودة',            icon: '🔍', section: 'الإنتاج' },

  { key: '/dashboard/inventory',         label: 'المخزون',           icon: '📦', section: 'المخازن والتوريد' },
  { key: '/dashboard/showroom',          label: 'المعروض على الرف',  icon: '🏪', section: 'المخازن والتوريد' },
  { key: '/dashboard/restock-decisions', label: 'قرارات التوريد',    icon: '⚖️', section: 'المخازن والتوريد' },
  { key: '/dashboard/suppliers',         label: 'الموردين',          icon: '🤝', section: 'المخازن والتوريد' },
  { key: '/dashboard/procurement',       label: 'المشتريات',         icon: '🛒', section: 'المخازن والتوريد' },

  { key: '/dashboard/shipping',          label: 'الشحن',             icon: '🚚', section: 'الشحن والفروع' },
  { key: '/dashboard/branches',          label: 'الفروع والمعارض',   icon: '🏬', section: 'الشحن والفروع' },
  { key: '/dashboard/invoices',          label: 'الفواتير',          icon: '🧾', section: 'الشحن والفروع' },

  { key: '/dashboard/employees',         label: 'الموظفين',          icon: '👥', section: 'الإدارة' },
  { key: '/dashboard/complaints',        label: 'الشكاوى',           icon: '📢', section: 'الإدارة' },
  { key: '/dashboard/permissions',       label: 'الصلاحيات',         icon: '🔑', section: 'الإدارة' },
  { key: '/dashboard/production/targets', label: 'تارجت الإنتاج',   icon: '🎯', section: 'الإدارة' },
  { key: '/dashboard/changelog',         label: 'سجل التغييرات',     icon: '📋', section: 'الإدارة' },
]

// صفحات خاصة خارج نظام page_permissions
export const HOME_PATH = '/dashboard'               // ظاهرة للكل دايمًا، مش قابلة للسحب
export const SETTINGS_PATH = '/dashboard/settings'  // للـ owner فقط دايمًا، مش قابلة للمنح لغيره
export const MY_PERFORMANCE_PATH = '/dashboard/my-performance'  // ظاهرة للكل، بلا صلاحية

// روابط إضافية بتتبع نفس صلاحية صفحة أساسية (مش صفحة منفصلة بالمنطق، بس مسار مختلف)
export const EXTRA_NAV_LINKS: { after: PageKey; label: string; icon: string; path: string }[] = [
  { after: '/dashboard/production', label: 'تجميع التطريز', icon: '🧵', path: '/dashboard/production/embroidery' },
  { after: '/dashboard/production', label: 'تجميع الطباعة', icon: '🖨️', path: '/dashboard/production/printing' },
]

// ═══════════════════════════════════════════════════════════════
// مستويات الصلاحية لكل صفحة على حدة (بدل صلاحية "عرض" بوليانية واحدة).
// غياب الصفحة من الخريطة = ممنوع الدخول لها أصلاً.
//   view        → 👁️ قراءة فقط (يشوف الصفحة، مفيش أفعال تعديل/حذف)
//   edit        → ✏️ يقدر يضيف/يعدّل جوه الصفحة
//   edit_delete → 🗑️ يقدر يضيف/يعدّل/يحذف جوه الصفحة
//
// ملاحظة مهمة: المستوى ده بيتحكم في عرض/إخفاء الصفحة والأزرار في الواجهة بس.
// صلاحيات الأفعال الحساسة على مستوى الـ API (زي can_edit_production،
// can_edit_orders...) لسه منفصلة تماماً وبتتفحص على السيرفر في src/lib/server/auth.ts
// - محدش يلمسها لحد ما نراجعها في مرحلة منفصلة.
// ═══════════════════════════════════════════════════════════════
export type PermissionLevel = 'view' | 'edit' | 'edit_delete'

export type PagePermissions = Partial<Record<PageKey, PermissionLevel>>

export const PERMISSION_LEVEL_ORDER: PermissionLevel[] = ['view', 'edit', 'edit_delete']

export const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  view: '👁️ قراءة فقط',
  edit: '✏️ تعديل',
  edit_delete: '🗑️ تعديل وحذف',
}

// هل المستوى الممنوح يغطي على الأقل الحد الأدنى المطلوب؟
export function levelAtLeast(level: PermissionLevel | null | undefined, min: PermissionLevel): boolean {
  if (!level) return false
  return PERMISSION_LEVEL_ORDER.indexOf(level) >= PERMISSION_LEVEL_ORDER.indexOf(min)
}

// هل المستخدم يقدر يشوف الصفحة دي؟ (owner يشوف كل حاجة دايمًا بأعلى صلاحية)
export function canAccessPageKey(
  pageKey: PageKey,
  isOwner: boolean,
  pagePermissions: PagePermissions | null | undefined
): boolean {
  if (isOwner) return true
  return !!pagePermissions?.[pageKey]
}

// إرجاع مستوى صلاحية المستخدم الفعلي على صفحة معيّنة (owner = أعلى صلاحية دايمًا)
export function getPageLevel(
  pageKey: PageKey,
  isOwner: boolean,
  pagePermissions: PagePermissions | null | undefined
): PermissionLevel | null {
  if (isOwner) return 'edit_delete'
  return pagePermissions?.[pageKey] ?? null
}

// تحديد أنهي PageKey مسؤول عن مسار معيّن (بيغطي الصفحات الفرعية زي orders/[id])
//
// ملاحظة مهمة: لازم ناخد أطول/أدق تطابق، مش أول تطابق بالترتيب في PAGE_LIST.
// لو دورنا على أول تطابق بس، مسار زي '/dashboard/production/targets' كان
// هيتلقط غلط تحت '/dashboard/production' (لأنها أسبق في المصفوفة وبتعمل
// startsWith('/dashboard/production/') بنجاح)، مع إن فيه تسجيل مخصّص وأدق
// ليها. الحل: نختار من بين كل الصفحات المتطابقة أطول key (أكتر تحديدًا).
export function matchPageKeyForPath(pathname: string): PageKey | null {
  const matches = PAGE_LIST.filter(p => pathname === p.key || pathname.startsWith(p.key + '/'))
  if (matches.length === 0) return null
  const best = matches.reduce((longest, current) =>
    current.key.length > longest.key.length ? current : longest
  )
  return best.key
}