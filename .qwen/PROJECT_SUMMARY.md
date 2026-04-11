The user wants a comprehensive project summary of the conversation history. Let me review the key points:

1. This is an Azure VM Pricing Calculator - a React + TypeScript + Vite frontend with a Node.js + Express + SQLite backend
2. The user provided a detailed spec and multiple iterations of changes
3. Key features include: VM table with editable cells, cost calculation, SKU breakdown, currency conversion, savings plans, etc.
4. There were many bugs fixed and optimizations made

Let me create a comprehensive summary.# Project Summary

## Overall Goal
Build an Azure VM Pricing Calculator web application that allows users to paste/import VM lists and calculate exact Azure pricing with SKU-level detail, using a React frontend and minimal Node.js/Express backend with SQLite for shared pricing cache.

## Key Knowledge

### Technology Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Node.js + Express (single file `server.js`)
- **Database**: better-sqlite3 for SQLite caching
- **Styling**: Custom CSS with Inter font, shadcn/ui-inspired design
- **Font**: Inter (Google Fonts)

### Architecture Decisions
- **Pricing data flow**: User opens page → Frontend requests `/api/pricing?region=X` → Backend checks SQLite cache → If cache < 24hrs returns immediately, if expired returns stale data and triggers background refresh
- **Azure API optimization**: Fetches ONLY 47 specific VM SKUs (B, D, E, F series) instead of all 367K+ records, reducing fetch from 5+ min to ~15 seconds
- **Caching**: SQLite persists across users; 24-hour TTL; no cron jobs - refresh triggered by page loads only
- **Server ports**: Backend on 3001, Frontend on 5173

### VM SKU Constraints
- **Included families**: B-series (Burstable), Dsv3/Dsv5 (General Purpose), Ev3/Ev5 (Memory Optimized), Fsv2 (Compute Optimized)
- **Excluded**: Spot, AMD (Das series), GPU (NC/ND/NV), HPC (H-series)
- **API field**: `armSkuName` uses `Standard_` prefix (e.g., `Standard_D2s_v5`)
- **Disk pricing**: Only Premium SSD, Standard SSD, Standard HDD (no v2/Ultra)
- **Backup**: VM only, LRS only
- **ASR**: Not in Azure Retail API - hardcoded pricing
- **SQL Server**: Not in Azure Retail API - hardcoded rates with min 4-core (2-pack) licensing rule

### Pricing Model Options
- `PAYG` - Full retail price
- `1-year SP (~37% off)` - Savings Plan
- `3-year SP (~63% off)` - Savings Plan  
- `1-year RI (~30% off)` - Reserved Instance
- `3-year RI (~55% off)` - Reserved Instance

### OS Licensing Logic
- Windows Server: estimated $0.02/vCPU/hr (bundled in Azure compute)
- RHEL: $0.09/vCPU/hr
- SUSE: $0.06/vCPU/hr
- Ubuntu/CentOS: free
- AHB (Azure Hybrid Benefit) removes Windows Server license cost entirely

### Currency Handling
- All API data is USD only
- Frontend converts using hardcoded exchange rates in `constants.ts`
- Summary cards show selected currency with USD sub-label when non-USD
- VMTable per-row costs show selected currency

### Build/Dev Commands
```bash
# Start backend
npm run server        # node server.js

# Start frontend dev server
npm run dev           # vite --host 0.0.0.0 --port 5173

# Start both
npm run dev:all       # concurrently

# Production build
npm run build         # tsc -b && vite build
```

### File Structure
```
src/
├── App.tsx                    # Main app with state management
├── App.css                    # All styles (Inter font, Azure theme)
├── types/index.ts             # TypeScript types + LOCALE_TO_REGION
├── components/
│   ├── SettingsPanel.tsx      # Header bar, region/currency/AHB selectors
│   ├── VMTable.tsx            # Editable spreadsheet table + Set All row
│   ├── SummaryCards.tsx       # Cost summary cards with currency conversion
│   ├── SKUBreakdown.tsx       # Expandable SKU line items table
│   └── ExportButtons.tsx      # CSV export buttons
├── hooks/
│   └── usePricing.ts          # API hook with progress polling
└── utils/
    ├── constants.ts           # Regions, currencies, VM/Disk SKUs, exchange rates
    ├── helpers.ts             # generateId(), createVM() shared factory
    ├── vmMapper.ts            # VM size matching with v5>v3>v2 priority
    ├── pricingCalculator.ts   # Cost calculation engine
    └── csvExporter.ts         # Dual CSV export (VM table + SKU items)
server.js                      # Express + SQLite backend
```

