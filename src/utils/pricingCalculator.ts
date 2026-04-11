// ============================================================
// Azure VM Pricing Calculator - Pricing Calculator
// ============================================================

import type {
  VMEntry,
  SKULineItem,
  OptimizedPricingRecord,
  SQLOption,
} from '../types';
import { findClosestVMSize, findClosestDiskSKU } from './vmMapper';

// ============================================================
// Savings Plan / Reserved Instance discount mapping
// Maps pricing model names to reservation terms used in API data.
// '1 Year' = 1-year Reserved Instance, '3 Years' = 3-year Reserved Instance.
// Note: Azure Savings Plans are priced similarly to RIs in the Retail API.
// ============================================================

const PRICING_MODEL_TO_RESERVATION: Record<string, string | null> = {
  'PAYG': null,
  '1-year SP (~26% off)': '1 Year',
  '3-year SP (~48% off)': '3 Years',
  '1-year RI (~41% off)': '1 Year',
  '3-year RI (~63% off)': '3 Years',
};

// ============================================================
// Disk Pricing Model
// ==================
// Azure Retail API only returns a subset of disk SKUs per region
// (typically P6, P10, P15, P20). We derive pricing for all 39
// tiers using a per-GB rate model calibrated from the API data.
//
// Pricing structure:
// - P1-P50: Linear per-GB pricing (rate derived from API data)
// - P60+: Volume discount applied (rate drops ~47%)
//
// Base per-GB rates derived from Australia East API data:
//   P6  (64 GB):   $10.207  → $0.15948/GB
//   P10 (128 GB):  $19.71   → $0.15398/GB
//   P15 (256 GB):  $38.012  → $0.14848/GB
//   P20 (512 GB):  $73.22   → $0.14301/GB
//   Average: ~$0.151/GB for Premium SSD
//
// Standard SSD/HDD rates derived from Premium SSD ratio:
//   Premium SSD : Standard SSD : Standard HDD ≈ 3 : 1 : 0.33
// ============================================================

// Pricing thresholds (capacity in GB where volume discount kicks in)
const VOLUME_DISCOUNT_THRESHOLD_GB = 16384; // P60/E60/S60 capacity

/**
 * Calculate disk tier price using a per-GB rate model derived from API data.
 * Uses Australia East Premium SSD data as the base, with ratios for other types.
 */
function calculateDiskTierPrice(diskType: string, capacityGB: number): number {
  // Base per-GB rate for Premium SSD derived from API data (P6-P20 average)
  const PREMIUM_SSD_PER_GB = 0.151;

  // Derive rates for other disk types using Azure's pricing ratios
  // Premium SSD : Standard SSD : Standard HDD ≈ 3 : 1 : 0.33
  const rateMultipliers: Record<string, number> = {
    'Premium SSD': 1.0,
    'Standard SSD': 1.0 / 3.0,  // ~$0.050/GB
    'Standard HDD': 0.33 / 3.0, // ~$0.017/GB
  };

  const multiplier = rateMultipliers[diskType] ?? 1.0;
  const basePerGBRate = PREMIUM_SSD_PER_GB * multiplier;

  // Apply volume discount for large tiers (P60+)
  // Azure prices P60+ at ~47% of the standard per-GB rate
  const volumeDiscountFactor = capacityGB >= VOLUME_DISCOUNT_THRESHOLD_GB ? 0.47 : 1.0;

  const effectivePerGBRate = basePerGBRate * volumeDiscountFactor;

  return Math.round(capacityGB * effectivePerGBRate * 100) / 100;
}

// ============================================================
// Main calculation entry point
// ============================================================

export interface CalculationResult {
  lineItems: SKULineItem[];
  totalMonthlyCost: number;
  /** Derived monthly cost (rounded) */
  monthlyCost: number;
  /** Derived VM SKU selected by the calculator */
  selectedVMSKU?: string;
  /** Derived disk SKU selected by the calculator */
  selectedDiskSKU?: string;
}

