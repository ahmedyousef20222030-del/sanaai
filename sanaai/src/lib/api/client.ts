/**
 * API Client for frontend
 * Handles all communication with backend API routes
 */

import { supabase } from '@/lib/supabase'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

async function apiCall<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  })

  const data: ApiResponse<T> = await response.json()

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'API request failed')
  }

  return data.data as T
}

// ── Orders API ──
export const ordersApi = {
  async list(page = 1, limit = 50, filters?: Record<string, unknown>) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...Object.fromEntries(
        Object.entries(filters || {}).map(([k, v]) => [k, String(v)]),
      ),
    })
    return apiCall(`/api/orders?${params}`)
  },

  async get(id: string) {
    return apiCall(`/api/orders/${id}`)
  },

  async create(data: unknown) {
    return apiCall('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: string, data: unknown) {
    return apiCall(`/api/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async updateStatus(id: string, status: string) {
    return apiCall(`/api/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  async delete(id: string) {
    return apiCall(`/api/orders/${id}`, {
      method: 'DELETE',
    })
  },
}

// ── Clients API ──
export const clientsApi = {
  async list(page = 1, limit = 50) {
    return apiCall(`/api/clients?page=${page}&limit=${limit}`)
  },

  async get(id: string) {
    return apiCall(`/api/clients/${id}`)
  },

  async create(data: unknown) {
    return apiCall('/api/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: string, data: unknown) {
    return apiCall(`/api/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async delete(id: string) {
    return apiCall(`/api/clients/${id}`, {
      method: 'DELETE',
    })
  },
}

// ── Production API ──
export const productionApi = {
  async get(id: string) {
    return apiCall(`/api/production/${id}`)
  },

  async updateStage(
    id: string,
    stage: string,
    value: string,
    notes?: string,
  ) {
    return apiCall(`/api/production/${id}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ stage, value, notes }),
    })
  },
}

// ── Auth API ──
export const authApi = {
  async getCurrentUser() {
    return apiCall('/api/auth/user')
  },
}