// ============================================================
// Azure VM Pricing Calculator - Settings Components
// ============================================================

import React from 'react';
import type { AppSettings } from '../types';
import { AZURE_REGIONS, CURRENCIES } from '../utils/constants';
import { detectDefaultRegion, detectDefaultCurrency } from '../utils/geolocation';
import { CustomDropdown, type DropdownOption } from './CustomDropdown';

// Help link URLs for Azure Hybrid Benefit
const AHB_WINDOWS_HELP_LINK = 'https://learn.microsoft.com/en-us/windows-server/get-started/azure-hybrid-benefit';
const AHB_SQL_HELP_LINK = 'https://learn.microsoft.com/en-us/azure/azure-sql/azure-hybrid-benefit';

interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

const regionOptions: DropdownOption[] = AZURE_REGIONS.map((r) => ({
  value: r.name,
  label: r.displayName,
  subtext: r.pricePremium && r.pricePremium > 0 ? `+${r.pricePremium}%` : undefined,
}));

const currencyOptions: { value: string; label: string }[] = CURRENCIES.map((c) => ({
  value: c.code,
  label: c.displayName,
}));

export const SettingsPanel: React.FC<SettingsPanelProps> = React.memo(({
  settings,
  onSettingsChange,
}) => {
  React.useEffect(() => {
    if (!settings.region) {
      // Detect region and currency from IP geolocation (async, cached in sessionStorage)
      Promise.all([detectDefaultRegion(), detectDefaultCurrency()]).then(([region, currency]) => {
        onSettingsChange({
          region,
          currency,
          azureHybridBenefitWindows: false,
          azureHybridBenefitSQL: false,
        });
      });
    }
  }, []);

  const renderRegionOption = (option: DropdownOption) => (
    <span className="region-option">
      <span className="region-name">{option.label}</span>
      {option.subtext && <span className="region-premium-inline">{option.subtext}</span>}
    </span>
  );

  return (
    <div className="settings-panel-card">
      <div className="settings-panel-body">
        <div className="settings-group">
          <svg className="settings-icon" viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <span className="settings-group-label">Region</span>
          <CustomDropdown
            options={regionOptions}
            value={settings.region}
            onChange={(val) => onSettingsChange({ ...settings, region: val })}
            className="settings-dropdown"
            renderOption={renderRegionOption}
          />
        </div>

        <div className="settings-group">
          <svg className="settings-icon" viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
          </svg>
          <span className="settings-group-label">Currency</span>
          <CustomDropdown
            options={currencyOptions}
            value={settings.currency}
            onChange={(val) => onSettingsChange({ ...settings, currency: val })}
            className="settings-dropdown settings-dropdown-currency"
          />
        </div>

        <div className="settings-group settings-group-ahb">
          <svg className="settings-icon settings-icon-ahb" viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M13 2L3 14h9l-1 10 10-12h-9l1-10z"/>
          </svg>
          <span className="settings-group-label">Azure Hybrid Benefit</span>
          <span className="ahb-separator">·</span>
          <span className="ahb-label">Windows</span>
          <a href={AHB_WINDOWS_HELP_LINK} target="_blank" rel="noopener noreferrer" className="info-link-settings">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
          </a>
          <label className="toggle-switch toggle-ahb">
            <input
              type="checkbox"
              checked={settings.azureHybridBenefitWindows || false}
              onChange={(e) => onSettingsChange({ ...settings, azureHybridBenefitWindows: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
          <span className="ahb-separator">·</span>
          <span className="ahb-label">SQL</span>
          <a href={AHB_SQL_HELP_LINK} target="_blank" rel="noopener noreferrer" className="info-link-settings">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
          </a>
          <label className="toggle-switch toggle-ahb">
            <input
              type="checkbox"
              checked={settings.azureHybridBenefitSQL || false}
              onChange={(e) => onSettingsChange({ ...settings, azureHybridBenefitSQL: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  );
});
