import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'impersonation_state'

type ImpersonationState = {
  adminAccessToken: string
  adminRefreshToken: string
  logId: string
  targetName: string
}

export function getImpersonationState(): ImpersonationState | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function isImpersonating(): boolean {
  return !!getImpersonationState()
}

// ── يبدأ جلسة دخول كمستخدم آخر، بعد حفظ جلسة الـ admin الحالية أولاً ──
export async function startImpersonation(targetUserId: string): Promise<{ error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'يجب تسجيل الدخول أولاً' }

  const res = await fetch('/api/platform/impersonate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ targetUserId }),
  })
  const result = await res.json()
  if (!res.ok) return { error: result.error || 'تعذر بدء المعاينة' }

  // احفظ جلسة الـ admin الأصلية قبل التبديل
  const state: ImpersonationState = {
    adminAccessToken: session.access_token,
    adminRefreshToken: session.refresh_token,
    logId: result.logId,
    targetName: result.targetUser.full_name || result.targetUser.email,
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))

  // بدّل الجلسة الحالية لجلسة المستخدم المستهدف
  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: result.tokenHash,
    type: 'magiclink',
  })
  if (otpError) {
    sessionStorage.removeItem(STORAGE_KEY)
    return { error: 'تعذر تفعيل جلسة المستخدم: ' + otpError.message }
  }

  return {}
}

// ── يرجّع جلسة الـ admin الأصلية وينهي المعاينة ──
export async function endImpersonation(): Promise<{ error?: string }> {
  const state = getImpersonationState()
  if (!state) return {}

  const { error: setError } = await supabase.auth.setSession({
    access_token: state.adminAccessToken,
    refresh_token: state.adminRefreshToken,
  })
  if (setError) {
    sessionStorage.removeItem(STORAGE_KEY)
    return { error: 'تعذر استعادة جلستك الأصلية، برجاء تسجيل الدخول مرة أخرى: ' + setError.message }
  }

  // بلّغ السيرفر بإنهاء المعاينة (بعد استعادة جلسة الـ admin)
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    fetch('/api/platform/impersonate/end', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ logId: state.logId }),
    }).catch(() => {}) // تسجيل ثانوي، فشله ما يوقفش العملية
  }

  sessionStorage.removeItem(STORAGE_KEY)
  return {}
}