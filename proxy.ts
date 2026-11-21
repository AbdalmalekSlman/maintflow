import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })

          response = NextResponse.next({ request })

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Preserve refreshed authentication cookies on redirects.
  function redirect(path: string) {
    const result = NextResponse.redirect(
      new URL(path, request.url)
    )

    response.cookies.getAll().forEach(cookie => {
      result.cookies.set(cookie)
    })

    return result
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return redirect('/')
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('must_change_password')
    .eq('id', user.id)
    .single()

  // Fail closed if account status cannot be verified.
  if (profileError || !profile) {
    return new NextResponse(
      'Unable to verify account status. Please try again.',
      { status: 503 }
    )
  }

  const pathname = request.nextUrl.pathname

  // Users with a temporary password may only access
  // the My Account page within the dashboard.
  if (
    profile.must_change_password &&
    pathname !== '/dashboard/account'
  ) {
    return redirect('/dashboard/account?passwordChange=required')
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}