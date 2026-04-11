// ============================================================
// Azure VM Pricing Calculator - VMTable Component
// ============================================================

import React from 'react';
import type { VMEntry, VMFamily, DiskType, OSOption, SQLOption, BackupOption, PricingModel } from '../types';
import { VM_FAMILY_OPTIONS, DISK_TYPE_OPTIONS, OS_OPTIONS, SQL_OPTIONS } from '../utils/constants';
import { createVM } from '../utils/helpers';
import { findClosestVMSize, findClosestDiskSKU } from '../utils/vmMapper';
import { CustomDropdown, type DropdownOption } from './CustomDropdown';

// Help link URLs for info tooltips
const HELP_LINKS = {
  vmFamily: 'https://learn.microsoft.com/azure/virtual-machines/sizes/',
  diskType: 'https://learn.microsoft.com/azure/virtual-machines/disks-types/',
  pricingModel: 'https://learn.microsoft.com/en-au/azure/cost-management-billing/savings-plan/decide-between-savings-plan-reservation',
} as const;

// Currency formatting helper
const formatCurrency = (value: number, symbol: string): string => {
  const hasDecimals = !['¥', '₩', '₹'].includes(symbol);
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  })}`;
};

interface VMTableProps {
  vms: VMEntry[];
  onVMsChange: (vms: VMEntry[]) => void;
  currencySymbol: string;
  rate: number;
  onClearAll?: () => void;
}

interface SetAllValues {
  vmFamily: VMFamily;
  diskType: DiskType;
  os: OSOption;
  sql: SQLOption;
  backup: BackupOption;
  monitoring: boolean;
  asr: boolean;
  pricingModel: PricingModel;
}

const vmFamilyOptions: { value: string; label: string }[] = VM_FAMILY_OPTIONS.map((f) => ({
  value: f,
  label: f,
}));

const diskTypeOptions: { value: string; label: string }[] = DISK_TYPE_OPTIONS.map((d) => ({
  value: d,
  label: d,
}));

const osOptions: { value: string; label: string }[] = OS_OPTIONS.map((o) => ({
  value: o,
  label: o,
}));

const sqlOptions: { value: string; label: string }[] = SQL_OPTIONS.map((s) => ({
  value: s,
  label: s === 'None' ? 'No SQL' : s,
}));

const backupOptions: DropdownOption[] = [
  { value: 'No backups', label: 'No Backups' },
  { value: 'Short-term (34 days)', label: 'Short Term', subtext: '34 days · 5 weeks' },
  { value: 'Short + Long-term (34d/5w/12m/7y)', label: 'Short + Long Term', subtext: '34 days · 5 weeks · 12 months · 7 years' },
];

const renderBackupOption = (option: DropdownOption) => (
  <span className="backup-option">
    <span className="backup-option-label">{option.label}</span>
    {option.subtext && <span className="backup-option-subtext">{option.subtext}</span>}
  </span>
);

const pricingModelOptions: DropdownOption[] = [
  { value: 'PAYG', label: 'Pay-As-You-Go' },
  { value: '1-year SP (~26% off)', label: '1yr Savings Plan', subtext: '~26% off' },
  { value: '3-year SP (~48% off)', label: '3yr Savings Plan', subtext: '~48% off' },
  { value: '1-year RI (~41% off)', label: '1yr Reserved', subtext: '~41% off' },
  { value: '3-year RI (~63% off)', label: '3yr Reserved', subtext: '~63% off' },
];

const renderPricingModelOption = (option: DropdownOption) => (
  <span className="region-option">
    <span className="region-name">{option.label}</span>
    {option.subtext && <span className="pricing-discount">{option.subtext}</span>}
  </span>
);

export const VMTable: React.FC<VMTableProps> = React.memo(({ vms, onVMsChange, currencySymbol, rate, onClearAll }) => {
  const [setAll, setSetAll] = React.useState<SetAllValues>({
    vmFamily: 'Auto',
    diskType: 'Premium SSD',
    os: 'Windows Server',
    sql: 'None',
    backup: 'No backups',
    monitoring: false,
    asr: false,
    pricingModel: 'PAYG',
  });

  const addVM = () => {
    onVMsChange([...vms, createVM(`VM-${vms.length + 1}`)]);
  };

  const removeVM = (id: string) => {
    onVMsChange(vms.filter((vm) => vm.id !== id));
  };

  const updateVM = (id: string, updates: Partial<VMEntry>) => {
    onVMsChange(vms.map((vm) => (vm.id === id ? { ...vm, ...updates } : vm)));
  };

  const handleSetAllChange = <K extends keyof SetAllValues>(field: K, newValue: SetAllValues[K]) => {
    onVMsChange(vms.map((vm) => ({ ...vm, [field]: newValue })));
    setSetAll((prev) => ({ ...prev, [field]: newValue }));
  };

  return (
    <div className="vm-table-card">
      <div className="table-scroll">
        <table className="vm-table">
          <thead>
            <tr>
              <th className="col-row-num">#</th>
              <th className="col-vm-name">VM Name</th>
              <th className="col-vm-family">
                <span className="th-label">
                  Family
                  <a href={HELP_LINKS.vmFamily} target="_blank" rel="noopener noreferrer" className="info-link">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                    </svg>
                  </a>
                </span>
              </th>
              <th className="col-vcpu">vCPU</th>
              <th className="col-memory">RAM (GB)</th>
              <th className="col-disk-size">Disk (GB)</th>
              <th className="col-disk-type">
                <span className="th-label">
                  Disk Type
                  <a href={HELP_LINKS.diskType} target="_blank" rel="noopener noreferrer" className="info-link">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                    </svg>
                  </a>
                </span>
              </th>
              <th className="col-os">OS</th>
              <th className="col-sql">SQL</th>
              <th className="col-backup">Backup</th>
              <th className="col-monitoring">Monitor</th>
              <th className="col-asr">ASR</th>
              <th className="col-pricing-model">
                <span className="th-label">
                  Pricing Model
                  <a href={HELP_LINKS.pricingModel} target="_blank" rel="noopener noreferrer" className="info-link">
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                    </svg>
                  </a>
                </span>
              </th>
              <th className="col-vm-sku">VM SKU</th>
              <th className="col-disk-sku">Disk SKU</th>
              <th className="col-monthly-cost">Monthly Cost</th>
              <th className="col-actions"></th>
            </tr>
            <tr className="set-all-row">
              <td className="col-row-num"></td>
              <td className="col-vm-name">
                <span className="set-all-label">SET ALL</span>
              </td>
              <td className="col-vm-family">
                <CustomDropdown
                  options={vmFamilyOptions}
                  value={setAll.vmFamily}
                  onChange={(val) => handleSetAllChange('vmFamily', val as VMFamily)}
                  placeholder="Family..."
                  className="set-all-dropdown"
                />
              </td>
              <td className="col-vcpu"></td>
              <td className="col-memory"></td>
              <td className="col-disk-size"></td>
              <td className="col-disk-type">
                <CustomDropdown
                  options={diskTypeOptions}
                  value={setAll.diskType}
                  onChange={(val) => handleSetAllChange('diskType', val as DiskType)}
                  placeholder="Disk Type..."
                  className="set-all-dropdown"
                />
              </td>
              <td className="col-os">
                <CustomDropdown
                  options={osOptions}
                  value={setAll.os}
                  onChange={(val) => handleSetAllChange('os', val as OSOption)}
                  placeholder="OS..."
                  className="set-all-dropdown"
                />
              </td>
              <td className="col-sql">
                <CustomDropdown
                  options={sqlOptions}
                  value={setAll.sql}
                  onChange={(val) => handleSetAllChange('sql', val as SQLOption)}
                  placeholder="SQL..."
                  className="set-all-dropdown"
                />
              </td>
              <td className="col-backup">
                <CustomDropdown
                  options={backupOptions}
                  value={setAll.backup}
                  onChange={(val) => handleSetAllChange('backup', val as BackupOption)}
                  placeholder="Backup..."
                  className="set-all-dropdown backup-dropdown"
                  renderOption={renderBackupOption}
                />
              </td>
              <td className="col-monitoring">
                <input type="checkbox" checked={setAll.monitoring} onChange={(e) => handleSetAllChange('monitoring', e.target.checked)} />
              </td>
              <td className="col-asr">
                <input type="checkbox" checked={setAll.asr} onChange={(e) => handleSetAllChange('asr', e.target.checked)} />
              </td>
              <td className="col-pricing-model">
                <CustomDropdown
                  options={pricingModelOptions}
                  value={setAll.pricingModel}
                  onChange={(val) => handleSetAllChange('pricingModel', val as PricingModel)}
                  placeholder="Model..."
                  className="set-all-dropdown"
                  renderOption={renderPricingModelOption}
                />
              </td>
              <td className="col-vm-sku"></td>
              <td className="col-disk-sku"></td>
              <td className="col-monthly-cost"></td>
              <td className="col-actions"></td>
            </tr>
          </thead>
          <tbody>
            {vms.map((vm, index) => (
              <tr key={vm.id}>
                <td className="col-row-num">{index + 1}</td>
                <td className="col-vm-name">
                  <input type="text" value={vm.name} placeholder={`e.g. WEB-${String(index + 1).padStart(2, '0')}`} onChange={(e) => updateVM(vm.id, { name: e.target.value })} />
                </td>
                <td className="col-vm-family">
                  <CustomDropdown
                    options={vmFamilyOptions}
                    value={vm.vmFamily}
                    onChange={(val) => updateVM(vm.id, { vmFamily: val as VMFamily })}
                  />
                </td>
                <td className="col-vcpu">
                  <input type="number" min={0} value={vm.vcpu} onChange={(e) => updateVM(vm.id, { vcpu: Math.max(0, parseFloat(e.target.value) || 0) })} />
                </td>
                <td className="col-memory">
                  <input type="number" min={0} value={vm.memoryGB} onChange={(e) => updateVM(vm.id, { memoryGB: Math.max(0, parseFloat(e.target.value) || 0) })} />
                </td>
                <td className="col-disk-size">
                  <input type="number" min={0} value={vm.diskSizeGB} onChange={(e) => updateVM(vm.id, { diskSizeGB: Math.max(0, parseFloat(e.target.value) || 0) })} />
                </td>
                <td className="col-disk-type">
                  <CustomDropdown
                    options={diskTypeOptions}
                    value={vm.diskType}
                    onChange={(val) => updateVM(vm.id, { diskType: val as DiskType })}
                  />
                </td>
                <td className="col-os">
                  <CustomDropdown
                    options={osOptions}
                    value={vm.os}
                    onChange={(val) => updateVM(vm.id, { os: val as OSOption })}
                  />
                </td>
                <td className="col-sql">
                  <CustomDropdown
                    options={sqlOptions}
                    value={vm.sql}
                    onChange={(val) => updateVM(vm.id, { sql: val as SQLOption })}
                  />
                </td>
                <td className="col-backup">
                  <CustomDropdown
                    options={backupOptions}
                    value={vm.backup}
                    onChange={(val) => updateVM(vm.id, { backup: val as BackupOption })}
                    className="backup-dropdown"
                    renderOption={renderBackupOption}
                  />
                </td>
                <td className="col-monitoring">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={vm.monitoring} onChange={(e) => updateVM(vm.id, { monitoring: e.target.checked })} />
                    <span className="sr-only">Monitoring</span>
                  </label>
                </td>
                <td className="col-asr">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={vm.asr} onChange={(e) => updateVM(vm.id, { asr: e.target.checked })} />
                    <span className="sr-only">ASR</span>
                  </label>
                </td>
                <td className="col-pricing-model">
                  <CustomDropdown
                    options={pricingModelOptions}
                    value={vm.pricingModel}
                    onChange={(val) => updateVM(vm.id, { pricingModel: val as PricingModel })}
                    renderOption={renderPricingModelOption}
                  />
                </td>
                <td className="col-vm-sku">
                  <span className="sku-display">{vm.vcpu > 0 && vm.memoryGB > 0 ? (vm.selectedVMSKU && vm.selectedVMSKU !== '-' ? vm.selectedVMSKU : findClosestVMSize(vm.vcpu, vm.memoryGB, vm.vmFamily).size) : '-'}</span>
                </td>
                <td className="col-disk-sku">
                  <span className="sku-display">{vm.selectedDiskSKU && vm.selectedDiskSKU !== '-' ? vm.selectedDiskSKU : (vm.diskSizeGB > 0 ? findClosestDiskSKU(vm.diskType, vm.diskSizeGB)?.skuName.replace(' LRS', '') : '-') || '-'}</span>
                </td>
                <td className="col-monthly-cost">
                  <span className="cost-value">{formatCurrency(vm.monthlyCost * rate, currencySymbol)}</span>
                </td>
                <td className="col-actions">
                  <button className="delete-btn" onClick={() => removeVM(vm.id)} aria-label="Remove VM">✕</button>
                </td>
              </tr>
            ))}
            {vms.length === 0 && (
              <tr>
                <td className="empty-row-cell" colSpan={17}>
                  No VMs added yet. Click "Add VM" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-actions">
        <button className="add-vm-btn" onClick={addVM}>
          <svg className="add-icon" viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          Add VM
        </button>
        {onClearAll && vms.length > 0 && (
          <button className="add-vm-btn add-vm-btn-clear" onClick={onClearAll}>
            <svg className="add-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            Clear All
          </button>
        )}
      </div>
    </div>
  );
});
