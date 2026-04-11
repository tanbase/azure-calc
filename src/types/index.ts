// ============================================================
// Azure VM Pricing Calculator - TypeScript Types
// ============================================================

// --- Azure Pricing API Types ---

export interface AzureMeter {
  id: string;
  location: string;
  meterCategory: string;
  meterSubcategory: string;
  meterName: string;
  meterStatus: string;
  meterTags: Record<string, unknown>;
  effectiveStartDate: string;
  effectiveEndDate: string;
  unitOfMeasure: string;
  unitPrice: number;
  pricingCurrency: string;
  isPrimaryMeter: boolean;
  reservationTerm?: string;
  skuName: string;
  productId: string;
  productName: string;
  serviceId: string;
  serviceName: string;
  serviceFamily: string;
  tierMinimumUnits: number;
  type: string;
  armRegionName: string;
}

export interface OptimizedPricingRecord {
  skuId: string;
  productName: string;
  serviceName: string;
  meterName: string;
  region: string; // kept for grouping; not read by frontend on individual records
  unitOfMeasure: string;
  unitPrice: number;
  reservationTerm: string | null; // null = PAYG
  skuName: string; // storage tier identifier (e.g. "Standard", "Archive" for Backup)
  armSkuName: string; // Azure VM SKU name like "D2s_v3"
}

export interface PricingResponse {
  status: 'fresh' | 'stale' | 'empty' | 'error';
  data: Record<string, OptimizedPricingRecord[]> | null; // keyed by region
  lastUpdated: string | null;
  message?: string;
}

export interface RefreshProgress {
  status: 'idle' | 'refreshing' | 'complete';
  progress: number; // 0-100
  current: number;
  total: number;
}

// --- VM Configuration Types ---

export type OSOption = 'Windows Server' | 'Ubuntu' | 'Red Hat Linux' | 'SUSE Linux' | 'CentOS';
export type DiskType = 'Premium SSD' | 'Standard SSD' | 'Standard HDD';
export type SQLOption = 'None' | 'Standard' | 'Enterprise' | 'Developer';
export type BackupOption =
  | 'No backups'
  | 'Short-term (34 days)'
  | 'Short + Long-term (34d/5w/12m/7y)';
export type PricingModel = 'PAYG' | '1-year SP (~26% off)' | '3-year SP (~48% off)' | '1-year RI (~41% off)' | '3-year RI (~63% off)';
export type VMFamily = 'Auto' | 'General Purpose (D-series)' | 'Compute Optimized (F-series)' | 'Memory Optimized (E-series)' | 'Burstable (B-series)';

export interface VMEntry {
  id: string;
  name: string;
  vmFamily: VMFamily;
  vcpu: number;
  memoryGB: number;
  diskType: DiskType;
  diskSizeGB: number;
  os: OSOption;
  sql: SQLOption;
  backup: BackupOption;
  monitoring: boolean;
  asr: boolean;
  pricingModel: PricingModel;
  monthlyCost: number;
  selectedVMSKU: string; // Display only
  selectedDiskSKU: string; // Display only
}

// --- SKU Breakdown Types ---

export interface SKULineItem {
  skuId: string;
  productName: string;
  serviceName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  vmName: string; // which VM this line item belongs to
  vmId: string;   // unique ID for grouping (handles duplicate names)
  meterName: string;
  unitOfMeasure: string;
}

// --- Settings Types ---

export interface AppSettings {
  region: string;
  currency: string;
  azureHybridBenefitWindows: boolean;
  azureHybridBenefitSQL: boolean;
}

export interface AzureRegion {
  name: string;
  displayName: string;
  pricePremium?: number; // percentage above East US
}

export interface VMSKU {
  size: string;
  family: VMFamily;
  vcpu: number;
  memoryGB: number;
}

// --- Export Types ---

export interface VMExportRow {
  'VM Name': string;
  'VM Family': string;
  vCPU: number;
  'Memory GB': number;
  'VM SKU': string;
  'Disk Type': string;
  'Disk Size GB': number;
  'Disk SKU': string;
  OS: string;
  SQL: string;
  Backup: string;
  Monitoring: string;
  'ASR (Replication)': string;
  'Pricing Model': string;
  'Monthly Cost': number;
}

export interface SKUExportRow {
  'SKU ID': string;
  'Product Name': string;
  Service: string;
  'Unit Price': number;
  Quantity: number;
  'Line Total': number;
  'VM Name': string;
  'Meter Name': string;
  'Unit of Measure': string;
}

// --- Locale detection ---
// Maps browser locale to closest available pricing region
// Only includes regions that exist in COMMERCIAL_REGIONS (scripts/refresh-pricing.js)

export const LOCALE_TO_REGION: Record<string, string> = {
  'en-AU': 'australiaeast',
  'en-US': 'eastus',
  'en-GB': 'uksouth',
  'en-CA': 'canadacentral',
  'en-IN': 'centralindia',
  'ja-JP': 'japaneast',
  'ko-KR': 'koreacentral',
  'de-DE': 'westeurope',
  'fr-FR': 'francecentral',
  'es-ES': 'westeurope',
  'it-IT': 'westeurope',
  'nl-NL': 'westeurope',
  'pt-BR': 'brazilsouth',
  'zh-CN': 'eastasia',
  'zh-TW': 'eastasia',
  'ar-AE': 'uaenorth',
  'hi-IN': 'centralindia',
};
