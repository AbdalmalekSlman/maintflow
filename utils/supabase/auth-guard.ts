// utils/supabase/auth-guard.ts
import { createClient } from '@/utils/supabase/server'
import type { PlantRole } from '@/lib/permissions'

export async function verifyUserRole(allowed: PlantRole[]) {
  const supabase = await createClient()               // uses getAll/setAll
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized: please sign in.')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !allowed.includes(profile.role as PlantRole))
    throw new Error('Forbidden: your role cannot perform this action.')
  return { supabase, user, role: profile.role as PlantRole }
}