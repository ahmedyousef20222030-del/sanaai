export type PageAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete'

export interface SystemPage {
  id: string
  label: string
  icon: string
  path: string
  section: string
  ownerOnly?: boolean      // الصفحة دي محجوبة تمامًا عن أي حد غير الـ owner (زي الإعدادات)
  alwaysVisible?: boolean  // ظاهرة لأي مستخدم مسجل دخول، بدون التحقق من صلاحية (زي لوحة التحكم الرئيسية)
}

// ── كل صفحات النظام، بالترتيب اللي هيظهروا بيه في القائمة الجانبية ──
export const SYSTEM_PAGES: SystemPage[] = [
  { id: 'dashboard',   label: 'لوحة التحكم',       icon: '🏠', path: '/dashboard',             section: 'الرئيسية', alwaysVisible: true },

  { id: 'orders',      label: 'الطلبات',           icon: '📦', path: '/dashboard/orders',      section: 'المبيعات' },
  { id: 'orders_new',  label: 'طلب جديد',          icon: '➕', path: '/dashboard/orders/new',  section: 'المبيعات' },
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

// ── الصفحات اللي ممكن الـ owner يعيّن صلاحيات عليها لمستخدم تاني ──
// (بنستبعد لوحة التحكم لأنها ظاهرة دايمًا، والإعدادات لأنها owner فقط ولا تُعيَّن)
export const ASSIGNABLE_PAGES: SystemPage[] = SYSTEM_PAGES.filter(
  p => !p.alwaysVisible && !p.ownerOnly
)

// ── أسماء الأقسام بالترتيب، مبنية تلقائيًا من ASSIGNABLE_PAGES فعليًا ──
export const PAGE_SECTIONS: string[] = Array.from(
  new Set(ASSIGNABLE_PAGES.map(p => p.section))
)

// ── إيجاد الصفحة