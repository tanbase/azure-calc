// ============================================================
// Azure VM Pricing Calculator - VM & Disk SKU Mapper
// Maps user-entered vCPU/RAM specs to closest Azure VM size
// ============================================================

import type { VMFamily, VMSKU, SQLMIRole } from '../types';
import { VM_SKUS } from './constants';

// ============================================================
// SQL MI SKU Definitions
// SQL Managed Instance has fixed vCore→memory ratio: 4 GB RAM per vCore (Gen5).
// Available vCore counts for both GP and BC tiers.
// ============================================================

export const SQL_MI_VCORE_OPTIONS = [4, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80];
export const SQL_MI_MEMORY_PER_VCORE = 4; // GB per vCore for Gen5

export interface SQLMISKU {
  tier: 'General Purpose' | 'Business Critical';
  vcores: number;
  memoryGB: number;
  skuName: string; // display name
}

/**
 * Find the closest SQL MI vCore count for given specs.
 * Always rounds UP to the nearest available vCore tier.
 * Family determines whether GP or BC tier is returned.
 */
export function findClosestSQLMISKU(
  vcpu: number,
  memoryGB: number,
  _role: SQLMIRole = 'Primary',
  family: VMFamily = 'SQL MI - General Purpose',
): SQLMISKU {
  const memoryPerVCore = SQL_MI_MEMORY_PER_VCORE;
  const tier = family === 'SQL MI - Business Critical' ? 'Business Critical' : 'General Purpose';
  const tierAbbr = tier === 'Business Critical' ? 'BC' : 'GP';

  // Calculate minimum vCores needed based on CPU and memory requirements
  const vcoresForCPU = vcpu;
  const vcoresForMemory = Math.ceil(memoryGB / memoryPerVCore);
  const minVcores = Math.max(vcoresForCPU, vcoresForMemory, SQL_MI_VCORE_OPTIONS[0]);

  // Find the smallest vCore option that meets requirements
  const vcores = SQL_MI_VCORE_OPTIONS.find((v) => v >= minVcores)
    ?? SQL_MI_VCORE_OPTIONS[SQL_MI_VCORE_OPTIONS.length - 1];

  const memoryGBActual = vcores * memoryPerVCore;

  return {
    tier,
    vcores,
    memoryGB: memoryGBActual,
    skuName: `SQL MI ${tierAbbr} ${vcores} core`,
  };
}

/**
 * Find the best SQL MI SKU by trying both GP and BC tiers.
 * Returns the cheaper option based on pricing data.
 */
export function findBestSQLMISKU(
  vcpu: number,
  memoryGB: number,
  _role: SQLMIRole = 'Primary',
): { gp: SQLMISKU; bc: SQLMISKU } {
  const memoryPerVCore = SQL_MI_MEMORY_PER_VCORE;
  const vcoresForCPU = vcpu;
  const vcoresForMemory = Math.ceil(memoryGB / memoryPerVCore);
  const minVcores = Math.max(vcoresForCPU, vcoresForMemory, SQL_MI_VCORE_OPTIONS[0]);
  const vcores = SQL_MI_VCORE_OPTIONS.find((v) => v >= minVcores)
    ?? SQL_MI_VCORE_OPTIONS[SQL_MI_VCORE_OPTIONS.length - 1];
  const memoryGBActual = vcores * memoryPerVCore;

  return {
    gp: { tier: 'General Purpose', vcores, memoryGB: memoryGBActual, skuName: `SQL MI GP ${vcores} core` },
    bc: { tier: 'Business Critical', vcores, memoryGB: memoryGBActual, skuName: `SQL MI BC ${vcores} core` },
  };
}

/**
 * Find the closest Azure VM SKU for given specs and family.
 * 'Auto' picks the best matching SKU across ALL families, preferring newer generations (v5 > v3 > v2).
 */
