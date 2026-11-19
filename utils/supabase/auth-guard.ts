
import { createClient } from '@/utils/supabase/server'
import type { PlantRole } from '@/lib/permissions'

/**
 * Authenticates the current request and verifies its role.
 * The authoritative user table in MaintFlow is public.users.
 */
export async function verifyUserRole(allowed: PlantRole[]) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized: please sign in.')
  }

  const { data: userRecord, error: roleError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (roleError || !userRecord?.role) {
    throw new Error('Unable to verify your user role.')
  }

  const role = userRecord.role as PlantRole

  if (!allowed.includes(role)) {
    throw new Error('Forbidden: your role cannot perform this action.')
  }

  return { supabase, user, role }
}
