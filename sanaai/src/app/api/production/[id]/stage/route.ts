import { NextRequest } from 'next/server'
import { getCurrentUser, checkPermission } from '@/lib/server/auth'
import { supabaseAdmin } from '@/lib/server/supabase'
import { updateProductionStageSchema } from '@/lib/server/validators'
import { Permission } from '@/lib/types'
import { successResponse, handleError } from '@/lib/server/responses'
import { NotFoundError } from '@/lib/errors'

type Props = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    
    // التأكد من أن المستخدم لديه صلاحية تحديث الإنتاج
    checkPermission(user, Permission.ProductionUpdate)

    const body = await request.json()
    
    // ⚠️ تنبيه: يجب تحديث updateProductionStageSchema في ملف validators.ts 
    // ليتناسب مع الأسماء الجديدة (stage_design, stage_cut, إلخ) والقيم (done, pending)
    const validated = updateProductionStageSchema.parse(body)

    // بناء بيانات التحديث بناءً على السكيما v1.1
    const updateData: Record<string, unknown> = {
      [validated.stage]: validated.value, // القيمة يجب أن تكون 'done' أو 'pending'
      updated_at: new Date().toISOString(),
    }

    // إضافة الملاحظات إذا وجدت
    if (validated.notes) {
      updateData.notes = validated.notes
    }

    // تنفيذ التحديث في جدول production
    const { data, error } = await supabaseAdmin
      .from('production')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      throw new NotFoundError('Production record not found or update failed')
    }

    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    
    // التأكد من صلاحية القراءة
    checkPermission(user, Permission.ProductionRead)

    const { data, error } = await supabaseAdmin
      .from('production')
      .select('*, orders(order_number, quantity)')
      .eq('id', id)
      .single()

    if (error || !data) throw new NotFoundError('Production record')
    return successResponse(data)
  } catch (error) {
    return handleError(error)
  }
}