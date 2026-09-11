import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// خريطة لتخزين معدل الطلبات (Rate Limiting)
const rateLimitMap = new Map<string, { count: number, lastReset: number }>();

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. تطبيق الحماية على مسارات الـ API (Rate Limiting)
    if (pathname.startsWith('/api/')) {
        const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
        const windowMs = 15 * 60 * 1000; // 15 دقيقة
        const maxRequests = 100;

        const now = Date.now();
        const clientData = rateLimitMap.get(ip);

        if (!clientData) {
            rateLimitMap.set(ip, { count: 1, lastReset: now });
        } else {
            if (now - clientData.lastReset > windowMs) {
                clientData.count = 1;
                clientData.lastReset = now;
            } else {
                clientData.count++;
                if (clientData.count > maxRequests) {
                    return NextResponse.json(
                        { error: "Too many requests, please try again later." },
                        { status: 429 }
                    );
                }
            }
        }
    }

    // 2. تطبيق الحماية والتحقق من المصادقة على صفحات لوحة التحكم (Authentication Check)
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
        // البحث عن الـ Token أو ملف تعريف الدخول في الكوكيز (Cookies)
        const authToken = request.cookies.get('sb-access-token') || request.cookies.get('next-auth.session-token');

        // إذا لم يكن المستخدم مسجلاً للدخول، يتم توجيهه مباشرة إلى صفحة تسجيل الدخول
        if (!authToken) {
            const loginUrl = new URL('/auth/login', request.url);
            return NextResponse.redirect(loginUrl);
        }
    }

    return NextResponse.next();
}

// تحديد المسارات المستهدفة بالمراقبة
export const config = {
    matcher: ['/api/:path*', '/dashboard/:path*', '/admin/:path*'],
};