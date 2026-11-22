'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/lib/useCurrentUser'

type ResetRequest = {
  id: string
  employee_number: string
  status: 'pending' | 'approved' | 'processing' | 'rejected' | 'completed'
  request_note: string | null
  admin_note: string | null
  created_at: string
  reviewed_at: string | null
  completed_at: string | null
  reset_started_at: string | null
}

export default function PasswordResetRequestsPage() {
  const router = useRouter()
  const { role, loading: authLoading } = useCurrentUser()

  const [requests, setRequests] = useState<ResetRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [temporaryCredentials, setTemporaryCredentials] = useState<{
  employeeNumber: string
  password: string
} | null>(null)
const [passwordCopied, setPasswordCopied] = useState(false)
  const [now, setNow] = useState<number | null>(null)

  const fetchRequests = useCallback(async () => {
    try {
      const response = await fetch(
        '/api/admin/password-reset-requests',
        { cache: 'no-store' }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to load requests')
      }

      setRequests(result.requests ?? [])
      setNow(Date.now())
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return

    if (role !== 'admin') {
      router.replace('/dashboard')
      return
    }

    const timer = window.setTimeout(() => void fetchRequests(), 0)
    return () => window.clearTimeout(timer)
  }, [authLoading, role, router, fetchRequests])

  useEffect(() => {
    if (!requests.some(request => request.status === 'processing')) return

    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [requests])

  async function reviewRequest(
    requestId: string,
    decision: 'approved' | 'rejected'
  ) {
    if (processingId) return

    const confirmed = window.confirm(
      `Are you sure you want to ${decision === 'approved' ? 'approve' : 'reject'} this request?`
    )

    if (!confirmed) return

    const note = window.prompt(
      'Admin note (optional, maximum 500 characters):',
      ''
    )

    if (note === null) return

    if (note.length > 500) {
      setError('Admin note must not exceed 500 characters.')
      return
    }

    setProcessingId(requestId)
    setError('')
    setMessage('')

    try {
      const response = await fetch(
        '/api/admin/password-reset-requests',
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            decision,
            adminNote: note,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to review request')
      }

      setMessage(result.message)
      await fetchRequests()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error'
      )
    } finally {
      setProcessingId(null)
    }
  }
  async function resetEmployeePassword(requestId: string) {
  if (processingId || temporaryCredentials) return

  const confirmed = window.confirm(
    'Reset this employee password?\n\n' +
    'The current password will stop working, and a new temporary ' +
    'password will be displayed once.'
  )

  if (!confirmed) return

  setProcessingId(requestId)
  setError('')
  setMessage('')

  try {
    const response = await fetch(
      '/api/admin/password-reset-requests/reset',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId }),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(
        result.error || 'Unable to reset password'
      )
    }
setPasswordCopied(false)
    setTemporaryCredentials({
      employeeNumber: result.employeeNumber,
      password: result.temporaryPassword,
    })

    if (result.warning) {
      setError(result.warning)
    }

    await fetchRequests()
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unexpected password reset error'
    )
  } finally {
    setProcessingId(null)
  }
}

  if (authLoading || role !== 'admin') {
    return <div className="p-8 text-slate-600">Checking access...</div>
  }

  const pendingCount = requests.filter(
    r => r.status === 'pending'
  ).length

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        <button
          onClick={() => router.push('/dashboard')}
          className="text-sm text-blue-700 hover:underline"
        >
          ← Back to Dashboard
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Password Reset Requests
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Review employee password assistance requests.
            </p>
          </div>

          <button
            onClick={() => {
              setLoading(true)
              setError('')
              void fetchRequests()
            }}
            disabled={loading || processingId !== null}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 bg-white disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-500">Pending Requests</p>
          <p className="text-3xl font-bold text-slate-900">
            {pendingCount}
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {message && (
          <div role="status" className="p-3 bg-green-50 text-green-700 rounded-lg">
            {message}
          </div>
        )}
        {temporaryCredentials && (
  <div
    role="alert"
    className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-3"
  >
    <h2 className="text-lg font-bold text-amber-950">
      Temporary Password – Displayed Once
    </h2>

    <p className="text-sm text-amber-900">
      Employee Number:
      <strong className="ml-2">
        {temporaryCredentials.employeeNumber}
      </strong>
    </p>

    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <code className="break-all text-slate-900">
        {temporaryCredentials.password}
      </code>
    </div>

    <p className="text-sm text-amber-900">
      Deliver this password through an approved secure channel.
      The employee must change it at their next login.
      Closing this message will remove it from this page.
    </p>

    <div className="flex flex-wrap gap-2">
      <button
  type="button"
  onClick={async () => {
    if (!temporaryCredentials) return

    try {
      await navigator.clipboard.writeText(
        temporaryCredentials.password
      )

      setPasswordCopied(true)
      setError('')
    } catch {
      setError('Unable to copy password.')
    }
  }}
  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white cursor-pointer hover:bg-blue-700 active:scale-95 transition-all duration-150"
>
  {passwordCopied ? '✓ Copied!' : 'Copy Password'}
</button>

      <button
        type="button"
        onClick={() => setTemporaryCredentials(null)}
        className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-medium text-amber-950 cursor-pointer hover:bg-amber-100 active:scale-95 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        I&apos;ve Saved It – Close
      </button>
    </div>
  </div>
)}

        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3">Employee Number</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Admin Note</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center">
                    Loading requests...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center">
                    No password reset requests found.
                  </td>
                </tr>
              ) : (
                requests.map(request => (
                  <tr key={request.id}>
                    <td className="px-4 py-4 font-semibold">
                      {request.employee_number}
                    </td>

                    <td className="px-4 py-4">
                      {new Date(request.created_at).toLocaleString()}
                    </td>

                    <td className="px-4 py-4 capitalize">
                      {request.status}
                    </td>

                    <td className="px-4 py-4">
                      {request.admin_note || '—'}
                    </td>

                    <td className="px-4 py-4">
                      {request.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button
                            disabled={processingId !== null}
                            onClick={() =>
                              void reviewRequest(request.id, 'approved')
                            }
                            className="rounded-lg bg-green-600 px-3 py-2 text-white disabled:opacity-50"
                          >
                            Approve
                          </button>

                          <button
                            disabled={processingId !== null}
                            onClick={() =>
                              void reviewRequest(request.id, 'rejected')
                            }
                            className="rounded-lg bg-red-600 px-3 py-2 text-white disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : request.status === 'approved' ? (
  <button
    type="button"
    disabled={processingId !== null || temporaryCredentials !== null}
    onClick={() => void resetEmployeePassword(request.id)}
    className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
  >
    {processingId === request.id
      ? 'Resetting...'
      : 'Reset Password'}
  </button>
) : request.status === 'processing' ? (
  <button
    type="button"
    disabled={
      processingId !== null ||
      temporaryCredentials !== null ||
      !request.reset_started_at ||
      now === null ||
      now - new Date(
        request.reset_started_at
      ).getTime() < 5 * 60 * 1000
    }
    onClick={() => void resetEmployeePassword(request.id)}
    className="rounded-lg border border-amber-400 px-3 py-2 text-amber-800 disabled:opacity-50"
  >
    Retry Interrupted Reset
  </button>
) : (
  <span className="text-slate-500">
    Reviewed
  </span>
)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500">
          Approving a request does not change the employee password.
          This view displays the most recent 100 requests.
        </p>
      </div>
    </div>
  )
}