export function findClosestVMSize(
  vcpu: number,
  memoryGB: number,
  family: VMFamily,
): VMSKU {
  if (family === 'Auto') {
    return findClosestInList(vcpu, memoryGB, VM_SKUS as VMSKU[], true);
  }

  const shortFamily = family.replace(/\s*\(.*\)/, '');
  const familySkus = VM_SKUS.filter(
    (s) => s.family.replace(/\s*\(.*\)/, '') === shortFamily
  ) as VMSKU[];

  if (familySkus.length === 0) {
    return findClosestInList(
      vcpu,
      memoryGB,
      VM_SKUS.filter((s) => s.family.includes('General Purpose')) as VMSKU[],
      true,
    );
  }

  return findClosestInList(vcpu, memoryGB, familySkus, true);
}

function findClosestInList(
  vcpu: number,
  memoryGB: number,
  skus: VMSKU[],
  preferNewer: boolean,
): VMSKU {
  if (skus.length === 0) throw new Error('No SKUs available');

  // Priority 1: Find SKUs that meet or exceed both requirements (ceiling search)
  const fitting = skus.filter((s) => s.vcpu >= vcpu && s.memoryGB >= memoryGB);

  if (fitting.length > 0) {
    // Among fitting SKUs, pick the smallest (lowest vcpu, then lowest memory)
    // Break ties by preferring newer generations
    fitting.sort((a, b) => {
      const aGen = generationScore(a.size);
      const bGen = generationScore(b.size);
      // Primary: smallest vcpu; secondary: smallest memory; tertiary: newer gen
      if (a.vcpu !== b.vcpu) return a.vcpu - b.vcpu;
      if (a.memoryGB !== b.memoryGB) return a.memoryGB - b.memoryGB;
      return bGen - aGen; // higher gen score = newer, so reverse for ascending sort
    });
    return fitting[0];
  }

  // Priority 2: No SKU meets both requirements — fall back to closest match
  // (preferring SKUs that at least meet one requirement)
  let best = skus[0];
  let bestScore = Infinity;

  for (const sku of skus) {
    const cpuDiff = Math.max(0, vcpu - sku.vcpu); // penalty for under-provisioning
    const memDiff = Math.max(0, memoryGB - sku.memoryGB);
    let score = cpuDiff / 96 + memDiff / 672;

    if (preferNewer) {
      const gen = generationScore(sku.size);
      score -= gen * 0.0015;
    }

    if (score < bestScore) {
      bestScore = score;
      best = sku;
    }
  }

  return best;
}

function generationScore(size: string): number {
  if (size.includes('_v5')) return 3;
  if (size.includes('_v3')) return 2;
  if (size.includes('_v2')) return 1;
  return 0;
}

/**
 * Map disk type and size to the closest Azure disk SKU
 */
export function findClosestDiskSKU(
  diskType: string,
  diskSizeGB: number,
): { skuName: string; armSkuName: string; meterName: string; capacityGB: number } | null {
  const typeMap: Record<string, { prefix: string; typeName: string; sizes: number[]; labels: string[] }> = {
    'Premium SSD': {
      prefix: 'P',
      typeName: 'Premium_SSD_Managed_Disk',
      sizes: [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32767],
      labels: ['P1','P2','P3','P4','P6','P10','P15','P20','P30','P40','P50','P60','P70','P80'],
    },
    'Standard SSD': {
      prefix: 'E',
      typeName: 'Standard_SSD_Managed_Disk',
      sizes: [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32767],
      labels: ['E1','E2','E3','E4','E6','E10','E15','E20','E30','E40','E50','E60','E70','E80'],
    },
    'Standard HDD': {
      prefix: 'S',
      typeName: 'Standard_HDD_Managed_Disk',
      sizes: [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32767],
      labels: ['S4','S6','S10','S15','S20','S30','S40','S50','S60','S70','S80'],
    },
  };

  const config = typeMap[diskType];
  if (!config) return null;

  const fitting = config.sizes.filter((s) => s >= diskSizeGB);
  const capacityGB = fitting.length > 0 ? fitting[0] : config.sizes[config.sizes.length - 1];
  const idx = config.sizes.indexOf(capacityGB);
  const diskSKUName = config.labels[idx] || `${config.prefix}${capacityGB}`;

  return {
    skuName: `${diskSKUName} LRS`,
    armSkuName: `${config.typeName}_${diskSKUName}`,
    meterName: `${diskSKUName} LRS Disk`,
    capacityGB,
  };
}
