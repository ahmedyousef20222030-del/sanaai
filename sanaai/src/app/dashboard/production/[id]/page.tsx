'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ordersApi } from '@/lib/api/client'

// ── Types ──────────────────────────────────────────────────────────────────────
type StageGroup = 'design' | 'cutting' | 'print_embroidery' | 'sewing' | 'packing'

const STAGE_LABELS: Record<StageGroup, string> = {
  design: '🎨 التصميم',
  cutting: '✂️ القص',
  print_embroidery: '🖨️ الطباعة / التطريز',
  sewing: '🧵 الخياطة',
  packing: '📦 التغليف',
}

const STAGE_COLORS: Record<StageGroup, string> = {
  design: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',
  cutting: 'from-amber-500/10 to-amber-600/5 border-amber-500/20',
  print_embroidery: 'from-purple-500/10 to-purple-600/5 border-purple-500/20',
  sewing: 'from-pink-500/10 to-pink-600/5 border-pink-500/20',
  packing: 'from-green-500/10 to-green-600/5 border-green-500/20',
}

type SubStage = {
  id: string
  stage_group: StageGroup
  sub_stage_key: string
  sub_stage_display_name: string
  sort_order: number
  completion?: {
    id: string
    started_at: string
    completed_at: string | null
    worker?: { id: string; full_name: string } | null
    qa_status?: string
  } | null
  progress?: number // 0, 50, 100
}

type ProductionStagesResponse = {
  data: {
    production: { id: string; print_or_embroidery: string; overall_progress_pct: number }
    stages: Record<StageGroup, SubStage[]>
    summary: { total_stages: number; completed_stages: number; in_progress_stages: number }
  }
}

