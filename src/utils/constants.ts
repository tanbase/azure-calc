// ============================================================
// Azure VM Pricing Calculator - Constants
// ============================================================

import type {
  AzureRegion,
  OSOption,
  DiskType,
  SQLOption,
  BackupOption,
  PricingModel,
  VMFamily,
} from '../types';

// --- Azure Regions ---

export const AZURE_REGIONS: AzureRegion[] = [
  // Australia (all regions)
  { name: 'australiaeast', displayName: 'Australia East (Sydney)', pricePremium: 12 },
  { name: 'australiasoutheast', displayName: 'Australia Southeast (Melbourne)', pricePremium: 12 },
  { name: 'australiacentral', displayName: 'Australia Central (Canberra)', pricePremium: 12 },
  { name: 'australiacentral2', displayName: 'Australia Central 2 (Canberra)', pricePremium: 12 },
  // Asia Pacific
  { name: 'southeastasia', displayName: 'Southeast Asia (Singapore)', pricePremium: 8 },
  { name: 'eastasia', displayName: 'East Asia (Hong Kong)', pricePremium: 8 },
  { name: 'japaneast', displayName: 'Japan East', pricePremium: 10 },
  { name: 'koreacentral', displayName: 'Korea Central', pricePremium: 10 },
  { name: 'centralindia', displayName: 'Central India', pricePremium: 8 },
  { name: 'southindia', displayName: 'South India', pricePremium: 8 },
  // US
  { name: 'eastus', displayName: 'East US', pricePremium: 0 },
  { name: 'eastus2', displayName: 'East US 2', pricePremium: 0 },
  { name: 'westus2', displayName: 'West US 2', pricePremium: 0 },
  { name: 'westus3', displayName: 'West US 3', pricePremium: 0 },
  { name: 'centralus', displayName: 'Central US', pricePremium: 0 },
  // Europe
  { name: 'northeurope', displayName: 'North Europe (Ireland)', pricePremium: 5 },
  { name: 'westeurope', displayName: 'West Europe (Netherlands)', pricePremium: 5 },
  { name: 'uksouth', displayName: 'UK South', pricePremium: 8 },
  { name: 'francecentral', displayName: 'France Central', pricePremium: 9 },
  // Middle East
  { name: 'uaenorth', displayName: 'UAE North', pricePremium: 12 },
  { name: 'qatarcentral', displayName: 'Qatar Central', pricePremium: 10 },
  // Americas
  { name: 'canadacentral', displayName: 'Canada Central', pricePremium: 5 },
  { name: 'brazilsouth', displayName: 'Brazil South', pricePremium: 15 },
];

// --- Currencies ---

export const CURRENCIES = [
  { code: 'USD', symbol: '$', displayName: 'USD - US Dollar' },
  { code: 'AUD', symbol: 'A$', displayName: 'AUD - Australian Dollar' },
  { code: 'EUR', symbol: '€', displayName: 'EUR - Euro' },
  { code: 'GBP', symbol: '£', displayName: 'GBP - British Pound' },
  { code: 'CAD', symbol: 'C$', displayName: 'CAD - Canadian Dollar' },
  { code: 'JPY', symbol: '¥', displayName: 'JPY - Japanese Yen' },
  { code: 'CNY', symbol: '¥', displayName: 'CNY - Chinese Yuan' },
  { code: 'INR', symbol: '₹', displayName: 'INR - Indian Rupee' },
  { code: 'KRW', symbol: '₩', displayName: 'KRW - Korean Won' },
  { code: 'BRL', symbol: 'R$', displayName: 'BRL - Brazilian Real' },
  { code: 'CHF', symbol: 'CHF', displayName: 'CHF - Swiss Franc' },
  { code: 'SEK', symbol: 'kr', displayName: 'SEK - Swedish Krona' },
  { code: 'NOK', symbol: 'kr', displayName: 'NOK - Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', displayName: 'DKK - Danish Krone' },
  { code: 'NZD', symbol: 'NZ$', displayName: 'NZD - New Zealand Dollar' },
  { code: 'SGD', symbol: 'S$', displayName: 'SGD - Singapore Dollar' },
  { code: 'HKD', symbol: 'HK$', displayName: 'HKD - Hong Kong Dollar' },
  { code: 'TWD', symbol: 'NT$', displayName: 'TWD - Taiwan Dollar' },
  { code: 'ZAR', symbol: 'R', displayName: 'ZAR - South African Rand' },
  { code: 'MXN', symbol: 'MX$', displayName: 'MXN - Mexican Peso' },
];

