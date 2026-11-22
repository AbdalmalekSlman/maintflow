import 'server-only'

export function isTrustedRequestOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false

  // A reverse proxy can leave the standalone server's request URL on loopback.
  const configured = process.env.AUTH_TRUSTED_ORIGIN
  if (configured === undefined) return origin === new URL(request.url).origin

  try {
    const expected = new URL(configured)
    return (expected.protocol === 'https:' || expected.protocol === 'http:') &&
      expected.href === `${expected.origin}/` && origin === expected.origin
  } catch {
    return false
  }
}