export function calculateVMCost(
  vm: VMEntry,
  pricingData: OptimizedPricingRecord[],
  azureHybridBenefitWindows: boolean = false,
  azureHybridBenefitSQL: boolean = false,
): CalculationResult {
  const lineItems: SKULineItem[] = [];
  let selectedVMSKU: string | undefined;
  let selectedDiskSKU: string | undefined;

  // Only calculate compute cost if vCPU and memory are populated (>0)
  if (vm.vcpu > 0 && vm.memoryGB > 0) {
    // 1. Compute cost (includes OS licensing bundled in Azure pricing)
    const computeResult = calculateComputeCost(vm, pricingData, azureHybridBenefitWindows);
    lineItems.push(...computeResult.items);
    selectedVMSKU = computeResult.selectedVMSKU;

    // 1b. SQL licensing (only if vCPU > 0 and SQL is selected)
    if (vm.vcpu > 0 && vm.sql !== 'None') {
      const sqlItems = calculateSQLCost(vm, computeResult.resolvedVcpu, pricingData, azureHybridBenefitSQL);
      lineItems.push(...sqlItems);
    }

    // 2. Monitoring
    if (vm.monitoring) {
      lineItems.push(...calculateMonitoringCost(vm, pricingData));
    }
  }

  // Only calculate disk/ASR/backup costs if disk size > 0
  if (vm.diskSizeGB > 0) {
    // 3. Disk cost
    const diskResult = calculateDiskCost(vm, pricingData);
    lineItems.push(...diskResult.items);
    selectedDiskSKU = diskResult.selectedDiskSKU;

    // 4. Backup cost (only if disk is present)
    if (vm.backup !== 'No backups') {
      lineItems.push(...calculateBackupCost(vm, pricingData, vm.backup, diskResult.selectedDiskSKU, diskResult.items));
    }

    // 5. ASR cost (protected instance + replica disk, only if disk is present)
    if (vm.asr) {
      lineItems.push(...calculateASRCost(vm, pricingData));
    }
  }

  const totalMonthlyCost = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    lineItems,
    totalMonthlyCost,
    monthlyCost: Math.round(totalMonthlyCost * 100) / 100,
    selectedVMSKU,
    selectedDiskSKU,
  };
}

// ============================================================
// Compute Cost
// ============================================================
//
// Azure Retail API pricing model:
// - PAYG (type: "Consumption"): Returns Windows-inclusive rate for all VMs
// - Reserved Instances: Returns base compute rate (Linux equivalent, no OS license)
//
// OS Licensing is returned as a SEPARATE line item:
// - Windows Server: ~$0.046/vCPU/hr premium over VM base
// - RHEL: ~$0.09/vCPU/hr surcharge on top of VM base
// - SUSE: ~$0.06/vCPU/hr surcharge on top of VM base
// - Ubuntu/CentOS: No surcharge (VM base rate only)
//
// SQL Server Licensing: Separate per-vCPU charge (handled in calculateSQLCost).
//
// Windows AHB: Removes the Windows OS line item entirely.
// ============================================================

const WINDOWS_LICENSE_PER_VCPU_HOUR = 0.046;
const RHEL_LICENSE_PER_VCPU_HOUR = 0.0108;
const SUSE_LICENSE_PER_VCPU_HOUR = 0; // Free like other Linux distros on Azure

/**
 * Extract OS licensing per-vCPU hourly rates from pricing data.
 * Looks for records with serviceName='OS Licensing' and matching meterName.
 * Falls back to hardcoded rates if not found.
 */
function getOSLicensingRates(
  pricingData: OptimizedPricingRecord[],
): { windows: number; rhel: number; suse: number } {
  let windowsRate: number | undefined;
  let rhelRate: number | undefined;

  for (const record of pricingData) {
    if (record.serviceName !== 'OS Licensing') continue;
    const meterName = record.meterName || '';
    if (meterName === 'Windows Server per vCPU Hour' && windowsRate === undefined) {
      windowsRate = record.unitPrice;
    }
    if (meterName === 'RHEL per vCPU Hour' && rhelRate === undefined) {
      rhelRate = record.unitPrice;
    }
  }

  return {
    windows: windowsRate ?? WINDOWS_LICENSE_PER_VCPU_HOUR,
    rhel: rhelRate ?? RHEL_LICENSE_PER_VCPU_HOUR,
    suse: SUSE_LICENSE_PER_VCPU_HOUR, // Free like other Linux distros on Azure
  };
}

