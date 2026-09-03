-- ════════════════════════════════════════════════════════════════════════
-- Migration: مسميات وظيفية حرة + مستويات صلاحية دقيقة لكل صفحة
--
-- ينفّذ البندين:
--   6) إضافة وظائف/مسميات وظيفية حرة عند إضافة موظف أو مستخدم (job_title)
--   7) صلاحيات أكثر مرونة لكل صفحة: بدون وصول / قراءة فقط / تعديل / تعديل وحذف
--      (page_permissions بدل allowed_pages + الأعمدة البوليانية الخمسة)
--
-- شغّل هذا الملف مرة واحدة على قاعدة بيانات Supabase (SQL Editor أو migration).
-- ════════════════════════════════════════════════════════════════════════

-- 1) أعمدة جديدة على users ---------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS page_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.job_title IS
  'مسمى وظيفي حر يكتبه صاحب المصنع أو من معه صلاحية (مثال: مصمم أفلام تطريز، فنى تطريز، مصمم جرافيك، سنجر، أوفر، مقص دار، أورليه، أو أي وظيفة أخرى). عرضي فقط ولا يتحكم في أي صلاحية.';
COMMENT ON COLUMN public.users.page_permissions IS
  'خريطة { "<page_key>": "view" | "edit" | "edit_delete" } — مستوى صلاحية المستخدم في كل صفحة من صفحات لوحة التحكم على حدة. غياب المفتاح = ممنوع الدخول للصفحة أصلاً.';

-- 2) ترحيل البيانات القديمة (allowed_pages[] + الأعمدة البوليانية) إلى page_permissions
--    - أي صفحة كانت موجودة في allowed_pages تتحول لمستوى "view" افتراضيًا
--    - لو كان فيه صلاحية تعديل مرتبطة (can_edit_orders/can_edit_production/can_manage_sales/can_manage_users)
--      بترفع المستوى لـ "edit" على الصفحة المناظرة
UPDATE public.users u
SET page_permissions = (
  SELECT COALESCE(
    jsonb_object_agg(
      page_key,
      CASE
        WHEN page_key = '/dashboard/orders'      AND u.can_edit_orders     THEN 'edit'
        WHEN page_key = '/dashboard/production'  AND u.can_edit_production THEN 'edit'
        WHEN page_key = '/dashboard/clients'     AND u.can_manage_sales    THEN 'edit'
        WHEN page_key = '/dashboard/permissions' AND u.can_manage_users    THEN 'edit'
        ELSE 'view'
      END
    ),
    '{}'::jsonb
  )
  FROM unnest(u.allowed_pages) AS page_key
)
WHERE u.allowed_pages IS NOT NULL
  AND array_length(u.allowed_pages, 1) > 0
  AND u.page_permissions = '{}'::jsonb; -- ما يلمّسش صفوف اتعدّلت يدويًا بالفعل بعد النشر

-- ملحوظة: owner ماله عمود page_permissions مهم أصلاً — كوده في التطبيق
-- (derivePermissions و canAccessPageKey) بيدّيله كل الصفحات بأعلى صلاحية دايمًا.

-- 3) عمود job_title على جدول employees (سجلات العمال البسيطة بدون تسجيل دخول) --
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS job_title text;

COMMENT ON COLUMN public.employees.job_title IS
  'الوظيفة الفعلية للعامل (مثال: سنجر، أوفر، مقص دار، أورليه...). حر تمامًا، بديل أدق من عمود role العام.';

-- 4) (اختياري — نفّذها بس بعد التأكد إن كل شيء شغال بالنظام الجديد على الإنتاج)
--    حذف الأعمدة القديمة اللي بقت غير مستخدمة في الكود:
-- ALTER TABLE public.users DROP COLUMN allowed_pages;
-- ALTER TABLE public.users DROP COLUMN can_edit_production;
-- ALTER TABLE public.users DROP COLUMN can_edit_orders;
-- ALTER TABLE public.users DROP COLUMN can_manage_sales;
-- ALTER TABLE public.users DROP COLUMN can_manage_users;
-- ALTER TABLE public.users DROP COLUMN can_view_clients;
