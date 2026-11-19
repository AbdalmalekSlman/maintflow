
'use server'

import { revalidatePath } from 'next/cache'
import { verifyUserRole } from '@/utils/supabase/auth-guard'

type ActionResult =
  | { success: true }
  | { success: false; error: string }

const INVENTORY_ROLES = [
  'admin',
  'stock_keeper',
  'superintendent',
  'team_leader',
] as const

function parseNonNegativeInteger(
  value: FormDataEntryValue | null,
  fieldName: string
): number {
  const raw = String(value ?? '').trim()

  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `${fieldName} must be a whole number greater than or equal to 0.`
    )
  }

  const parsed = Number(raw)

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${fieldName} is outside the supported range.`)
  }

  return parsed
}

export async function addInventoryItem(
  formData: FormData
): Promise<ActionResult> {
  try {
    const { supabase } = await verifyUserRole([...INVENTORY_ROLES])

    const partName = String(
      formData.get('part_name') ?? ''
    ).trim()

    const partNumber = String(
      formData.get('part_number') ?? ''
    ).trim()

    const stockQuantity = parseNonNegativeInteger(
      formData.get('stock_quantity'),
      'Initial stock'
    )

    const minThreshold = parseNonNegativeInteger(
      formData.get('min_threshold'),
      'Minimum threshold'
    )

    if (!partName || !partNumber) {
      return {
        success: false,
        error: 'Part name and part number are required.',
      }
    }

    const { error } = await supabase
      .from('inventory')
      .insert({
        part_name: partName,
        part_number: partNumber,
        stock_quantity: stockQuantity,
        min_threshold: minThreshold,
      })

    if (error) {
      return {
        success: false,
        error: `Failed to add inventory item: ${error.message}`,
      }
    }

    revalidatePath('/dashboard/inventory')

    return { success: true }

  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unexpected error while adding inventory item.',
    }
  }
}

/**
 * Adjust stock using a signed quantity delta.
 * Positive = restock.
 * Negative = stock adjustment downward.
 */
export async function adjustInventoryQuantity(
  itemId: string,
  delta: number
): Promise<ActionResult> {
  try {
    const { supabase } = await verifyUserRole([...INVENTORY_ROLES])

    if (!itemId?.trim()) {
      return {
        success: false,
        error: 'Inventory item ID is required.',
      }
    }

    if (!Number.isSafeInteger(delta) || delta === 0) {
      return {
        success: false,
        error: 'Stock adjustment must be a non-zero whole number.',
      }
    }

    const { error } = await supabase.rpc('adjust_stock', {
      p_part_id: itemId,
      p_delta: delta,
    })

    if (error) {
      return {
        success: false,
        error: `Failed to adjust stock: ${error.message}`,
      }
    }

    revalidatePath('/dashboard/inventory')
    revalidatePath('/dashboard/work-orders')

    return { success: true }

  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unexpected error while adjusting stock.',
    }
  }
}