## Recent Actions

### Critical Bug Fixes
1. **[DONE] SP/RI discount double-counting** - Compute item was already discounted AND a separate negative discount line item was pushed, making 3-year SP costs go negative. Fixed: main item shows full PAYG rate, discount is a separate negative line item.

2. **[DONE] ASR replica disk pricing mismatch** - Primary disk used API fixed pricing but ASR replica used per-GB fallback rates. Fixed: ASR now looks up same disk SKU from API pricing data.

3. **[DONE] Backup cost skipped when diskSizeGB=0** - Backup was inside `if (diskSizeGB > 0)` block. Fixed: backup base cost now applies even without disk.

4. **[DONE] Windows OS licensing not showing** - `getCostBreakdown` checked for `'Windows Server'` in product name but the OS license item had `skuId: 'os-windows-server'`. Fixed: use `skuId.startsWith('os-')` to categorize.

5. **[DONE] Hardcoded $ in VMTable** - Monthly cost used hardcoded `$` regardless of selected currency. Fixed: VMTable now receives `currencySymbol` prop from App.

6. **[DONE] usePricing memory leak** - `setInterval` in `pollProgress` never cleaned up on unmount. Fixed: added `useEffect` cleanup.

### Code Cleanup
- Consolidated `generateId()` and `createVM()` into shared `utils/helpers.ts`
- Removed unused exports: `DEFAULT_VM_ENTRY`, `AZURE_PRICING_API_URL`, `CACHE_TTL_HOURS`, `REFRESH_CHUNK_SIZE`, `REFRESH_INTERVAL_MS`, `DISK_SKUS` interface, `getVMSizesForFamily()`
- Removed unused CSS variable `--success`
- Updated `index.html` title to "Azure VM Pricing Calculator"

### UI/UX Changes
- **Theme**: Inter font, shadcn/ui-inspired design with Azure blue header bar
- **Summary cards**: Colored left-border accents, hover shadow lift
- **SKU Breakdown**: Expand/collapse toggle per VM, subtotals, grand total
- **Column alignment**: Right-justified Unit Price, Qty, Line Total headers
- **Table padding**: 24px consistent left/right padding on tables
- **VM table columns**: vCPU (70px), Memory (85px), Disk Size (100px) - sized for digits + spinner

## Current Plan

All major features implemented and bugs fixed. The application is functional with:

- ✅ 3 default VM rows with Auto family selection
- ✅ vCPU/Memory/Disk Size fields with proper widths
- ✅ "Set All" row with dropdowns/checkboxes for all fields
- ✅ Region and currency selectors with auto-detection
- ✅ AHB toggle in settings bar
- ✅ Savings Plan / Reserved Instance pricing with discounts
- ✅ OS licensing (Windows, RHEL, SUSE) as separate line items
- ✅ SQL Server pricing with min 4-core rule
- ✅ Backup (short-term and short+long-term)
- ✅ ASR with replica disk cost
- ✅ Azure Monitor basic pricing
- ✅ Currency conversion throughout
- ✅ SKU Breakdown table with expand/collapse
- ✅ Dual CSV export
- ✅ Progress bar during pricing refresh

### Potential Future Work
- [TODO] Add `AbortController` to prevent race conditions on rapid region changes
- [TODO] Replace `err: any` with proper TypeScript error handling in usePricing
- [TODO] Consider using actual API disk pricing data instead of per-GB fallback for P1-P5, P30+
- [TODO] Add VM name uniqueness validation to prevent SKU breakdown grouping errors

---

## Summary Metadata
**Update time**: 2026-04-08T04:22:56.690Z 
