'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { verifyUserRole } from '@/utils/auth-guard';

async function verifyOperationalWriteAccess() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized: Please log in.');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'manager') {
    throw new Error('Access Denied: Managers have View-Only access.');
  }

  return { supabase, user, role: profile?.role };
}

export async function addInventoryItem(formData: FormData) {
  try {
    // ADD THIS LINE AT THE TOP (adjust roles per action)
    const { supabase, user } = await verifyUserRole(['Admin', 'Stock Keeper']);
  const { supabase } = await verifyOperationalWriteAccess();

  const part_name = formData.get('part_name') as string;
  const sku = formData.get('sku') as string;
  const quantity = Number(formData.get('quantity')) || 0;
  const min_stock = Number(formData.get('min_stock')) || 5;

  const { error } = await supabase.from('inventory').insert({
    part_name,
    sku,
    quantity,
    min_stock,
  })};

  if (error) {
    throw new Error(`Failed to add inventory item: ${error.message}`);
  }

  revalidatePath('/inventory');
}

export async function adjustInventoryQuantity(itemId: string, newQuantity: number) {
  try {
    // ADD THIS LINE AT THE TOP (adjust roles per action)
    const { supabase, user } = await verifyUserRole(['Admin', 'Stock Keeper']);
  const { supabase } = await verifyOperationalWriteAccess();

  if (newQuantity < 0) {
    throw new Error('Inventory quantity cannot be negative.');
  }

  const { error } = await supabase
    .from('inventory')
    .update({ quantity: newQuantity })
    .eq('id', itemId);

  if (error) {
    throw new Error(`Failed to update inventory quantity: ${error.message}`);
  }

  revalidatePath('/inventory');
}}