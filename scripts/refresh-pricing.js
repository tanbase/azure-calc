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
const API_CALL_DELAY_MS = 500; // delay between top-level API calls to avoid 429 rate limits

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

const COMMERCIAL_REGIONS = new Set([
  'australiaeast', 'australiasoutheast', 'australiacentral', 'australiacentral2',
  'eastus', 'eastus2', 'westus2', 'westus3', 'centralus',
  'northeurope', 'westeurope', 'uksouth', 'francecentral',
  'southeastasia', 'eastasia', 'japaneast', 'koreacentral',
  'canadacentral', 'brazilsouth', 'uaenorth', 'qatarcentral',
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
      if (response.status === 429) {
        console.warn('  ⚠️  Rate limited (429), waiting 2s...');
        await sleep(2000);
        return fetchPricingPage(url);
      }
      throw new Error(`Azure API returned ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchPricingWithPagination(url) {
  const allRecords = [];
  while (url) {
    const data = await fetchPricingPage(url);
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid API response (not an object): ${url}`);
    }
    if (!Array.isArray(data.Items)) {
      console.warn(`  ⚠️  API response missing Items array: ${url}`);
      break;
    }
    const records = data.Items;
    allRecords.push(...records);
    url = data.NextPageLink || null;
    if (url) {
      await new Promise(resolve => setTimeout(resolve, 500));
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
    const paygFilter = `serviceName eq 'Virtual Machines' and (${skuFilter}) and type eq 'Consumption'`;
    const paygUrl = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(paygFilter)}`;
    console.log(`  VM batch ${i + 1}/${totalBatches}: fetching PAYG for ${batch.length} SKUs...`);
    const paygRecords = await fetchPricingWithPagination(paygUrl);
    console.log(`    Got ${paygRecords.length} PAYG records`);
    allRecords.push(...paygRecords);

    // 1-year RI
    const ri1Filter = `serviceName eq 'Virtual Machines' and (${skuFilter}) and reservationTerm eq '1 Year'`;
    const ri1Url = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(ri1Filter)}`;
    const ri1Records = await fetchPricingWithPagination(ri1Url);
    console.log(`    Got ${ri1Records.length} 1-year RI records`);
    allRecords.push(...ri1Records);

    // 3-year RI
    const ri3Filter = `serviceName eq 'Virtual Machines' and (${skuFilter}) and reservationTerm eq '3 Years'`;
    const ri3Url = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(ri3Filter)}`;
    const ri3Records = await fetchPricingWithPagination(ri3Url);
    console.log(`    Got ${ri3Records.length} 3-year RI records`);
    allRecords.push(...ri3Records);
  }

  return allRecords;
}

async function fetchDiskPricing() {
  console.log('  Fetching all Managed Disk pricing...');
  const diskFilter = `serviceName eq 'Storage' and type eq 'Consumption' and (contains(productName, 'Managed Disks')) and unitOfMeasure eq '1/Month'`;
  const url = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(diskFilter)}`;
  const records = await fetchPricingWithPagination(url);
  console.log(`    Got ${records.length} disk records`);
  return records;
}

