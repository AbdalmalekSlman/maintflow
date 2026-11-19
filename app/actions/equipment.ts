
'use server'

import { revalidatePath } from 'next/cache'
import { verifyUserRole } from '@/utils/supabase/auth-guard'

type ActionResult =
  | { success: true }
  | { success: false; error: string }

const EQUIPMENT_ROLES = [
  'admin',
  'superintendent',
  'team_leader',
] as const

const EQUIPMENT_STATUSES = [
  'operational',
  'under_maintenance',
  'out_of_service',
] as const

export async function createEquipment(
  formData: FormData
): Promise<ActionResult> {
  try {
    const { supabase } = await verifyUserRole([...EQUIPMENT_ROLES])

    const name = String(formData.get('name') ?? '').trim()
    const assetTag =
      String(formData.get('asset_tag') ?? '').trim() || null
    const location =
      String(formData.get('location') ?? '').trim() || null
    const status = String(
      formData.get('status') ?? 'operational'
    )

    if (!name) {
      return {
        success: false,
        error: 'Equipment name is required.',
      }
    }

    if (
      !EQUIPMENT_STATUSES.includes(
        status as (typeof EQUIPMENT_STATUSES)[number]
      )
    ) {
      return {
        success: false,
        error: 'Invalid equipment status.',
      }
    }

    const { error } = await supabase
      .from('equipment')
      .insert({
        name,
        asset_tag: assetTag,
        location,
        status,
      })

    if (error) {
      return {
        success: false,
        error: `Failed to add equipment: ${error.message}`,
      }
    }

    revalidatePath('/dashboard/equipment')

    return { success: true }

  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unexpected error while adding equipment.',
    }
  }
}

export async function updateEquipmentStatus(
  equipmentId: string,
  status: string
): Promise<ActionResult> {
  try {
    const { supabase } = await verifyUserRole([...EQUIPMENT_ROLES])

    if (!equipmentId?.trim()) {
      return {
        success: false,
        error: 'Equipment ID is required.',
      }
    }

    if (
      !EQUIPMENT_STATUSES.includes(
        status as (typeof EQUIPMENT_STATUSES)[number]
      )
    ) {
      return {
        success: false,
        error: 'Invalid equipment status.',
      }
    }

    const { data, error } = await supabase
      .from('equipment')
      .update({ status })
      .eq('id', equipmentId)
      .select('id')

    if (error) {
      return {
        success: false,
        error: `Failed to update equipment status: ${error.message}`,
      }
    }

    if (!data?.length) {
      return {
        success: false,
        error: 'Equipment not found or update not permitted.',
      }
    }

    revalidatePath('/dashboard/equipment')

    return { success: true }

  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unexpected error while updating equipment.',
    }
  }
}
