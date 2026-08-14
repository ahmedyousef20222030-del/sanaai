import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Perm = { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }

export function usePagePermission(pageId: string) {
  const [perm, setPerm] = useState<Perm>({ can_view: false, can_create: false, can_edit: false, can_delete: false })
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
        setPerm({ can_view: true, can_create: true, can_edit: true, can_delete: true })
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('user_page_permissions')
        .select('can_view, can_create, can_edit, can_delete')
        .eq('user_id', user.id)
        .eq('page_id', pageId)
        .maybeSingle()

      if (data) setPerm(data)
      setLoading(false)
    })()
  }, [pageId])

  return { ...perm, isOwner, loading }
}