function calculateComputeCost(
  vm: VMEntry,
  pricingData: OptimizedPricingRecord[],
  azureHybridBenefitWindows: boolean = false,
): { items: SKULineItem[]; selectedVMSKU: string; resolvedVcpu: number } {
  const vmSize = findClosestVMSize(vm.vcpu, vm.memoryGB, vm.vmFamily);
  const selectedVMSKU = vmSize.size;

  const reservationTerm = PRICING_MODEL_TO_RESERVATION[vm.pricingModel] ?? null;
  const azureSku = `Standard_${vmSize.size}`;
  const hoursPerMonth = 730;

  // Step 1: Get the base compute rate from the API
  // IMPORTANT: The Azure Retail API is inconsistent — some PAYG meters include
  // "Windows" in the productName, others don't. We detect this dynamically.
  // RIs always return base (VM base) rates.
  const computeRecords = pricingData.filter(
    (r) =>
      r.armSkuName === azureSku &&
      isComputeMeter(r) &&
      r.reservationTerm === reservationTerm,
  );

  if (computeRecords.length === 0) {
    return { items: [makePlaceholderItem('compute', vm, vmSize.size, 'Hours')], selectedVMSKU, resolvedVcpu: vmSize.vcpu };
  }

  const items: SKULineItem[] = [];

  // Read OS licensing rates once (before the loop)
  const osRates = getOSLicensingRates(pricingData);

  for (const record of computeRecords) {
    // Determine if this PAYG meter already includes Windows licensing
    // (Azure API is inconsistent — some meters have "Windows" in productName, others don't)
    const isPaygWindowsIncluded = reservationTerm === null && record.productName.includes('Windows');

    // Determine effective monthly cost based on reservation type
    let baseMonthlyCost: number;
    let effectiveUnitPrice: number;
    let quantity: number;

    if (reservationTerm) {
      // RI: API price is total upfront for the term, convert to monthly
      const termMonths: Record<string, number> = { '1 Year': 12, '3 Years': 36 };
      const months = termMonths[reservationTerm] || 12;
      baseMonthlyCost = Math.round((record.unitPrice / months) * 100) / 100;
      effectiveUnitPrice = Math.round((record.unitPrice / (months * hoursPerMonth)) * 10000) / 10000;
      quantity = hoursPerMonth;
    } else if (isPaygWindowsIncluded) {
      // PAYG with Windows included: subtract Windows premium to get VM base
      // Use the resolved VM SKU's vCPU count, not the user input
      const windowsPremium = osRates.windows * vmSize.vcpu * hoursPerMonth;
      baseMonthlyCost = Math.round((record.unitPrice * hoursPerMonth - windowsPremium) * 100) / 100;
      effectiveUnitPrice = Math.round((record.unitPrice - osRates.windows * vmSize.vcpu) * 10000) / 10000;
      quantity = hoursPerMonth;
    } else {
      // PAYG Linux base: already the VM base rate
      baseMonthlyCost = Math.round(record.unitPrice * hoursPerMonth * 100) / 100;
      effectiveUnitPrice = record.unitPrice;
      quantity = hoursPerMonth;
    }

    // Build display meter name
    const planLabel = reservationTerm ? ` (${vm.pricingModel})` : '';
    const displayMeterName = `${record.meterName}${planLabel} (VM Base)`;

    items.push({
      skuId: `compute-${record.skuId}${reservationTerm ? `-${reservationTerm.replace(/\s/g, '')}` : ''}`,
      productName: record.productName,
      serviceName: record.serviceName,
      unitPrice: effectiveUnitPrice,
      quantity,
      lineTotal: baseMonthlyCost,
      vmName: vm.name,
      vmId: vm.id,
      meterName: displayMeterName,
      unitOfMeasure: reservationTerm ? '1/Month' : record.unitOfMeasure,
    });

    // Step 2: Add separate OS licensing line item (if applicable)
    // Pass the resolved VM SKU's vCPU count for accurate licensing
    const osItem = calculateOSLineItem(vm, vmSize.vcpu, azureHybridBenefitWindows, hoursPerMonth, osRates);
    if (osItem) {
      items.push(osItem);
    }
  }

  return { items, selectedVMSKU, resolvedVcpu: vmSize.vcpu };
}

/**
 * Create a separate OS licensing line item.
 * Returns null if no OS license is needed (Linux/CentOS base, or AHB enabled for Windows).
 */
function calculateOSLineItem(
  vm: VMEntry,
  resolvedVcpu: number,
  azureHybridBenefitWindows: boolean,
  hoursPerMonth: number,
  osRates: { windows: number; rhel: number; suse: number },
): SKULineItem | null {
  // No OS license needed for Linux base or CentOS
  const isLinuxBase = vm.os === 'Ubuntu' || vm.os === 'CentOS';
  if (isLinuxBase) return null;

  // Windows with AHB: no OS license
  if (vm.os === 'Windows Server' && azureHybridBenefitWindows) return null;

  // Determine OS license rate and description
  let ratePerHour: number;
  let productName: string;
  let meterName: string;

  switch (vm.os) {
    case 'Windows Server':
      ratePerHour = osRates.windows;
      productName = 'Windows Server License';
      meterName = `Windows Server (per vCPU/hour)`;
      break;
    case 'Red Hat Linux':
      ratePerHour = osRates.rhel;
      productName = 'Red Hat Enterprise Linux';
      meterName = `RHEL (per vCPU/hour)`;
      break;
    case 'SUSE Linux':
      ratePerHour = osRates.suse;
      productName = 'SUSE Linux Enterprise Server';
      meterName = `SLES (per vCPU/hour)`;
      break;
    default:
      return null;
  }

  const quantity = resolvedVcpu * hoursPerMonth;
  const lineTotal = Math.round(ratePerHour * quantity * 100) / 100;

  return {
    skuId: `os-${vm.os.toLowerCase().replace(/\s+/g, '-')}`,
    productName,
    serviceName: 'Virtual Machines',
    unitPrice: ratePerHour,
    quantity,
    lineTotal,
    vmName: vm.name,
    vmId: vm.id,
    meterName,
    unitOfMeasure: '1 Hour',
  };
}