async function fetchServicePricing() {
  const allRecords = [];

  // Backup — only fetch the specific meters we store:
  // protected instances + LRS storage (Standard + Archive tiers)
  console.log('  Fetching Backup pricing...');
  const backupFilter = `serviceName eq 'Backup' and type eq 'Consumption' and `
    + `(meterName eq 'On Premises Server Protected Instance' or `
    + `meterName eq 'Azure VM Protected Instance' or `
    + `meterName eq 'Standard LRS Data Stored' or `
    + `meterName eq 'Archive LRS Data Stored')`;
  const backupUrl = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(backupFilter)}`;
  const backupRecords = await fetchPricingWithPagination(backupUrl);
  console.log(`    Got ${backupRecords.length} records`);
  allRecords.push(...backupRecords);

  // Azure Monitor — only Basic Logs ingestion (we don't use any other meter)
  console.log('  Fetching Azure Monitor pricing...');
  const monitorFilter = `serviceName eq 'Azure Monitor' and type eq 'Consumption' and meterName eq 'Basic Logs Data Ingestion'`;
  const monitorUrl = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(monitorFilter)}`;
  const monitorRecords = await fetchPricingWithPagination(monitorUrl);
  console.log(`    Got ${monitorRecords.length} records`);
  allRecords.push(...monitorRecords);

  // Log Analytics — only Analytics Logs ingestion + retention (for SQL MI monitoring)
  console.log('  Fetching Log Analytics pricing...');
  const logAnalyticsFilter = `serviceName eq 'Log Analytics' and type eq 'Consumption' and `
    + `(meterName eq 'Analytics Logs Data Ingestion' or meterName eq 'Analytics Logs Data Retention')`;
  const logAnalyticsUrl = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(logAnalyticsFilter)}`;
  const logAnalyticsRecords = await fetchPricingWithPagination(logAnalyticsUrl);
  console.log(`    Got ${logAnalyticsRecords.length} records`);
  allRecords.push(...logAnalyticsRecords);

  return allRecords;
}

async function fetchLicensingPricing() {
  console.log('  Fetching SQL Server + OS licensing pricing...');
  const licensingFilter = `serviceName eq 'Virtual Machines Licenses'`;
  const url = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(licensingFilter)}`;
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

    if (price <= 0) continue;

    if (productName === 'SQL Server Standard' && skuName.includes('vCPU VM') && meterName.includes('vCPU VM License')) {
      const vcpuMatch = skuName.match(/^(\d+)\s+vCPU/);
      if (vcpuMatch) {
        const vcpus = parseInt(vcpuMatch[1], 10);
        const perVcpuHour = price / vcpus;
        if (perVcpuHour > 0.05 && perVcpuHour < 2.0 && sqlLicensing.Standard === null) {
          sqlLicensing.Standard = perVcpuHour;
        }
      }
    }

    if (productName === 'SQL Server Enterprise' && skuName.includes('vCPU VM') && meterName.includes('vCPU VM License')) {
      const vcpuMatch = skuName.match(/^(\d+)\s+vCPU/);
      if (vcpuMatch) {
        const vcpus = parseInt(vcpuMatch[1], 10);
        const perVcpuHour = price / vcpus;
        if (perVcpuHour > 0.10 && perVcpuHour < 5.0 && sqlLicensing.Enterprise === null) {
          sqlLicensing.Enterprise = perVcpuHour;
        }
      }
    }

    if (productName === 'Windows Server' && skuName.includes('vCPU VM') && meterName.includes('vCPU VM License')) {
      const vcpuMatch = skuName.match(/^(\d+)\s+vCPU/);
      if (vcpuMatch) {
        const vcpus = parseInt(vcpuMatch[1], 10);
        const perVcpuHour = price / vcpus;
        if (perVcpuHour > 0.01 && perVcpuHour < 1.0 && windowsRate === null) {
          windowsRate = perVcpuHour;
        }
      }
    }

    if (productName === 'Red Hat Enterprise Linux' && skuName.includes('vCPU VM') && meterName.includes('vCPU VM License')) {
      const vcpuMatch = skuName.match(/^(\d+)\s+vCPU/);
      if (vcpuMatch) {
        const vcpus = parseInt(vcpuMatch[1], 10);
        const perVcpuHour = price / vcpus;
        if (perVcpuHour > 0.005 && perVcpuHour < 1.0 && rhelRate === null) {
          rhelRate = perVcpuHour;
        }
      }
    }
  }

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

async function fetchSQLMIPricing() {
  console.log('  Fetching SQL Managed Instance pricing...');
  const sqlmiFilter = `serviceName eq 'SQL Managed Instance' and type eq 'Consumption' and `
    + `(productName eq 'SQL Managed Instance General Purpose - Compute Gen5' or `
    + `productName eq 'SQL Managed Instance Business Critical - Compute Gen5' or `
    + `productName eq 'SQL Managed Instance General Purpose - Storage' or `
    + `productName eq 'SQL Managed Instance Business Critical - Storage' or `
    + `productName eq 'SQL Managed Instance PITR Backup Storage' or `
    + `productName eq 'SQL Managed Instance - LTR Backup Storage')`;
  const url = `${AZURE_PRICING_API}?$filter=${encodeURIComponent(sqlmiFilter)}`;
  const allRecords = await fetchPricingWithPagination(url);
  console.log(`    Got ${allRecords.length} SQL MI records`);
  return allRecords;
}

