#!/usr/bin/env node
// ============================================================
// Azure VM Pricing Calculator - Pricing Data Refresh Script
// Fetches pricing from Azure Retail API and writes to public/pricing/*.json
// Can be run standalone, via `npm run refresh-pricing`, or as a GitHub Action.
// ============================================================

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// Constants
// ============================================================

const AZURE_PRICING_API = 'https://prices.azure.com/api/retail/prices';
const FETCH_TIMEOUT_MS = 30000;

const VM_SKU_NAMES = [
  // B-series
  'Standard_B1s', 'Standard_B2s', 'Standard_B2ms', 'Standard_B4ms',
  'Standard_B8ms', 'Standard_B12ms', 'Standard_B16ms', 'Standard_B20ms',
  // Dsv3
  'Standard_D2s_v3', 'Standard_D4s_v3', 'Standard_D8s_v3', 'Standard_D16s_v3',
  'Standard_D32s_v3', 'Standard_D64s_v3',
  // Dsv5
  'Standard_D2s_v5', 'Standard_D4s_v5', 'Standard_D8s_v5', 'Standard_D16s_v5',
  'Standard_D32s_v5', 'Standard_D48s_v5', 'Standard_D64s_v5', 'Standard_D96s_v5',
  // Ev3
  'Standard_E2s_v3', 'Standard_E4s_v3', 'Standard_E8s_v3', 'Standard_E16s_v3',
  'Standard_E20s_v3', 'Standard_E32s_v3', 'Standard_E64s_v3', 'Standard_E64is_v3',
  // Ev5
  'Standard_E2s_v5', 'Standard_E4s_v5', 'Standard_E8s_v5', 'Standard_E16s_v5',
  'Standard_E20s_v5', 'Standard_E32s_v5', 'Standard_E48s_v5', 'Standard_E64s_v5',
  'Standard_E96s_v5',
  // Fsv2
  'Standard_F2s_v2', 'Standard_F4s_v2', 'Standard_F8s_v2', 'Standard_F16s_v2',
  'Standard_F32s_v2', 'Standard_F48s_v2', 'Standard_F64s_v2', 'Standard_F72s_v2',
];

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const VM_SKU_BATCHES = chunkArray(VM_SKU_NAMES, 5);

const HARDCODED_PRICING = {
  sqlServer: {
    Standard: 0.10,     // per vCPU per hour (Azure Retail API: Virtual Machines Licenses)
    Enterprise: 0.375,  // per vCPU per hour (Azure Retail API: Virtual Machines Licenses)
  },
  osLicensing: {
    windowsServer: 0.046,   // per vCPU per hour (Azure Retail API: Virtual Machines Licenses)
    rhel: 0.0108,           // per vCPU per hour (Azure Retail API: Virtual Machines Licenses)
    // SUSE is free like other Linux distros on Azure — no OS licensing surcharge
    // (SUSE support subscriptions are optional add-ons, not mandatory licensing)
    suse: 0,
  },
  asr: {
    protectedInstance: 25.0,
    replicaStoragePerGB: 0.05,
  },
};

const EXCHANGE_RATE_API = 'https://open.er-api.com/v6/latest/USD';
const DEFAULT_EXCHANGE_RATES = {
  USD: 1.0, AUD: 1.53, EUR: 0.92, GBP: 0.79, CAD: 1.36,
  JPY: 150.0, KRW: 1320.0, INR: 83.0, BRL: 4.97, CNY: 7.24, TWD: 31.5,
};

// Filter to popular commercial + Australia/APAC regions
const COMMERCIAL_REGIONS = new Set([
  // Australia (all regions)
  'australiaeast', 'australiasoutheast', 'australiacentral', 'australiacentral2',
  // Global / US
  'eastus', 'eastus2', 'westus2', 'westus3', 'centralus',
  // Europe
  'northeurope', 'westeurope', 'uksouth', 'francecentral',
  // Asia Pacific
  'southeastasia', 'eastasia', 'japaneast',
  'koreacentral',
  // Americas
  'canadacentral', 'brazilsouth',
  // Middle East
  'uaenorth', 'qatarcentral',
  // India
  'centralindia', 'southindia',
]);

// ============================================================
// Fetch helpers
// ============================================================

