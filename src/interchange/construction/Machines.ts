// CONSTRUCTION MACHINES (T15). Stub: excavator, dump truck, crane, paver, roller as instanced meshes on the active task.
export type MachineKind = 'excavator' | 'truck' | 'crane' | 'paver' | 'roller';
export interface MachinePlan {
  kind: MachineKind;
  taskId: string;
  count: number;
}
export function planMachines(_schedule: unknown): MachinePlan[] {
  throw new Error('T15 not implemented');
}
