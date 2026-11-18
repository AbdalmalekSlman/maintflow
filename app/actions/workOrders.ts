// app/actions/workOrders.ts  (equipment.ts / inventory.ts follow the same shape)
'use server'
import { revalidatePath } from 'next/cache'
import { verifyUserRole } from '@/utils/supabase/auth-guard'

const PRIORITIES = ['low','medium','high','urgent']
const STATUSES = ['assigned','in_progress','completed_pending_review','verified_closed']
type Result = { success: true } | { success: false; error: string }

export async function createWorkOrder(formData: FormData): Promise<Result> {
  try {
    const { supabase, user } = await verifyUserRole(['admin','superintendent','team_leader','shift_technician'])
    const title = String(formData.get('title') ?? '').trim()
    const priority = String(formData.get('priority') ?? 'medium')
    if (!title) return { success: false, error: 'Title is required.' }
    if (!PRIORITIES.includes(priority)) return { success: false, error: 'Invalid priority.' }

    const { error } = await supabase.from('work_orders').insert({
      title,
      description: String(formData.get('description') ?? ''),
      equipment_id: formData.get('equipment_id') || null,
      team_leader_id: formData.get('team_leader_id'),
      assigned_to: formData.get('assigned_to'),
      priority, status: 'assigned', created_by: user.id,
    })
    if (error) return { success: false, error: error.message }
    revalidatePath('/dashboard/work-orders')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unexpected error' }
  }
}

export async function updateWorkOrderStatus(id: string, status: string): Promise<Result> {
  try {
    const { supabase } = await verifyUserRole(['admin','superintendent','team_leader','technician','shift_technician'])
    if (!STATUSES.includes(status)) return { success: false, error: 'Invalid status.' }
    const { data, error } = await supabase.from('work_orders').update({ status }).eq('id', id).select('id')
    if (error) return { success: false, error: error.message }
    if (!data?.length) return { success: false, error: 'Not permitted or work order not found.' }
    revalidatePath('/dashboard/work-orders')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unexpected error' }
  }
}