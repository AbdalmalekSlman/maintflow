import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }

  const reply = (body: object, status: number) =>
    NextResponse.json(body, { status, headers })

  try {
    // Reject cross-origin requests.
    const origin = request.headers.get('origin')
    const expectedOrigin = new URL(request.url).origin

    if (!origin || origin !== expectedOrigin) {
      return reply({ error: 'Forbidden' }, 403)
    }

    if (
      request.headers.get('content-type')?.split(';')[0].trim()
      !== 'application/json'
    ) {
      return reply({ error: 'Invalid request format' }, 415)
    }

    const contentLength = Number(
      request.headers.get('content-length') ?? '0'
    )

    if (
      !Number.isFinite(contentLength) ||
      contentLength > 4096
    ) {
      return reply({ error: 'Invalid request size' }, 413)
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user || !user.email) {
      return reply({ error: 'Unauthorized' }, 401)
    }

    const body = await request.json().catch(() => null)

    const currentPassword = body?.currentPassword
    const newPassword = body?.newPassword
    const confirmPassword = body?.confirmPassword

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmPassword !== 'string'
    ) {
      return reply({ error: 'All password fields are required' }, 400)
    }

    if (
      currentPassword.length > 1024 ||
      newPassword.length > 128 ||
      confirmPassword.length > 128
    ) {
      return reply({ error: 'Invalid password length' }, 400)
    }

    if (newPassword.length < 12) {
      return reply(
        { error: 'New password must contain at least 12 characters' },
        400
      )
    }

    if (newPassword !== confirmPassword) {
      return reply({ error: 'New passwords do not match' }, 400)
    }

    if (newPassword === currentPassword) {
      return reply(
        { error: 'New password must be different from your current password' },
        400
      )
    }

    // Use a separate, non-persistent client to verify the
    // current password without replacing the user's browser session.
    const verificationClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const { data: verification, error: verificationError } =
      await verificationClient.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })

    if (
      verificationError ||
      !verification.user ||
      verification.user.id !== user.id
    ) {
      return reply({ error: 'Current password is incorrect' }, 400)
    }

    // Update the actual password using the authenticated
    // user's normal Supabase session.
    const { error: updateError } =
      await supabase.auth.updateUser({
        password: newPassword,
      })

    if (updateError) {
      return reply(
        { error: 'Unable to change password. Please try again.' },
        400
      )
    }

    // Update account-security metadata.
    // Password change has already succeeded at this point.
    const admin = createAdminClient()

    const { error: profileError } = await admin
      .from('users')
      .update({
        password_changed_at: new Date().toISOString(),
        must_change_password: false,
      })
      .eq('id', user.id)

    if (profileError) {
      console.error('Password changed but profile update failed')

      return reply({
        success: true,
        warning: 'Password changed, but account metadata could not be updated.',
      }, 200)
    }

    return reply({
      success: true,
      message: 'Password changed successfully.',
    }, 200)

  } catch (error) {
    console.error(
      'Change password error:',
      error instanceof Error ? error.name : 'Unknown error'
    )

    return reply(
      { error: 'Unexpected error. Please try again.' },
      500
    )
  }
}