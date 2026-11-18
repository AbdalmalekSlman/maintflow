'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

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

export async function createEquipment(formData: FormData) {
  const { supabase } = await verifyOperationalWriteAccess();

  const name = formData.get('name') as string;
  const asset_tag = formData.get('asset_tag') as string;
  const location = formData.get('location') as string;
  const status = (formData.get('status') as string) || 'operational';

  const { error } = await supabase.from('equipment').insert({
    name,
    asset_tag,
    location,
    status,
  });

  if (error) {
    throw new Error(`Failed to add equipment: ${error.message}`);
  }

  revalidatePath('/equipment');
}

export async function updateEquipmentStatus(equipmentId: string, status: string) {
  const { supabase } = await verifyOperationalWriteAccess();

  const { error } = await supabase
    .from('equipment')
    .update({ status })
    .eq('id', equipmentId);

  if (error) {
    throw new Error(`Failed to update equipment status: ${error.message}`);
  }

  revalidatePath('/equipment');
}