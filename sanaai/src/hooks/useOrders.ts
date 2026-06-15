'use client'

import { useCallback, useState } from 'react'
import { ordersApi } from '@/lib/api/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useOrders(page = 1, limit = 50) {
  const queryClient = useQueryClient()

  // Fetch orders
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', page, limit],
    queryFn: () => ordersApi.list(page, limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Create order mutation
  const createMutation = useMutation({
    mutationFn: (orderData: unknown) => ordersApi.create(orderData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Update order mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      ordersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Delete order mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => ordersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  return {
    orders: data,
    isLoading,
    error,
    refetch,
    createOrder: createMutation.mutate,
    updateOrder: updateMutation.mutate,
    deleteOrder: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
