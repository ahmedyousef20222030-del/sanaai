export type PageAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete'

export interface SystemPage {
  id: string
  label: string
  icon: string
  path: string
  section: string
  ownerOnly?: boolean
  alwaysVisible?: boolean // ظاهرة لأي مستخدم مسجل دخول، بدون التحقق من صلاحية
}

export const SYSTEM_PAGES: SystemPage[] = [
  { id: 'dashboard',   label: 'لوحة التحكم',       icon: '🏠', path: '/dashboard',             section: 'الرئيسية', alwaysVisible: true },
  { id: 'orders',      label: 'الطلبات',           icon: '📦', path: '/dashboard/orders',      section: 'المبيعات' },
  { id: 'orders',      label: 'طلب جديد',          icon: '➕', path: '/dashboard/orders/new',  section: 'المبيعات' },
  { id: 'clients',     label: 'العملاء',           icon: '🏢', path: '/dashboard/clients',     section: 'المبيعات' },
  { id: 'pipeline',    label: 'خط الإنتاج',        icon: '🔄', path: '/dashboard/pipeline',    section: 'المبيعات' },
  { id: 'suppliers',   label: 'الموردين',          icon: '🤝', path: '/dashboard/suppliers',   section: 'التوريدات والمخازن' },
  { id: 'procurement', label: 'المشتريات',         icon: '🛒', path: '/dashboard/procurement', section: 'التوريدات والمخازن' },
  { id: 'inventory',   label: 'المخزون',           icon: '📦', path: '/dashboard/inventory',   section: 'التوريدات والمخازن' },
  { id: 'production',  label: 'الإنتاج',           icon: '⚙️', path: '/dashboard/production',  section: 'التشغيل' },
  { id: 'quality',     label: 'الجودة',            icon: '🔍', path: '/dashboard/quality',     section: 'التشغيل' },
  { id: 'showroom',    label: 'المعروض على الرف',  icon: '🏪', path: '/dashboard/showroom',    section: 'التشغيل' },
  { id: 'shipping',    label: 'الشحن',             icon: '🚚', path: '/dashboard/shipping',    section: 'التشغيل' },
  { id: 'invoices',    label: 'الفواتير',          icon: '🧾', path: '/dashboard/invoices',    section: 'التشغيل' },
  { id: 'employees',   label: 'الموظفين',          icon: '👥', path: '/dashboard/employees',   section: 'الإدارة' },
  { id: 'complaints',  label: 'الشكاوى',           icon: '📢', path: '/dashboard/complaints',  section: 'الإدارة' },
  { id: 'permissions', label: 'الصلاحيات',         icon: '🔑', path: '/dashboard/permissions', section: 'الإدارة' },
  { id: 'changelog',   label: 'سجل التغييرات',      icon: '📋', path: '/dashboard/changelog',   section: 'الإدارة' },
  { id: 'settings',    label: 'الإعدادات',          icon: '⚙️', path: '/dashboard/settings',    section: 'الإدارة', ownerOnly: true },
]

// أطول مسار مطابق أولاً، عشان /dashboard/orders/new تتطابق قبل /dashboard/orders
export function findPageByPath(pathname: string): SystemPage | undefined {
  const sorted = [...SYSTEM_PAGES].sort((a, b) => b.path.length - a.path.length)
  return sorted.find(p => pathname === p.path || pathname.startsWith(p.path + '/'))
}