// ============================================================
// SQL Licensing
// SQL Server licensing rules:
// - Licenses sold in 2-core packs (1 pack = 2 vCPU)
// - Minimum 4 vCPU per VM (2 packs minimum)
// - SQL AHB removes the SQL surcharge entirely.
//
// Rates are read from pricingData (populated by refresh-pricing.js via
// Azure Retail Prices API — Virtual Machines Licenses service).
// Falls back to hardcoded rates if not found in pricing data.
// ============================================================

const SQL_CORES_PER_PACK = 2;
const SQL_MIN_PACKS = 2; // Minimum 4 vCPU = 2 packs

// Fallback rates from Azure Retail Prices API (Virtual Machines Licenses).
// These match the refresh-pricing.js hardcoded defaults.
const SQL_FALLBACK_MONTHLY_PER_VCPU: Record<SQLOption, number> = {
  None: 0,
  Standard: 73,      // $0.10/vCPU/hr × 730 hrs
  Enterprise: 274,   // $0.375/vCPU/hr × 730 hrs
  Developer: 0,
};

/**
 * Extract SQL per-vCPU monthly rates from pricing data.
 * Looks for records with serviceName='SQL Server' and meterName like '{tier} per vCPU Hour'.
 * Converts hourly rate to monthly (×730). Falls back to hardcoded rates if not found.
 */
function getSQLRatesFromPricingData(
  pricingData: OptimizedPricingRecord[],
): Record<SQLOption, number> {
  const rates: Record<string, number> = {};

  for (const record of pricingData) {
    if (record.serviceName !== 'SQL Server') continue;
    const meterName = record.meterName || '';
    // Match records like "Standard per vCPU Hour", "Enterprise per vCPU Hour"
    const match = meterName.match(/^(Standard|Enterprise|Developer) per vCPU Hour$/);
    if (match) {
      const tier = match[1] as SQLOption;
      // Only set once (all regions have the same rate)
      if (rates[tier] === undefined) {
        rates[tier] = record.unitPrice * 730; // hourly → monthly
      }
    }
  }

  // Fill in missing tiers from fallback
  const result: Record<SQLOption, number> = {
    None: 0,
    Standard: rates.Standard ?? SQL_FALLBACK_MONTHLY_PER_VCPU.Standard,
    Enterprise: rates.Enterprise ?? SQL_FALLBACK_MONTHLY_PER_VCPU.Enterprise,
    Developer: 0,
  };

  return result;
}

function calculateSQLCost(
  vm: VMEntry,
  resolvedVcpu: number,
  pricingData: OptimizedPricingRecord[],
  azureHybridBenefitSQL: boolean = false,
): SKULineItem[] {
  if (vm.sql === 'None') return [];
  if (vm.sql === 'Developer') {
    return [{
      skuId: 'sql-developer',
      productName: 'SQL Server Developer',
      serviceName: 'SQL Server',
      unitPrice: 0,
      quantity: 1,
      lineTotal: 0,
      vmName: vm.name,
      vmId: vm.id,
      meterName: 'SQL Server Developer (free)',
      unitOfMeasure: '1/Month',
    }];
  }

  // SQL AHB removes SQL licensing cost
  if (azureHybridBenefitSQL) return [];

  // Read SQL rates from pricing data (with fallback to hardcoded rates)
  const sqlRates = getSQLRatesFromPricingData(pricingData);
  const ratePerVcpuMonth = sqlRates[vm.sql] || 0;
  const costPerPack = ratePerVcpuMonth * SQL_CORES_PER_PACK;

  // Calculate packs needed: ceil(resolvedVcpu / 2), minimum 2 packs
  const packsNeeded = Math.ceil(resolvedVcpu / SQL_CORES_PER_PACK);
  const billablePacks = Math.max(packsNeeded, SQL_MIN_PACKS);

  const lineTotal = Math.round(costPerPack * billablePacks * 100) / 100;
  const billableVcpu = billablePacks * SQL_CORES_PER_PACK;

  return [{
    skuId: `sql-${vm.sql.toLowerCase()}`,
    productName: `SQL Server ${vm.sql} License`,
    serviceName: 'SQL Server',
    unitPrice: costPerPack,
    quantity: billablePacks,
    lineTotal,
    vmName: vm.name,
    vmId: vm.id,
    meterName: `SQL ${vm.sql} (${billablePacks}x 2-core pack${billablePacks > 1 ? 's' : ''}, ${billableVcpu} vCPU billed)`,
    unitOfMeasure: '1 Pack/Month',
  }];
}

