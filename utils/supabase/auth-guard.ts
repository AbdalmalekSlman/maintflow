// utils/auth-guard.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function verifyUserRole(allowedRoles: string[]) {
  // Next.js 16 requires awaiting cookies()
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Unauthorized: No active session found.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !allowedRoles.includes(profile.role)) {
    throw new Error('Forbidden: Your role does not have permission to perform this action.');
  }

  return { user, role: profile.role, supabase };
}