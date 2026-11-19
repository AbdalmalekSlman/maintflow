'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Permissions, PlantRole } from '@/lib/permissions'

interface WorkOrder {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'assigned' | 'in_progress' | 'completed_pending_review' | 'verified_closed'
  created_at: string
  equipment?: { name: string }
  team_leader?: { full_name: string }
  assignee?: { full_name: string }
}

interface EquipmentOption {
  id: string
  name: string
}

interface UserOption {
  id: string
  full_name: string
  role: string
}

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([])
  const [usersList, setUsersList] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<PlantRole | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('')

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [equipmentId, setEquipmentId] = useState('')
  const [teamLeaderId, setTeamLeaderId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const router = useRouter()

  // Derived role flags
  const isReadOnly = userRole === 'manager' || userRole === 'stock_keeper'
  const isShiftTech = userRole === 'shift_technician'

  const fetchData = async () => {
    setLoading(true)

    // 1. Get current logged-in user session
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      return
    }

    setCurrentUserId(user.id)

    // 2. Fetch user profile to check role and display name
    const { data: profile } = await supabase
      .from('users')
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    const activeRole = (profile?.role as PlantRole) || null
    if (activeRole) {
      setUserRole(activeRole)
    }
    setCurrentUserName(profile?.full_name || user.email || 'Current User')

    // 3. Build query based on role
    let query = supabase
      .from('work_orders')
      .select(
        'id, title, description, priority, status, created_at, equipment:equipment_id(name), team_leader:team_leader_id(full_name), assignee:assigned_to(full_name)'
      )
      .order('created_at', { ascending: false })

    // If the user is a technician, restrict view strictly to work orders assigned to them
    if (activeRole === 'technician') {
      query = query.eq('assigned_to', user.id)
    }

    const { data: woData, error: woError } = await query

    if (woError) {
      console.error('Error fetching work orders:', woError.message)
    } else if (woData) {
      setWorkOrders(woData as WorkOrder[])
    }

    const { data: eqData } = await supabase.from('equipment').select('id, name')
    if (eqData) setEquipmentList(eqData)

    const { data: userData } = await supabase.from('users').select('id, full_name, role')
    if (userData) setUsersList(userData)

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (isShiftTech && currentUserId) {
      setAssignedTo(currentUserId)
    }
  }, [isShiftTech, currentUserId])

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    const trimmedTitle = title.trim()

if (!trimmedTitle) {
  alert('Please enter a valid work order title.')
  setSubmitting(false)
  return
}
    e.preventDefault()
    setSubmitting(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      alert('You must be logged in to create a work order.')
      setSubmitting(false)
      return
    }

    const finalAssignedTo =
      userRole === 'shift_technician' ? user.id : assignedTo || null

    const { error } = await supabase.from('work_orders').insert([
      {
        title,
        description,
        priority,
        equipment_id: equipmentId || null,
        team_leader_id: teamLeaderId || null,
        assigned_to: finalAssignedTo,
        created_by: user.id,
        status: 'assigned',
      },
    ])

    if (error) {
      alert('Error creating work order: ' + error.message)
    } else {
      setTitle('')
      setDescription('')
      setPriority('medium')
      setEquipmentId('')
      setTeamLeaderId('')
      setAssignedTo(isShiftTech && currentUserId ? currentUserId : '')
      await fetchData()
    }
    setSubmitting(false)
  }

  const updateStatus = async (id: string, newStatus: WorkOrder['status']) => {
    if (isReadOnly) return

    const { error } = await supabase
      .from('work_orders')
      .update({ status: newStatus })
      .eq('id', id)

    if (!error) {
      await fetchData()
    }
  }

  const teamLeaders = usersList.filter((u) => u.role === 'team_leader')
  const technicians = usersList.filter(
    (u) => u.role === 'technician' || u.role === 'shift_technician'
  )

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Work Orders Dispatch</h1>
            <p className="text-sm text-slate-500">
              Assign a mandatory Team Leader and Technician to plant maintenance tasks
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Create Work Order Form */}
        {userRole && Permissions.canCreateWorkOrder(userRole) && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Dispatch New Work Order</h2>
            <form onSubmit={handleCreateWorkOrder} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Replace hydraulic seals on CNC Mill #1"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Target Equipment</label>
                <select
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Select Equipment (Optional)</option>
                  {equipmentList.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Assign Team Leader (Required)
                </label>
                <select
                  required
                  value={teamLeaderId}
                  onChange={(e) => setTeamLeaderId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Select Team Leader</option>
                  {teamLeaders.map((tl) => (
                    <option key={tl.id} value={tl.id}>
                      {tl.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Assign Technician (Required)
                </label>
                {isShiftTech ? (
                  <input
                    type="text"
                    value={currentUserName || 'Assigned to You'}
                    disabled
                    className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-300 rounded-lg text-slate-600 cursor-not-allowed"
                  />
                ) : (
                  <select
                    required
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Select Technician</option>
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Description & Instructions
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide details on symptoms, required tools, or safety notes..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="md:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 shadow-sm"
                >
                  {submitting ? 'Dispatching...' : 'Dispatch Work Order'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Work Orders List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Active Work Orders ({workOrders.length})</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading work orders...</div>
          ) : workOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No work orders dispatched yet. Create your first task above!
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {workOrders.map((wo) => (
                <div
                  key={wo.id}
                  className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3
                        onClick={() => router.push(`/dashboard/work-orders/${wo.id}`)}
                        className="font-semibold text-slate-900 hover:text-blue-600 cursor-pointer transition"
                      >
                        {wo.title}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                          wo.priority === 'urgent'
                            ? 'bg-red-100 text-red-800'
                            : wo.priority === 'high'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {wo.priority}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{wo.description || 'No description provided.'}</p>
                    <p className="text-xs text-slate-400">
                      Equipment:{' '}
                      <span className="font-medium text-slate-700">
                        {wo.equipment?.name || 'General Facility'}
                      </span>{' '}
                      • Team Leader:{' '}
                      <span className="font-medium text-slate-700">
                        {wo.team_leader?.full_name || 'Unassigned'}
                      </span>{' '}
                      • Tech:{' '}
                      <span className="font-medium text-slate-700">
                        {wo.assignee?.full_name || 'Unassigned'}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        wo.status === 'verified_closed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : wo.status === 'completed_pending_review'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : wo.status === 'in_progress'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {wo.status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    {isReadOnly ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                        {wo.status.replace('_', ' ')}
                      </span>
                    ) : (
                      <select
                        value={wo.status}
                        onChange={(e) => updateStatus(wo.id, e.target.value as any)}
                        className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
                      >
                        <option value="assigned">Assigned</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed_pending_review">Pending Review</option>
                        <option value="verified_closed">Verified Closed</option>
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}