import 'server-only'
import { createHmac } from 'node:crypto'
import { createAdminClient } from '@/utils/supabase/admin'

type RateLimitResult = {
  allowed: boolean
  error: boolean
}

export async function consumeRateLimit(
  category: string,
  identifier: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const secret = process.env.AUTH_RATE_LIMIT_SECRET

    if (!secret || secret.length < 32) {
      console.error('Rate limit secret is missing or too short')

      return { allowed: false, error: true }
    }

    const bucketKey = createHmac('sha256', secret)
      .update(`${category}:${identifier}`)
      .digest('hex')

    const admin = createAdminClient()

    const { data, error } = await admin.rpc(
      'consume_auth_rate_limit',
      {
        p_bucket_key: bucketKey,
        p_max_attempts: maxAttempts,
        p_window_seconds: windowSeconds,
      }
    )

    if (error || typeof data !== 'boolean') {
      console.error('Rate limit database check failed')

      return { allowed: false, error: true }
    }

    return { allowed: data, error: false }
  } catch {
    console.error('Rate limit unexpected failure')

    return { allowed: false, error: true }
  }
}