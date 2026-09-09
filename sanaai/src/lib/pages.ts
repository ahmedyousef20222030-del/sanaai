// ============================================================================
// نظام "صَنَاعي" (Sanaai ERP) — إدارة الصفحات والصلاحيات
// المسار: src/lib/pages.ts
// ============================================================================

export type PagePermissions = {
  orders?: boolean
  invoices?: boolean
  clients?: boolean
  complaints?: boolean
  production?: boolean
  machines?: boolean
  quality?: boolean
  targets?: boolean
  materials?: boolean       // 🧵 صلاحية مخزن الخامات
  inventory?: boolean
  suppliers?: boolean
  shipping?: boolean
  showroom?: boolean
  employees?: boolean
  branches?: boolean
  changelog?: boolean
  [key: string]: boolean | undefined
}

export type PageItem = {
  key: string
  label: string
  icon: string
  section: string
}

export type ExtraNavLink = {
  label: string
  icon: string
  path: string
  after: string
}

export const HOME_PATH = '/dashboard'
export const SETTINGS_PATH = '/dashboard/settings'
export const MY_PERFORMANCE_PATH = '/dashboard/my-performance'

// ── مصفوفة الصفحات الرئيسية للوحة التحكم ──
export const PAGE_LIST: PageItem[] = [
  // ── العملاء والطلبات ──
  {
    key: '/dashboard/orders',
    label: 'الطلبات',
    icon: '📦',
    section: 'العملاء والطلبات',
  },
  {
    key: '/dashboard/invoices',
    label: 'الفواتير',
    icon: '🧾',
    section: 'العملاء والطلبات',
  },
  {
    key: '/dashboard/clients',
    label: 'العملاء',
    icon: '👥',
    section: 'العملاء والطلبات',
  },
  {
    key: '/dashboard/complaints',
    label: 'الشكاوى',
    icon: '📢',
    section: 'العملاء والطلبات',
  },

  // ── الإنتاج والتصنيع ──
  {
    key: '/dashboard/pipeline',
    label: 'تتبع مراحل الطلبات',
    icon: '🔄',
    section: 'الإنتاج',
  },
  {
    key: '/dashboard/production',
    label: 'المكن وخطوط الإنتاج',
    icon: '🏭',
    section: 'الإنتاج',
  },
  {
    key: '/dashboard/inventory/materials',
    label: 'مخزن الخامات',
    icon: '🧵',
    section: 'الإنتاج',
  },
  {
    key: '/dashboard/quality',
    label: 'الجودة',
    icon: '🔍',
    section: 'الإنتاج',
  },
  {
    key: '/dashboard/production-targets',
    label: 'تارجت الإنتاج',
    icon: '🎯',
    section: 'الإنتاج',
  },

  // ── المخازن والتوريد ──
  {
    key: '/dashboard/inventory',
    label: 'المخزون العام',
    icon: '📦',
    section: 'المخازن والتوريد',
  },
  {
    key: '/dashboard/suppliers',
    label: 'الموردين',
    icon: '🚚',
    section: 'المخازن والتوريد',
  },
  {
    key: '/dashboard/restock-decisions',
    label: 'قرارات التوريد',
    icon: '📋',
    section: 'المخازن والتوريد',
  },

  // ── المبيعات والشحن ──
  {
    key: '/dashboard/shipping',
    label: 'الشحن والتسليم',
    icon: '🚛',
    section: 'المبيعات والشحن',
  },
  {
    key: '/dashboard/showroom',
    label: 'معرض المنتجات',
    icon: '🏬',
    section: 'المبيعات والشحن',
  },

  // ── الموارد البشرية والفروع ──
  {
    key: '/dashboard/employees',
    label: 'الموظفين',
    icon: '👔',
    section: 'الموارد البشرية',
  },
  {
    key: '/dashboard/branches',
    label: 'الفروع',
    icon: '🏢',
    section: 'الموارد البشرية',
  },
  {
    key: '/dashboard/changelog',
    label: 'سجل التحديثات',
    icon: '📝',
    section: 'الموارد البشرية',
  },
]

// ── الروابط الإضافية المتفرعة ──
export const EXTRA_NAV_LINKS: ExtraNavLink[] = []

// ── خريطة ربط المسارات بمفاتيح الصلاحيات ──
const PATH_TO_PERMISSION_KEY: Record<string, keyof PagePermissions> = {
  '/dashboard/orders': 'orders',
  '/dashboard/invoices': 'invoices',
  '/dashboard/clients': 'clients',
  '/dashboard/complaints': 'complaints',
  '/dashboard/pipeline': 'production',
  '/dashboard/production': 'machines',
  '/dashboard/inventory/materials': 'materials',
  '/dashboard/quality': 'quality',
  '/dashboard/production-targets': 'targets',
  '/dashboard/inventory': 'inventory',
  '/dashboard/suppliers': 'suppliers',
  '/dashboard/restock-decisions': 'inventory',
  '/dashboard/shipping': 'shipping',
  '/dashboard/showroom': 'showroom',
  '/dashboard/employees': 'employees',
  '/dashboard/branches': 'branches',
  '/dashboard/changelog': 'changelog',
}

// ── التحقق من إمكانية وصول المستخدم للصفحة ──
export function canAccessPageKey(
  pathOrKey: string,
  isOwner: boolean,
  permissions: PagePermissions | null
): boolean {
  if (isOwner) return true
  if (!permissions) return false

  const permKey = PATH_TO_PERMISSION_KEY[pathOrKey] || (pathOrKey as keyof PagePermissions)
  return Boolean(permissions[permKey])
}

// ── مطابقة مسار الـ URL الحالي مع المسار المسجل في النظام ──
export function matchPageKeyForPath(pathname: string): string | null {
  // مطابقة مسار الخامات واعتماد خامات الطلب
  if (pathname.startsWith('/dashboard/inventory/materials')) {
    return '/dashboard/inventory/materials'
  }
  if (pathname.startsWith('/dashboard/orders/') && pathname.includes('/materials')) {
    return '/dashboard/inventory/materials'
  }

  // مطابقة بقية المسارات الفرعية
  for (const page of PAGE_LIST) {
    if (pathname === page.key || pathname.startsWith(page.key + '/')) {
      return page.key
    }
  }

  return null
}