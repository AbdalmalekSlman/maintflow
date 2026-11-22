import { isTrustedRequestOrigin } from '@/utils/auth/request-origin'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const noStore = { 'Cache-Control': 'no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: noStore,
  })
}

async function requireAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, must_change_password')
    .eq('id', user.id)
    .single()

  if (
  profileError ||
  profile?.role !== 'admin' ||
  profile.must_change_password
) {
  return null
}

  return user.id
}

// Admin: list reset requests
export async function GET() {
  try {
    const adminId = await requireAdmin()

    if (!adminId) {
      return reply({ error: 'Unauthorized' }, 403)
    }

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('password_reset_requests')
      .select(
  'id, employee_number, status, request_note, admin_note, created_at, reviewed_at, completed_at, reset_started_at'
)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Reset request list failed')
      return reply({ error: 'Unable to load requests' }, 500)
    }

    return reply({ requests: data ?? [] })
  } catch {
    return reply({ error: 'Unexpected server error' }, 500)
  }
}

// Admin: approve or reject a pending request
export async function PATCH(request: Request) {
  try {
    if (!isTrustedRequestOrigin(request)) {
      return reply({ error: 'Forbidden' }, 403)
    }

    const adminId = await requireAdmin()

    if (!adminId) {
      return reply({ error: 'Unauthorized' }, 403)
    }

    if (
      request.headers.get('content-type')?.split(';')[0].trim()
      !== 'application/json'
    ) {
      return reply({ error: 'Invalid request format' }, 415)
    }

    const rawBody = await request.text()

    if (rawBody.length > 4096) {
      return reply({ error: 'Request too large' }, 413)
    }

    const body = JSON.parse(rawBody)

    const { requestId, decision, adminNote } = body ?? {}

    if (
      typeof requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
    ) {
      return reply({ error: 'Invalid request ID' }, 400)
    }

    if (
      decision !== 'approved' &&
      decision !== 'rejected'
    ) {
      return reply({ error: 'Invalid decision' }, 400)
    }

    if (
      adminNote !== undefined &&
      (typeof adminNote !== 'string' || adminNote.length > 500)
    ) {
      return reply({ error: 'Invalid Admin note' }, 400)
    }

    const admin = createAdminClient()

    // Conditional update ensures only pending requests
    // can be approved or rejected.
    const { data, error } = await admin
      .from('password_reset_requests')
      .update({
        status: decision,
        admin_id: adminId,
        admin_note: adminNote?.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id, status')
      .maybeSingle()

    if (error) {
      console.error('Reset request review failed')
      return reply({ error: 'Unable to update request' }, 500)
    }

    if (!data) {
      return reply(
        { error: 'Request not found or already reviewed' },
        409
      )
    }

    return reply({
      success: true,
      message: `Request ${decision} successfully.`,
      request: data,
    })
  } catch {
    return reply({ error: 'Invalid or unexpected request' }, 400)
  }
}