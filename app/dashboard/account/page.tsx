'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Profile = {
  full_name: string
  employee_number: string | null
  role: string
  password_changed_at: string | null
  must_change_password: boolean
}
  

export default function MyAccountPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/')
        return
      }

      const { data, error: profileError } = await supabase
        .from('users')
        .select(
  'full_name, employee_number, role, password_changed_at, must_change_password'
)
        .eq('id', user.id)
        .single()

      if (!active) return

      if (profileError || !data) {
        setError('Unable to load account information.')
      } else {
        setProfile(data as Profile)
      }

      setLoading(false)
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [router])

  async function handleChangePassword(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault()

    if (saving) return

    setError('')
    setSuccess('')

    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Unable to change password.')
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')

      setSuccess(
        result.warning ||
        result.message ||
        'Password changed successfully.'
      )

      if (!result.warning) {
  setProfile(previous => previous
    ? {
        ...previous,
        password_changed_at: new Date().toISOString(),
        must_change_password: false,
      }
    : previous
  )

  router.replace('/dashboard')
  router.refresh()
}
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-slate-600">
        Loading account...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {!profile?.must_change_password && (
  <a
    href="/dashboard"
    className="inline-flex items-center text-sm font-medium text-blue-700 cursor-pointer hover:text-blue-900 hover:underline"
  >
    ← Back to Dashboard
  </a>
)}

        <h1 className="text-2xl font-bold text-slate-900">
          My Account
        </h1>
{profile?.must_change_password && (
  <div
    role="alert"
    className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900"
  >
    <p className="font-semibold">
      Password Change Required
    </p>

    <p className="mt-1 text-sm">
      You are using a temporary password.
      Please change your password before accessing MaintFlow.
    </p>
  </div>
)}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Account Information
          </h2>

          {profile ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Full Name</p>
                <p className="font-medium text-slate-900">
                  {profile.full_name}
                </p>
              </div>

              <div>
                <p className="text-slate-500">Employee Number</p>
                <p className="font-medium text-slate-900">
                  {profile.employee_number || 'Not assigned'}
                </p>
              </div>

              <div>
                <p className="text-slate-500">Role</p>
                <p className="font-medium text-slate-900">
                  {profile.role.replaceAll('_', ' ')}
                </p>
              </div>

              <div>
                <p className="text-slate-500">Last Password Change</p>
                <p className="font-medium text-slate-900">
                  {profile.password_changed_at
                    ? new Date(
                        profile.password_changed_at
                      ).toLocaleString()
                    : 'Not recorded'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-red-700">
              Unable to display account information.
            </p>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Change Password
          </h2>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700"
            >
              {success}
            </div>
          )}

          <form
            onSubmit={handleChangePassword}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3 text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3 text-slate-900"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use at least 12 characters.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3 text-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !profile}
              className="rounded-lg bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Changing Password...' : 'Change Password'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
