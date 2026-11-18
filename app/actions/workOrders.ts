'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

// Helper to verify user and ensure Managers cannot write
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

export async function createWorkOrder(formData: FormData) {
  const { supabase, user } = await verifyOperationalWriteAccess();

  const title = formData.get('title') as string;
  const description = formData.get('description') as string;
  const equipment_id = formData.get('equipment_id') as string;
  const priority = (formData.get('priority') as string) || 'medium';

  const { error } = await supabase.from('work_orders').insert({
    title,
    description,
    equipment_id,
    priority,
    status: 'open',
    created_by: user.id,
  });

  if (error) {
    throw new Error(`Failed to create work order: ${error.message}`);
  }

  revalidatePath('/work-orders');
}

export async function updateWorkOrderStatus(workOrderId: string, status: string) {
  const { supabase } = await verifyOperationalWriteAccess();

  const { error } = await supabase
    .from('work_orders')
    .update({ status })
    .eq('id', workOrderId);

  if (error) {
    throw new Error(`Failed to update work order: ${error.message}`);
  }

  revalidatePath('/work-orders');
}