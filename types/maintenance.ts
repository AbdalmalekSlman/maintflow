// types/maintenance.ts

export type UserRole = 'manager' | 'team_leader' | 'technician';

export type WorkOrderStatus = 'open' | 'in_progress' | 'completed' | 'closed';
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'critical';
export type EquipmentStatus = 'operational' | 'under_maintenance' | 'out_of_service' | 'decommissioned';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at?: string;
}

export interface Equipment {
  id: string;
  name: string;
  asset_tag: string;
  location: string;
  status: EquipmentStatus;
  manufacturer?: string | null;
  model_number?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface WorkOrder {
  id: string;
  title: string;
  description?: string | null;
  equipment_id: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  assigned_to?: string | null;
  created_by: string;
  created_at: string;
  updated_at?: string;
  // Optional joined relation data when querying with Supabase select('*, equipment(name, asset_tag)')
  equipment?: Pick<Equipment, 'name' | 'asset_tag'>;
}

export interface InventoryItem {
  id: string;
  part_name: string;
  sku: string;
  quantity: number;
  min_stock: number;
  location?: string | null;
  unit_cost?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface PMSchedule {
  id: string;
  title: string;
  equipment_id: string;
  frequency_days: number;
  next_due_date: string;
  last_completed_date?: string | null;
  assigned_to?: string | null;
  is_active: boolean;
  created_at: string;
  equipment?: Pick<Equipment, 'name' | 'asset_tag'>;
}