// ============================================================
// Azure VM Pricing Calculator - Footer Component
// ============================================================

import React from 'react';

interface FooterProps {
  lastUpdated: string | null;
  isLoading: boolean;
}

export const Footer: React.FC<FooterProps> = React.memo(({ lastUpdated, isLoading }) => {
  const getLastRefreshedText = (): string => {
    if (!lastUpdated) return 'never';
    return new Date(lastUpdated).toLocaleString('en-AU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <footer className="app-footer">
      <div className="footer-top-row">
        <div className="footer-status-left">
          <svg className={`footer-icon ${isLoading ? 'footer-icon-warning' : 'footer-icon-success'}`} viewBox="0 0 24 24" width="18" height="18">
            {isLoading ? (
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            ) : (
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            )}
          </svg>
          <span className="footer-text">
            {isLoading ? (
              <>Loading pricing data...</>
            ) : (
              <>Azure pricing data last updated <strong>{getLastRefreshedText()}</strong></>
            )}
          </span>
        </div>
      </div>

      <p className="footer-disclaimer">
        Prices sourced directly from the Azure Retail Prices API. Commitment discounts (Savings Plans, Reserved Instances) are applied as standard Azure discount tiers. Verify with the <a href="https://azure.microsoft.com/en-us/pricing/calculator/" target="_blank" rel="noopener noreferrer">Azure Pricing Calculator</a> for production estimates.
      </p>
    </footer>
  );
});
