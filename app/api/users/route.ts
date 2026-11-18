import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_ROLES = ['admin', 'manager', 'superintendent', 'team_leader', 'technician', 'shift_technician', 'stock_keeper']

export async function POST(request: Request) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing in .env.local' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const { email, password, full_name, role } = await request.json()

    // Validate role
    const assignedRole = ALLOWED_ROLES.includes(role) ? role : 'technician'

    // 1. Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const userId = authData.user.id

    // 2. Insert their profile into public.users with the chosen role
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert([
        {
          id: userId,
          email,
          full_name,
          role: assignedRole
        }
      ])

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: 'Profile creation failed: ' + profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, userId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}