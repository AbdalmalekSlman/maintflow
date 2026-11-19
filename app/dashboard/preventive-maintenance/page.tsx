'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Permissions, PlantRole } from '@/lib/permissions'

interface PMSchedule {
  id: string
  title: string
  description: string
  frequency: string
  next_due_date: string
  status: string
  equipment?: {
    name: string
  }
}

interface EquipmentOption {
  id: string
  name: string
}

export default function PreventiveMaintenancePage() {
  const [userRole, setUserRole] = useState<PlantRole | null>(null)
  const [schedules, setSchedules] = useState<PMSchedule[]>([])
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([])
  const [loading, setLoading] = useState(true)
  
  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  
  const [nextDueDate, setNextDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly')
  const router = useRouter()

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/')
      return
    }

    // 1. Fetch current user's role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role) {
      setUserRole(profile.role as PlantRole)
    }

    // 2. Fetch PM Schedules
    const { data: pmData, error: pmError } = await supabase
      .from('pm_schedules')
      .select('id, title, description, frequency, next_due_date, status, equipment:equipment_id(name)')
      .order('next_due_date', { ascending: true })

    if (!pmError && pmData) {
      setSchedules(pmData as unknown as PMSchedule[])
    }

    // 3. Fetch Equipment list for dropdown
    const { data: eqData } = await supabase
      .from('equipment')
      .select('id, name')
      .order('name', { ascending: true })

    if (eqData) {
      setEquipmentList(eqData)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [router])

 const handleCreatePM = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    // Superintendents and Admins create pre-approved schedules; Team Leaders submit for approval
    const initialStatus = userRole === 'team_leader' ? 'pending_approval' : 'active'

    const { error } = await supabase
      .from('pm_schedules')
      .insert([
        {
          title,
          description,
          equipment_id: equipmentId || null,
          frequency,
          next_due_date: nextDueDate,
          status: initialStatus,
        },
      ])

    if (error) {
      alert('Error creating PM schedule: ' + error.message)
    } else {
      setTitle('')
      setDescription('')
      setEquipmentId('')
      setFrequency('monthly')
      setNextDueDate('')
      fetchData()
    }

    setSubmitting(false)
  }

  const handleApprovePM = async (scheduleId: string) => {
    const { error } = await supabase
      .from('pm_schedules')
      .update({ status: 'active' })
      .eq('id', scheduleId)

    if (error) {
      alert('Error approving PM: ' + error.message)
    } else {
      fetchData()
    }
  }

  const handleCompletePM = async (scheduleId: string) => {
    const { error } = await supabase
      .from('pm_schedules')
      .update({ status: 'completed' })
      .eq('id', scheduleId)

    if (error) {
      alert('Error updating PM status: ' + error.message)
    } else {
      fetchData()
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Preventive Maintenance (PM)</h1>
            <p className="text-sm text-slate-500">Scheduled inspections, recurring maintenance plans, and compliance tracking</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Create PM Form - Visible only to Admin, Superintendent, and Team Leader (Hidden for Manager & Technicians) */}
        {userRole && Permissions.canManagePM(userRole) && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Schedule Preventive Maintenance</h2>
            <form onSubmit={handleCreatePM} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Monthly Conveyor Belt Inspection"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Target Equipment</label>
                <select
                  required
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">Select Equipment...</option>
                  {equipmentList.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
                <select
  value={frequency}
  disabled={submitting}
  onChange={(e) => setFrequency(e.target.value)}
  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
>
  <option value="daily">Daily</option>
  <option value="weekly">Weekly</option>
  <option value="monthly">Monthly</option>
  <option value="quarterly">Quarterly</option>
  <option value="yearly">Yearly</option>
</select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Next Due Date</label>
                <input
                  type="date"
                  required
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Checklist / Instructions</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe inspection points, lubrication specs, or safety checks..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="md:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 shadow-sm"
                >
                  {submitting ? 'Saving...' : '+ Add PM Schedule'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* PM Schedules List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Active & Scheduled Maintenance ({schedules.length})</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading PM schedules...</div>
          ) : schedules.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No preventive maintenance schedules found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="px-6 py-3 font-medium">Task</th>
                    <th className="px-6 py-3 font-medium">Equipment</th>
                    <th className="px-6 py-3 font-medium">Frequency</th>
                    <th className="px-6 py-3 font-medium">Due Date</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {schedules.map((pm) => (
                    <tr key={pm.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{pm.title}</div>
                        <div className="text-xs text-slate-500">{pm.description}</div>
                      </td>
                      <td className="px-6 py-4">{pm.equipment?.name || 'General Plant'}</td>
                      <td className="px-6 py-4">{pm.frequency}</td>
                      <td className="px-6 py-4">{pm.next_due_date}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          pm.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          pm.status === 'pending_approval' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {pm.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {/* Superintendent & Admin Approval Button */}
                        {(userRole === 'superintendent' || userRole === 'admin') && pm.status === 'pending_approval' && (
                          <button
                            onClick={() => handleApprovePM(pm.id)}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium transition"
                          >
                            Approve
                          </button>
                        )}

                        {/* Execution Button (Hidden for Manager since Manager is View Only) */}
                        {userRole && userRole !== 'manager' && pm.status === 'active' && (
                          <button
                            onClick={() => handleCompletePM(pm.id)}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition"
                          >
                            Mark Completed
                          </button>
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