async function fetchPricingPage(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Azure API returned ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchPricingWithPagination(url) {
  const allRecords = [];
  while (url) {
    const data = await fetchPricingPage(url);
    const records = data.Items || [];
    allRecords.push(...records);
    url = data.NextPageLink || null;
    if (url) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  return allRecords;
}

// ============================================================
// Fetch pricing from Azure
// ============================================================

async function fetchVMPricing() {
  const allRecords = [];
  const totalBatches = VM_SKU_BATCHES.length;

  for (let i = 0; i < totalBatches; i++) {
    const batch = VM_SKU_BATCHES[i];
    const skuFilter = batch.map(sku => `armSkuName eq '${sku}'`).join(' or ');

    // PAYG
    const paygUrl = `${AZURE_PRICING_API}?$filter=serviceName eq 'Virtual Machines' and (${skuFilter}) and type eq 'Consumption'`;
    console.log(`  VM batch ${i + 1}/${totalBatches}: fetching PAYG for ${batch.length} SKUs...`);
    const paygRecords = await fetchPricingWithPagination(paygUrl);
    console.log(`    Got ${paygRecords.length} PAYG records`);
    allRecords.push(...paygRecords);

    // 1-year RI
    const ri1Url = `${AZURE_PRICING_API}?$filter=serviceName eq 'Virtual Machines' and (${skuFilter}) and reservationTerm eq '1 Year'`;
    const ri1Records = await fetchPricingWithPagination(ri1Url);
    console.log(`    Got ${ri1Records.length} 1-year RI records`);
    allRecords.push(...ri1Records);

    // 3-year RI
    const ri3Url = `${AZURE_PRICING_API}?$filter=serviceName eq 'Virtual Machines' and (${skuFilter}) and reservationTerm eq '3 Years'`;
    const ri3Records = await fetchPricingWithPagination(ri3Url);
    console.log(`    Got ${ri3Records.length} 3-year RI records`);
    allRecords.push(...ri3Records);
  }

  return allRecords;
}

async function fetchDiskPricing() {
  const allRecords = [];
  const premiumDiskSkus = [];
  const ssdDiskSkus = [];
  const hddDiskSkus = [];

  for (const size of ['P1','P2','P3','P4','P6','P10','P15','P20','P30','P40','P50','P60','P70','P80']) {
    premiumDiskSkus.push(`Premium_SSD_Managed_Disk_${size}`);
  }
  for (const size of ['E1','E2','E3','E4','E6','E10','E15','E20','E30','E40','E50','E60','E70','E80']) {
    ssdDiskSkus.push(`Standard_SSD_Managed_Disk_${size}`);
  }
  for (const size of ['S4','S6','S10','S15','S20','S30','S40','S50','S60','S70','S80']) {
    hddDiskSkus.push(`Standard_HDD_Managed_Disk_${size}`);
  }

  const allDiskSkus = [...premiumDiskSkus, ...ssdDiskSkus, ...hddDiskSkus];
  console.log(`  Fetching ${allDiskSkus.length} disk SKUs...`);

  const diskBatches = chunkArray(allDiskSkus, 5);
  for (let i = 0; i < diskBatches.length; i++) {
    const batch = diskBatches[i];
    const skuFilter = batch.map(sku => `armSkuName eq '${sku}'`).join(' or ');
    const url = `${AZURE_PRICING_API}?$filter=serviceName eq 'Storage' and (${skuFilter}) and type eq 'Consumption'`;
    console.log(`    Disk batch ${i + 1}/${diskBatches.length}: ${batch.join(', ')}`);
    const records = await fetchPricingWithPagination(url);
    console.log(`    Got ${records.length} records`);
    allRecords.push(...records);
  }

  return allRecords;
}

async function fetchServicePricing() {
  const allRecords = [];

  console.log('  Fetching Backup pricing...');
  const backupUrl = `${AZURE_PRICING_API}?$filter=serviceName eq 'Backup' and type eq 'Consumption'`;
  const backupRecords = await fetchPricingWithPagination(backupUrl);
  console.log(`    Got ${backupRecords.length} records`);
  allRecords.push(...backupRecords);

  console.log('  Fetching Azure Monitor pricing...');
  const monitorUrl = `${AZURE_PRICING_API}?$filter=serviceName eq 'Azure Monitor' and type eq 'Consumption'`;
  const monitorRecords = await fetchPricingWithPagination(monitorUrl);
  console.log(`    Got ${monitorRecords.length} records`);
  allRecords.push(...monitorRecords);

  // Log Analytics - Analytics Logs ingestion + retention for SQL MI monitoring
  console.log('  Fetching Log Analytics pricing...');
  const logAnalyticsUrl = `${AZURE_PRICING_API}?$filter=serviceName eq 'Log Analytics' and type eq 'Consumption'`;
  const logAnalyticsRecords = await fetchPricingWithPagination(logAnalyticsUrl);
  console.log(`    Got ${logAnalyticsRecords.length} records`);
  allRecords.push(...logAnalyticsRecords);

  return allRecords;
}

// ============================================================
// Fetch SQL Server licensing + OS licensing (Windows, RHEL)
// from the Virtual Machines Licenses API.
// Extracts per-vCPU hourly rates for SQL Standard/Enterprise,
// Windows Server, and Red Hat Enterprise Linux.
// Falls back to HARDCODED_PRICING values if API data is unavailable.
// ============================================================

async function fetchLicensingPricing() {
  console.log('  Fetching SQL Server + OS licensing pricing...');
  const url = `${AZURE_PRICING_API}?$filter=serviceName eq 'Virtual Machines Licenses'`;
  const allRecords = await fetchPricingWithPagination(url);
  console.log(`    Got ${allRecords.length} VM Licenses records`);

  const sqlLicensing = { Standard: null, Enterprise: null };
  let windowsRate = null;
  let rhelRate = null;

  for (const record of allRecords) {
    const productName = record.productName || '';
    const skuName = record.skuName || '';
    const meterName = record.meterName || '';
    const price = record.retailPrice || 0;

    // Skip zero-priced records
    if (price <= 0) continue;

    // SQL Server Standard
    if (productName === 'SQL Server Standard' && skuName.includes('vCPU VM') && meterName.includes('vCPU VM License')) {
      const vcpuMatch = skuName.match(/^(\d+)\s+vCPU/);
      if (vcpuMatch) {
        const vcpus = parseInt(vcpuMatch[1], 10);
        const perVcpuHour = price / vcpus;
        if (sqlLicensing.Standard === null || Math.abs(perVcpuHour - 0.10) < Math.abs(sqlLicensing.Standard - 0.10)) {
          sqlLicensing.Standard = perVcpuHour;
        }
      }
    }

    // SQL Server Enterprise
    if (productName === 'SQL Server Enterprise' && skuName.includes('vCPU VM') && meterName.includes('vCPU VM License')) {
      const vcpuMatch = skuName.match(/^(\d+)\s+vCPU/);
      if (vcpuMatch) {
        const vcpus = parseInt(vcpuMatch[1], 10);
        const perVcpuHour = price / vcpus;
        if (sqlLicensing.Enterprise === null || Math.abs(perVcpuHour - 0.375) < Math.abs(sqlLicensing.Enterprise - 0.375)) {
          sqlLicensing.Enterprise = perVcpuHour;
        }
      }
    }

    // Windows Server (standalone license)
    // ProductName exactly "Windows Server", not "Windows Server for Azure Local" etc.
    if (productName === 'Windows Server' && skuName.includes('vCPU VM') && meterName.includes('vCPU VM License')) {
      const vcpuMatch = skuName.match(/^(\d+)\s+vCPU/);
      if (vcpuMatch) {
        const vcpus = parseInt(vcpuMatch[1], 10);
        const perVcpuHour = price / vcpus;
        // Should be ~$0.046/vCPU/hr
        if (windowsRate === null || Math.abs(perVcpuHour - 0.046) < Math.abs(windowsRate - 0.046)) {
          windowsRate = perVcpuHour;
        }
      }
    }

    // Red Hat Enterprise Linux (standalone license, base — not SAP/HANA variants)
    if (productName === 'Red Hat Enterprise Linux' && skuName.includes('vCPU VM') && meterName.includes('vCPU VM License')) {
      const vcpuMatch = skuName.match(/^(\d+)\s+vCPU/);
      if (vcpuMatch) {
        const vcpus = parseInt(vcpuMatch[1], 10);
        const perVcpuHour = price / vcpus;
        // Should be ~$0.0108/vCPU/hr (skip outlier entries with huge per-vCPU rates)
        if (perVcpuHour < 1.0 && (rhelRate === null || Math.abs(perVcpuHour - 0.0108) < Math.abs(rhelRate - 0.0108))) {
          rhelRate = perVcpuHour;
        }
      }
    }
  }

  // Fall back to hardcoded values if API didn't return data
  const result = {
    sqlStandard: sqlLicensing.Standard ?? HARDCODED_PRICING.sqlServer.Standard,
    sqlEnterprise: sqlLicensing.Enterprise ?? HARDCODED_PRICING.sqlServer.Enterprise,
    sqlDeveloper: 0,
    windowsServer: windowsRate ?? HARDCODED_PRICING.osLicensing?.windowsServer ?? 0.046,
    rhel: rhelRate ?? HARDCODED_PRICING.osLicensing?.rhel ?? 0.0108,
  };

  console.log(`    ✅ SQL Standard: $${result.sqlStandard.toFixed(3)}/vCPU/hr, SQL Enterprise: $${result.sqlEnterprise.toFixed(3)}/vCPU/hr`);
  console.log(`    ✅ Windows Server: $${result.windowsServer.toFixed(3)}/vCPU/hr, RHEL: $${result.rhel.toFixed(3)}/vCPU/hr`);
  return result;
}

// ============================================================
// Fetch SQL Managed Instance pricing from Azure Retail API.
// SQL MI uses per-vCore hourly pricing (not bundle SKUs like VMs).
// Fetches General Purpose Gen5 and Business Critical Gen5 compute + storage.
// ============================================================

async function fetchSQLMIPricing() {
  console.log('  Fetching SQL Managed Instance pricing...');
  const url = `${AZURE_PRICING_API}?$filter=serviceName eq 'SQL Managed Instance' and type eq 'Consumption'`;
  const allRecords = await fetchPricingWithPagination(url);
  console.log(`    Got ${allRecords.length} SQL MI records`);
  return allRecords;
}

// ============================================================
// Filter SQL MI records into the OptimizedPricingRecord format.
// We keep:
// - GP Gen5 Compute: meterName='vCore', skuName='1 vCore' → per-vCore/hr
// - BC Gen5 Compute: meterName='vCore', skuName='1 vCore' → per-vCore/hr
// - GP Storage: meterName='General Purpose Data Stored' → per GB/mo
// - BC Storage: meterName='Business Critical Data Stored' → per GB/mo
// - PITR Backup (LRS): productName includes 'PITR Backup', meterName='LRS Data Stored'
// - LTR Backup (LRS): productName includes 'LTR Backup', meterName='LTR Backup LRS Data Stored'
// We normalize productName to simple labels for easy lookup.
// ============================================================

function filterAndOptimizeSQLMIRecords(records) {
  const optimized = [];
  const seen = new Set();

  for (const record of records) {
    const productName = record.productName || '';
    const meterName = record.meterName || '';
    const skuName = record.skuName || '';
    const region = record.armRegionName || '';
    const price = record.retailPrice || 0;

    const isPerVCoreUnit = meterName === 'vCore' && skuName === '1 vCore';
    const isGPStorageUnit = meterName === 'General Purpose Data Stored';
    const isBCStorageUnit = meterName === 'Business Critical Data Stored';
    const isPITRBackup = productName.includes('PITR Backup Storage') && meterName === 'LRS Data Stored';
    const isLTRBackup = productName.includes('LTR Backup Storage') && meterName === 'LTR Backup LRS Data Stored';

    if (!isPerVCoreUnit && !isGPStorageUnit && !isBCStorageUnit && !isPITRBackup && !isLTRBackup) continue;

    let serviceName = 'SQL Managed Instance';
    let normalizedProductName;
    let meterLabel;

    if (productName.includes('General Purpose - Compute Gen5') && isPerVCoreUnit) {
      normalizedProductName = 'General Purpose Gen5';
      meterLabel = 'vCore per Hour';
    } else if (productName.includes('Business Critical - Compute Gen5') && isPerVCoreUnit) {
      normalizedProductName = 'Business Critical Gen5';
      meterLabel = 'vCore per Hour';
    } else if (productName.includes('General Purpose') && productName.includes('Storage') && meterName === 'General Purpose Data Stored') {
      if (meterName.includes('Zone Redundancy')) continue;
      normalizedProductName = 'General Purpose Storage';
      meterLabel = 'GB per Month';
    } else if (productName.includes('Business Critical') && productName.includes('Storage') && meterName === 'Business Critical Data Stored') {
      if (meterName.includes('Zone Redundancy')) continue;
      normalizedProductName = 'Business Critical Storage';
      meterLabel = 'GB per Month';
    } else if (isPITRBackup) {
      normalizedProductName = 'PITR Backup LRS';
      meterLabel = 'GB per Month';
    } else if (isLTRBackup) {
      normalizedProductName = 'LTR Backup LRS';
      meterLabel = 'GB per Month';
    } else {
      continue;
    }

    const dedupKey = `${normalizedProductName}|${region}|${meterLabel}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    optimized.push({
      skuId: `sqlmi-${normalizedProductName.replace(/\s/g, '-').toLowerCase()}-${region}`,
      productName: normalizedProductName,
      serviceName,
      meterName: meterLabel,
      region,
      unitOfMeasure: meterLabel === 'GB per Month' ? '1 GB/Month' : '1 Hour',
      unitPrice: price,
      reservationTerm: null,
      skuName: normalizedProductName,
      armSkuName: normalizedProductName,
    });
  }

  return optimized;
}

function filterAndOptimizeRecords(records) {
  const optimized = [];
  const seen = new Set();

  for (const record of records) {
    const reservationTerm = record.reservationTerm || null;

    if (!reservationTerm && record.type !== 'Consumption') continue;
    if (record.tierMinimumUnits !== 0) continue;
    if (record.skuName && (record.skuName.includes('Spot') || record.skuName.includes('Low Priority'))) continue;

    if (record.serviceName === 'Storage') {
      if (!record.meterName || !/^[A-Z]\d+ LRS Disk$/.test(record.meterName)) continue;
    }

    const startDate = new Date(record.effectiveStartDate);
    if (startDate > new Date()) continue;

    // Azure Monitor — keep only Basic Logs
    if (record.serviceName === 'Azure Monitor') {
      if (record.meterName !== 'Basic Logs Data Ingestion') continue;
    }

    // Backup — keep protected instances AND storage rate records
    if (record.serviceName === 'Backup') {
      const isProtectedInstance =
        record.meterName === 'On Premises Server Protected Instances' ||
        record.meterName === 'Azure VM Protected Instances';
      const isStorageRate =
        record.skuName === 'Standard' && record.meterName === 'LRS Data Stored';
      const isArchiveRate =
        record.skuName === 'Archive' && record.meterName === 'LRS Data Stored';
      if (!isProtectedInstance && !isStorageRate && !isArchiveRate) continue;
    }

    // Log Analytics — keep Analytics Logs ingestion and retention
    if (record.serviceName === 'Log Analytics') {
      const isIngestion = record.meterName === 'Analytics Logs Data Ingestion' && record.retailPrice > 0;
      const isRetention = record.meterName === 'Analytics Logs Data Retention';
      if (!isIngestion && !isRetention) continue;
    }

    const optimizedRecord = {
      skuId: record.skuId,
      productName: record.productName,
      serviceName: record.serviceName,
      meterName: record.meterName,
      region: record.armRegionName,
      unitOfMeasure: record.unitOfMeasure,
      unitPrice: record.retailPrice,
      reservationTerm,
      skuName: record.skuName || '', // needed to distinguish Backup storage tiers
      armSkuName: record.armSkuName || '',
    };

    const dedupKey = `${record.skuName}|${record.armRegionName}|${record.meterName}|${reservationTerm || 'PAYG'}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    optimized.push(optimizedRecord);
  }

  return optimized;
}

// ============================================================
// Fetch exchange rates
// ============================================================

async function fetchExchangeRates() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    console.log('🔄 Fetching exchange rates...');
    const res = await fetch(EXCHANGE_RATE_API, { signal: controller.signal });
    if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);
    const data = await res.json();
    if (!data.rates) throw new Error('No rates in response');
    console.log(`✅ Exchange rates updated: ${Object.keys(data.rates).length} currencies`);
    return data.rates;
  } catch (error) {
    console.error('❌ Failed to fetch exchange rates:', error.message);
    console.log('⚠️  Using default fallback exchange rates');
    return DEFAULT_EXCHANGE_RATES;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Main refresh
// ============================================================

async function refreshPricing() {
  const startTime = Date.now();
  console.log('🚀 Starting Azure pricing data refresh...\n');

  // 1. Fetch VM pricing
  console.log('📡 Fetching VM pricing (47 SKUs)...');
  const vmRecords = await fetchVMPricing();
  console.log(`  ✅ VM pricing: ${vmRecords.length} records\n`);

  // 2. Fetch disk pricing
  console.log('📡 Fetching disk pricing...');
  const diskRecords = await fetchDiskPricing();
  console.log(`  ✅ Disk pricing: ${diskRecords.length} records\n`);

  // 3. Fetch service pricing
  console.log('📡 Fetching service pricing...');
  const serviceRecords = await fetchServicePricing();
  console.log(`  ✅ Service pricing: ${serviceRecords.length} records\n`);

  // 4. Fetch SQL Managed Instance pricing
  console.log('📡 Fetching SQL Managed Instance pricing...');
  const sqlMIRecords = await fetchSQLMIPricing();
  console.log(`  ✅ SQL MI pricing: ${sqlMIRecords.length} raw records`);
  const sqlMIOptimized = filterAndOptimizeSQLMIRecords(sqlMIRecords);
  console.log(`  ✅ SQL MI pricing: ${sqlMIOptimized.length} optimized records\n`);

  // 5. Fetch SQL Server + OS licensing pricing
  console.log('📡 Fetching SQL Server + OS licensing...');
  const licensing = await fetchLicensingPricing();
  console.log('');

  // 6. Fetch exchange rates
  const exchangeRates = await fetchExchangeRates();

  // 7. Combine and filter VM/disk/service records
  const allRecords = [...vmRecords, ...diskRecords, ...serviceRecords];
  console.log(`\n📊 Processing ${allRecords.length} raw records...`);
  const optimized = filterAndOptimizeRecords(allRecords);
  console.log(`✨ Optimized to ${optimized.length} records`);

  // 7. Add SQL Server + OS licensing pricing (from API or fallback)
  const licensingRecords = [];
  const regions = [...new Set(optimized.map(r => r.region))];
  for (const region of regions) {
    // SQL Server licensing
    licensingRecords.push({
      skuId: 'sql-server-standard',
      productName: 'SQL Server Standard',
      serviceName: 'SQL Server',
      meterName: 'Standard per vCPU Hour',
      region,
      unitOfMeasure: '1 Hour',
      unitPrice: licensing.sqlStandard,
      reservationTerm: null,
      skuName: 'SQL Server Standard',
      armSkuName: 'SQL Server Standard',
    });
    licensingRecords.push({
      skuId: 'sql-server-enterprise',
      productName: 'SQL Server Enterprise',
      serviceName: 'SQL Server',
      meterName: 'Enterprise per vCPU Hour',
      region,
      unitOfMeasure: '1 Hour',
      unitPrice: licensing.sqlEnterprise,
      reservationTerm: null,
      skuName: 'SQL Server Enterprise',
      armSkuName: 'SQL Server Enterprise',
    });
    licensingRecords.push({
      skuId: 'sql-server-developer',
      productName: 'SQL Server Developer',
      serviceName: 'SQL Server',
      meterName: 'Developer per vCPU Hour',
      region,
      unitOfMeasure: '1 Hour',
      unitPrice: licensing.sqlDeveloper,
      reservationTerm: null,
      skuName: 'SQL Server Developer',
      armSkuName: 'SQL Server Developer',
    });

    // OS Licensing
    licensingRecords.push({
      skuId: 'os-windows-server',
      productName: 'Windows Server License',
      serviceName: 'OS Licensing',
      meterName: 'Windows Server per vCPU Hour',
      region,
      unitOfMeasure: '1 Hour',
      unitPrice: licensing.windowsServer,
      reservationTerm: null,
      skuName: 'Windows Server',
      armSkuName: 'Windows Server',
    });
    licensingRecords.push({
      skuId: 'os-rhel',
      productName: 'Red Hat Enterprise Linux',
      serviceName: 'OS Licensing',
      meterName: 'RHEL per vCPU Hour',
      region,
      unitOfMeasure: '1 Hour',
      unitPrice: licensing.rhel,
      reservationTerm: null,
      skuName: 'Red Hat Enterprise Linux',
      armSkuName: 'Red Hat Enterprise Linux',
    });
    licensingRecords.push({
      skuId: 'os-suse',
      productName: 'SUSE Linux Enterprise Server',
      serviceName: 'OS Licensing',
      meterName: 'SLES per vCPU Hour',
      region,
      unitOfMeasure: '1 Hour',
      unitPrice: HARDCODED_PRICING.osLicensing.suse,
      reservationTerm: null,
      skuName: 'SUSE Linux Enterprise Server',
      armSkuName: 'SUSE Linux Enterprise Server',
    });
  }

  // 8. Add ASR pricing records (still hardcoded)
  const asrRecords = [];
  for (const region of regions) {
    asrRecords.push({
      skuId: 'asr-protected-instance',
      productName: 'Azure Site Recovery - Protected Instance',
      serviceName: 'Site Recovery',
      meterName: 'Protected Instance',
      region,
      unitOfMeasure: '1/Month',
      unitPrice: HARDCODED_PRICING.asr.protectedInstance,
      reservationTerm: null,
      skuName: 'Site Recovery',
      armSkuName: 'Site Recovery',
    });
    asrRecords.push({
      skuId: 'asr-replica-storage',
      productName: 'Azure Site Recovery - Replica Storage',
      serviceName: 'Site Recovery',
      meterName: 'Replica Storage (LRS)',
      region,
      unitOfMeasure: '1 GB/Month',
      unitPrice: HARDCODED_PRICING.asr.replicaStoragePerGB,
      reservationTerm: null,
      skuName: 'Site Recovery Storage',
      armSkuName: 'Site Recovery Storage',
    });
  }

  const allOptimized = [...optimized, ...licensingRecords, ...asrRecords, ...sqlMIOptimized];
  console.log(`✨ With SQL MI + SQL + OS + ASR pricing: ${allOptimized.length} records`);

  // 9. Group by region and filter to commercial regions
  const allRegions = {};
  for (const record of allOptimized) {
    if (!allRegions[record.region]) {
      allRegions[record.region] = [];
    }
    allRegions[record.region].push(record);
  }

  const byRegion = {};
  for (const [region, data] of Object.entries(allRegions)) {
    if (COMMERCIAL_REGIONS.has(region)) {
      byRegion[region] = data;
    }
  }

  const totalRegions = Object.keys(byRegion).length;
  console.log(`\n🌍 Filtered to ${totalRegions} commercial regions`);

  // 10. Write per-region JSON files + index
  const publicDir = path.join(__dirname, '..', 'public');
  const pricingDir = path.join(publicDir, 'pricing');

  // Ensure pricing directory exists
  if (!fs.existsSync(pricingDir)) {
    fs.mkdirSync(pricingDir, { recursive: true });
  }

  // Write index file with exchange rates and region list
  const indexOutput = {
    exchangeRates,
    lastUpdated: new Date().toISOString(),
    regions: Object.keys(byRegion),
  };
  const indexPath = path.join(pricingDir, 'index.json');
  fs.writeFileSync(path.join(pricingDir, 'index.json.tmp'), JSON.stringify(indexOutput));
  fs.renameSync(path.join(pricingDir, 'index.json.tmp'), indexPath);

  // Write individual region files
  let totalRecords = 0;
  for (const [region, data] of Object.entries(byRegion)) {
    const regionOutput = {
      region,
      records: data,
      lastUpdated: new Date().toISOString(),
    };
    const regionPath = path.join(pricingDir, `${region}.json`);
    fs.writeFileSync(regionPath + '.tmp', JSON.stringify(regionOutput));
    fs.renameSync(regionPath + '.tmp', regionPath);
    totalRecords += data.length;
  }

  const fileSize = fs.statSync(indexPath).size;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ Pricing refresh complete in ${elapsed}s`);
  console.log(`   📄 Written: ${pricingDir}/ (${totalRegions} region files, ${(fileSize / 1024).toFixed(0)} KB index)`);
  console.log(`   📊 ${totalRegions} regions, ${totalRecords} records`);
}

// Run if called directly
refreshPricing().catch((err) => {
  console.error('❌ Refresh failed:', err.message);
  process.exit(1);
});
