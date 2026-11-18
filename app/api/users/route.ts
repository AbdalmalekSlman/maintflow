// app/api/users/route.ts
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

const ROLES = ['admin','manager','superintendent','team_leader','technician','shift_technician','stock_keeper']

export async function POST(request: Request) {
  // 1. Authenticate + authorize the caller
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 2. Validate input (reject bad roles instead of defaulting)
  const body = await request.json().catch(() => null)
  const { email, password, full_name, role } = body ?? {}
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== 'string' || password.length < 8 ||
      typeof full_name !== 'string' || !full_name.trim() ||
      !ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid name, email, password (min 8) or role' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } })

  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // 3. Write to profiles (the table RLS actually reads)
  const { error: pErr } = await admin.from('users')
    .insert({ id: data.user.id, email, full_name: full_name.trim(), role })
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id)
    return NextResponse.json({ error: 'Profile creation failed: ' + pErr.message }, { status: 400 })
  }
  return NextResponse.json({ success: true, userId: data.user.id })
}