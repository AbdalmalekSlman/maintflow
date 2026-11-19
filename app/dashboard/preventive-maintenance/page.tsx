'use client'

import { useCallback, useEffect, useState } from 'react'
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
  equipment_id: string | null
  equipment?: {
    name: string
  }
}

interface EquipmentOption {
  id: string
  name: string
}

type PMFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
type DueUrgency = 'overdue' | 'upcoming' | 'normal'

const ROLES_ALLOWED_TO_COMPLETE_PM: PlantRole[] = [
  'admin',
  'superintendent',
  'team_leader',
]

const normalizePMFrequency = (value: string): PMFrequency => {
  const lower = value.trim().toLowerCase()
  if (
    lower === 'daily' ||
    lower === 'weekly' ||
    lower === 'monthly' ||
    lower === 'quarterly' ||
    lower === 'yearly'
  ) {
    return lower
  }
  return 'monthly'
}

const getLocalDateISO = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDaysISO = (baseISO: string, days: number): string => {
  const [y, m, d] = baseISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days))
  return dt.toISOString().slice(0, 10)
}

const getDueUrgency = (nextDueDate: string, status: string): DueUrgency => {
  if (!nextDueDate || status === 'completed') return 'normal'
  const todayISO = getLocalDateISO()
  const upcomingCutoffISO = addDaysISO(todayISO, 7)

  if (nextDueDate < todayISO) return 'overdue'
  if (nextDueDate <= upcomingCutoffISO) return 'upcoming'
  return 'normal'
}

const calculateNextDueDate = (currentDueDate: string, frequency: string): string => {
  const normalizedFreq = frequency.trim().toLowerCase()
  const base = /^\d{4}-\d{2}-\d{2}$/.test(currentDueDate)
    ? new Date(`${currentDueDate}T00:00:00Z`)
    : new Date()

  const year = base.getUTCFullYear()
  const month = base.getUTCMonth()
  const day = base.getUTCDate()

  let next: Date

  switch (normalizedFreq) {
    case 'daily':
      next = new Date(Date.UTC(year, month, day + 1))
      break
    case 'weekly':
      next = new Date(Date.UTC(year, month, day + 7))
      break
    case 'quarterly': {
      const targetMonth = month + 3
      const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
      next = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)))
      break
    }
    case 'yearly': {
      const targetYear = year + 1
      const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate()
      next = new Date(Date.UTC(targetYear, month, Math.min(day, lastDay)))
      break
    }
    case 'monthly':
    default: {
      const targetMonth = month + 1
      const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
      next = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)))
      break
    }
  }

  return next.toISOString().slice(0, 10)
}

