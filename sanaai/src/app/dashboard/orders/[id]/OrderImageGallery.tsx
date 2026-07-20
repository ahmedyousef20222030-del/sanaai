'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type OrderImage = {
  id: string
  image_url: string
  sort_order: number
}

type Props = {
  orderId: string
  tenantId: string
  canEdit: boolean
  /** Images stored the old way, directly on orders.attachments (text[]),
   *  from before this order_images gallery existed. Shown read-only with
   *  a one-click option to migrate them into the new system. */
  legacyAttachments: string[]
}

const BUCKET = 'order-attachments'

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  return idx === -1 ? null : url.slice(idx + marker.length)
}

export default function OrderImageGallery({ orderId, tenantId, canEdit, legacyAttachments }: Props) {
  const [images, setImages]   = useState<OrderImage[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draggingId    = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => { fetchImages() }, [orderId])

  async function fetchImages() {
    setLoading(true)
    const { data, error } = await supabase
      .from('order_images')
      .select('id, image_url, sort_order')
      .eq('order_id', orderId)
      .order('sort_order', { ascending: true })
    if (!error) setImages(data || [])
    setLoading(false)
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    const startOrder = images.length ? Math.max(...images.map(i => i.sort_order)) + 1 : 0
    const failures: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${orderId}/${crypto.randomUUID()}.${ext}`

        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
        if (uploadError) throw uploadError

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

        const { data: row, error: insertError } = await supabase
          .from('order_images')
          .insert({
            order_id: orderId,
            tenant_id: tenantId,
            image_url: pub.publicUrl,
            sort_order: startOrder + i,
          })
          .select('id, image_url, sort_order')
          .single()

        if (insertError) throw insertError
        if (row) setImages(prev => [...prev, row])
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`)
      }
    }

    if (failures.length > 0) setError('فشل رفع بعض الصور — ' + failures.join(' | '))
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function deleteImage(img: OrderImage) {
    if (!confirm('حذف هذه الصورة؟')) return
    const path = storagePathFromPublicUrl(img.image_url)
    if (path) {
      await supabase.storage.from(BUCKET).remove([path])
    }
    const { error } = await supabase.from('order_images').delete().eq('id', img.id)
    if (!error) setImages(prev => prev.filter(i => i.id !== img.id))
  }

  async function persistOrder(newOrder: OrderImage[]) {
    setImages(newOrder)
    await Promise.all(
      newOrder.map((img, idx) =>
        img.sort_order === idx
          ? Promise.resolve()
          : supabase.from('order_images').update({ sort_order: idx }).eq('id', img.id),
      ),
    )
  }

  function moveImage(index: number, direction: 1 | -1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= images.length) return
    const reordered = [...images]
    ;[reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]]
    persistOrder(reordered)
  }

  function handleDrop(targetId: string) {
    const sourceId = draggingId.current
    draggingId.current = null
    setDragOverId(null)
    if (!sourceId || sourceId === targetId) return
    const sourceIdx = images.findIndex(i => i.id === sourceId)
    const targetIdx = images.findIndex(i => i.id === targetId)
    if (sourceIdx === -1 || targetIdx === -1) return
    const reordered = [...images]
    const [moved] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, moved)
    persistOrder(reordered)
  }

  async function migrateLegacy() {
    setMigrating(true)
    const startOrder = images.length ? Math.max(...images.map(i => i.sort_order)) + 1 : 0
    const rows = legacyAttachments.map((url, idx) => ({
      order_id: orderId,
      tenant_id: tenantId,
      image_url: url,
      sort_order: startOrder + idx,
    }))
    const { data, error } = await supabase.from('order_images').insert(rows).select('id, image_url, sort_order')
    if (!error && data) setImages(prev => [...prev, ...data])
    setMigrating(false)
  }

  const showLegacy = images.length === 0 && legacyAttachments.length > 0

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-[#555a66] font-semibold tracking-widest uppercase">صور الطلب</span>
        {canEdit && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-[rgba(212,168,67,0.12)] text-[#D4A843] border border-[rgba(212,168,67,0.3)] hover:bg-[rgba(212,168,67,0.2)] transition disabled:opacity-50"
          >
            {uploading ? 'جاري الرفع...' : '+ إضافة صور'}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFilesSelected(e.target.files)}
        />
      </div>

      {error && <p className="text-[11px] text-red-400 mb-3">{error}</p>}

      {loading ? (
        <div className="h-[140px] rounded-2xl bg-[#0D0F14] animate-pulse" />
      ) : showLegacy ? (
        <div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {legacyAttachments.map((url, i) => (
              <img key={i} src={url} alt="" className="w-full h-24 object-cover rounded-lg opacity-80" />
            ))}
          </div>
          {canEdit && (
            <button
              onClick={migrateLegacy}
              disabled={migrating}
              className="text-[10px] px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:text-[#D4A843] hover:border-[rgba(212,168,67,0.4)] transition disabled:opacity-50"
            >
              {migrating ? 'جاري الترحيل...' : '↻ ترحيل هذه الصور لمعرض الصور الجديد (لدعم الترتيب والحذف)'}
            </button>
          )}
        </div>
      ) : images.length === 0 ? (
        <div className="h-[140px] rounded-2xl bg-gradient-to-br from-[#0D0F14] to-[#1A1D26] flex flex-col items-center justify-center gap-2">
          <span className="text-4xl opacity-20">👕</span>
          <span className="text-[12px] text-[#555a66]">لا توجد صور مرفقة بعد</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <div
              key={img.id}
              draggable={canEdit}
              onDragStart={() => (draggingId.current = img.id)}
              onDragOver={e => { if (canEdit) { e.preventDefault(); setDragOverId(img.id) } }}
              onDragLeave={() => setDragOverId(prev => (prev === img.id ? null : prev))}
              onDrop={e => { e.preventDefault(); handleDrop(img.id) }}
              className={`relative group rounded-lg overflow-hidden h-24 ${dragOverId === img.id ? 'ring-2 ring-[#D4A843]' : ''}`}
            >
              <img src={img.image_url} alt="" className="w-full h-full object-cover" />
              {canEdit && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
                  <button onClick={() => moveImage(i, -1)} disabled={i === 0}
                    className="w-6 h-6 rounded bg-white/20 text-white text-xs disabled:opacity-30">←</button>
                  <button onClick={() => deleteImage(img)}
                    className="w-6 h-6 rounded bg-red-500/70 text-white text-xs">✕</button>
                  <button onClick={() => moveImage(i, 1)} disabled={i === images.length - 1}
                    className="w-6 h-6 rounded bg-white/20 text-white text-xs disabled:opacity-30">→</button>
                </div>
              )}
              {i === 0 && (
                <span className="absolute top-1 right-1 bg-[rgba(212,168,67,0.9)] text-[#08090A] text-[9px] px-1.5 py-0.5 rounded font-bold">
                  رئيسية
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}