// ============================================================
// Filter/Optimize logic
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
      tierMinimumUnits: record.tierMinimumUnits ?? 0,
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
    
    const isTieredService = record.serviceName === 'Log Analytics' || record.serviceName === 'Backup';
    if ((record.tierMinimumUnits ?? 0) > 0 && !isTieredService) continue;
    
    if (record.skuName && (record.skuName.includes('Spot') || record.skuName.includes('Low Priority'))) continue;

    if (record.serviceName === 'Storage') {
      const isManagedDisk = record.productName.includes('Managed Disks');
      const isBaseStorageMeter = /^[PES]\d+ (LRS|ZRS) Disk$/.test(record.meterName || '');
      const isMonthly = record.unitOfMeasure === '1/Month';
      if (!isManagedDisk || !isBaseStorageMeter || !isMonthly) continue;
    }

    const startDate = new Date(record.effectiveStartDate);
    if (startDate > new Date()) continue;

    if (record.serviceName === 'Azure Monitor') {
      if (record.meterName !== 'Basic Logs Data Ingestion') continue;
    }

    if (record.serviceName === 'Backup') {
      const isProtectedInstance =
        record.meterName === 'On Premises Server Protected Instance' ||
        record.meterName === 'Azure VM Protected Instance';
      const isStorageRate = record.meterName === 'Standard LRS Data Stored';
      const isArchiveRate = record.meterName === 'Archive LRS Data Stored';
      if (!isProtectedInstance && !isStorageRate && !isArchiveRate) continue;
    }

    if (record.serviceName === 'Log Analytics') {
      const isIngestion = record.meterName === 'Analytics Logs Data Ingestion' && (record.retailPrice > 0 || record.tierMinimumUnits === 5);
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
      skuName: record.skuName || '',
      armSkuName: record.armSkuName || '',
      tierMinimumUnits: record.tierMinimumUnits ?? 0,
    };

    const dedupKey = `${record.skuName}|${record.armRegionName}|${record.meterName}|${reservationTerm || 'PAYG'}|${record.tierMinimumUnits || 0}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    optimized.push(optimizedRecord);
  }

  return optimized;
}

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

  const vmRecords = await fetchVMPricing();
  await sleep(API_CALL_DELAY_MS);

  const diskRecords = await fetchDiskPricing();
  await sleep(API_CALL_DELAY_MS);

  const serviceRecords = await fetchServicePricing();
  await sleep(API_CALL_DELAY_MS);

  const sqlMIRecords = await fetchSQLMIPricing();
  const sqlMIOptimized = filterAndOptimizeSQLMIRecords(sqlMIRecords);
  await sleep(API_CALL_DELAY_MS);

  const licensing = await fetchLicensingPricing();
  const exchangeRates = await fetchExchangeRates();

  const allRecords = [...vmRecords, ...diskRecords, ...serviceRecords];
  console.log(`\n📊 Processing ${allRecords.length} raw records...`);
  const optimized = filterAndOptimizeRecords(allRecords);
  console.log(`✨ Optimized to ${optimized.length} records`);

  const licensingRecords = [];
  const regions = [...new Set(optimized.map(r => r.region))];
  for (const region of regions) {
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

  const allRegions = {};
  for (const record of allOptimized) {
    if (!allRegions[record.region]) allRegions[record.region] = [];
    allRegions[record.region].push(record);
  }

  const byRegion = {};
  for (const [region, data] of Object.entries(allRegions)) {
    if (COMMERCIAL_REGIONS.has(region)) byRegion[region] = data;
  }

  const totalRegions = Object.keys(byRegion).length;
  console.log(`\n🌍 Filtered to ${totalRegions} commercial regions`);

  const pricingDir = path.join(__dirname, '..', 'public', 'pricing');
  if (!fs.existsSync(pricingDir)) fs.mkdirSync(pricingDir, { recursive: true });

  const indexOutput = { exchangeRates, lastUpdated: new Date().toISOString(), regions: Object.keys(byRegion) };
  fs.writeFileSync(path.join(pricingDir, 'index.json'), JSON.stringify(indexOutput));

  let totalRecords = 0;
  for (const [region, data] of Object.entries(byRegion)) {
    fs.writeFileSync(path.join(pricingDir, `${region}.json`), JSON.stringify({ region, records: data, lastUpdated: new Date().toISOString() }));
    totalRecords += data.length;
  }

  console.log(`\n✅ Pricing refresh complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`   📊 ${totalRegions} regions, ${totalRecords} records`);
}

refreshPricing().catch((err) => {
  console.error('❌ Refresh failed:', err.message);
  process.exit(1);
});
