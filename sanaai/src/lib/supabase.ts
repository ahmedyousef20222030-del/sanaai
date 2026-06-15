import { createClient } from '@supabase/supabase-js'

// ⚠️ IMPORTANT: These environment variables MUST be set
// See .env.example for configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local and .env.example')
}

// Client-side safe: uses public anon key only
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// Server-side only: should NEVER be used in browser
// Import only in server-side code (API routes, server components)
export const getSupabaseAdmin = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. This should only be used server-side.')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export const auth = {
  async signIn({ email, password }: { email: string; password: string }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },
  async signUp({ email, password, factoryName, ownerName }: {
    email: string; password: string; factoryName: string; ownerName: string
  }) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: ownerName, factory_name: factoryName } },
    })
    if (error) throw error
    return data
  },
  async signOut() {
    await supabase.auth.signOut()
  },
  async getUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase
      .from('users').select('*, tenants(*)').eq('id', user.id).single()
    return { ...user, profile }
  },
  onAuthChange(callback: any) {
    return supabase.auth.onAuthStateChange(callback)
  },
}

export const ordersApi = {
  async getAll({ status, sector, search, limit = 50, offset = 0 }: any = {}) {
    let query = supabase
      .from('orders')
      .select('*, clients(name, phone, sector), assigned_user:users(full_name)')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (status) query = query.eq('status', status)
    if (sector) query = query.eq('sector', sector)
    if (search) query = query.ilike('order_number', `%${search}%`)
    const { data, error, count } = await query
    if (error) throw error
    return { data, count }
  },
  async create(orderData: any) {
    const { data, error } = await supabase.from('orders').insert(orderData).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('orders').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },
  async updateStatus(id: string, status: string) {
    return this.update(id, { status })
  },
  async delete(id: string) {
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) throw error
  },
}

export const productionApi = {
  async getAll({ status }: any = {}) {
    let query = supabase.from('production')
      .select('*, orders(order_number, quantity, expected_delivery)')
      .order('created_at', { ascending: false })
    if (status) query = query.eq('final_status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },
  async updateStage(id: string, stage: string, value: string) {
    const { data, error } = await supabase.from('production')
      .update({ [stage]: value }).eq('id', id).select().single()
    if (error) throw error
    return data
  },
  async updateCompleted(id: string, completedQty: number) {
    const { data, error } = await supabase.from('production')
      .update({ completed_qty: completedQty }).eq('id', id).select().single()
    if (error) throw error
    return data
  },
}

export const clientsApi = {
  async getAll() {
    const { data, error } = await supabase.from('clients')
      .select('*').order('total_spent', { ascending: false })
    if (error) throw error
    return data
  },
  async create(clientData: any) {
    const { data, error } = await supabase.from('clients').insert(clientData).select().single()
    if (error) throw error
    return data
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },
}

export const dashboardApi = {
  async getSummary() {
    const { data, error } = await supabase.from('dashboard_summary').select('*').single()
    if (error) throw error
    return data
  },
  async getRecentOrders(limit = 5) {
    const { data, error } = await supabase.from('orders')
      .select('*, clients(name)').order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    return data
  },
}

export const notificationsApi = {
  async getAll() {
    const { data, error } = await supabase.from('notifications')
      .select('*').order('created_at', { ascending: false }).limit(20)
    if (error) throw error
    return data
  },
  async markRead(id: string) {
    await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
  },
  subscribe(userId: string, callback: any) {
    return supabase.channel(`notif:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'notifications', filter: `user_id=eq.${userId}`,
      }, callback).subscribe()
  },
}

export const subscriptionsApi = {
  async getCurrent() {
    const { data, error } = await supabase.from('subscriptions')
      .select('*').order('created_at', { ascending: false }).limit(1).single()
    if (error && error.code !== 'PGRST116') throw error
    return data
  },
  async initiatePayment({ plan, billingPeriod }: { plan: string; billingPeriod: string }) {
    const response = await fetch('/api/payments/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, billingPeriod }),
    })
    if (!response.ok) throw new Error('فشل في بدء عملية الدفع')
    return response.json()
  },
}

export const storageApi = {
  async uploadDesign(file: File, orderId: string) {
    const ext  = file.name.split('.').pop()
    const path = `designs/${orderId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('order-files').upload(path, file)
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('order-files').getPublicUrl(path)
    return publicUrl
  },
  async uploadLogo(file: File, tenantId: string) {
    const ext  = file.name.split('.').pop()
    const path = `logos/${tenantId}.${ext}`
    const { error } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('tenant-assets').getPublicUrl(path)
    return publicUrl
  },
}