// --- Dropdown Options ---

export const VM_FAMILY_OPTIONS: VMFamily[] = [
  'Auto',
  'General Purpose (D-series)',
  'Compute Optimized (F-series)',
  'Memory Optimized (E-series)',
  'Burstable (B-series)',
];

export const DISK_TYPE_OPTIONS: DiskType[] = ['Premium SSD', 'Standard SSD', 'Standard HDD'];

export const OS_OPTIONS: OSOption[] = [
  'Windows Server',
  'Ubuntu',
  'Red Hat Linux',
  'SUSE Linux',
  'CentOS',
];

export const SQL_OPTIONS: SQLOption[] = ['None', 'Standard', 'Enterprise', 'Developer'];

export const BACKUP_OPTIONS: BackupOption[] = [
  'No backups',
  'Short-term (34 days)',
  'Short + Long-term (34d/5w/12m/7y)',
];

export const PRICING_MODEL_OPTIONS: PricingModel[] = [
  'PAYG',
  '1-year SP (~26% off)',
  '3-year SP (~48% off)',
  '1-year RI (~41% off)',
  '3-year RI (~63% off)',
];

// --- VM SKU Definitions ---

export const VM_SKUS = [
  // B-series (Burstable)
  { size: 'B1s', family: 'Burstable (B-series)', vcpu: 1, memoryGB: 1 },
  { size: 'B2s', family: 'Burstable (B-series)', vcpu: 2, memoryGB: 4 },
  { size: 'B2ms', family: 'Burstable (B-series)', vcpu: 2, memoryGB: 8 },
  { size: 'B4ms', family: 'Burstable (B-series)', vcpu: 4, memoryGB: 16 },
  { size: 'B8ms', family: 'Burstable (B-series)', vcpu: 8, memoryGB: 32 },
  { size: 'B12ms', family: 'Burstable (B-series)', vcpu: 12, memoryGB: 48 },
  { size: 'B16ms', family: 'Burstable (B-series)', vcpu: 16, memoryGB: 64 },
  { size: 'B20ms', family: 'Burstable (B-series)', vcpu: 20, memoryGB: 80 },
  // Dsv3 (General Purpose)
  { size: 'D2s_v3', family: 'General Purpose (D-series)', vcpu: 2, memoryGB: 8 },
  { size: 'D4s_v3', family: 'General Purpose (D-series)', vcpu: 4, memoryGB: 16 },
  { size: 'D8s_v3', family: 'General Purpose (D-series)', vcpu: 8, memoryGB: 32 },
  { size: 'D16s_v3', family: 'General Purpose (D-series)', vcpu: 16, memoryGB: 64 },
  { size: 'D32s_v3', family: 'General Purpose (D-series)', vcpu: 32, memoryGB: 128 },
  { size: 'D64s_v3', family: 'General Purpose (D-series)', vcpu: 64, memoryGB: 256 },
  // Dsv5 (General Purpose)
  { size: 'D2s_v5', family: 'General Purpose (D-series)', vcpu: 2, memoryGB: 8 },
  { size: 'D4s_v5', family: 'General Purpose (D-series)', vcpu: 4, memoryGB: 16 },
  { size: 'D8s_v5', family: 'General Purpose (D-series)', vcpu: 8, memoryGB: 32 },
  { size: 'D16s_v5', family: 'General Purpose (D-series)', vcpu: 16, memoryGB: 64 },
  { size: 'D32s_v5', family: 'General Purpose (D-series)', vcpu: 32, memoryGB: 128 },
  { size: 'D48s_v5', family: 'General Purpose (D-series)', vcpu: 48, memoryGB: 192 },
  { size: 'D64s_v5', family: 'General Purpose (D-series)', vcpu: 64, memoryGB: 256 },
  { size: 'D96s_v5', family: 'General Purpose (D-series)', vcpu: 96, memoryGB: 384 },
  // Ev3 (Memory Optimized)
  { size: 'E2s_v3', family: 'Memory Optimized (E-series)', vcpu: 2, memoryGB: 16 },
  { size: 'E4s_v3', family: 'Memory Optimized (E-series)', vcpu: 4, memoryGB: 32 },
  { size: 'E8s_v3', family: 'Memory Optimized (E-series)', vcpu: 8, memoryGB: 64 },
  { size: 'E16s_v3', family: 'Memory Optimized (E-series)', vcpu: 16, memoryGB: 128 },
  { size: 'E20s_v3', family: 'Memory Optimized (E-series)', vcpu: 20, memoryGB: 160 },
  { size: 'E32s_v3', family: 'Memory Optimized (E-series)', vcpu: 32, memoryGB: 256 },
  { size: 'E64s_v3', family: 'Memory Optimized (E-series)', vcpu: 64, memoryGB: 432 },
  { size: 'E64is_v3', family: 'Memory Optimized (E-series)', vcpu: 64, memoryGB: 432 },
  // Ev5 (Memory Optimized)
  { size: 'E2s_v5', family: 'Memory Optimized (E-series)', vcpu: 2, memoryGB: 16 },
  { size: 'E4s_v5', family: 'Memory Optimized (E-series)', vcpu: 4, memoryGB: 32 },
  { size: 'E8s_v5', family: 'Memory Optimized (E-series)', vcpu: 8, memoryGB: 64 },
  { size: 'E16s_v5', family: 'Memory Optimized (E-series)', vcpu: 16, memoryGB: 128 },
  { size: 'E20s_v5', family: 'Memory Optimized (E-series)', vcpu: 20, memoryGB: 160 },
  { size: 'E32s_v5', family: 'Memory Optimized (E-series)', vcpu: 32, memoryGB: 256 },
  { size: 'E48s_v5', family: 'Memory Optimized (E-series)', vcpu: 48, memoryGB: 384 },
  { size: 'E64s_v5', family: 'Memory Optimized (E-series)', vcpu: 64, memoryGB: 512 },
  { size: 'E96s_v5', family: 'Memory Optimized (E-series)', vcpu: 96, memoryGB: 672 },
  // Fsv2 (Compute Optimized)
  { size: 'F2s_v2', family: 'Compute Optimized (F-series)', vcpu: 2, memoryGB: 4 },
  { size: 'F4s_v2', family: 'Compute Optimized (F-series)', vcpu: 4, memoryGB: 8 },
  { size: 'F8s_v2', family: 'Compute Optimized (F-series)', vcpu: 8, memoryGB: 16 },
  { size: 'F16s_v2', family: 'Compute Optimized (F-series)', vcpu: 16, memoryGB: 32 },
  { size: 'F32s_v2', family: 'Compute Optimized (F-series)', vcpu: 32, memoryGB: 64 },
  { size: 'F48s_v2', family: 'Compute Optimized (F-series)', vcpu: 48, memoryGB: 96 },
  { size: 'F64s_v2', family: 'Compute Optimized (F-series)', vcpu: 64, memoryGB: 128 },
  { size: 'F72s_v2', family: 'Compute Optimized (F-series)', vcpu: 72, memoryGB: 144 },
];

// --- Exchange Rates (relative to USD, approximate) ---

export const EXCHANGE_RATES: Record<string, number> = {
  'USD': 1.0,
  'AUD': 1.53,
  'EUR': 0.92,
  'GBP': 0.79,
  'CAD': 1.36,
  'JPY': 149.50,
  'CNY': 7.24,
  'INR': 83.12,
  'KRW': 1320.0,
  'BRL': 4.97,
  'CHF': 0.88,
  'SEK': 10.45,
  'NOK': 10.60,
  'DKK': 6.87,
  'NZD': 1.63,
  'SGD': 1.34,
  'HKD': 7.82,
  'TWD': 31.50,
  'ZAR': 18.95,
  'MXN': 17.15,
};
