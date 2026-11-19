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
        {userRole && Permissions.canEditEquipment(userRole) && (
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {equipment.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">{item.asset_tag || '—'}</td>
                      <td className="px-6 py-4">{item.location || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          item.status === 'operational'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : item.status === 'under_maintenance'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {item.status.replace('_', ' ').toUpperCase()}
                        </span>
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