export type PlantRole = 
  | 'admin' 
  | 'manager' 
  | 'superintendent' 
  | 'team_leader' 
  | 'technician' 
  | 'shift_technician' 
  | 'stock_keeper'

export const Permissions = {
  // User & Role Management (Admin: Full | Manager & Superintendent: View Only)
  canManageUsers: (role: PlantRole) => role === 'admin',
  canViewUsers: (role: PlantRole) => ['admin', 'manager', 'superintendent'].includes(role),

  // Work Orders (Manager is View Only)
  canViewAllWorkOrders: (role: PlantRole) => ['admin', 'manager', 'superintendent'].includes(role),
  canCreateWorkOrder: (role: PlantRole) => ['admin', 'superintendent', 'team_leader', 'shift_technician'].includes(role), // Manager excluded

  // Preventive Maintenance (Manager is View Only)
  canManagePM: (role: PlantRole) => ['admin', 'superintendent', 'team_leader'].includes(role), // Manager excluded

  // Inventory & Spare Parts (Manager is View Only)
  canManageInventory: (role: PlantRole) => ['admin', 'stock_keeper', 'superintendent', 'team_leader'].includes(role), // Manager excluded

  // Equipment & Assets (Manager is View Only)
  canEditEquipment: (role: PlantRole) => ['admin', 'superintendent', 'team_leader'].includes(role), // Manager excluded

  // Operational Analytics (Manager has view access to analytics)
  canViewAnalytics: (role: PlantRole) => ['admin', 'manager', 'superintendent', 'team_leader'].includes(role),
}