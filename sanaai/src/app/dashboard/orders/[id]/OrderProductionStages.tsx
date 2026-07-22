'use client'

import { useEffect, useState } from 'react'

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
  progress?: number
}

type ProductionStagesResponse = {
  data: {
    production: { id: string; print_or_embroidery: string; overall_progress_pct: number }
    stages: Record<StageGroup, SubStage[]>
    summary: { total_stages: number; completed_stages: number; in_progress_stages: number }
  }
}

export default function OrderProductionStages({ productionId }: { productionId: string }) {
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
    fetchStages()
  }, [productionId])

  async function fetchStages() {
    setLoading(true)
    try {
      const res = await fetch(`/api/production/${productionId}/stages`)
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
    setCompleting(`${stageGroup}:${subStageKey}`)
    try {
      const res = await fetch(`/api/production/${productionId}/complete-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_group: stageGroup, sub_stage_key: subStageKey }),
      })
      if (res.ok) {
        await fetchStages()
      }
    } catch (err) {
      console.error('Error completing stage:', err)
    } finally {
      setCompleting(null)
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-6">
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
        <p className="text-xs text-gray-500 mt-3">
          {summary.completed_stages}/{summary.total_stages} مرحلة مكتملة
          {summary.in_progress_stages > 0 && ` • ${summary.in_progress_stages} قيد التنفيذ`}
        </p>
      </div>

      {/* Production Type */}
      {production?.print_or_embroidery && (
        <div className="bg-[#111318] border border-white/5 rounded-lg px-4 py-2 text-sm inline-block">
          <span className="text-gray-400">نوع الزخرفة: </span>
          <span className="font-bold text-[#D4A843]">
            {production.print_or_embroidery === 'printing' ? '🖨️ طباعة' : '✨ تطريز'}
          </span>
        </div>
      )}

      {/* Stages */}
      <div className="space-y-4">
        {(Object.keys(stages) as StageGroup[]).map(groupKey => {
          const groupStages = stages[groupKey] || []
          if (groupStages.length === 0) return null

          const completedInGroup = groupStages.filter(s => s.completion?.completed_at).length
          const groupProgress = groupStages.length > 0 ? Math.round((completedInGroup / groupStages.length) * 100) : 0

          return (
            <div
              key={groupKey}
              className={`rounded-xl border p-4 bg-gradient-to-br ${STAGE_COLORS[groupKey]} transition-all hover:border-opacity-100`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-bold text-white">{STAGE_LABELS[groupKey]}</h3>
                  <p className="text-xs text-gray-500">{completedInGroup}/{groupStages.length}</p>
                </div>
                <div className="text-sm font-black text-[#D4A843]">{groupProgress}%</div>
              </div>

              <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-[#D4A843]/60 to-[#E8C06A]/60 transition-all duration-300"
                  style={{ width: `${groupProgress}%` }}
                />
              </div>

              <div className="space-y-2">
                {groupStages.map((stage, idx) => {
                  const isDone = !!stage.completion?.completed_at
                  const isInProgress = stage.completion?.started_at && !stage.completion?.completed_at
                  const key = `${groupKey}:${stage.sub_stage_key}`
                  const isCompleting = completing === key

                  return (
                    <div
                      key={stage.id}
                      className={`rounded-lg border p-3 transition-all ${
                        isDone
                          ? 'bg-white/[0.02] border-white/5'
                          : isInProgress
                            ? 'bg-white/[0.04] border-amber-500/20'
                            : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold flex-shrink-0 ${isDone ? 'text-[#1B7A6E]' : 'text-gray-400'}`}>
                              {isDone ? '✓' : isInProgress ? '⚙' : `${idx + 1}`}
                            </span>
                            <span className="text-sm font-medium text-white truncate">{stage.sub_stage_display_name}</span>
                            {isDone && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#1B7A6E]/20 text-[#1B7A6E] flex-shrink-0">مكتمل</span>}
                          </div>

                          {stage.completion && (
                            <div className="text-xs text-gray-500 ml-6 space-y-0.5">
                              {stage.completion.worker && <div>👤 {stage.completion.worker.full_name}</div>}
                              {stage.completion.started_at && <div>⏰ {fmt(stage.completion.started_at)}</div>}
                              {stage.completion.completed_at && <div>✓ {fmt(stage.completion.completed_at)}</div>}
                            </div>
                          )}
                        </div>

                        {!isDone && (
                          <button
                            onClick={() => markStageComplete(groupKey, stage.sub_stage_key)}
                            disabled={isCompleting}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#D4A843]/20 text-[#D4A843] border border-[#D4A843]/30 hover:bg-[#D4A843]/30 transition-all disabled:opacity-50 flex-shrink-0"
                          >
                            {isCompleting ? '...' : '✓'}
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
    </div>
  )
}