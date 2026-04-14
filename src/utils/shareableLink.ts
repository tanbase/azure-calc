// ============================================================
// Azure VM Pricing Calculator - Shareable Link Encoding
// Encodes/decodes VM configuration state into a URL hash.
// Works entirely client-side — no server or storage needed.
// ============================================================

import type { VMEntry, AppSettings } from '../types';
import { VM_FAMILY_OPTIONS, DISK_TYPE_OPTIONS, OS_OPTIONS, SQL_OPTIONS, BACKUP_OPTIONS, PRICING_MODEL_OPTIONS } from './constants';

// ============================================================
// Compact encoding: enum strings → indices, booleans → 0/1
// ============================================================

interface CompactState {
  v: Array<{
    n: string; f: number; v: number; m: number; d: number;
    dt: number; o: number; s: number; b: number;
    mo: number; a: number; p: number;
  }>;
  s: {
    r: string; c: string; hw: number; hs: number;
  };
}

/**
 * Encode VM entries and settings into a compact base64 string.
 */
export function encodeState(vms: VMEntry[], settings: AppSettings): string {
  const compact: CompactState = {
    v: vms.map(vm => ({
      n: vm.name,
      f: VM_FAMILY_OPTIONS.indexOf(vm.vmFamily),
      v: vm.vcpu,
      m: vm.memoryGB,
      d: vm.diskSizeGB,
      dt: DISK_TYPE_OPTIONS.indexOf(vm.diskType),
      o: OS_OPTIONS.indexOf(vm.os),
      s: SQL_OPTIONS.indexOf(vm.sql),
      b: BACKUP_OPTIONS.indexOf(vm.backup),
      mo: vm.monitoring ? 1 : 0,
      a: vm.asr ? 1 : 0,
      p: PRICING_MODEL_OPTIONS.indexOf(vm.pricingModel),
    })),
    s: {
      r: settings.region,
      c: settings.currency,
      hw: settings.azureHybridBenefitWindows ? 1 : 0,
      hs: settings.azureHybridBenefitSQL ? 1 : 0,
    },
  };
  return btoa(JSON.stringify(compact));
}

/**
 * Decode a base64 string back into VM entries and settings.
 * Returns null if the encoded data is invalid or malformed.
 */
export function decodeState(encoded: string): { vms: VMEntry[]; settings: AppSettings } | null {
  try {
    const data: CompactState = JSON.parse(atob(encoded));
    if (!data.v || !data.s) return null;

    const vms: VMEntry[] = data.v.map((vm, i) => {
      const family = VM_FAMILY_OPTIONS[vm.f] ?? 'Auto';
      const isSQLMI = family.includes('SQL MI');
      return {
        id: `vm-${Date.now()}-${i}`,
        name: vm.n || `VM-${i + 1}`,
        vmFamily: family,
        vcpu: vm.v ?? 0,
        memoryGB: vm.m ?? 0,
        diskSizeGB: vm.d ?? 0,
        diskType: DISK_TYPE_OPTIONS[vm.dt] ?? 'Premium SSD',
        os: isSQLMI ? 'Ubuntu' : (OS_OPTIONS[vm.o] ?? 'Ubuntu'),
        sql: isSQLMI ? 'None' : (SQL_OPTIONS[vm.s] ?? 'None'),
        sqlMIRole: 'Primary',
        sqlMIStorageTier: 'General Purpose',
        backup: BACKUP_OPTIONS[vm.b] ?? 'No backups',
        monitoring: vm.mo === 1,
        asr: vm.a === 1,
        pricingModel: PRICING_MODEL_OPTIONS[vm.p] ?? 'PAYG',
        monthlyCost: 0,
        selectedVMSKU: '-',
        selectedDiskSKU: '-',
      };
    });

    return {
      vms,
      settings: {
        region: data.s.r || '',
        currency: data.s.c || '',
        azureHybridBenefitWindows: data.s.hw === 1,
        azureHybridBenefitSQL: data.s.hs === 1,
      },
    };
  } catch {
    return null;
  }
}
