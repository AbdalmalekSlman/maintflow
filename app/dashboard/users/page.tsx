'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Permissions, PlantRole } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/useCurrentUser'

interface UserProfile {
  id: string
  full_name: string
  role: PlantRole
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  // New user form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<PlantRole>('technician')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  const { role: userRole, userId: currentUserId, loading: authLoading } = useCurrentUser()

  useEffect(() => {
    if (!authLoading && userRole && !Permissions.canViewUsers(userRole)) router.replace('/dashboard')
  }, [authLoading, userRole, router])

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, role')
      .order('full_name', { ascending: true })
    if (!error && data) setUsers(data as UserProfile[])
    setLoading(false)
    }, [])

  useEffect(() => {
  if (
    authLoading ||
    !userRole ||
    !Permissions.canViewUsers(userRole)
  ) {
    return
  }

  const timer = window.setTimeout(() => {
    void fetchUsers()
  }, 0)

  return () => window.clearTimeout(timer)
}, [authLoading, userRole, fetchUsers])

    const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName, role }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert('Error creating user: ' + (data.error || 'Unknown error'))
      } else {
        alert('User successfully created and assigned!')
        setFullName('')
        setEmail('')
        setPassword('')
        setRole('technician')
        fetchUsers()
      }
    } catch (err: unknown) {
  const message =
    err instanceof Error
      ? err.message
      : 'An unexpected error occurred.'

  alert('Error: ' + message)
}
    setSubmitting(false)
  }

  const handleRoleChange = async (userId: string, newRole: PlantRole) => {
    if (userId === currentUserId) return          // never edit your own role
    setUpdatingId(userId)
    const { data, error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', userId)
      .select('id')                               // lets us detect a silent RLS block

    if (error) {
      alert('Error updating role: ' + error.message)
    } else if (!data?.length) {
      alert('Not permitted to change this role.')
    } else {
      fetchUsers()
    }
    setUpdatingId(null)
  }

  const formatRoleLabel = (r: PlantRole) => {
    switch (r) {
      case 'admin': return 'Admin'
      case 'manager': return 'Manager'
      case 'superintendent': return 'Superintendent'
      case 'team_leader': return 'Team Leader'
      case 'technician': return 'Technician'
      case 'shift_technician': return 'Shift Technician'
      case 'stock_keeper': return 'Stock Keeper'
      default: return r
    }
  }

  if (authLoading || !userRole || !Permissions.canViewUsers(userRole)) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>
  }
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User & Role Management</h1>
            <p className="text-sm text-slate-500">Provision plant personnel across all operational hierarchy levels</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Add New User Form */}
        {userRole && Permissions.canManageUsers(userRole) && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Add New Team Member</h2>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@plant.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Temporary Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as PlantRole)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="superintendent">Superintendent</option>
                <option value="team_leader">Team Leader</option>
                <option value="technician">Technician</option>
                <option value="shift_technician">Shift Technician</option>
                <option value="stock_keeper">Stock Keeper</option>
              </select>
            </div>
            <div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 shadow-sm"
              >
                {submitting ? 'Creating...' : '+ Create User'}
              </button>
            </div>
          </form>
        </div>
        )}
        {/* Users Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Registered Plant Users ({users.length})</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No registered users found in the database.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="px-6 py-3 font-medium">Full Name</th>
                    <th className="px-6 py-3 font-medium">User ID</th>
                    <th className="px-6 py-3 font-medium">Assigned Role</th>
                    <th className="px-6 py-3 font-medium text-right">Update Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{u.full_name || 'Unnamed User'}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{u.id}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                          u.role === 'admin' ? 'bg-red-50 text-red-700 border border-red-200' :
                          u.role === 'manager' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                          u.role === 'superintendent' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          u.role === 'team_leader' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          u.role === 'shift_technician' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {formatRoleLabel(u.role || 'technician')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {Permissions.canManageUsers(userRole) && u.id !== currentUserId ? (
                        <select
                          value={u.role || 'technician'}
                          disabled={updatingId === u.id}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as PlantRole)}
                          className="px-3 py-1 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:opacity-50"
                        >
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="superintendent">Superintendent</option>
                          <option value="team_leader">Team Leader</option>
                          <option value="technician">Technician</option>
                          <option value="shift_technician">Shift Technician</option>
                          <option value="stock_keeper">Stock Keeper</option>
                        </select>
                        ) : (
    <span className="text-xs text-slate-400">{u.id === currentUserId ? 'You' : 'View only'}</span>
  )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}