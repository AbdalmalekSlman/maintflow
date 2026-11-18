'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { PlantRole } from '@/lib/permissions'

export function useCurrentUser() {
  const router = useRouter()
  const [s, setS] = useState<{ loading: boolean; userId: string | null; role: PlantRole | null; error: string | null }>(
    { loading: true, userId: null, role: null, error: null })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      const { data, error } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (!cancelled) setS({ loading: false, userId: user.id, role: (data?.role as PlantRole) ?? null, error: error?.message ?? null })
    })()
    return () => { cancelled = true }
  }, [router])

  return s
}