// ============================================================
// Disk Cost
// Azure Managed Disks are priced per tier (fixed monthly cost),
// NOT per GB. You pay for the full tier capacity regardless
// of actual usage. Multiple disks can be used to accommodate
// larger storage requirements.
//
// Pricing is calculated using a per-GB rate model derived from
// Azure Retail API data (see DISK_TIERS and calculateDiskTierPrice).
// ============================================================

function calculateDiskCost(
  vm: VMEntry,
  pricingData: OptimizedPricingRecord[],
): { items: SKULineItem[]; selectedDiskSKU: string } {
  const diskSKU = findClosestDiskSKU(vm.diskType, vm.diskSizeGB);
  if (!diskSKU) return { items: [], selectedDiskSKU: '' };
  const selectedDiskSKU = diskSKU.skuName.replace(' LRS', '');

  // Extract the tier label (P1, P10, E30, S60, etc.) from the SKU name
  const tierLabel = diskSKU.skuName.replace(' LRS', '').trim();
  const tierCapacityGB = diskSKU.capacityGB;

  // Calculate how many disks are needed to accommodate the required size
  const disksNeeded = Math.max(1, Math.ceil(vm.diskSizeGB / tierCapacityGB));

  // Try API data first, fall back to calculated model
  const matchingRecords = pricingData.filter(
    (r) => r.serviceName === 'Storage' && r.meterName === diskSKU.meterName,
  );

  let unitPrice: number;

  if (matchingRecords.length > 0) {
    // Use API pricing when available
    unitPrice = matchingRecords[0].unitPrice;
  } else {
    // Fall back to calculated per-GB rate model
    unitPrice = calculateDiskTierPrice(vm.diskType, tierCapacityGB);
  }

  const lineTotal = Math.round(unitPrice * disksNeeded * 100) / 100;

  return {
    items: [{
      skuId: `disk-${tierLabel.toLowerCase()}`,
      productName: `${vm.diskType} ${tierLabel}`,
      serviceName: 'Storage',
      unitPrice,
      quantity: disksNeeded,
      lineTotal,
      vmName: vm.name,
      vmId: vm.id,
      meterName: `${disksNeeded}x ${tierLabel} ${vm.diskType} (${tierCapacityGB.toLocaleString()} GB each, ${(tierCapacityGB * disksNeeded).toLocaleString()} GB total)`,
      unitOfMeasure: '1/Month',
    }],
    selectedDiskSKU,
  };
}

// ============================================================
// Backup Cost
// Azure Backup has two cost components per Azure VM:
// 1. Protected Instance charge: per-VM fee (from API, ~$10/mo)
// 2. Storage consumed: per-GB fee for backup data (from API, ~$0.0224/GB/mo for LRS)
// Long-term retention adds archive storage costs on top.
// ============================================================

