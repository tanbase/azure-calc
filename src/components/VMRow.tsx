// ============================================================
// Azure VM Pricing Calculator - VMRow Component
// ============================================================

import React from 'react';
import type { VMEntry, VMFamily, DiskType, OSOption, SQLOption, BackupOption, PricingModel, SQLMIRole } from '../types';
import { CustomDropdown, type DropdownOption } from './CustomDropdown';
import { findClosestVMSize, findClosestDiskSKU, findClosestSQLMISKU } from '../utils/vmMapper';

interface VMRowProps {
  vm: VMEntry;
  index: number;
  currencySymbol: string;
  rate: number;
  vmFamilyOptions: DropdownOption[];
  diskTypeOptions: DropdownOption[];
  osOptions: DropdownOption[];
  sqlOptions: DropdownOption[];
  sqlMIRoleOptions: DropdownOption[];
  backupOptions: DropdownOption[];
  pricingModelOptions: DropdownOption[];
  sqlMIPricingModelOptions: DropdownOption[];
  isSQLMIFamily: (family: VMFamily) => boolean;
  updateVM: (id: string, updates: Partial<VMEntry>) => void;
  removeVM: (id: string) => void;
  renderBackupOption: (option: DropdownOption) => React.ReactNode;
  renderPricingModelOption: (option: DropdownOption) => React.ReactNode;
  formatCurrency: (value: number, symbol: string) => string;
}

export const VMRow = React.memo(({
  vm, index, currencySymbol, rate,
  vmFamilyOptions, diskTypeOptions, osOptions, sqlOptions, sqlMIRoleOptions,
  backupOptions, pricingModelOptions, sqlMIPricingModelOptions,
  isSQLMIFamily, updateVM, removeVM, renderBackupOption, renderPricingModelOption, formatCurrency
}: VMRowProps) => {
  return (
    <tr>
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
        {isSQLMIFamily(vm.vmFamily) ? (
          <span className="cell-placeholder">
            {vm.vmFamily === 'SQL MI - Business Critical' ? 'Business Critical' : 'General Purpose'}
          </span>
        ) : (
          <CustomDropdown
            options={diskTypeOptions}
            value={vm.diskType}
            onChange={(val) => updateVM(vm.id, { diskType: val as DiskType })}
          />
        )}
      </td>
      <td className="col-os">
        {!isSQLMIFamily(vm.vmFamily) ? (
          <CustomDropdown
            options={osOptions}
            value={vm.os}
            onChange={(val) => updateVM(vm.id, { os: val as OSOption })}
          />
        ) : <span className="cell-placeholder">-</span>}
      </td>
      <td className="col-sql">
        {isSQLMIFamily(vm.vmFamily) ? (
          <CustomDropdown
            options={sqlMIRoleOptions}
            value={vm.sqlMIRole}
            onChange={(val) => updateVM(vm.id, { sqlMIRole: val as SQLMIRole })}
          />
        ) : (
          <CustomDropdown
            options={sqlOptions}
            value={vm.sql}
            onChange={(val) => updateVM(vm.id, { sql: val as SQLOption })}
          />
        )}
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
        {!isSQLMIFamily(vm.vmFamily) ? (
          <label className="checkbox-label">
            <input type="checkbox" checked={vm.asr} onChange={(e) => updateVM(vm.id, { asr: e.target.checked })} />
            <span className="sr-only">ASR</span>
          </label>
        ) : <span className="cell-placeholder">-</span>}
      </td>
      <td className="col-pricing-model">
        <CustomDropdown
          options={isSQLMIFamily(vm.vmFamily) ? sqlMIPricingModelOptions : pricingModelOptions}
          value={vm.pricingModel}
          onChange={(val) => updateVM(vm.id, { pricingModel: val as PricingModel })}
          renderOption={renderPricingModelOption}
        />
      </td>
      <td className="col-vm-sku">
        <span className="sku-display">
          {vm.vcpu > 0 && vm.memoryGB > 0
            ? (vm.selectedVMSKU && vm.selectedVMSKU !== '-'
              ? vm.selectedVMSKU
              : isSQLMIFamily(vm.vmFamily)
                ? findClosestSQLMISKU(vm.vcpu, vm.memoryGB, vm.sqlMIRole, vm.vmFamily).skuName
                : findClosestVMSize(vm.vcpu, vm.memoryGB, vm.vmFamily).size)
            : '-'}
        </span>
      </td>
      <td className="col-disk-sku">
        {isSQLMIFamily(vm.vmFamily) ? (
          <span className="sku-display">—</span>
        ) : (
          <span className="sku-display">{vm.selectedDiskSKU && vm.selectedDiskSKU !== '-' ? vm.selectedDiskSKU : (vm.diskSizeGB > 0 ? findClosestDiskSKU(vm.diskType, vm.diskSizeGB)?.skuName.replace(' LRS', '') : '-') || '-'}</span>
        )}
      </td>
      <td className="col-monthly-cost">
        <span className="cost-value">{formatCurrency(vm.monthlyCost * rate, currencySymbol)}</span>
      </td>
      <td className="col-actions">
        <button className="delete-btn" onClick={() => removeVM(vm.id)} aria-label="Remove VM">✕</button>
      </td>
    </tr>
  );
});
