'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Permissions, PlantRole } from '@/lib/permissions'
interface InventoryItem {
  id: string
  part_name: string
  part_number: string
  stock_quantity: number
  min_threshold: number
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [partName, setPartName] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [stockQuantity, setStockQuantity] = useState('10')
  const [minThreshold, setMinThreshold] = useState('5')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const [userRole, setUserRole] = useState<PlantRole | null>(null)
  const fetchInventory = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('part_name', { ascending: true })

    if (!error && data) {
      setItems(data as InventoryItem[])
    }
    setLoading(false)

    // 2. Fetch user profile to check their role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role) {
      setUserRole(profile.role as PlantRole) // <-- Add this line
    }
  }

  useEffect(() => {
    fetchInventory()
  }, [])

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const { error } = await supabase.from('inventory').insert([
      {
        part_name: partName,
        part_number: partNumber,
        stock_quantity: parseInt(stockQuantity, 10) || 0,
        min_threshold: parseInt(minThreshold, 10) || 5,
      },
    ])

    if (error) {
      alert('Error adding part: ' + error.message)
    } else {
      setPartName('')
      setPartNumber('')
      setStockQuantity('10')
      setMinThreshold('5')
      fetchInventory()
    }
    setSubmitting(false)
  }

  const handleQuickRestock = async (id: string, currentQty: number, amount: number) => {
    const newQty = Math.max(0, currentQty + amount)
    const { error } = await supabase
      .from('inventory')
      .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (!error) {
      fetchInventory()
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Spare Parts Inventory</h1>
            <p className="text-sm text-slate-500">Track stock levels, reorder thresholds, and restock quantities</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Add Spare Part Form */}
        {userRole && Permissions.canManageInventory(userRole) && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Add New Spare Part</h2>
          <form onSubmit={handleAddPart} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Part Name</label>
              <input
                type="text"
                required
                value={partName}
                onChange={(e) => setPartName(e.target.value)}
                placeholder="e.g. Ball Bearing 6204"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Part Number (SKU)</label>
              <input
                type="text"
                required
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="e.g. BRG-6204-ZZ"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Initial Stock Qty</label>
              <input
                type="number"
                min="0"
                required
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Min Reorder Alert</label>
              <input
                type="number"
                min="0"
                required
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 shadow-sm"
              >
                {submitting ? 'Saving...' : '+ Add Spare Part'}
              </button>
            </div>
          </form>
        </div>
        )}
        {/* Inventory List Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Stock Catalog ({items.length})</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading inventory...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No spare parts logged yet. Add your first part above!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="px-6 py-3 font-medium">Part Name</th>
                    <th className="px-6 py-3 font-medium">Part Number</th>
                    <th className="px-6 py-3 font-medium">In Stock</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Quick Restock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {items.map((item) => {
                    const isLow = item.stock_quantity <= item.min_threshold
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{item.part_name}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-600">{item.part_number}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {item.stock_quantity} <span className="text-xs font-normal text-slate-400">(min {item.min_threshold})</span>
                        </td>
                        <td className="px-6 py-4">
                          {isLow ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              LOW STOCK
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              HEALTHY
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => handleQuickRestock(item.id, item.stock_quantity, 1)}
                            className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded border border-slate-300"
                          >
                            +1
                          </button>
                          <button
                            onClick={() => handleQuickRestock(item.id, item.stock_quantity, 5)}
                            className="px-2.5 py-1 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200"
                          >
                            +5
                          </button>
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