function calculateBackupCost(
  vm: VMEntry,
  pricingData: OptimizedPricingRecord[],
  backupType: string,
  _selectedDiskSKU: string,
  diskLineItems: SKULineItem[],
): SKULineItem[] {
  // 1. Protected instance pricing from API
  const vmBackupRecords = pricingData.filter(
    (r) =>
      r.serviceName === 'Backup' &&
      (r.meterName === 'On Premises Server Protected Instances' || r.meterName === 'Azure VM Protected Instances'),
  );
  const protectedInstancePrice = vmBackupRecords.length > 0 ? vmBackupRecords[0].unitPrice : 10.0;
  const protectedInstanceSkuId = vmBackupRecords.length > 0 ? vmBackupRecords[0].skuId : 'backup-vm';

  // 2. Storage rate from API (Standard LRS)
  const storageRateRecords = pricingData.filter(
    (r) =>
      r.serviceName === 'Backup' &&
      r.skuName === 'Standard' &&
      r.meterName === 'LRS Data Stored',
  );
  const storagePerGB = storageRateRecords.length > 0 ? storageRateRecords[0].unitPrice : 0.0224;

  // 3. Calculate total resolved disk capacity from disk line items
  const totalDiskCapacityGB = diskLineItems.reduce((sum, item) => {
    // Match numbers that may contain commas (e.g., "1,024 GB total")
    const match = item.meterName.match(/([\d,]+)\s*GB total/);
    const captured = match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
    return sum + (captured > 0 ? captured : 0);
  }, 0) || vm.diskSizeGB; // fallback to user input if parsing fails

  // 4. Estimate backup storage based on Azure Pricing Calculator ratios:
  //    Short-term (34 daily + 5 weekly): ~1.34x disk capacity in Standard tier
  //    Long-term (+ 12 monthly + 7 yearly): ~1.48x Standard + ~3.75x Archive
  //    These ratios account for multiple retention copies, not just a single backup.
  //    Source: Azure Pricing Calculator (East US, 100 GB VM, Low churn, LRS)
  const shortTermRatio = 1.34; // Standard tier multiplier for short-term retention
  const longTermStandardRatio = 1.48; // Standard tier multiplier with long-term retention
  const longTermArchiveRatio = 3.75; // Archive tier multiplier for long-term retention

  const shortTermStorageGB = Math.max(1, Math.round(totalDiskCapacityGB * shortTermRatio));
  const storageCost = Math.round(storagePerGB * shortTermStorageGB * 100) / 100;

  // Build line items
  const items: SKULineItem[] = [
    {
      skuId: `backup-protected-${protectedInstanceSkuId}`,
      productName: 'Azure Backup - Protected Instance',
      serviceName: 'Backup',
      unitPrice: protectedInstancePrice,
      quantity: 1,
      lineTotal: Math.round(protectedInstancePrice * 100) / 100,
      vmName: vm.name,
      vmId: vm.id,
      meterName: 'Protected Instance (short-term, 34 days)',
      unitOfMeasure: '1/Month',
    },
    {
      skuId: `backup-storage-lrs`,
      productName: 'Azure Backup - Storage (Standard LRS)',
      serviceName: 'Backup',
      unitPrice: storagePerGB,
      quantity: shortTermStorageGB,
      lineTotal: storageCost,
      vmName: vm.name,
      vmId: vm.id,
      meterName: `Backup Storage (${shortTermStorageGB} GB estimated, LRS)`,
      unitOfMeasure: '1 GB/Month',
    },
    {
      skuId: `backup-snapshot`,
      productName: 'Azure Backup - Instant Restore Snapshot',
      serviceName: 'Backup',
      unitPrice: 0.13,
      quantity: 1,
      lineTotal: 0.13,
      vmName: vm.name,
      vmId: vm.id,
      meterName: 'Snapshot (1 GB instant restore)',
      unitOfMeasure: '1 GB/Month',
    },
  ];

  // Long-term retention: adjust standard tier + add archive storage cost
  if (backupType.includes('Long-term')) {
    // Update standard tier storage for long-term retention (slightly higher due to monthly copies)
    const longTermStorageGB = Math.max(1, Math.round(totalDiskCapacityGB * longTermStandardRatio));
    const longTermStorageCost = Math.round(storagePerGB * longTermStorageGB * 100) / 100;

    // Replace the short-term storage line with long-term storage line
    items[1] = {
      skuId: `backup-storage-lrs-longterm`,
      productName: 'Azure Backup - Storage (Standard LRS, long-term)',
      serviceName: 'Backup',
      unitPrice: storagePerGB,
      quantity: longTermStorageGB,
      lineTotal: longTermStorageCost,
      vmName: vm.name,
      vmId: vm.id,
      meterName: `Backup Storage (${longTermStorageGB} GB estimated, LRS)`,
      unitOfMeasure: '1 GB/Month',
    };

    // Add archive storage for long-term retention (12 monthly + 7 yearly copies)
    const archiveRateRecords = pricingData.filter(
      (r) =>
        r.serviceName === 'Backup' &&
        r.skuName === 'Archive' &&
        r.meterName === 'LRS Data Stored',
    );
    const archivePerGB = archiveRateRecords.length > 0 ? archiveRateRecords[0].unitPrice : 0.0013;
    const archiveStorageGB = Math.max(1, Math.round(totalDiskCapacityGB * longTermArchiveRatio));
    const archiveCost = Math.round(archivePerGB * archiveStorageGB * 100) / 100;

    items.push({
      skuId: `backup-long-term-archive`,
      productName: 'Azure Backup - Long-term Retention (Archive)',
      serviceName: 'Backup',
      unitPrice: archivePerGB,
      quantity: archiveStorageGB,
      lineTotal: archiveCost,
      vmName: vm.name,
      vmId: vm.id,
      meterName: `Archive Storage (${archiveStorageGB} GB estimated, LRS)`,
      unitOfMeasure: '1 GB/Month',
    });
  }

  return items;
}

