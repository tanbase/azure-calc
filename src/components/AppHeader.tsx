// ============================================================
// Azure VM Pricing Calculator - AppHeader Component
// ============================================================

import React from 'react';
import type { VMEntry, SKULineItem } from '../types';
import { exportVMTableToCSV, exportSKUToCSV, downloadCSV } from '../utils/csvExporter';

interface AppHeaderProps {
  vms: VMEntry[];
  lineItems: SKULineItem[];
  onReset: () => void;
  onShare: () => void;
  shareCopied: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = React.memo(({ vms, lineItems, onReset, onShare, shareCopied }) => {
  const handleExportVMTable = () => {
    const csv = exportVMTableToCSV(vms);
    downloadCSV(csv, 'vm-table-export.csv');
  };

  const handleExportSKU = () => {
    const csv = exportSKUToCSV(lineItems);
    downloadCSV(csv, 'sku-line-items-export.csv');
  };

  return (
    <header className="app-header-bar">
      <div className="header-left">
        <div className="header-logo">
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path
              fill="#FFFFFF"
              d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
            />
            <text x="12" y="16.5" text-anchor="middle" font-size="10" font-weight="bold" fill="#0078D4">$</text>
          </svg>
        </div>
        <div className="header-title-group">
          <h1 className="header-title">Azure VM Pricing Tool</h1>
          <p className="header-subtitle">Estimate monthly costs for your Azure VM fleet</p>
        </div>
      </div>
      <div className="header-actions">
        <button className="header-btn header-btn-secondary" onClick={onReset}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="currentColor"
              d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            />
          </svg>
          Reset
        </button>
        <button
          className={`header-btn ${shareCopied ? 'header-btn-success' : 'header-btn-secondary'}`}
          onClick={onShare}
          disabled={vms.length === 0}
          title="Copy a shareable link to your current configuration"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="currentColor"
              d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
            />
          </svg>
          {shareCopied ? 'Link Copied!' : 'Share'}
        </button>
        <button
          className="header-btn header-btn-primary"
          onClick={handleExportVMTable}
          disabled={vms.length === 0}
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="currentColor"
              d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"
            />
          </svg>
          Export VM Table
        </button>
        <button
          className="header-btn header-btn-primary"
          onClick={handleExportSKU}
          disabled={lineItems.length === 0}
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="currentColor"
              d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"
            />
          </svg>
          Export SKU Items
        </button>
      </div>
    </header>
  );
});
