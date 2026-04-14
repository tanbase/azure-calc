// ============================================================
// Azure VM Pricing Calculator - Main App
// ============================================================

import React from 'react';
import type { VMEntry, AppSettings, SKULineItem } from './types';
import { usePricing } from './hooks/usePricing';
import { AppHeader } from './components/AppHeader';
import { SettingsPanel } from './components/SettingsPanel';
import { PasteFromExcel } from './components/PasteFromExcel';
import { VMTable } from './components/VMTable';
import { Footer } from './components/Footer';
import { calculateAllVMs, getCostBreakdown, type CostBreakdown } from './utils/pricingCalculator';
import { CURRENCIES, VM_SKUS } from './utils/constants';
import { detectDefaultRegion, detectDefaultCurrency } from './utils/geolocation';
import { createVM } from './utils/helpers';
import { findClosestDiskSKU, findClosestVMSize } from './utils/vmMapper';
import './App.css';

// Lazy-loaded components (only loaded after calculation)
// Wrapped in ErrorBoundary fallback to prevent full app crash on chunk load failure
const SummaryCards = React.lazy(() => import('./components/SummaryCards').then(m => ({ default: m.SummaryCards })));
const SKUBreakdown = React.lazy(() => import('./components/SKUBreakdown').then(m => ({ default: m.SKUBreakdown })));

// Simple error boundary fallback for lazy-loaded components
const LazyErrorFallback = () => (
  <div className="summary-cards" style={{ padding: '20px', color: 'var(--muted-foreground)', textAlign: 'center' }}>
    Failed to load component. Please refresh the page.
  </div>
);

// Helper functions moved outside component to avoid recreation
// Use vmMapper to derive actual specs from vCPU/memory/diskType without relying on mutated state
const getActualVcpu = (vm: VMEntry): number => {
  if (vm.vcpu === 0 || vm.memoryGB === 0) return 0;
  const vmSize = vm.selectedVMSKU && vm.selectedVMSKU !== '-'
    ? VM_SKUS.find((s) => s.size === vm.selectedVMSKU)
    : findClosestVMSize(vm.vcpu, vm.memoryGB, vm.vmFamily);
  return vmSize?.vcpu ?? 0;
};

const getActualMemoryGB = (vm: VMEntry): number => {
  if (vm.vcpu === 0 || vm.memoryGB === 0) return 0;
  const vmSize = vm.selectedVMSKU && vm.selectedVMSKU !== '-'
    ? VM_SKUS.find((s) => s.size === vm.selectedVMSKU)
    : findClosestVMSize(vm.vcpu, vm.memoryGB, vm.vmFamily);
  return vmSize?.memoryGB ?? 0;
};

const getActualDiskGB = (vm: VMEntry): number => {
  if (vm.diskSizeGB === 0) return 0;
  const diskSKU = findClosestDiskSKU(vm.diskType, vm.diskSizeGB);
  return diskSKU?.capacityGB ?? 0;
};

const createDefaultVMs = (): VMEntry[] => [1, 2, 3].map((i) => createVM(`VM-${i}`));

