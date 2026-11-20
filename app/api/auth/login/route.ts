import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'


const INVALID_CREDENTIALS = 'Invalid employee number or password'

export async function POST(request: Request) {
  const headers = {
    'Cache-Control': 'no-store',
  }

  try {
    // Allow requests only from this application's origin.
    const origin = request.headers.get('origin')
    const expectedOrigin = new URL(request.url).origin

    if (!origin || origin !== expectedOrigin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers }
      )
    }

    // Restrict request size.
    const contentLength = Number(
      request.headers.get('content-length') ?? '0'
    )

    if (
      !Number.isFinite(contentLength) ||
      contentLength > 4096
    ) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400, headers }
      )
    }

    const body = await request.json().catch(() => null)

    const employeeNumber =
      typeof body?.employeeNumber === 'string'
        ? body.employeeNumber.trim()
        : ''

    const password =
      typeof body?.password === 'string'
        ? body.password
        : ''

    // Employee numbers are numeric, without leading zero.
    if (
      !/^[1-9][0-9]*$/.test(employeeNumber) ||
      employeeNumber.length > 20 ||
      !password ||
      password.length > 1024
    ) {
      return NextResponse.json(
        { error: INVALID_CREDENTIALS },
        { status: 401, headers }
      )
    }

    // Use the privileged client only to resolve the
    // employee number to the internal Auth identity.
    const admin = createAdminClient()

    const { data: profile, error: lookupError } = await admin
      .from('users')
      .select('id, email')
      .eq('employee_number', employeeNumber)
      .maybeSingle()

    if (lookupError) {
      console.error('Employee login lookup failed')

      return NextResponse.json(
        { error: 'Unable to sign in right now' },
        { status: 500, headers }
      )
    }

    if (!profile) {
      return NextResponse.json(
        { error: INVALID_CREDENTIALS },
        { status: 401, headers }
      )
    }

    // This is the normal request-scoped Supabase SSR
    // client, not the privileged Admin client.
    const supabase = await createClient()

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      })

    if (
      error ||
      !data.user ||
      data.user.id !== profile.id
    ) {
      if (data.user) {
        await supabase.auth.signOut()
      }

      return NextResponse.json(
        { error: INVALID_CREDENTIALS },
        { status: 401, headers }
      )
    }

    return NextResponse.json(
      { success: true },
      { status: 200, headers }
    )
  } catch (error) {
    console.error(
      'Employee login error:',
      error instanceof Error ? error.name : 'Unknown error'
    )

    return NextResponse.json(
      { error: 'Unable to sign in right now' },
      { status: 500, headers }
    )
  }
}