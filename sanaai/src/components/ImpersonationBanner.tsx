'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isImpersonating, getImpersonationState, endImpersonation } from '@/lib/impersonation'

export default function ImpersonationBanner() {
  const router = useRouter()
  const [active, setActive] = useState(false)
  const [targetName, setTargetName] = useState('')
  const [ending, setEnding] = useState(false)

  useEffect(() => {
    const state = getImpersonationState()
    setActive(!!state)
    if (state) setTargetName(state.targetName)
  }, [])

  async function handleExit() {
    setEnding(true)
    const { error } = await endImpersonation()
    if (error) {
      alert(error)
      setEnding(false)
      return
    }
    router.push('/platform')
    router.refresh()
  }

  if (!active) return null

  return (
    <div className="sticky top-0 z-[60] bg-purple-600 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm" dir="rtl">
      <span className="flex items-center gap-2">
        👁️ أنت تعاين الموقع الآن كـ <strong>{targetName}</strong> — أي تعديل هيؤثر فعليًا على بيانات هذه الشركة
      </span>
      <button
        onClick={handleExit}
        disabled={ending}
        className="px-4 py-1 bg-white text-purple-700 font-bold rounded-lg hover:bg-purple-50 transition text-xs disabled:opacity-50"
      >
        {ending ? 'جاري الخروج...' : '✕ إنهاء المعاينة'}
      </button>
    </div>
  )
}