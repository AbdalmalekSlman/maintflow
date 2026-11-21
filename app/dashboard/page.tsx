'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Permissions, PlantRole } from '@/lib/permissions'

interface UserProfile {
  full_name: string
  role: PlantRole
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      const { data } = await supabase
        .from('users')
        .select('full_name, role')
        .eq('id', user.id)
        .single()

      if (data) {
  setProfile(data as UserProfile)
} else {
  setProfile(null)
}
      setLoading(false)
    }

    fetchProfile()
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

 if (loading) {
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      Loading MaintFlow Dashboard...
    </div>
  )
}

if (!profile) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-red-700">
      Unable to verify your account. Please refresh or contact the Admin.
    </div>
  )
}

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">MaintFlow CMMS</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500">Welcome, <strong>{profile.full_name}</strong></span>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 rounded">
              Role: {profile.role.replace('_', ' ')}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
        >
          Sign Out
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. Work Orders (All Roles) */}
          <div 
            onClick={() => router.push('/dashboard/work-orders')}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-600 cursor-pointer transition space-y-2"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-lg">Work Orders</h2>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                {Permissions.canViewAllWorkOrders(profile.role) ? 'Plant-Wide' : 'Assigned / Team'}
              </span>
            </div>
            <p className="text-sm text-slate-500">Manage maintenance tasks, work assignments, and execution updates.</p>
          </div>

          {/* 2. Preventive Maintenance (All Roles) */}
          <div 
            onClick={() => router.push('/dashboard/preventive-maintenance')}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-600 cursor-pointer transition space-y-2"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-lg">Preventive Maintenance</h2>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                {Permissions.canManagePM(profile.role) ? 'Schedule / Approve' : 'Execute / View'}
              </span>
            </div>
            <p className="text-sm text-slate-500">Scheduled inspections, recurring maintenance checklists, and compliance.</p>
          </div>

          {/* 3. Inventory & Spare Parts (All Roles) */}
          <div 
            onClick={() => router.push('/dashboard/inventory')}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-600 cursor-pointer transition space-y-2"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-lg">Inventory & Parts</h2>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium">
                {Permissions.canManageInventory(profile.role) ? 'Manage Stock' : 'View Only'}
              </span>
            </div>
            <p className="text-sm text-slate-500">Browse spare parts catalog, stock quantities, and warehouse locations.</p>
          </div>

          {/* 4. Plant Equipment & Assets (All Roles) */}
          <div 
            onClick={() => router.push('/dashboard/equipment')}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-slate-500 cursor-pointer transition space-y-2"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-lg">Plant Equipment</h2>
              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                {Permissions.canEditEquipment(profile.role) ? 'Edit / Inspect' : 'View Only'}
              </span>
            </div>
            <p className="text-sm text-slate-500">Inspect machinery status, technical specifications, and asset logs.</p>
          </div>

          {/* 5. Operational Analytics (Admin, Manager, Superintendent, Team Leader) */}
          {Permissions.canViewAnalytics(profile.role) && (
            <div 
              onClick={() => router.push('/dashboard/analytics')}
              className="bg-white p-6 rounded-xl border border-amber-200 shadow-sm hover:border-amber-500 cursor-pointer transition space-y-2 bg-amber-50/10"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900 text-lg">Operational Analytics</h2>
                <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-medium">KPIs</span>
              </div>
              <p className="text-sm text-slate-600">Review plant uptime metrics, open backlogs, and performance reports.</p>
            </div>
          )}

          {/* 6. User & Role Management (Admin: Full | Manager & Superintendent: View Only) */}
          {Permissions.canViewUsers(profile.role) && (
            <div 
              onClick={() => router.push('/dashboard/users')}
              className="bg-white p-6 rounded-xl border border-purple-200 shadow-sm hover:border-purple-500 cursor-pointer transition space-y-2 bg-purple-50/20"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900 text-lg">User Management</h2>
                <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full font-medium">
                  {Permissions.canManageUsers(profile.role) ? 'Full Access' : 'View Only'}
                </span>
              </div>
              <p className="text-sm text-slate-600">View and manage plant personnel across the 7-tier hierarchy.</p>
            </div>
          )}
{/* 7. My Account - All authenticated users */}
<button
  type="button"
  onClick={() => router.push('/dashboard/account')}
  className="w-full text-left bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-blue-600 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600 cursor-pointer transition-all space-y-2"
>
  <div className="flex items-center justify-between">
    <h2 className="font-bold text-slate-900 text-lg">
      My Account
    </h2>
    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">
      All Users
    </span>
  </div>
  <p className="text-sm text-slate-500">
    View your account information and change your password.
  </p>
</button>

{/* 8. Password Reset Requests - Admin only */}
{profile.role === 'admin' && (
  <button
    type="button"
    onClick={() =>
      router.push('/dashboard/password-reset-requests')
    }
    className="w-full text-left bg-white p-6 rounded-xl border border-amber-200 shadow-sm hover:border-amber-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-amber-600 cursor-pointer transition-all space-y-2"
  >
    <div className="flex items-center justify-between">
      <h2 className="font-bold text-slate-900 text-lg">
        Password Reset Requests
      </h2>
      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-medium">
        Admin Only
      </span>
    </div>
    <p className="text-sm text-slate-500">
      Review employee requests, approve resets, and issue temporary passwords.
    </p>
  </button>
)}
        </div>
      </main>
    </div>
  )
}