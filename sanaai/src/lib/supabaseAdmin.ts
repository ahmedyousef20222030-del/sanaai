// src/lib/supabaseAdmin.ts
//
// ⚠️ هذا الملف يُستخدم فقط داخل API Routes (كود يعمل على السيرفر).
// ⚠️ لا تستورد هذا الملف أبداً داخل أي component بـ 'use client'،
//    لأن ده هيسرب المفتاح الإداري لمتصفح المستخدم.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY غير موجود في Environment Variables')
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})