'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (loading) return

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(
        '/api/auth/password-reset-request',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            employeeNumber: employeeNumber.trim(),
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to submit the request.'
        )
        return
      }

      setSuccess(result.message)
      setEmployeeNumber('')

    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Password Reset Request
          </h1>

          <p className="text-sm text-slate-500 mt-2">
            Enter your employee number to request
            password assistance from the system Admin.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="employeeNumber"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Employee Number
            </label>

            <input
              id="employeeNumber"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              pattern="[1-9][0-9]*"
              maxLength={20}
              required
              value={employeeNumber}
              onChange={(e) =>
                setEmployeeNumber(e.target.value)
              }
              placeholder="Enter employee number"
              className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? 'Submitting...'
              : 'Send Reset Request'}
          </button>
        </form>

        <Link
          href="/"
          className="block text-center text-sm text-blue-700 hover:underline"
        >
          ← Back to Login
        </Link>
      </div>
    </div>
  )
}