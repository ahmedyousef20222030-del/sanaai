import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// =============================================================================
// 🔐 AUTH SERVICE - إدارة الهوية والمصنع
// =============================================================================
export const auth = {
  async signIn({ email, password }: { email: string; password: string }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },
  async signUp({ email, password, factoryName, ownerName }: {
    email: string; password: string; factoryName: string; ownerName: string
  }) {
    // يتم إنشاء المصنع والمستخدم تلقائياً عبر Trigger في القاعدة (handle_new_user)
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
    // جلب بيانات المستخدم مع بيانات المصنع المرتبط به (الـ tenant)
    const { data: profile, error } = await supabase
      .from('users')
      .select('*, tenants(*)')
      .eq('id', user.id)
      .single()
    
    if (error) console.error('Error fetching user profile:', error)
    return { ...user, profile }
  },
  onAuthChange(callback: any) {
    return supabase.auth.onAuthStateChange(callback)
  },
}

// =============================================================================
// 📦 ORDERS API - إدارة الطلبات (مطابق للملف الهندسي)
// =============================================================================
export const ordersApi = {
  async getAll({ status, sector, search, limit = 50, offset = 0 }: any = {}) {
    let query = supabase
      .from('orders')
      .select('*, clients(name, phone, sector), production(progress_pct)') // جلب نسبة الإنجاز
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    
    if (status) query = query.eq('status', status)
    if (sector) query = query.eq('sector', sector)
    if (search) query = query.ilike('order_number', `%${search}%`)
    
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(orderData: any) {
    // 🛠️ حقن الـ tenant_id إجبارياً لضمان قبول الطلب من قبل RLS
    const { data: me } = await supabase.from('users').select('tenant_id').single()
    
    const payload = {
      ...orderData,
      tenant_id: me?.tenant_id,
      total_amount: orderData.total_amount || orderData.total_price, // توحيد المسميات
      deposit_paid: orderData.deposit_paid || orderData.paid,       // توحيد المسميات
    }

    const { data, error } = await supabase.from('orders').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('orders').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id: string) {
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) throw error
  },
}

// =============================================================================
// ⚙️ PRODUCTION API - إدارة الإنتاج
// =============================================================================
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
}

// =============================================================================
// 🏢 CLIENTS API - إدارة العملاء
// =============================================================================
export const clientsApi = {
  async getAll() {
    const { data, error } = await supabase.from('clients')
      .select('*').order('total_spent', { ascending: false })
    if (error) throw error
    return data
  },

  async create(clientData: any) {
    const { data: me } = await supabase.from('users').select('tenant_id').single()
    
    const payload = {
      ...clientData,
      tenant_id: me?.tenant_id // حقن معرف المصنع
    }

    const { data, error } = await supabase.from('clients').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },
}

// =============================================================================
// 📊 DASHBOARD & NOTIFICATIONS
// =============================================================================
export const dashboardApi = {
  async getSummary() {
    // استدعاء الـ View التي أصلحناها (SECURITY INVOKER)
    const { data, error } = await supabase.from('dashboard_summary').select('*').single()
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
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
  },
}

// =============================================================================
// 📁 STORAGE API - إدارة الملفات (مطابق للسكيما)
// =============================================================================
export const storageApi = {
  async uploadAttachment(file: File, orderId: string) {
    const ext = file.name.split('.').pop()
    const path = `attachments/${orderId}/${Date.now()}.${ext}`
    
    // استخدام bucket 'order-attachments' كما في السكيما
    const { error } = await supabase.storage.from('order-attachments').upload(path, file)
    if (error) throw error
    
    const { data } = supabase.storage.from('order-attachments').getPublicUrl(path)
    return data.publicUrl
  },

  async uploadLogo(file: File, tenantId: string) {
    const ext = file.name.split('.').pop()
    const path = `logos/${tenantId}.${ext}`
    
    const { error } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true })
    if (error) throw error
    
    const { data } = supabase.storage.from('tenant-assets').getPublicUrl(path)
    return data.publicUrl
  },
}