const App: React.FC = () => {
  const [vms, setVms] = React.useState<VMEntry[]>(createDefaultVMs);
  const [settings, setSettings] = React.useState<AppSettings>({
    region: '',
    currency: '',
    azureHybridBenefitWindows: false,
    azureHybridBenefitSQL: false,
  });
  const [allLineItems, setAllLineItems] = React.useState<SKULineItem[]>([]);
  const [costBreakdown, setCostBreakdown] = React.useState<CostBreakdown | null>(null);
  const [totalMonthlyCost, setTotalMonthlyCost] = React.useState(0);

  const { pricingData, isLoading, lastUpdated, fetchPricing, exchangeRates, error } = usePricing();

  // Derived values computed from VMs (no extra state, no re-render cascade)
  const totalVcpu = React.useMemo(
    () => vms.reduce((s, vm) => s + getActualVcpu(vm), 0),
    [vms],
  );
  const totalMemoryGB = React.useMemo(
    () => vms.reduce((s, vm) => s + getActualMemoryGB(vm), 0),
    [vms],
  );
  const totalDiskGB = React.useMemo(
    () => vms.reduce((s, vm) => s + getActualDiskGB(vm), 0),
    [vms],
  );

  // Fetch pricing when region changes
  React.useEffect(() => {
    if (settings.region) fetchPricing(settings.region);
  }, [settings.region, fetchPricing]);

  // Recalculate when VMs, pricing, or AHB changes
  React.useEffect(() => {
    if (!pricingData || vms.length === 0) {
      setAllLineItems([]);
      setCostBreakdown(null);
      setTotalMonthlyCost(0);
      // Reset VM monthly costs when no pricing data
      setVms((prev) => prev.map((vm) => ({ ...vm, monthlyCost: 0 })));
      return;
    }
    const { allLineItems: items, totalMonthlyCost: total } = calculateAllVMs(
      vms,
      pricingData,
      settings.azureHybridBenefitWindows,
      settings.azureHybridBenefitSQL,
    );
    setAllLineItems(items);
    setTotalMonthlyCost(total);
    setCostBreakdown(getCostBreakdown(items));

    // Compute per-VM costs from line items and update VMs
    const vmCosts = new Map<string, number>();
    for (const item of items) {
      vmCosts.set(item.vmId, (vmCosts.get(item.vmId) || 0) + item.lineTotal);
    }
    // Update VMs with new costs (only if values actually changed to avoid loops)
    setVms((prev) => prev.map((vm) => {
      const newCost = Math.round((vmCosts.get(vm.id) || 0) * 100) / 100;
      if (vm.monthlyCost === newCost) return vm;
      return { ...vm, monthlyCost: newCost };
    }));
  }, [vms, pricingData, settings.azureHybridBenefitWindows, settings.azureHybridBenefitSQL]);

  const currencyCode = settings.currency || 'USD';
  const currencySymbol = CURRENCIES.find((c) => c.code === currencyCode)?.symbol || '$';
  const rate = exchangeRates[currencyCode] || 1.0;

  // Calculate 3-year RI estimate: recalculate all VMs with 3-year RI pricing
  const threeYearRIComputeCost = React.useMemo(() => {
    if (!pricingData || vms.length === 0) return 0;
    const riVms = vms.map((vm) => ({ ...vm, pricingModel: '3-year RI (~63% off)' as const }));
    const { allLineItems: riItems } = calculateAllVMs(
      riVms,
      pricingData,
      settings.azureHybridBenefitWindows,
      settings.azureHybridBenefitSQL,
    );
    // Only return the compute portion (storage/backup/etc stay full price)
    return riItems.filter((i) => i.serviceName === 'Virtual Machines' && !i.skuId.startsWith('os-')).reduce((s, i) => s + i.lineTotal, 0);
  }, [vms, pricingData, settings.azureHybridBenefitWindows, settings.azureHybridBenefitSQL]);

  // 3-year RI: only VM compute gets discounted (using actual 3-year RI prices from API)
  const threeYearRIMonthly = costBreakdown
    ? (threeYearRIComputeCost +
       costBreakdown.storage +
       costBreakdown.backup +
       costBreakdown.siteRecovery +
       costBreakdown.monitor +
       costBreakdown.sql +
       costBreakdown.osLicensing) * rate
    : 0;

  const handleReset = React.useCallback(async () => {
    // Auto-detect region and currency from IP geolocation (async, cached in sessionStorage)
    const [defaultRegion, defaultCurrency] = await Promise.all([
      detectDefaultRegion(),
      detectDefaultCurrency(),
    ]);

    setVms(createDefaultVMs());
    setSettings({
      region: defaultRegion,
      currency: defaultCurrency,
      azureHybridBenefitWindows: false,
      azureHybridBenefitSQL: false,
    });
    setAllLineItems([]);
    setCostBreakdown(null);
    setTotalMonthlyCost(0);
  }, []);

  const handleClearAll = React.useCallback(() => {
    setVms([]);
  }, []);

  const handlePasteFromExcel = React.useCallback((pastedVms: VMEntry[]) => {
    setVms((prev) => [...prev, ...pastedVms]);
  }, []);

  // Memoized derived values to prevent unnecessary re-renders
  // Skip conversion when rate === 1.0 (USD) to avoid unnecessary object creation
  const convertedLineItems = React.useMemo(
    () => rate === 1.0 ? allLineItems : allLineItems.map(item => ({
      ...item,
      unitPrice: item.unitPrice * rate,
      lineTotal: item.lineTotal * rate,
    })),
    [allLineItems, rate],
  );

  const convertedBreakdown = React.useMemo(
    () => !costBreakdown ? null : rate === 1.0 ? costBreakdown : {
      compute: costBreakdown.compute * rate,
      paygCompute: costBreakdown.paygCompute * rate,
      storage: costBreakdown.storage * rate,
      backup: costBreakdown.backup * rate,
      siteRecovery: costBreakdown.siteRecovery * rate,
      monitor: costBreakdown.monitor * rate,
      sql: costBreakdown.sql * rate,
      osLicensing: costBreakdown.osLicensing * rate,
      total: costBreakdown.total * rate,
    },
    [costBreakdown, rate],
  );

  return (
    <div className="app-container">
      <AppHeader vms={vms} lineItems={allLineItems} onReset={handleReset} />
      <div className="app-content">
        <SettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
        />

        {error && (
          <div
            className="error-banner"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (settings.region) fetchPricing(settings.region);
              }
            }}
            onClick={() => {
              if (settings.region) fetchPricing(settings.region);
            }}
          >
            {error} — click to retry
          </div>
        )}

        <PasteFromExcel onPaste={handlePasteFromExcel} />

        <VMTable vms={vms} onVMsChange={setVms} currencySymbol={currencySymbol} rate={rate} onClearAll={handleClearAll} />

        <React.Suspense fallback={<LazyErrorFallback />}>
          <SummaryCards
            totalMonthlyCost={totalMonthlyCost * rate}
            threeYearRIMonthly={threeYearRIMonthly}
            totalVMs={vms.filter((vm) => vm.vcpu > 0 && vm.memoryGB > 0).length}
            totalVcpu={totalVcpu}
            totalMemoryGB={totalMemoryGB}
            totalDiskGB={totalDiskGB}
            breakdown={convertedBreakdown}
            currencySymbol={currencySymbol}
          />
        </React.Suspense>

        {allLineItems.length > 0 && (
          <React.Suspense fallback={<LazyErrorFallback />}>
            <SKUBreakdown
              lineItems={convertedLineItems}
              vms={vms}
              currencySymbol={currencySymbol}
            />
          </React.Suspense>
        )}

        <Footer
          lastUpdated={lastUpdated}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};

export default App;