// ============================================================
// ASR Cost (protected instance + replica disk using same SKU)
// ============================================================

function calculateASRCost(
  vm: VMEntry,
  pricingData: OptimizedPricingRecord[],
): SKULineItem[] {
  const items: SKULineItem[] = [];

  // Protected instance pricing from API (fallback to $25)
  const asrProtectedRecords = pricingData.filter(
    (r) =>
      r.serviceName === 'Site Recovery' &&
      r.meterName === 'Protected Instance',
  );
  const protectedInstancePrice = asrProtectedRecords.length > 0 ? asrProtectedRecords[0].unitPrice : 25.0;

  items.push({
    skuId: 'asr-protected-instance',
    productName: 'Azure Site Recovery - Protected Instance',
    serviceName: 'Site Recovery',
    unitPrice: protectedInstancePrice,
    quantity: 1,
    lineTotal: Math.round(protectedInstancePrice * 100) / 100,
    vmName: vm.name,
    vmId: vm.id,
    meterName: 'ASR Protected Instance',
    unitOfMeasure: '1/Month',
  });

  // Replica disk — try Site Recovery replica storage rate from API first,
  // then fall back to primary disk Storage API pricing, then calculated model.
  const asrReplicaRecords = pricingData.filter(
    (r) =>
      r.serviceName === 'Site Recovery' &&
      r.meterName === 'Replica Storage (LRS)',
  );

  const diskSKU = findClosestDiskSKU(vm.diskType, vm.diskSizeGB);
  if (diskSKU) {
    if (asrReplicaRecords.length > 0) {
      // Use Site Recovery replica storage rate from API
      const replicaPerGB = asrReplicaRecords[0].unitPrice;
      const replicaCost = Math.round(replicaPerGB * diskSKU.capacityGB * 100) / 100;
      items.push({
        skuId: `asr-replica-${diskSKU.skuName.replace(/\s/g, '-').toLowerCase()}`,
        productName: `ASR Replica Storage - ${vm.diskType}`,
        serviceName: 'Site Recovery',
        unitPrice: replicaPerGB,
        quantity: diskSKU.capacityGB,
        lineTotal: replicaCost,
        vmName: vm.name,
        vmId: vm.id,
        meterName: `ASR Replica (${diskSKU.skuName.replace(' LRS', '')} ${vm.diskType}, ${diskSKU.capacityGB.toLocaleString()} GB)`,
        unitOfMeasure: '1 GB/Month',
      });
    } else {
      // Fall back to primary disk Storage API pricing
      const apiRecords = pricingData.filter(
        (r) => r.serviceName === 'Storage' && r.meterName === diskSKU.meterName,
      );

      if (apiRecords.length > 0) {
        const replicaCost = Math.round(apiRecords[0].unitPrice * 100) / 100;
        items.push({
          skuId: `asr-replica-${diskSKU.skuName.replace(/\s/g, '-').toLowerCase()}`,
          productName: `ASR Replica Storage - ${vm.diskType}`,
          serviceName: 'Site Recovery',
          unitPrice: apiRecords[0].unitPrice,
          quantity: 1,
          lineTotal: replicaCost,
          vmName: vm.name,
          vmId: vm.id,
          meterName: `ASR Replica (${diskSKU.skuName.replace(' LRS', '')} ${vm.diskType})`,
          unitOfMeasure: '1/Month',
        });
      } else {
        // Fallback: use calculated tier pricing for ASR replica storage
        const replicaCost = calculateDiskTierPrice(vm.diskType, diskSKU.capacityGB);
        items.push({
          skuId: `asr-replica-disk`,
          productName: `ASR Replica Storage - ${vm.diskType}`,
          serviceName: 'Site Recovery',
          unitPrice: replicaCost,
          quantity: 1,
          lineTotal: replicaCost,
          vmName: vm.name,
          vmId: vm.id,
          meterName: `ASR Replica (${diskSKU.skuName.replace(' LRS', '')} ${vm.diskType}, ${diskSKU.capacityGB.toLocaleString()} GB)`,
          unitOfMeasure: '1/Month',
        });
      }
    }
  }

  return items;
}

// ============================================================
// Monitoring
// ============================================================

