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
  const { data: me } = await supabase.from('users').select('role, must_change_password').eq('id', user.id).single()
  if (me?.role !== 'admin' || me.must_change_password) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 2. Validate input (reject bad roles instead of defaulting)
  const body = await request.json().catch(() => null)
  const { employee_number, email, password, full_name, role } = body ?? {}

const validEmployeeNumber =
  typeof employee_number === 'string' &&
  /^[1-9][0-9]*$/.test(employee_number) &&
  employee_number.length <= 20
  if (!validEmployeeNumber || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) ||
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

  // 3. Write to users (the table RLS actually reads)
  const { error: pErr } = await admin.from('users')
    .insert({
  id: data.user.id,
  employee_number,
  email,
  full_name: full_name.trim(),
  role,
  must_change_password: true,
})
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id)
    return NextResponse.json({ error: 'Profile creation failed: ' + pErr.message }, { status: 400 })
  }
  return NextResponse.json({ success: true, userId: data.user.id })
}


export async function DELETE(request: Request) {
  try {
    // 1. Authenticate current user
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Verify Admin role
    const { data: me, error: roleError } = await supabase
      .from('users')
      .select('role, must_change_password')
      .eq('id', user.id)
      .single()

    if (roleError || me?.role !== 'admin' || me.must_change_password) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      )
    }

    // 3. Validate target user ID
    const targetUserId = new URL(request.url)
      .searchParams.get('userId')

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (!targetUserId || !uuidPattern.test(targetUserId)) {
      return NextResponse.json(
        { error: 'Valid user ID is required' },
        { status: 400 }
      )
    }

    // 4. Prevent deleting yourself
    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own Admin account' },
        { status: 400 }
      )
    }

    // 5. Find target user
    const { data: target, error: targetError } = await supabase
      .from('users')
      .select('id, full_name, role')
      .eq('id', targetUserId)
      .maybeSingle()

    if (targetError) {
      return NextResponse.json(
        { error: targetError.message },
        { status: 500 }
      )
    }

    if (!target) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // 6. Prevent deleting the last Admin
    if (target.role === 'admin') {
      const { count, error: countError } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')

      if (countError) {
        return NextResponse.json(
          { error: 'Unable to verify Admin accounts' },
          { status: 500 }
        )
      }

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the last Admin account' },
          { status: 409 }
        )
      }
    }

    // 7. Prevent orphaning active maintenance assignments
    const { count: assignedCount, error: assignedError } =
      await supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', targetUserId)
        .or('status.is.null,status.neq.verified_closed')

    if (assignedError) {
      return NextResponse.json(
        { error: 'Unable to check assigned work orders' },
        { status: 500 }
      )
    }

    const { count: leaderCount, error: leaderError } =
      await supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('team_leader_id', targetUserId)
        .or('status.is.null,status.neq.verified_closed')

    if (leaderError) {
      return NextResponse.json(
        { error: 'Unable to check Team Leader assignments' },
        { status: 500 }
      )
    }

    if ((assignedCount ?? 0) > 0 || (leaderCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            'This user has active work orders. Reassign or close them before deleting the account.',
          assignedWorkOrders: assignedCount ?? 0,
          ledWorkOrders: leaderCount ?? 0,
        },
        { status: 409 }
      )
    }

    // 8. Initialize Supabase Admin client
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    // 9. Delete Supabase Auth account
    // public.users is deleted through its existing
    // ON DELETE CASCADE foreign key.
    const { error: deleteError } =
      await admin.auth.admin.deleteUser(targetUserId)

    if (deleteError) {
      const message = deleteError.message

      return NextResponse.json(
        { error: message },
        {
          status: message.toLowerCase().includes('last admin')
            ? 409
            : 400,
        }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${target.full_name || 'User'} was successfully deleted`,
      userId: targetUserId,
    })

  } catch (error) {
    console.error('User deletion error:', error)

    return NextResponse.json(
      { error: 'Unexpected error while deleting user' },
      { status: 500 }
    )
  }
}
