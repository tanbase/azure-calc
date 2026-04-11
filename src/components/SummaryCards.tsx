// ============================================================
// Azure VM Pricing Calculator - SummaryCards Component
// ============================================================

import React from 'react';
import type { CostBreakdown } from '../utils/pricingCalculator';

interface SummaryCardsProps {
  totalMonthlyCost: number;
  threeYearRIMonthly: number;
  totalVMs: number;
  totalVcpu: number;
  totalMemoryGB: number;
  totalDiskGB: number;
  breakdown: CostBreakdown | null;
  currencySymbol: string;
}

export const SummaryCards: React.FC<SummaryCardsProps> = React.memo(({
  totalMonthlyCost, threeYearRIMonthly, totalVMs, totalVcpu, totalMemoryGB, totalDiskGB,
  breakdown, currencySymbol,
}) => {
  const fmt = (n: number) => {
    // Use currency code-aware formatting
    const hasDecimals = !['JPY', 'KRW', 'INR'].includes(currencySymbol);
    return `${currencySymbol}${n.toLocaleString(undefined, {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    })}`;
  };

  return (
    <div className="summary-cards">
      {/* Row 1: Overview */}
      <div className="summary-cards-row">
        <div className="summary-card summary-card-vms">
          <div className="vm-card-layout">
            <div className="vm-card-left">
              <div className="card-label">TOTAL VMS</div>
              <div className="card-value">{totalVMs}</div>
            </div>
            <div className="vm-card-divider"></div>
            <div className="vm-card-right">
              <div className="vm-stat">{totalVcpu} vCPU</div>
              <div className="vm-stat">{totalMemoryGB} GB RAM</div>
              <div className="vm-stat">{totalDiskGB} GB Disk</div>
            </div>
          </div>
        </div>
        <div className="summary-card summary-card-monthly">
          <div className="card-label">MONTHLY EST.</div>
          <div className="card-value">{fmt(totalMonthlyCost)}</div>
        </div>
        <div className="summary-card summary-card-annual">
          <div className="card-label">ANNUAL EST.</div>
          <div className="card-value">{fmt(totalMonthlyCost * 12)}</div>
        </div>
        <div className="summary-card summary-card-ri">
          <div className="card-label-row">
            <span className="card-label">3YR RI ESTIMATE</span>
            <span className="card-ri-badge">~63% off compute</span>
          </div>
          <div className="card-value">{fmt(threeYearRIMonthly)}</div>
        </div>
      </div>

      {/* Row 2: Cost Breakdown */}
      {breakdown && (
        <div className="summary-cards-row">
          <div className="summary-card summary-card-breakdown summary-card-compute">
            <div className="breakdown-icon">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#3B82F6" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
              </svg>
            </div>
            <div className="breakdown-info">
              <div className="card-label">COMPUTE</div>
              <div className="card-value">{fmt(breakdown.compute)}</div>
            </div>
          </div>
          <div className="summary-card summary-card-breakdown summary-card-licensing">
            <div className="breakdown-icon">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#F97316" d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
              </svg>
            </div>
            <div className="breakdown-info">
              <div className="card-label">LICENSING</div>
              <div className="card-value">{fmt(breakdown.osLicensing + breakdown.sql)}</div>
            </div>
          </div>
          <div className="summary-card summary-card-breakdown summary-card-storage">
            <div className="breakdown-icon">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#10B981" d="M2 9h20v6H2zM4 11h16v2H4zm-2-4h20v2H2zm0 8h20v2H2z"/>
              </svg>
            </div>
            <div className="breakdown-info">
              <div className="card-label">STORAGE</div>
              <div className="card-value">{fmt(breakdown.storage)}</div>
            </div>
          </div>
          <div className="summary-card summary-card-breakdown summary-card-backup">
            <div className="breakdown-icon">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#F59E0B" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.66 0 3 1.34 3 3v4H9v-4c0-1.66 1.34-3 3-3z"/>
              </svg>
            </div>
            <div className="breakdown-info">
              <div className="card-label">BACKUP</div>
              <div className="card-value">{fmt(breakdown.backup)}</div>
            </div>
          </div>
          <div className="summary-card summary-card-breakdown summary-card-monitor">
            <div className="breakdown-icon">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#8B5CF6" d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
              </svg>
            </div>
            <div className="breakdown-info">
              <div className="card-label">MONITORING</div>
              <div className="card-value">{fmt(breakdown.monitor)}</div>
            </div>
          </div>
          <div className="summary-card summary-card-breakdown summary-card-asr">
            <div className="breakdown-icon">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#EC4899" d="M16 1H8C6.34 1 5 2.34 5 4v16c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3V4c0-1.66-1.34-3-3-3zm0 18H8V4h8v15z"/>
              </svg>
            </div>
            <div className="breakdown-info">
              <div className="card-label">ASR</div>
              <div className="card-value">{fmt(breakdown.siteRecovery)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
