import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { consumeRateLimit } from '@/utils/auth/rate-limit'
const GENERIC_MESSAGE =
  'If this employee number is registered, your request has been submitted to the Admin.'

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }

  const respond = (body: object, status: number) =>
    NextResponse.json(body, { status, headers })

  try {
    // Reject requests from a different website.
    const origin = request.headers.get('origin')
    const expectedOrigin = new URL(request.url).origin

    if (!origin || origin !== expectedOrigin) {
      return respond({ error: 'Forbidden' }, 403)
    }

    if (
      request.headers.get('content-type')?.split(';')[0].trim()
      !== 'application/json'
    ) {
      return respond({ error: 'Invalid request format' }, 415)
    }

    // Bound the actual request body, not just Content-Length.
    const rawBody = await request.text()

    if (rawBody.length > 4096) {
      return respond({ error: 'Request too large' }, 413)
    }

    let body: unknown

    try {
      body = JSON.parse(rawBody)
    } catch {
      return respond({ error: 'Invalid request' }, 400)
    }

    const employeeNumber =
      body !== null &&
      typeof body === 'object' &&
      'employeeNumber' in body &&
      typeof body.employeeNumber === 'string'
        ? body.employeeNumber.trim()
        : ''

    if (
      !/^[1-9][0-9]*$/.test(employeeNumber) ||
      employeeNumber.length > 20
    ) {
      return respond(
        { error: 'Enter a valid employee number.' },
        400
      )
    }
// Maximum 3 reset requests per employee number per hour.
// The identifier is HMAC-hashed by consumeRateLimit.
const rateLimit = await consumeRateLimit(
  'password-reset-request',
  employeeNumber,
  3,
  60 * 60
)

if (rateLimit.error) {
  return respond(
    { error: 'Unable to process the request right now.' },
    503
  )
}

if (!rateLimit.allowed) {
  return NextResponse.json(
    {
      error: 'Too many requests. Please try again later.',
    },
    {
      status: 429,
      headers: {
        ...headers,
        'Retry-After': '3600',
      },
    }
  )
}
    const admin = createAdminClient()

    // Use the server-only Admin client.
    // Never expose this lookup to the browser.
    const { data: user, error: userError } = await admin
      .from('users')
      .select('id, employee_number')
      .eq('employee_number', employeeNumber)
      .maybeSingle()

    if (userError) {
      console.error('Password reset user lookup failed')
      return respond(
        { error: 'Unable to process the request right now.' },
        500
      )
    }

    // Identical response whether the account exists or not.
    if (!user) {
      return respond({
        success: true,
        message: GENERIC_MESSAGE,
      }, 200)
    }

    // One pending request per user is also enforced by the
    // database's unique partial index.
    const { error: insertError } = await admin
      .from('password_reset_requests')
      .insert({
        user_id: user.id,
        employee_number: user.employee_number,
        status: 'pending',
      })

    if (insertError && insertError.code !== '23505') {
      console.error('Password reset request insert failed')

      return respond(
        { error: 'Unable to process the request right now.' },
        500
      )
    }

    return respond({
      success: true,
      message: GENERIC_MESSAGE,
    }, 200)

  } catch (error) {
    console.error(
      'Password reset request error:',
      error instanceof Error ? error.name : 'Unknown error'
    )

    return respond(
      { error: 'Unable to process the request right now.' },
      500
    )
  }
}