import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useAllPagePermissions() {
  const [allowedPageIds, setAllowedPageIds] = useState<Set<string>>(new Set())
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()

      if (userRow?.role === 'owner') {
        setIsOwner(true)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('user_page_permissions')
        .select('page_id, can_view')
        .eq('user_id', user.id)
        .eq('can_view', true)

      setAllowedPageIds(new Set((data ?? []).map(p => p.page_id)))
      setLoading(false)
    })()
  }, [])

  return { allowedPageIds, isOwner, loading }
}