export default function PreventiveMaintenancePage() {
  const [userRole, setUserRole] = useState<PlantRole | null>(null)
  const [schedules, setSchedules] = useState<PMSchedule[]>([])
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  // Create Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [nextDueDate, setNextDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [frequency, setFrequency] = useState<PMFrequency>('monthly')

  // Inline Edit state (PM-06)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [editFrequency, setEditFrequency] = useState<PMFrequency>('monthly')
  const [editNextDueDate, setEditNextDueDate] = useState('')
  const [savingScheduleEdit, setSavingScheduleEdit] = useState(false)

  // PM-to-WO generation state (PM-07)
  const [generatingWOId, setGeneratingWOId] = useState<string | null>(null)

  const router = useRouter()

  const canCompletePM = Boolean(userRole && ROLES_ALLOWED_TO_COMPLETE_PM.includes(userRole))
  const canEditScheduleInterval = userRole === 'superintendent' || userRole === 'admin'
  const canGenerateWO = Boolean(userRole && userRole !== 'manager')

  const overdueCount = schedules.filter((pm) => getDueUrgency(pm.next_due_date, pm.status) === 'overdue').length
  const upcomingCount = schedules.filter((pm) => getDueUrgency(pm.next_due_date, pm.status) === 'upcoming').length

  const fetchData = useCallback(async () => {
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
      .select('id, title, description, frequency, next_due_date, status, equipment_id, equipment:equipment_id(name)')
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
  }, [router])

  useEffect(() => {
  const timer = window.setTimeout(() => {
    void fetchData()
  }, 0)

  return () => window.clearTimeout(timer)
}, [fetchData])
  const handleCreatePM = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setActionMessage(null)

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
      await fetchData()
    }

    setSubmitting(false)
  }

  const handleApprovePM = async (scheduleId: string) => {
    setActionMessage(null)

    const { data, error } = await supabase
      .from('pm_schedules')
      .update({ status: 'active' })
      .eq('id', scheduleId)
      .select('id')

    if (error) {
      alert('Error approving PM: ' + error.message)
    } else if (!data || data.length === 0) {
      setActionMessage({
        type: 'error',
        text: 'Permission denied: unable to approve this PM schedule.',
      })
    } else {
      await fetchData()
    }
  }

  const handleCompletePM = async (schedule: PMSchedule) => {
    setActionMessage(null)

    if (!canCompletePM) {
      setActionMessage({
        type: 'error',
        text: `Permission denied: role "${userRole || 'unknown'}" is not authorized to mark PM schedules as completed.`,
      })
      return
    }

    const rolledDueDate = calculateNextDueDate(schedule.next_due_date, schedule.frequency)

    const { data, error } = await supabase
      .from('pm_schedules')
      .update({
        next_due_date: rolledDueDate,
        status: 'active',
      })
      .eq('id', schedule.id)
      .select('id')

    if (error) {
      setActionMessage({
        type: 'error',
        text: `Unable to complete PM schedule: ${error.message}`,
      })
      return
    }

    if (!data || data.length === 0) {
      setActionMessage({
        type: 'error',
        text: 'Permission denied or PM schedule no longer available (0 rows updated).',
      })
      return
    }

    setActionMessage({
      type: 'success',
      text: `PM cycle completed. Next due date rolled forward to ${rolledDueDate}.`,
    })
    await fetchData()
  }

  const startEditingSchedule = (pm: PMSchedule) => {
    setActionMessage(null)
    setEditingScheduleId(pm.id)
    setEditFrequency(normalizePMFrequency(pm.frequency))
    setEditNextDueDate(pm.next_due_date)
  }

  const cancelEditingSchedule = () => {
    setEditingScheduleId(null)
    setEditFrequency('monthly')
    setEditNextDueDate('')
  }

  const handleSaveScheduleEdit = async (scheduleId: string) => {
    setActionMessage(null)

    if (!canEditScheduleInterval) {
      setActionMessage({
        type: 'error',
        text: `Permission denied: role "${userRole || 'unknown'}" cannot edit PM intervals.`,
      })
      return
    }

    if (!editNextDueDate) {
      setActionMessage({
        type: 'error',
        text: 'Please select a valid due date.',
      })
      return
    }

    setSavingScheduleEdit(true)

    try {
      const { data, error } = await supabase
        .from('pm_schedules')
        .update({
          frequency: editFrequency,
          next_due_date: editNextDueDate,
        })
        .eq('id', scheduleId)
        .select('id')

      if (error) {
        setActionMessage({
          type: 'error',
          text: `Error updating PM interval: ${error.message}`,
        })
        return
      }

      if (!data || data.length === 0) {
        setActionMessage({
          type: 'error',
          text: 'Permission denied or PM schedule no longer available (0 rows updated).',
        })
        return
      }

      cancelEditingSchedule()
      setActionMessage({
        type: 'success',
        text: 'PM schedule interval updated.',
      })
      await fetchData()
    } finally {
      setSavingScheduleEdit(false)
    }
  }

  const handleGenerateWorkOrder = async (pm: PMSchedule) => {
    setActionMessage(null)

    if (!canGenerateWO) {
      setActionMessage({
        type: 'error',
        text: `Permission denied: role "${userRole || 'unknown'}" cannot generate work orders.`,
      })
      return
    }

    setGeneratingWOId(pm.id)

    try {
      const urgency = getDueUrgency(pm.next_due_date, pm.status)
      const priority = urgency === 'overdue' ? 'high' : 'medium'

      const { data, error } = await supabase
        .from('work_orders')
        .insert([
          {
            title: `PM: ${pm.title}`,
            description:
              pm.description ||
              `Preventive maintenance (${pm.frequency}) scheduled for ${pm.next_due_date}`,
            equipment_id: pm.equipment_id || null,
            status: 'open',
            priority,
          },
        ])
        .select('id')

      if (error) {
        setActionMessage({
          type: 'error',
          text: `Failed to generate work order: ${error.message}`,
        })
        return
      }

      if (!data || data.length === 0) {
        setActionMessage({
          type: 'error',
          text: 'Unable to create work order: permission denied or insert blocked (0 rows returned).',
        })
        return
      }

      setActionMessage({
        type: 'success',
        text: `Generated open work order for "${pm.title}" (${priority.toUpperCase()} priority).`,
      })
    } finally {
      setGeneratingWOId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Preventive Maintenance (PM)</h1>
            <p className="text-sm text-slate-500">Scheduled inspections, recurring maintenance plans, and compliance tracking</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
              Overdue: {overdueCount}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              Due ≤ 7d: {upcomingCount}
            </span>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {actionMessage && (
          <div
            className={`px-4 py-3 rounded-xl border text-sm font-medium ${
              actionMessage.type === 'error'
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        {/* Create PM Form - Visible only to Admin, Superintendent, and Team Leader */}
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
                  onChange={(e) => setFrequency(e.target.value as PMFrequency)}
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
                  {schedules.map((pm) => {
                    const isEditing = editingScheduleId === pm.id
                    const urgency = getDueUrgency(pm.next_due_date, pm.status)
                    const rowHighlightClass =
                      urgency === 'overdue'
                        ? 'bg-red-50/70 hover:bg-red-50'
                        : urgency === 'upcoming'
                        ? 'bg-amber-50/60 hover:bg-amber-50'
                        : 'hover:bg-slate-50'

                    return (
                      <tr key={pm.id} className={rowHighlightClass}>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{pm.title}</div>
                          <div className="text-xs text-slate-500">{pm.description}</div>
                        </td>
                        <td className="px-6 py-4">{pm.equipment?.name || 'General Plant'}</td>
                        <td className="px-6 py-4 capitalize">
                          {isEditing ? (
                            <select
                              value={editFrequency}
                              disabled={savingScheduleEdit}
                              onChange={(e) => setEditFrequency(e.target.value as PMFrequency)}
                              className="px-2.5 py-1 border border-slate-300 rounded-md text-xs font-medium text-slate-900 bg-white"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                              <option value="quarterly">Quarterly</option>
                              <option value="yearly">Yearly</option>
                            </select>
                          ) : (
                            pm.frequency
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editNextDueDate}
                              disabled={savingScheduleEdit}
                              onChange={(e) => setEditNextDueDate(e.target.value)}
                              className="px-2.5 py-1 border border-slate-300 rounded-md text-xs text-slate-900 bg-white"
                            />
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={
                                  urgency === 'overdue'
                                    ? 'font-semibold text-red-700'
                                    : urgency === 'upcoming'
                                    ? 'font-semibold text-amber-800'
                                    : ''
                                }
                              >
                                {pm.next_due_date}
                              </span>
                              {urgency === 'overdue' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
                                  Overdue
                                </span>
                              )}
                              {urgency === 'upcoming' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                  Due Soon
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                              pm.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : pm.status === 'pending_approval'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {pm.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={savingScheduleEdit}
                                  onClick={() => handleSaveScheduleEdit(pm.id)}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium transition disabled:opacity-50"
                                >
                                  {savingScheduleEdit ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingScheduleEdit}
                                  onClick={cancelEditingSchedule}
                                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                {/* Generate Work Order from PM (PM-07) */}
                                {canGenerateWO && (
                                  <button
                                    type="button"
                                    disabled={generatingWOId === pm.id}
                                    onClick={() => handleGenerateWorkOrder(pm)}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition disabled:opacity-50"
                                  >
                                    {generatingWOId === pm.id ? 'Creating WO...' : 'Create WO'}
                                  </button>
                                )}

                                {/* Superintendent & Admin Approval Button */}
                                {canEditScheduleInterval && pm.status === 'pending_approval' && (
                                  <button
                                    type="button"
                                    onClick={() => handleApprovePM(pm.id)}
                                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium transition"
                                  >
                                    Approve
                                  </button>
                                )}

                                {/* Superintendent & Admin Edit Interval Button (PM-06) */}
                                {canEditScheduleInterval && (
                                  <button
                                    type="button"
                                    disabled={editingScheduleId !== null}
                                    onClick={() => startEditingSchedule(pm)}
                                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition disabled:opacity-40"
                                  >
                                    Edit Interval
                                  </button>
                                )}

                                {/* Execution Button - Only for roles authorized to complete PMs */}
                                {canCompletePM && pm.status === 'active' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCompletePM(pm)}
                                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition"
                                  >
                                    Mark Completed
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}