function calculateMonitoringCost(
  vm: VMEntry,
  pricingData: OptimizedPricingRecord[],
): SKULineItem[] {
  const monitorRecords = pricingData.filter(
    (r) =>
      r.serviceName === 'Azure Monitor' &&
      r.meterName === 'Basic Logs Data Ingestion',
  );

  if (monitorRecords.length > 0) {
    const record = monitorRecords[0];
    // 1 GB per month for basic monitoring
    return [{
      skuId: `monitor-${record.skuId}`,
      productName: 'Azure Monitor - Basic Logs',
      serviceName: 'Azure Monitor',
      unitPrice: record.unitPrice,
      quantity: 1,
      lineTotal: Math.round(record.unitPrice * 100) / 100,
      vmName: vm.name,
      vmId: vm.id,
      meterName: 'Basic Logs Data Ingestion (1 GB)',
      unitOfMeasure: record.unitOfMeasure,
    }];
  }

  return [{
    skuId: 'monitor-basic',
    productName: 'Azure Monitor - Basic Logs',
    serviceName: 'Azure Monitor',
    unitPrice: 0.50,
    quantity: 1,
    lineTotal: 0.50,
    vmName: vm.name,
    vmId: vm.id,
    meterName: 'Basic Logs (1 GB)',
    unitOfMeasure: '1 GB',
  }];
}

// ============================================================
// Helpers
// ============================================================

function makePlaceholderItem(
  type: string,
  vm: VMEntry,
  skuName: string,
  meterSuffix: string,
): SKULineItem {
  return {
    skuId: `${type}-${skuName}`,
    productName: `${type} ${skuName}`,
    serviceName: type === 'compute' ? 'Virtual Machines' : type,
    unitPrice: 0,
    quantity: 1,
    lineTotal: 0,
    vmName: vm.name,
    vmId: vm.id,
    meterName: `${skuName} ${meterSuffix}`,
    unitOfMeasure: type === 'compute' ? '1 Hour' : '1/Month',
  };
}

function isComputeMeter(record: OptimizedPricingRecord): boolean {
  return (
    record.serviceName === 'Virtual Machines' &&
    !record.meterName.includes('Low Priority') &&
    !record.meterName.includes('Spot')
  );
}

// ============================================================
// Batch calculate all VMs
// ============================================================

export function calculateAllVMs(
  vms: VMEntry[],
  pricingData: OptimizedPricingRecord[],
  azureHybridBenefitWindows: boolean = false,
  azureHybridBenefitSQL: boolean = false,
): { allLineItems: SKULineItem[]; totalMonthlyCost: number } {
  const allLineItems: SKULineItem[] = [];
  let totalMonthlyCost = 0;

  for (const vm of vms) {
    const result = calculateVMCost(vm, pricingData, azureHybridBenefitWindows, azureHybridBenefitSQL);
    allLineItems.push(...result.lineItems);
    totalMonthlyCost += result.totalMonthlyCost;
  }

  return { allLineItems, totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100 };
}

// ============================================================
// Cost breakdown by category
// ============================================================

export interface CostBreakdown {
  compute: number;       // net compute (after plan discounts)
  paygCompute: number;   // raw PAYG compute (before discounts)
  storage: number;
  backup: number;
  siteRecovery: number;
  monitor: number;
  sql: number;
  osLicensing: number;
  total: number;
}

export function getCostBreakdown(lineItems: SKULineItem[]): CostBreakdown {
  const breakdown: CostBreakdown = {
    compute: 0,
    paygCompute: 0,
    storage: 0,
    backup: 0,
    siteRecovery: 0,
    monitor: 0,
    sql: 0,
    osLicensing: 0,
    total: 0,
  };

  for (const item of lineItems) {
    breakdown.total += item.lineTotal;

    if (item.serviceName === 'Virtual Machines') {
      // Track PAYG compute (positive line items only)
      if (item.lineTotal > 0 && !item.skuId.startsWith('os-')) {
        breakdown.paygCompute += item.lineTotal;
      }
      // OS licensing items have explicit names
      if (item.skuId.startsWith('os-')) {
        breakdown.osLicensing += item.lineTotal;
      } else {
        // Net compute (includes negative discount items)
        breakdown.compute += item.lineTotal;
      }
    } else if (item.serviceName === 'Storage') {
      breakdown.storage += item.lineTotal;
    } else if (item.serviceName === 'Backup') {
      breakdown.backup += item.lineTotal;
    } else if (item.serviceName === 'Site Recovery') {
      breakdown.siteRecovery += item.lineTotal;
    } else if (item.serviceName === 'Azure Monitor') {
      breakdown.monitor += item.lineTotal;
    } else if (item.serviceName === 'SQL Server') {
      breakdown.sql += item.lineTotal;
    }
  }

  for (const key of Object.keys(breakdown) as (keyof CostBreakdown)[]) {
    breakdown[key] = Math.round(breakdown[key] * 100) / 100;
  }

  return breakdown;
}
