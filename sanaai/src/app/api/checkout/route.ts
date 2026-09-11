import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js'; // أو استيراد عميل Supabase الخاص بمشروعك

// تهيئة عميل Supabase (يُفضل استخدام متغيرات البيئة السرية للخادم)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // مفتاح الخدمة الخاص بالسيرفر فقط للأمان العالي
);

export async function POST(request: Request) {
    try {
        // 1. استقبال وتجهيز البيانات المرسلة من المستخدم
        const body = await request.json();
        const { planId, userProvidedPrice } = body;

        // التحقق من وجود المدخلات الأساسية
        if (!planId || userProvidedPrice === undefined) {
            return NextResponse.json(
                { error: "Bad Request: Missing required fields (planId or price)." },
                { status: 400 }
            );
        }

        // 2. التحقق من جهة الخادم: جلب السعر الحقيقي والصحيح من قاعدة البيانات
        const { data: planData, error: dbError } = await supabase
            .from('plans') // اسم جدول الخطط في قاعدة البيانات لديك
            .select('price, is_active')
            .eq('id', planId)
            .single();

        if (dbError || !planData) {
            return NextResponse.json(
                { error: "Not Found: The specified plan does not exist." },
                { status: 404 }
            );
        }

        // التأكد من أن الخطة مفعلة وليست متوقفة
        if (!planData.is_active) {
            return NextResponse.json(
                { error: "Forbidden: This plan is currently inactive." },
                { status: 403 }
            );
        }

        // 3. مقارنة السعر المُرسل من العميل بالسعر الحقيقي في قاعدة البيانات (Core Server-side Validation)
        if (Number(userProvidedPrice) !== Number(planData.price)) {
            return NextResponse.json(
                { error: "Forbidden: Price mismatch detected. Tampering is not allowed." },
                { status: 403 }
            );
        }

        // 4. إذا نجح كل شيء، يتم إتمام الطلب أو الدفع بأمان تام
        // يمكنك هنا إضافة منطق حفظ الطلب في قاعدة البيانات أو إنشاء جلسة دفع (Stripe/Fatora)

        return NextResponse.json(
            { 
                success: true, 
                message: "Validation passed successfully.", 
                chargedPrice: planData.price 
            },
            { status: 200 }
        );

    } catch (error) {
        // معالجة أي خطأ غير متوقع في الخادم
        console.error("Server-side validation error:", error);
        return NextResponse.json(
            { error: "Internal Server Error." },
            { status: 500 }
        );
    }
}