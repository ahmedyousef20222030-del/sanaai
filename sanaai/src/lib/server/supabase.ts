import { createClient } from '@supabase/supabase-js'
import { SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL } from '@/lib/env'

// Server-side only: uses service role key with full permissions
// IMPORTANT: This file should ONLY be imported in server-side code (API routes, server actions)
// Never import this in client components!

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side operations')
}

export const supabaseAdmin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Helper to get user from auth header
export const getUserFromHeader = async (authHeader?: string) => {
  if (!authHeader) return null

  try {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(token)
    if (error || !user) return null
    return user
  } catch {
    return null
  }
}

// Helper to verify Supabase JWT token
export const verifyToken = async (token: string) => {
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(token)
    if (error || !user) return null
    return user
  } catch {
    return null
  }
}
