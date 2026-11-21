import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function reply(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

export async function POST(request: Request) {
  try {
    // CSRF protection
    const origin = request.headers.get('origin')
    const expectedOrigin = new URL(request.url).origin

    if (!origin || origin !== expectedOrigin) {
      return reply({ error: 'Forbidden' }, 403)
    }

    // Authenticate the Admin.
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return reply({ error: 'Unauthorized' }, 401)
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
      return reply({ error: 'Forbidden' }, 403)
    }

    const rawBody = await request.text()

    if (rawBody.length > 4096) {
      return reply({ error: 'Request too large' }, 413)
    }

    let body: { requestId?: unknown }

    try {
      body = JSON.parse(rawBody)
    } catch {
      return reply({ error: 'Invalid request' }, 400)
    }

    if (
      typeof body?.requestId !== 'string' ||
      !UUID_PATTERN.test(body.requestId)
    ) {
      return reply({ error: 'Invalid request ID' }, 400)
    }

    const admin = createAdminClient()

    // Atomically claim an approved request.
    const { data: claims, error: claimError } = await admin
      .rpc('claim_password_reset', {
        p_request_id: body.requestId,
        p_admin_id: user.id,
      })

    if (claimError) {
      console.error('Unable to claim password reset')
      return reply({ error: 'Unable to start password reset' }, 500)
    }

    const claim = claims?.[0]

    if (!claim) {
      return reply(
        { error: 'Request is not approved or already processed' },
        409
      )
    }

    const targetId = claim.target_user_id as string
    const employeeNumber = claim.target_employee_number as string

    // Recheck the target account.
    const { data: target, error: targetError } = await admin
      .from('users')
      .select('id, employee_number, role, must_change_password')
      .eq('id', targetId)
      .single()

    if (
      targetError ||
      !target ||
      target.employee_number !== employeeNumber ||
      target.role === 'admin'
    ) {
      // Leave the request in processing for investigation.
      // This prevents accidentally resetting the only Admin.
      return reply(
        { error: 'Target account requires Admin review' },
        409
      )
    }

    // Generate a high-entropy, one-time temporary password.
    const temporaryPassword = randomBytes(24)
      .toString('base64url')

    // Set the forced-change flag BEFORE updating Auth.
    const { error: flagError } = await admin
      .from('users')
      .update({ must_change_password: true })
      .eq('id', targetId)

    if (flagError) {
      return reply(
        { error: 'Unable to protect the target account' },
        500
      )
    }

    // Change the password using Supabase Auth Admin API.
    const { error: resetError } =
      await admin.auth.admin.updateUserById(targetId, {
        password: temporaryPassword,
      })

    if (resetError) {
  console.error('Supabase password reset failed')

  // The Auth password was not changed.
  // Restore the original password-change requirement.
  const { error: restoreError } = await admin
    .from('users')
    .update({
  must_change_password: target.must_change_password,
})
    .eq('id', targetId)

  if (restoreError) {
    console.error('Account flag restoration failed')

    // Leave the request in processing for investigation.
    return reply(
      {
        error:
          'Password reset failed. Account requires Admin intervention.',
      },
      500
    )
  }

  // Return the request to approved so the Admin can retry.
  const { error: requestError } = await admin
    .from('password_reset_requests')
    .update({
      status: 'approved',
      reset_started_at: null,
    })
    .eq('id', body.requestId)
    .eq('status', 'processing')

  if (requestError) {
    console.error('Reset request restoration failed')

    return reply(
      {
        error:
          'Password reset failed. Request requires Admin review.',
      },
      500
    )
  }

  return reply(
    { error: 'Password reset failed. Please try again.' },
    500
  )
}

    // Password changed successfully.
    const { error: completionError } = await admin
      .from('password_reset_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', body.requestId)
      .eq('status', 'processing')

    if (completionError) {
      console.error('Password reset completed but history update failed')
    }

    // This password is returned only in this response.
    // It must never be stored in the database or server logs.
    return reply({
      success: true,
      employeeNumber,
      temporaryPassword,
      warning: completionError
        ? 'Password changed, but request history requires review.'
        : null,
    })

  } catch (error) {
    console.error(
      'Admin password reset error:',
      error instanceof Error ? error.name : 'Unknown error'
    )

    return reply({ error: 'Unexpected server error' }, 500)
  }
}