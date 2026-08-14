export type PageAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete'

export type PageDef = {
  id: string
  label: string
  path: string
  icon: string
  section: string
  ownerOnly?: boolean
}

// ⚠️ لازم يفضل متطابق مع system_pages في قاعدة البيانات
export const SYSTEM_PAGES: PageDef[] = [
  { id: 'orders',      label: 'الطلبات',          path: '/dashboard/orders',      icon: '📦', section: 'المبيعات' },
  { id: 'orders_new',  label: 'طلب جديد',        path: '/dashboard/orders/new',  icon: '➕', section: 'المبيعات' },
  { id: 'clients',     label: 'العملاء',          path: '/dashboard/clients',     icon: '🏢', section: 'المبيعات' },
  { id: 'pipeline',    label: 'خط الإنتاج',       path: '/dashboard/pipeline',    icon: '🔄', section: 'المبيعات' },
  { id: 'suppliers',   label: 'الموردين',         path: '/dashboard/suppliers',   icon: '🤝', section: 'التوريدات والمخازن' },
  { id: 'procurement', label: 'المشتريات',        path: '/dashboard/procurement', icon: '🛒', section: 'التوريدات والمخازن' },
  { id: 'inventory',   label: 'المخزون',          path: '/dashboard/inventory',   icon: '📦', section: 'التوريدات والمخازن' },
  { id: 'production',  label: 'الإنتاج',          path: '/dashboard/production',  icon: '⚙️', section: 'التشغيل' },
  { id: 'quality',     label: 'الجودة',           path: '/dashboard/quality',     icon: '🔍', section: 'التشغيل' },
  { id: 'showroom',    label: 'المعروض على الرف', path: '/dashboard/showroom',    icon: '🏪', section: 'التشغيل' },
  { id: 'shipping',    label: 'الشحن',            path: '/dashboard/shipping',    icon: '🚚', section: 'التشغيل' },
  { id: 'invoices',    label: 'الفواتير',         path: '/dashboard/invoices',    icon: '🧾', section: 'التشغيل' },
  { id: 'employees',   label: 'الموظفين',         path: '/dashboard/employees',   icon: '👥', section: 'الإدارة' },
  { id: 'complaints',  label: 'الشكاوى',          path: '/dashboard/complaints',  icon: '📢', section: 'الإدارة' },
  { id: 'permissions', label: 'الصلاحيات',        path: '/dashboard/permissions', icon: '🔑', section: 'الإدارة' },
  { id: 'changelog',   label: 'سجل التغييرات',    path: '/dashboard/changelog',   icon: '📋', section: 'الإدارة' },
  { id: 'settings',    label: 'الإعدادات',        path: '/dashboard/settings',    icon: '⚙️', section: 'الإدارة', ownerOnly: true },
]

// الصفحات القابلة للتفويض فقط (بتستبعد ownerOnly) — دي اللي بتظهر في شاشة توزيع الصلاحيات
export const ASSIGNABLE_PAGES = SYSTEM_PAGES.filter(p => !p.ownerOnly)

export const PAGE_SECTIONS = Array.from(new Set(SYSTEM_PAGES.map(p => p.section)))

// إيجاد الصفحة اللي المسار الحالي بيتبعها (بيدعم الصفحات الفرعية زي /dashboard/orders/123)
export function findPageByPath(pathname: string): PageDef | undefined {
  return SYSTEM_PAGES
    .filter(p => pathname === p.path || pathname.startsWith(p.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0]
}