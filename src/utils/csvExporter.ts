// ============================================================
// Azure VM Pricing Calculator - CSV Exporter
// ============================================================

import type { VMEntry, SKULineItem, VMExportRow, SKUExportRow } from '../types';

/**
 * Convert VM entries to CSV string
 */
export function exportVMTableToCSV(vms: VMEntry[]): string {
  const headers: (keyof VMExportRow)[] = [
    'VM Name',
    'VM Family',
    'vCPU',
    'Memory GB',
    'VM SKU',
    'Disk Type',
    'Disk Size GB',
    'Disk SKU',
    'OS',
    'SQL',
    'Backup',
    'Monitoring',
    'ASR (Replication)',
    'Pricing Model',
    'Monthly Cost',
  ];

  const rows = vms.map((vm) => ({
    'VM Name': vm.name,
    'VM Family': vm.vmFamily,
    vCPU: vm.vcpu,
    'Memory GB': vm.memoryGB,
    'VM SKU': vm.selectedVMSKU || '-',
    'Disk Type': vm.diskType,
    'Disk Size GB': vm.diskSizeGB,
    'Disk SKU': vm.selectedDiskSKU || '-',
    OS: vm.os,
    SQL: vm.sql,
    Backup: vm.backup,
    Monitoring: vm.monitoring ? 'Yes' : 'No',
    'ASR (Replication)': vm.asr ? 'Yes' : 'No',
    'Pricing Model': vm.pricingModel,
    'Monthly Cost': vm.monthlyCost,
  }));

  return buildCSV(headers, rows);
}

/**
 * Convert SKU line items to CSV string
 */
export function exportSKUToCSV(lineItems: SKULineItem[]): string {
  const headers: (keyof SKUExportRow)[] = [
    'VM Name',
    'Service',
    'Meter Name',
    'Product Name',
    'Unit of Measure',
    'Unit Price',
    'Quantity',
    'Line Total',
  ];

  const rows = lineItems.map((item) => ({
    'VM Name': item.vmName,
    Service: item.serviceName,
    'Meter Name': item.meterName,
    'Product Name': item.productName,
    'Unit of Measure': item.unitOfMeasure,
    'Unit Price': item.unitPrice,
    Quantity: item.quantity,
    'Line Total': item.lineTotal,
  }));

  return buildCSV(headers, rows);
}

/**
 * Build CSV string from headers and rows
 */
function buildCSV<T extends Record<string, unknown>>(
  headers: string[],
  rows: T[],
): string {
  const escape = (value: unknown): string => {
    const str = String(value ?? '');
    // CSV injection prevention: prefix values that look like formulas
    // (=, +, -, @ followed by additional characters). Skip single '-' which is a common placeholder.
    const looksLikeFormula = str.length > 1 && (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@'));
    const safeStr = looksLikeFormula ? `'${str}` : str;
    if (safeStr.includes(',') || safeStr.includes('"') || safeStr.includes('\n')) {
      return `"${safeStr.replace(/"/g, '""')}"`;
    }
    return safeStr;
  };

  const lines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map((h) => escape(row[h]));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Trigger a file download in the browser
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
