'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PlantRole } from '@/lib/permissions'

interface WorkOrder {
  id: string
  title: string
  description: string
  priority: string
  status: string
  outcome_notes: string
  equipment?: { name: string; serial_number: string; location: string }
  team_leader?: { full_name: string }
  assignee?: { full_name: string }
}

interface InventoryPart {
  id: string
  part_name: string
  part_number: string
  stock_quantity: number
}

interface UsedPart {
  id: string
  quantity_used: number
  part: { part_name: string; part_number: string }
}

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const workOrderId = resolvedParams.id

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null)
  const [inventoryList, setInventoryList] = useState<InventoryPart[]>([])
  const [usedParts, setUsedParts] = useState<UsedPart[]>([])
  const [selectedPartId, setSelectedPartId] = useState('')
  const [quantityUsed, setQuantityUsed] = useState('1')
  const [outcomeNotes, setOutcomeNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [submittingPart, setSubmittingPart] = useState(false)
  const [savingOutcome, setSavingOutcome] = useState(false)
  const [userRole, setUserRole] = useState<PlantRole | null>(null)
  const router = useRouter()

  const isClosed = workOrder?.status === 'verified_closed'
  const isReadOnly = userRole === 'manager' || userRole === 'stock_keeper'
  const canApproveClose =
    userRole === 'admin' || userRole === 'superintendent' || userRole === 'team_leader'

  const fetchWorkOrderDetails = async () => {
    if (!workOrderId) return

    // Fetch current user's role so view-only roles stay restricted
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role) {
        setUserRole(profile.role as PlantRole)
      }
    }

    // Fetch Work Order with team_leader and assignee relations
    const { data: woData, error: woError } = await supabase
      .from('work_orders')
      .select(
        'id, title, description, priority, status, outcome_notes, equipment:equipment_id(name, serial_number, location), team_leader:team_leader_id(full_name), assignee:assigned_to(full_name)'
      )
      .eq('id', workOrderId)
      .single()

    if (woError) {
      alert('Supabase Error: ' + woError.message)
      router.replace('/dashboard/work-orders')
      return
    }

    if (!woData) {
      alert('Work order not found in database.')
      router.replace('/dashboard/work-orders')
      return
    }

    setWorkOrder(woData as WorkOrder)
    setOutcomeNotes(woData.outcome_notes || '')

    const { data: partsData } = await supabase
      .from('work_order_parts')
      .select('id, quantity_used, part:part_id(part_name, part_number)')
      .eq('work_order_id', workOrderId)

    if (partsData) {
      setUsedParts(partsData as unknown as UsedPart[])
    }

    const { data: invData } = await supabase
      .from('inventory')
      .select('id, part_name, part_number, stock_quantity')
      .order('part_name')

    if (invData) {
      setInventoryList(invData)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (workOrderId) {
      fetchWorkOrderDetails()
    }
  }, [workOrderId])

  const handleLogPart = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isReadOnly || isClosed || !selectedPartId) return
    const qty = parseInt(quantityUsed, 10)
  if (!qty || qty <= 0) {
    alert('Please enter a valid quantity greater than 0.')
    return
  }
    setSubmittingPart(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

  const { error } = await supabase.rpc('log_work_order_part', {
    p_work_order_id: workOrderId,
    p_part_id: selectedPartId,
    p_quantity_used: qty,
  })

    if (error) {
      alert('Error logging part: ' + error.message)
    } else {
      setSelectedPartId('')
      setQuantityUsed('1')
      await fetchWorkOrderDetails()
    }
    setSubmittingPart(false)
  }

  const handleSaveOutcome = async () => {
    if (isReadOnly || !workOrder) return

    if (workOrder.status === 'verified_closed') {
      alert('This work order is already verified and closed and cannot be modified or reopened.')
      return
    }

    setSavingOutcome(true)
    const nextStatus = canApproveClose ? 'verified_closed' : 'completed_pending_review'

    const { error } = await supabase
      .from('work_orders')
      .update({
        outcome_notes: outcomeNotes.trim() || null,
        status: nextStatus,
        completed_at: new Date().toISOString(),
      })
      .eq('id', workOrderId)
      .neq('status', 'verified_closed')

    if (error) {
      alert('Error saving notes: ' + error.message)
    } else {
      alert(
        nextStatus === 'verified_closed'
          ? 'Work order saved and marked as Verified Closed!'
          : 'Work order marked as completed and pending review!'
      )
      await fetchWorkOrderDetails()
    }
    setSavingOutcome(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        Loading work order...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{workOrder?.title}</h1>
            <p className="text-sm text-slate-500">
              Work Order ID: <span className="font-mono">{workOrderId}</span>
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/work-orders')}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            ← Back to Work Orders
          </button>
        </div>

        {/* Overview Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs text-slate-400 block uppercase font-semibold">Status</span>
              <span
                className={`inline-flex mt-1 px-3 py-1 rounded-full text-xs font-semibold border uppercase ${
                  isClosed
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}
              >
                {workOrder?.status?.replace(/_/g, ' ')}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block uppercase font-semibold">Priority</span>
              <span className="inline-flex mt-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 uppercase">
                {workOrder?.priority}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block uppercase font-semibold">Team Leader</span>
              <span className="text-sm font-medium text-slate-800 mt-1 block">
                {workOrder?.team_leader?.full_name || 'Unassigned'}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block uppercase font-semibold">Technician</span>
              <span className="text-sm font-medium text-slate-800 mt-1 block">
                {workOrder?.assignee?.full_name || 'Unassigned'}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase">
              Instructions & Description
            </h3>
            <p className="text-sm text-slate-700 mt-1">
              {workOrder?.description || 'No description provided.'}
            </p>
          </div>

          {workOrder?.equipment && (
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-1">
              <h3 className="text-xs font-semibold text-slate-500 uppercase">Target Asset</h3>
              <p className="text-sm font-semibold text-slate-900">
                {workOrder.equipment.name}{' '}
                <span className="font-mono text-xs text-slate-500">
                  ({workOrder.equipment.serial_number})
                </span>
              </p>
              <p className="text-xs text-slate-600">Location: {workOrder.equipment.location}</p>
            </div>
          )}
        </div>

        {/* Log Spare Parts Section */}
        {!isReadOnly && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Log Spare Parts Used</h2>
              {isClosed && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  Locked — Verified Closed
                </span>
              )}
            </div>

            <form
              onSubmit={handleLogPart}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
            >
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Select Spare Part
                </label>
                <select
                  required
                  disabled={isClosed || submittingPart}
                  value={selectedPartId}
                  onChange={(e) => setSelectedPartId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Choose part from inventory...</option>
                  {inventoryList.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.part_name} ({part.part_number}) — In Stock: {part.stock_quantity}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Quantity Used
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    required
                    disabled={isClosed || submittingPart}
                    value={quantityUsed}
                    onChange={(e) => setQuantityUsed(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={isClosed || submittingPart}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm"
                  >
                    {submittingPart ? 'Logging...' : 'Log Part'}
                  </button>
                </div>
              </div>
            </form>

            {usedParts.length > 0 && (
              <div className="border-t border-slate-100 pt-4 mt-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                  Parts Logged For This Task
                </h3>
                <ul className="divide-y divide-slate-100 text-sm">
                  {usedParts.map((up) => (
                    <li
                      key={up.id}
                      className="py-2 flex justify-between items-center text-slate-700"
                    >
                      <span>
                        {up.part?.part_name}{' '}
                        <span className="font-mono text-xs text-slate-400">
                          ({up.part?.part_number})
                        </span>
                      </span>
                      <span className="font-semibold text-slate-900">Qty: {up.quantity_used}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Outcome Notes & Completion */}
        {!isReadOnly && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Outcome & Completion Notes</h2>
              {isClosed && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  Verified Closed — Editing Disabled
                </span>
              )}
            </div>

            <textarea
              rows={3}
              disabled={isClosed || savingOutcome}
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
              placeholder="Summarize work performed, test results, or recommendations..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={isClosed || savingOutcome}
                onClick={handleSaveOutcome}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isClosed
                  ? 'Verified Closed'
                  : savingOutcome
                  ? 'Saving...'
                  : 'Save Notes & Complete Task'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}