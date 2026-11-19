'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Permissions, PlantRole } from '@/lib/permissions'

type EquipmentStatus = 'operational' | 'under_maintenance' | 'out_of_service'

const normalizeEquipmentStatus = (status?: string | null): EquipmentStatus => {
  if (status === 'under_maintenance' || status === 'out_of_service' || status === 'operational') {
    return status
  }
  return 'operational'
}

interface EquipmentItem {
  id: string
  name: string
  asset_tag: string | null
  location: string | null
  status: EquipmentStatus | null
}

interface MaintenanceHistoryItem {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
  completed_at: string | null
  outcome_notes: string | null
}

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [location, setLocation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userRole, setUserRole] = useState<PlantRole | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAssetTag, setEditAssetTag] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editStatus, setEditStatus] = useState<EquipmentStatus>('operational')
  const [savingEdit, setSavingEdit] = useState(false)
  const [selectedHistoryAsset, setSelectedHistoryAsset] = useState<EquipmentItem | null>(null)
  const [historyItems, setHistoryItems] = useState<MaintenanceHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const router = useRouter()

  

const fetchEquipment = useCallback(async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError.message)
    } else if (profile?.role) {
      setUserRole(profile.role as PlantRole)
    }

    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching equipment:', error.message)
    } else if (data) {
      setEquipment(data as EquipmentItem[])
    }
  } catch (err: unknown) {
    console.error('Unexpected error:', err)
  } finally {
    setLoading(false)
  }
}, [router])



