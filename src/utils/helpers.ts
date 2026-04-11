// ============================================================
// Azure VM Pricing Calculator - Shared Utilities
// ============================================================

import type { VMEntry } from '../types';

/**
 * Generate a unique VM entry ID
 */
export function generateId(): string {
  return `vm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new VM entry with default values
 */
export function createVM(name: string = '', overrides: Partial<VMEntry> = {}): VMEntry {
  return {
    id: generateId(),
    name,
    vmFamily: 'Auto',
    vcpu: 0,
    memoryGB: 0,
    diskType: 'Premium SSD',
    diskSizeGB: 0,
    os: 'Windows Server',
    sql: 'None',
    backup: 'No backups',
    monitoring: false,
    asr: false,
    pricingModel: 'PAYG',
    monthlyCost: 0,
    selectedVMSKU: '-',
    selectedDiskSKU: '-',
    ...overrides,
  };
}
