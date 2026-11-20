import { createClient } from '@/utils/supabase/server'
import type { PlantRole } from '@/lib/permissions'

export async function verifyUserRole(allowed: PlantRole[]) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized: please sign in.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, must_change_password')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.role) {
    throw new Error('Unable to verify your account.')
  }

  if (profile.must_change_password) {
    throw new Error(
      'You must change your password before using MaintFlow.'
    )
  }

  const role = profile.role as PlantRole

  if (!allowed.includes(role)) {
    throw new Error(
      'Forbidden: your role cannot perform this action.'
    )
  }

  return { supabase, user, role }
}