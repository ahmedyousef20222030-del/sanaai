import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════
// 🛠️ Common Validators (المحققات العامة)
// ═══════════════════════════════════════════════════════════════
export const uuidSchema = z.string().uuid('تنسيق UUID غير صحيح')
export const emailSchema = z.string().email('بريد إلكتروني غير صحيح')
export const phoneSchema = z.string().regex(/^[\d\s\-\+\(\)]+$/, 'رقم هاتف غير صحيح')

// Pagination (التنقل بين الصفحات)
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1).optional(),
  limit: z.number().int().min(1).max(100).default(50).optional(),
  offset: z.number().int().min(0).optional(),
})

// ═══════════════════════════════════════════════════════════════
// 📦 Orders (الطلبات) - متوافق مع v1.1
// ═══════════════════════════════════════════════════════════════
export const createOrderSchema = z.object({
  order_number: z.string().min(1, 'رقم الطلب مطلوب').max(50),
  client_id: uuidSchema,
  total_price: z.number().positive('إجمالي السعر يجب أن يكون موجباً'), // ✅ تصحيح
  deposit_paid: z.number().nonnegative('العربون لا يمكن أن يكون سالباً').optional(), // ✅ تصحيح
  expected_delivery: z.string().optional(), // يتم التحقق منه كـ Date في الواجهة
  notes: z.string().max(1000).optional(),
  sector: z.enum(['مدارس','مطاعم وفنادق','شركات كوربوريت','حكومي','أفراد','أخرى']), // ✅ إضافة التحقق
})

export const updateOrderSchema = createOrderSchema.partial()

export const updateOrderStatusSchema = z.object({
  status: z.enum(['جديد', 'تحت الإنتاج', 'فحص الجودة', 'جاهز للشحن', 'تم التسليم', 'مغلق']),
  notes: z.string().optional(),
})

// ═══════════════════════════════════════════════════════════════
// 🏢 Clients (العملاء) - متوافق مع v1.1
// ═══════════════════════════════════════════════════════════════
export const createClientSchema = z.object({
  name: z.string().min(1, 'اسم العميل مطلوب').max(200),
  email: emailSchema.optional(),
  phone: phoneSchema,
  sector: z.enum(['مدارس','مطاعم وفنادق','شركات كوربوريت','حكومي','أفراد','أخرى']), // ✅ تحويل إلى Enum
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(), // ✅ إضافة المدينة
})

export const updateClientSchema = createClientSchema.partial()

// ═══════════════════════════════════════════════════════════════
// ⚙️ Production (الإنتاج) - متوافق مع v1.1
// ═══════════════════════════════════════════════════════════════
export const updateProductionStageSchema = z.object({
  stage: z.enum([
    'stage_design', 
    'stage_cut', 
    'stage_sew', 
    'stage_print', 
    'stage_pack'
  ]), // ✅ مسميات السكيما v1.1
  value: z.enum(['pending', 'in_progress', 'done']), // ✅ قيم السكيما v1.1
  notes: z.string().optional(),
})

// ═══════════════════════════════════════════════════════════════
// 📎 File Upload (رفع الملفات)
// ═══════════════════════════════════════════════════════════════
export const fileUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive().max(10 * 1024 * 1024), // 10MB max
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'application/zip']),
})

// ═══════════════════════════════════════════════════════════════
// 🛠️ Helper Functions
// ═══════════════════════════════════════════════════════════════
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data)
}

export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown) {
  const result = schema.safeParse(data)
  return {
    success: result.success,
    data: result.success ? result.data : null,
    errors: !result.success
      ? Object.fromEntries(
          result.error.issues.map((issue) => [
            issue.path.join('.') || 'root',
            issue.message,
          ]),
        )
      : {},
  }
}