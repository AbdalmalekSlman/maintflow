'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()

  const [employeeNumber, setEmployeeNumber] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (loading) return

    setLoading(true)
    setErrorMsg('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          employeeNumber: employeeNumber.trim(),
          password,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setErrorMsg(
          result.error || 'Invalid employee number or password'
        )
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setErrorMsg('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            MaintFlow CMMS
          </h1>
          <p className="text-sm text-slate-500">
            Sign in using your employee number
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="employeeNumber"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Employee Number
            </label>
            <input
              id="employeeNumber"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              pattern="[1-9][0-9]*"
              required
              maxLength={20}
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              placeholder="Enter employee number"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 shadow-sm"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="text-center">
  <Link
    href="/forgot-password"
    className="text-sm font-medium text-blue-700 hover:underline"
  >
    Forgot your password?
  </Link>
</div>
      </div>
    </div>
  )
}