export default function ProductionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [productionId, setProductionId] = useState<string | null>(null)
  const [stages, setStages] = useState<Record<StageGroup, SubStage[]>>({
    design: [],
    cutting: [],
    print_embroidery: [],
    sewing: [],
    packing: [],
  })
  const [production, setProduction] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)
  const [summary, setSummary] = useState({ total_stages: 0, completed_stages: 0, in_progress_stages: 0 })

  useEffect(() => {
    params.then(p => {
      setProductionId(p.id)
      fetchStages(p.id)
    })
  }, [params])

  async function fetchStages(id: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/production/${id}/stages`)
      if (res.ok) {
        const json = (await res.json()) as ProductionStagesResponse
        setProduction(json.data.production)
        setStages(json.data.stages)
        setSummary(json.data.summary)
      }
    } catch (err) {
      console.error('Error fetching stages:', err)
    } finally {
      setLoading(false)
    }
  }

  async function markStageComplete(stageGroup: StageGroup, subStageKey: string) {
    if (!productionId) return
    setCompleting(`${stageGroup}:${subStageKey}`)
    try {
      const res = await fetch(`/api/production/${productionId}/complete-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_group: stageGroup, sub_stage_key: subStageKey }),
      })
      if (res.ok) {
        await fetchStages(productionId)
      } else {
        alert('تعذر تسجيل المرحلة')
      }
    } catch (err) {
      console.error('Error completing stage:', err)
      alert('خطأ: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'))
    } finally {
      setCompleting(null)
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08090A] flex items-center justify-center">
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#08090A] p-6 text-[#F0EDE8]" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white mb-1">مراحل الإنتاج</h1>
          <p className="text-sm text-gray-500">
            {summary.completed_stages}/{summary.total_stages} مرحلة مكتملة
            {summary.in_progress_stages > 0 && ` • ${summary.in_progress_stages} قيد التنفيذ`}
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 text-sm border border-white/10 rounded-lg text-gray-400 hover:text-[#D4A843] transition"
        >
          ← رجوع
        </button>
      </div>

      {/* Overall Progress Bar */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">التقدم الإجمالي</span>
          <span className="text-2xl font-black text-[#D4A843]">{production?.overall_progress_pct || 0}%</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#D4A843] to-[#E8C06A] transition-all duration-500"
            style={{ width: `${production?.overall_progress_pct || 0}%` }}
          />
        </div>
      </div>

      {/* Production Type Indicator */}
      {production?.print_or_embroidery && (
        <div className="bg-[#111318] border border-white/5 rounded-lg px-4 py-2 mb-6 text-sm">
          <span className="text-gray-400">نوع الزخرفة:</span>
          <span className="ml-2 font-bold text-[#D4A843]">
            {production.print_or_embroidery === 'printing' ? '🖨️ طباعة' : '✨ تطريز'}
          </span>
        </div>
      )}

      {/* Stage Groups */}
      <div className="space-y-6">
        {(Object.keys(stages) as StageGroup[]).map(groupKey => {
          const groupStages = stages[groupKey] || []
          if (groupStages.length === 0) return null

          const completedInGroup = groupStages.filter(s => s.completion?.completed_at).length
          const groupProgress = groupStages.length > 0 ? Math.round((completedInGroup / groupStages.length) * 100) : 0

          return (
            <div
              key={groupKey}
              className={`rounded-2xl border p-6 bg-gradient-to-br ${STAGE_COLORS[groupKey]}`}
            >
              {/* Group Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">{STAGE_LABELS[groupKey]}</h2>
                  <p className="text-xs text-gray-500">
                    {completedInGroup}/{groupStages.length} مراحل ({groupProgress}%)
                  </p>
                </div>
                <div className="w-16 h-16 rounded-full flex items-center justify-center bg-white/5 border border-white/10">
                  <span className="text-2xl font-black text-[#D4A843]">{groupProgress}%</span>
                </div>
              </div>

              {/* Mini Progress Bar */}
              <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-6">
                <div
                  className="h-full bg-gradient-to-r from-[#D4A843]/60 to-[#E8C06A]/60"
                  style={{ width: `${groupProgress}%` }}
                />
              </div>

              {/* Sub-stages */}
              <div className="space-y-3">
                {groupStages.map((stage, idx) => {
                  const isDone = !!stage.completion?.completed_at
                  const isInProgress = stage.completion?.started_at && !stage.completion?.completed_at
                  const key = `${groupKey}:${stage.sub_stage_key}`
                  const isCompleting = completing === key

                  return (
                    <div
                      key={stage.id}
                      className={`rounded-lg border p-4 transition ${
                        isDone
                          ? 'bg-white/[0.03] border-white/5'
                          : isInProgress
                            ? 'bg-white/[0.05] border-amber-500/30'
                            : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-sm font-bold ${isDone ? 'text-[#1B7A6E]' : 'text-gray-300'}`}>
                              {isDone ? '✓' : isInProgress ? '⚙' : `${idx + 1}`}
                            </span>
                            <span className="font-semibold text-white">{stage.sub_stage_display_name}</span>
                            {isDone && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#1B7A6E]/20 text-[#1B7A6E]">مكتمل</span>}
                            {isInProgress && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">قيد التنفيذ</span>
                            )}
                          </div>

                          {stage.completion && (
                            <div className="text-xs text-gray-500 ml-6 space-y-0.5">
                              {stage.completion.worker && (
                                <div>👤 {stage.completion.worker.full_name}</div>
                              )}
                              {stage.completion.started_at && (
                                <div>⏰ بدأ: {fmt(stage.completion.started_at)}</div>
                              )}
                              {stage.completion.completed_at && (
                                <div>✓ انتهى: {fmt(stage.completion.completed_at)}</div>
                              )}
                              {stage.completion.qa_status && (
                                <div className={`mt-1 ${stage.completion.qa_status === 'approved' ? 'text-[#1B7A6E]' : stage.completion.qa_status === 'rejected' ? 'text-[#C24B2A]' : 'text-gray-600'}`}>
                                  QA: {stage.completion.qa_status === 'approved' ? '✓ موافق' : stage.completion.qa_status === 'rejected' ? '✗ يحتاج تصحيح' : 'في الانتظار'}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {!isDone && (
                          <button
                            onClick={() => markStageComplete(groupKey, stage.sub_stage_key)}
                            disabled={isCompleting}
                            className="px-4 py-2 text-xs font-bold rounded-lg bg-[#D4A843]/20 text-[#D4A843] border border-[#D4A843]/30 hover:bg-[#D4A843]/30 transition disabled:opacity-50"
                          >
                            {isCompleting ? '...' : isDone ? '✓' : 'تسجيل اكتمال'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {Object.keys(stages).every(k => !stages[k as StageGroup] || stages[k as StageGroup].length === 0) && (
        <div className="text-center py-12 text-gray-600">
          <p>لا توجد مراحل لهذا الطلب</p>
        </div>
      )}
    </div>
  )
}