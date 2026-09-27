import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// خريطة معدل الطلبات (Rate Limiting)
const rateLimitMap = new Map<string, { count: number; lastReset: number }>()

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1) حماية مسارات الـ API (Rate Limiting)
  if (pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1'
    const windowMs = 15 * 60 * 1000
    const maxRequests = 100
    const now = Date.now()
    const clientData = rateLimitMap.get(ip)

    if (!clientData) {
      rateLimitMap.set(ip, { count: 1, lastReset: now })
    } else if (now - clientData.lastReset > windowMs) {
      clientData.count = 1
      clientData.lastReset = now
    } else {
      clientData.count++
      if (clientData.count > maxRequests) {
        return NextResponse.json(
          { error: 'Too many requests, please try again later.' },
          { status: 429 },
        )
      }
    }
  }

  // 2) response أساسي هنكتب فيه أي كوكيز متجددة
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // استدعاء getUser() (مش getSession) لأنه بيتحقق فعلياً مع سيرفر Supabase
  // وبيعمل refresh للتوكن تلقائياً لو قرب ينتهي
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtected =
    pathname.startsWith('/dashboard') || pathname.startsWith('/admin')

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // اختياري: لو المستخدم مسجّل دخول بالفعل ويحاول يفتح صفحة اللوجين
  if (pathname === '/auth/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/admin/:path*', '/auth/login'],
}