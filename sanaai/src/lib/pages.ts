// ── تعريف موحّد لكل صفحات لوحة التحكم ──
// أي صفحة جديدة تضيفها للنظام سجّلها هنا عشان: (1) تظهر في شاشة الصلاحيات كخيار،
// و(2) تتحمي تلقائيًا في layout.tsx. الصفحة اللي معندهاش تسجيل هنا بتفضل ظاهرة للكل
// (زي لوحة التحكم الرئيسية) إلا لو معمول لها استثناء يدوي زي "الإعدادات".

export type PageKey =
  | '/dashboard/orders'
  | '/dashboard/clients'
  | '/dashboard/pipeline'
  | '/dashboard/suppliers'
  | '/dashboard/procurement'
  | '/dashboard/inventory'
  | '/dashboard/restock-decisions'
  | '/dashboard/production'
  | '/dashboard/quality'
  | '/dashboard/showroom'
  | '/dashboard/shipping'
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
export const PAGE_LIST: PageDef[] = [
  { key: '/dashboard/orders',      label: 'الطلبات',          icon: '📦', section: 'المبيعات' },
  { key: '/dashboard/clients',     label: 'العملاء',          icon: '🏢', section: 'المبيعات' },
  { key: '/dashboard/pipeline',    label: 'خط الإنتاج',       icon: '🔄', section: 'المبيعات' },
  { key: '/dashboard/suppliers',   label: 'الموردين',         icon: '🤝', section: 'التوريدات والمخازن' },
  { key: '/dashboard/procurement', label: 'المشتريات',        icon: '🛒', section: 'التوريدات والمخازن' },
  { key: '/dashboard/inventory',   label: 'المخزون',          icon: '📦', section: 'التوريدات والمخازن' },
  { key: '/dashboard/restock-decisions', label: 'قرارات التوريد', icon: '⚖️', section: 'التوريدات والمخازن' },
  { key: '/dashboard/production',  label: 'الإنتاج',          icon: '⚙️', section: 'التشغيل' },
  { key: '/dashboard/quality',     label: 'الجودة',           icon: '🔍', section: 'التشغيل' },
  { key: '/dashboard/showroom',    label: 'المعروض على الرف', icon: '🏪', section: 'التشغيل' },
  { key: '/dashboard/shipping',    label: 'الشحن',            icon: '🚚', section: 'التشغيل' },
  { key: '/dashboard/invoices',    label: 'الفواتير',         icon: '🧾', section: 'التشغيل' },
  { key: '/dashboard/employees',   label: 'الموظفين',         icon: '👥', section: 'الإدارة' },
  { key: '/dashboard/complaints',  label: 'الشكاوى',          icon: '📢', section: 'الإدارة' },
  { key: '/dashboard/permissions', label: 'الصلاحيات',        icon: '🔑', section: 'الإدارة' },
  { key: '/dashboard/changelog',   label: 'سجل التغييرات',    icon: '📋', section: 'الإدارة' },
]

// صفحات خاصة خارج نظام allowed_pages
export const HOME_PATH = '/dashboard'               // ظاهرة للكل دايمًا، مش قابلة للسحب
export const SETTINGS_PATH = '/dashboard/settings'  // للـ owner فقط دايمًا، مش قابلة للمنح لغيره

// روابط إضافية بتتبع نفس صلاحية صفحة أساسية (مش صفحة منفصلة بالمنطق، بس مسار مختلف)
export const EXTRA_NAV_LINKS: { after: PageKey; label: string; icon: string; path: string }[] = [
  { after: '/dashboard/orders', label: 'طلب جديد', icon: '➕', path: '/dashboard/orders/new' },
  { after: '/dashboard/production', label: 'تجميع التطريز', icon: '🧵', path: '/dashboard/production/embroidery' },
  { after: '/dashboard/production', label: 'تجميع الطباعة', icon: '🖨️', path: '/dashboard/production/printing' },
]

// هل المستخدم يقدر يشوف الصفحة دي؟
export function canAccessPageKey(
  pageKey: PageKey,
  isOwner: boolean,
  allowedPages: string[] | null | undefined
): boolean {
  if (isOwner) return true
  return !!allowedPages?.includes(pageKey)
}

// تحديد أنهي PageKey مسؤول عن مسار معيّن (بيغطي الصفحات الفرعية زي orders/[id])
export function matchPageKeyForPath(pathname: string): PageKey | null {
  const match = PAGE_LIST.find(p => pathname === p.key || pathname.startsWith(p.key + '/'))
  return match ? match.key : null
}