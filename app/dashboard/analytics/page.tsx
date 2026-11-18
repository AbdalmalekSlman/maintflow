'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface AnalyticsMetrics {
  totalWorkOrders: number
  completedWorkOrders: number
  inProgressWorkOrders: number
  totalEquipment: number
  operationalEquipment: number
  downEquipment: number
  totalParts: number
  lowStockParts: number
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<AnalyticsMetrics>({
    totalWorkOrders: 0,
    completedWorkOrders: 0,
    inProgressWorkOrders: 0,
    totalEquipment: 0,
    operationalEquipment: 0,
    downEquipment: 0,
    totalParts: 0,
    lowStockParts: 0,
  })
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchAnalytics = async () => {
      // Fetch all core metrics in parallel
      const [
        { data: woData },
        { data: eqData },
        { data: invData }
      ] = await Promise.all([
        supabase.from('work_orders').select('status'),
        supabase.from('equipment').select('status'),
        supabase.from('inventory').select('stock_quantity, min_threshold')
      ])

      const totalWorkOrders = woData?.length || 0
      const completedWorkOrders = woData?.filter(w => w.status === 'verified_closed' || w.status === 'completed_pending_review').length || 0
      const inProgressWorkOrders = woData?.filter(w => w.status === 'in_progress').length || 0

      const totalEquipment = eqData?.length || 0
      const operationalEquipment = eqData?.filter(e => e.status === 'operational').length || 0
      const downEquipment = totalEquipment - operationalEquipment

      const totalParts = invData?.length || 0
      const lowStockParts = invData?.filter(i => i.stock_quantity <= i.min_threshold).length || 0

      setMetrics({
        totalWorkOrders,
        completedWorkOrders,
        inProgressWorkOrders,
        totalEquipment,
        operationalEquipment,
        downEquipment,
        totalParts,
        lowStockParts,
      })
      setLoading(false)
    }

    fetchAnalytics()
  }, [])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-600">Loading plant analytics...</div>
  }

  const equipmentUptimePct = metrics.totalEquipment > 0 
    ? Math.round((metrics.operationalEquipment / metrics.totalEquipment) * 100) 
    : 100

  const workOrderCompletionRate = metrics.totalWorkOrders > 0
    ? Math.round((metrics.completedWorkOrders / metrics.totalWorkOrders) * 100)
    : 0

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Plant Performance Analytics</h1>
            <p className="text-sm text-slate-500">Real-time KPIs, equipment uptime, and maintenance velocity</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase">Equipment Uptime Rate</p>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-slate-900">{equipmentUptimePct}%</span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {metrics.operationalEquipment} of {metrics.totalEquipment} Active
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${equipmentUptimePct}%` }}></div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase">Work Order Completion</p>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-slate-900">{workOrderCompletionRate}%</span>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {metrics.completedWorkOrders} of {metrics.totalWorkOrders} Closed
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full" style={{ width: `${workOrderCompletionRate}%` }}></div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase">Spare Parts Health</p>
            <div className="flex items-baseline justify-between">
              <span className={`text-3xl font-extrabold ${metrics.lowStockParts > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {metrics.lowStockParts} Alerts
              </span>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                {metrics.totalParts} Total SKUs
              </span>
            </div>
            <p className="text-xs text-slate-500 pt-1">
              {metrics.lowStockParts === 0 ? 'All spare parts inventory levels are healthy.' : 'Some catalog items have fallen below safety thresholds.'}
            </p>
          </div>
        </div>

        {/* Detailed Breakdown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Work Order Distribution</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600 font-medium">In Progress / Active</span>
                <span className="font-bold text-slate-900">{metrics.inProgressWorkOrders}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600 font-medium">Completed & Verified</span>
                <span className="font-bold text-emerald-700">{metrics.completedWorkOrders}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600 font-medium">Total Dispatched</span>
                <span className="font-bold text-blue-700">{metrics.totalWorkOrders}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Asset Health Status</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600 font-medium">Operational Assets</span>
                <span className="font-bold text-emerald-700">{metrics.operationalEquipment}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600 font-medium">Under Maintenance / Down</span>
                <span className="font-bold text-amber-700">{metrics.downEquipment}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-600 font-medium">Total Registered Machinery</span>
                <span className="font-bold text-slate-900">{metrics.totalEquipment}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}