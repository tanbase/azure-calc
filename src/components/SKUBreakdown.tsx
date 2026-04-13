// ============================================================
// Azure VM Pricing Calculator - SKUBreakdown Component
// ============================================================

import React from 'react';
import type { SKULineItem } from '../types';

interface SKUBreakdownProps {
  lineItems: SKULineItem[];
  vms: { id: string; name: string }[];
  currencySymbol: string;
}

export const SKUBreakdown: React.FC<SKUBreakdownProps> = React.memo(({ lineItems, vms, currencySymbol }) => {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [expandAll, setExpandAll] = React.useState(false);

  // Memoize grouping by VM id (must be before toggleAll which uses it)
  const itemsByVMId = React.useMemo(() => {
    const map = new Map<string, SKULineItem[]>();
    for (const item of lineItems) {
      const existing = map.get(item.vmId) || [];
      existing.push(item);
      map.set(item.vmId, existing);
    }
    return map;
  }, [lineItems]);

  const toggleVM = React.useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleAll = React.useCallback(() => {
    const next = !expandAll;
    setExpandAll(next);
    const newState: Record<string, boolean> = {};
    itemsByVMId.forEach((_, id) => {
      newState[id] = next;
    });
    setExpanded(newState);
  }, [expandAll, itemsByVMId]);

  // Memoize formatting functions
  const fmt = React.useCallback(
    (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`,
    [currencySymbol],
  );
  const fmtTotal = React.useCallback(
    (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    [currencySymbol],
  );

  // Abbreviate unit of measure for display
  const abbreviateUnits = React.useCallback((uom: string): string => {
    return uom
      .replace(/^1\s+/, '')           // Remove leading "1 "
      .replace(/\/Month/g, '/mth')    // Month → mth
      .replace(/\/Hour/g, '/hr')      // Hour → hr
      .replace(/Pack\/Month/g, 'packs/mth')
      .replace(/vCore\/Month/g, 'vCores/mth')
      .replace(/GB\/Month/g, 'GB/mth')
      .trim();
  }, []);

  const grandTotal = React.useMemo(
    () => lineItems.reduce((s, i) => s + i.lineTotal, 0),
    [lineItems],
  );

  if (lineItems.length === 0) {
    return (
      <div className="sku-breakdown">
        <h3>SKU Breakdown</h3>
        <div className="empty-sku">No SKU line items to display. Add VMs to see cost breakdown.</div>
      </div>
    );
  }

  const handleRowKeyDown = (e: React.KeyboardEvent, vmId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleVM(vmId);
    }
  };

  const handleToggleAllKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleAll();
    }
  };

  return (
    <div className="sku-breakdown">
      <h3>SKU Breakdown</h3>
      <div className="table-scroll">
        <table className="sku-table" role="table" aria-label="SKU cost breakdown by virtual machine">
          <thead>
            <tr>
              <th
                className="col-toggle expand-all-toggle"
                onClick={toggleAll}
                onKeyDown={handleToggleAllKeyDown}
                role="button"
                tabIndex={0}
                aria-label={expandAll ? 'Collapse all VMs' : 'Expand all VMs'}
              >
                <span className="expand-icon">{expandAll ? '▼' : '▶'}</span>
              </th>
              <th>VM Name</th>
              <th>SKU</th>
              <th>Product</th>
              <th>Service</th>
              <th>Units</th>
              <th className="col-right">Unit Price</th>
              <th className="col-right">Qty</th>
              <th className="col-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {vms.map((vm) => {
              const items = itemsByVMId.get(vm.id) || [];
              if (items.length === 0) return null;
              const vmTotal = items.reduce((s, i) => s + i.lineTotal, 0);
              const isExpanded = expanded[vm.id] ?? false;

              return (
                <React.Fragment key={vm.id}>
                  <tr
                    className="vm-summary-row"
                    onClick={() => toggleVM(vm.id)}
                    onKeyDown={(e) => handleRowKeyDown(e, vm.id)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                  >
                    <td className="col-toggle"><span className="expand-icon">{isExpanded ? '▼' : '▶'}</span></td>
                    <td className="vm-name-cell">{vm.name}</td>
                    <td className="vm-summary-service" colSpan={6}>
                      {(() => {
                        const svc = items[0].serviceName;
                        const displaySvc = svc === 'SQL Managed Instance' ? 'SQL Managed Instance' : svc;
                        return `${displaySvc}${items.length > 1 ? ` (${items.length} SKUs)` : ''}`;
                      })()}
                    </td>
                    <td className="total-cell subtotal-value">{fmtTotal(vmTotal)}</td>
                  </tr>
                  {isExpanded && items.map((item, idx) => (
                    <tr key={`${item.skuId}-${idx}`} className="sku-detail-row">
                      <td className="col-toggle"></td>
                      <td className="indent-cell"></td>
                      <td className="sku-name-cell">{item.meterName}</td>
                      <td className="product-cell">{item.productName}</td>
                      <td>{item.serviceName === 'SQL Managed Instance' ? 'SQL Managed Instance' : item.serviceName}</td>
                      <td className="units-cell">{abbreviateUnits(item.unitOfMeasure)}</td>
                      <td className="price-cell">{fmt(item.unitPrice)}</td>
                      <td className="qty-cell">{item.quantity}</td>
                      <td className="total-cell">{fmtTotal(item.lineTotal)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="grand-total-row">
              <td colSpan={8}>Grand Total</td>
              <td className="grand-total-value">{fmtTotal(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});
