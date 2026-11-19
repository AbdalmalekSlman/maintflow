'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Permissions, PlantRole } from '@/lib/permissions'

interface EquipmentItem {
  id: string
  name: string
  asset_tag: string | null
  location: string | null
  status: 'operational' | 'under_maintenance' | 'out_of_service'
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
  const [editStatus, setEditStatus] = useState<'operational' | 'under_maintenance' | 'out_of_service'>('operational')
  const [savingEdit, setSavingEdit] = useState(false)
  const router = useRouter()

  const fetchEquipment = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch user profile and store role
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role) {
        setUserRole(profile.role as PlantRole)
      }

      // Fetch equipment list
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching equipment:', error.message)
      } else if (data) {
        setEquipment(data as EquipmentItem[])
      }
    } catch (err) {
      console.error('Unexpected error:', err)
    } finally {
      // Guaranteed to run, clearing the loading spinner whether it succeeds or fails
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEquipment()
  }, [router])

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
    setEditStatus(item.status)
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
      await fetchEquipment()
    } finally {
      setSavingEdit(false)
    }
  }

  const canEdit = Boolean(userRole && Permissions.canEditEquipment(userRole))

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
                    {canEdit && <th className="px-6 py-3 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {equipment.map((item) => {
                    const isEditing = editingId === item.id

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
                              onChange={(e) =>
                                setEditStatus(
                                  e.target.value as 'operational' | 'under_maintenance' | 'out_of_service'
                                )
                              }
                              className="px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-900 bg-white"
                            >
                              <option value="operational">OPERATIONAL</option>
                              <option value="under_maintenance">UNDER MAINTENANCE</option>
                              <option value="out_of_service">OUT OF SERVICE</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                item.status === 'operational'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : item.status === 'under_maintenance'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {item.status.replace('_', ' ').toUpperCase()}
                            </span>
                          )}
                        </td>

                        {canEdit && (
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-2">
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
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={editingId !== null}
                                onClick={() => startEditing(item)}
                                className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md disabled:opacity-40"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        )}
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