useEffect(() => {
  const timer = window.setTimeout(() => {
    void fetchEquipment()
  }, 0)

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      router.replace('/')
    }
  })

  return () => {
    window.clearTimeout(timer)
    subscription.unsubscribe()
  }
}, [fetchEquipment, router])

   
  

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      alert('Please enter an equipment name.')
      return
    }

    const normalizedTag = serialNumber.trim() || null
    setSubmitting(true)

    try {
      const { error } = await supabase.from('equipment').insert([
        {
          name: trimmedName,
          asset_tag: normalizedTag,
          location: location.trim() || null,
          status: 'operational',
        },
      ])

      if (error) {
        if (error.code === '23505') {
          alert(
            normalizedTag
              ? `An asset with Asset Tag "${normalizedTag}" already exists. Please use a unique Asset Tag.`
              : 'An asset with this Asset Tag already exists. Please use a unique Asset Tag.'
          )
        } else {
          alert('Error adding equipment: ' + error.message)
        }
        return
      }

      setName('')
      setSerialNumber('')
      setLocation('')
      await fetchEquipment()
    } finally {
      setSubmitting(false)
    }
  }

  const startEditing = (item: EquipmentItem) => {
    setEditingId(item.id)
    setEditName(item.name)
    setEditAssetTag(item.asset_tag ?? '')
    setEditLocation(item.location ?? '')
    setEditStatus(normalizeEquipmentStatus(item.status))
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditName('')
    setEditAssetTag('')
    setEditLocation('')
    setEditStatus('operational')
  }

  const handleSaveEdit = async (id: string) => {
    const trimmedName = editName.trim()
    if (!trimmedName) {
      alert('Please enter an equipment name.')
      return
    }

    const normalizedTag = editAssetTag.trim() || null
    setSavingEdit(true)

    try {
      const { error } = await supabase
        .from('equipment')
        .update({
          name: trimmedName,
          asset_tag: normalizedTag,
          location: editLocation.trim() || null,
          status: editStatus,
        })
        .eq('id', id)

      if (error) {
        if (error.code === '23505') {
          alert(
            normalizedTag
              ? `An asset with Asset Tag "${normalizedTag}" already exists. Please use a unique Asset Tag.`
              : 'An asset with this Asset Tag already exists. Please use a unique Asset Tag.'
          )
        } else {
          alert('Error updating equipment: ' + error.message)
        }
        return
      }

      cancelEditing()
      if (selectedHistoryAsset?.id === id) {
        setSelectedHistoryAsset((prev) =>
          prev
            ? {
                ...prev,
                name: trimmedName,
                asset_tag: normalizedTag,
                location: editLocation.trim() || null,
                status: editStatus,
              }
            : null
        )
      }
      await fetchEquipment()
    } finally {
      setSavingEdit(false)
    }
  }

  const handleViewHistory = async (item: EquipmentItem) => {
    setSelectedHistoryAsset(item)
    setHistoryItems([])
    setHistoryError(null)
    setLoadingHistory(true)

    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, title, status, priority, created_at, completed_at, outcome_notes')
        .eq('equipment_id', item.id)
        .order('created_at', { ascending: false })

      if (error) {
        setHistoryError(error.message)
      } else {
        setHistoryItems((data as MaintenanceHistoryItem[]) || [])
      }
    } catch (err) {
      setHistoryError('Failed to load maintenance history.')
      console.error('Error loading maintenance history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const closeHistory = () => {
    setSelectedHistoryAsset(null)
    setHistoryItems([])
    setHistoryError(null)
  }

  const canEdit = userRole === null
  ? false
  : Permissions.canEditEquipment(userRole)

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Equipment Registry</h1>
            <p className="text-sm text-slate-500">Manage plant assets and track operational status</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Add Equipment Form */}
        {canEdit && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Register New Equipment</h2>
            <form onSubmit={handleAddEquipment} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Equipment Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CNC Milling Machine #2"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Asset Tag</label>
                <input
                  type="text"
                  required
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="e.g. TAG-4421-Y"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Building B - Bay 4"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="md:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 shadow-sm"
                >
                  {submitting ? 'Registering...' : 'Register Equipment'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Equipment List Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Registered Assets ({equipment.length})</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading equipment...</div>
          ) : equipment.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No equipment registered yet. Add your first asset above!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Asset Tag</th>
                    <th className="px-6 py-3 font-medium">Location</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {equipment.map((item) => {
                    const isEditing = editingId === item.id
                    const currentStatus = normalizeEquipmentStatus(item.status)

                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editName}
                              disabled={savingEdit}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm text-slate-900"
                            />
                          ) : (
                            item.name
                          )}
                        </td>

                        <td className="px-6 py-4 font-mono text-xs text-slate-600">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editAssetTag}
                              disabled={savingEdit}
                              onChange={(e) => setEditAssetTag(e.target.value)}
                              className="w-full px-2.5 py-1.5 font-mono text-xs border border-slate-300 rounded-md text-slate-900"
                            />
                          ) : (
                            item.asset_tag || '—'
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editLocation}
                              disabled={savingEdit}
                              onChange={(e) => setEditLocation(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm text-slate-900"
                            />
                          ) : (
                            item.location || '—'
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {isEditing ? (
                            <select
                              value={editStatus}
                              disabled={savingEdit}
                              onChange={(e) => setEditStatus(normalizeEquipmentStatus(e.target.value))}
                              className="px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-900 bg-white"
                            >
                              <option value="operational">OPERATIONAL</option>
                              <option value="under_maintenance">UNDER MAINTENANCE</option>
                              <option value="out_of_service">OUT OF SERVICE</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                currentStatus === 'operational'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : currentStatus === 'under_maintenance'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {currentStatus.replaceAll('_', ' ').toUpperCase()}
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleViewHistory(item)}
                              className="px-3 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                            >
                              History
                            </button>

                            {canEdit && (
                              isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={savingEdit}
                                    onClick={() => handleSaveEdit(item.id)}
                                    className="px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50"
                                  >
                                    {savingEdit ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingEdit}
                                    onClick={cancelEditing}
                                    className="px-3 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={editingId !== null}
                                  onClick={() => startEditing(item)}
                                  className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md disabled:opacity-40"
                                >
                                  Edit
                                </button>
                              )
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

        {/* Linked Maintenance History Panel */}
        {selectedHistoryAsset && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  Maintenance History — {selectedHistoryAsset?.name ?? ''}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Asset Tag: <span className="font-mono">{selectedHistoryAsset?.asset_tag || '—'}</span>
                  {' • '}
                  Location: <span>{selectedHistoryAsset?.location || '—'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeHistory}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Close
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-6 text-center text-sm text-slate-500">
                Loading maintenance history...
              </div>
            ) : historyError ? (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                Error loading history: {historyError}
              </div>
            ) : historyItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                No work orders linked to this asset yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {historyItems.map((wo) => (
                  <div
                    key={wo.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/work-orders/${wo.id}`)}
                          className="text-sm font-semibold text-blue-600 hover:underline text-left"
                        >
                          {wo.title}
                        </button>
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-slate-100 text-slate-700">
                          {wo.status.replaceAll('_', ' ').toUpperCase()}
                        </span>
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          {wo.priority.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500">
                        Created: {new Date(wo.created_at).toLocaleDateString()}
                        {wo.completed_at
                          ? ` • Completed: ${new Date(wo.completed_at).toLocaleDateString()}`
                          : ''}
                      </p>

                      {wo.outcome_notes && (
                        <p className="text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
                          Notes: {wo.outcome_notes}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/work-orders/${wo.id}`)}
                      className="self-start sm:self-center px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                    >
                      Open WO →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}