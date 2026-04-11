// ============================================================
// Paste from Excel or CSV Component
// ============================================================

import React from 'react';
import type { VMEntry, OSOption, BackupOption, SQLOption } from '../types';
import { createVM } from '../utils/helpers';

interface PasteFromExcelProps {
  onPaste: (vms: VMEntry[]) => void;
}

type ParsedRow = {
  vmName?: string;
  vcpu?: number;
  memoryGB?: number;
  diskGB?: number;
  os?: string;
  backup?: string;
  sql?: string;
  monitoring?: string;
  asr?: string;
};

/**
 * Parse TSV or CSV data into an array of row objects.
 * Excel copies data as TSV (tab-separated), CSV is comma-separated.
 */
function parseClipboardData(text: string): ParsedRow[] {
  // Detect delimiter: tab for Excel, comma for CSV
  const firstLine = text.split('\n')[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  // Check if first row is a header
  const firstCell = lines[0].split(delimiter)[0]?.trim().toLowerCase() || '';
  const hasHeader =
    firstCell === 'vm name' ||
    firstCell === 'name' ||
    firstCell === 'vmname' ||
    firstCell === 'vcpu';

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const cells = line.split(delimiter).map((c) => c.trim());
    const row: ParsedRow = {};

    // Expected columns: VM Name, vCPU, RAM (GB), Disk (GB), OS, Backup, SQL, Monitoring, ASR
    row.vmName = cells[0] || undefined;
    row.vcpu = cells[1] ? parseFloat(cells[1]) || undefined : undefined;
    row.memoryGB = cells[2] ? parseFloat(cells[2]) || undefined : undefined;
    row.diskGB = cells[3] ? parseFloat(cells[3]) || undefined : undefined;
    row.os = cells[4] || undefined;
    row.backup = cells[5] || undefined;
    row.sql = cells[6] || undefined;
    row.monitoring = cells[7] || undefined;
    row.asr = cells[8] || undefined;

    return row;
  });
}

/**
 * Map parsed row values to valid enum options with fuzzy matching.
 */
function matchOS(raw?: string): OSOption {
  if (!raw) return 'Ubuntu';
  const lower = raw.toLowerCase();
  if (lower.includes('windows')) return 'Windows Server';
  if (lower.includes('ubuntu')) return 'Ubuntu';
  if (lower.includes('red hat') || lower.includes('rhel')) return 'Red Hat Linux';
  if (lower.includes('suse')) return 'SUSE Linux';
  if (lower.includes('centos')) return 'CentOS';
  return 'Ubuntu';
}

function matchBackup(raw?: string): BackupOption {
  if (!raw) return 'No backups';
  const lower = raw.toLowerCase();
  if (lower.includes('no') || lower.includes('none') || lower === 'false' || lower === '0') {
    return 'No backups';
  }
  if (lower.includes('long') || lower.includes('7y') || lower.includes('12m')) {
    return 'Short + Long-term (34d/5w/12m/7y)';
  }
  return 'Short-term (34 days)';
}

function matchSQL(raw?: string): SQLOption {
  if (!raw) return 'None';
  const lower = raw.toLowerCase().trim();
  if (lower.includes('enterprise')) return 'Enterprise';
  if (lower.includes('standard')) return 'Standard';
  if (lower.includes('developer')) return 'Developer';
  if (lower.includes('none') || lower === 'false' || lower === '0' || lower === 'n/a' || lower === '-') {
    return 'None';
  }
  return 'None';
}

function parseBool(raw?: string): boolean {
  if (!raw) return false;
  const lower = raw.toLowerCase().trim();
  return lower === 'true' || lower === 'yes' || lower === '1' || lower === 'y';
}

/**
 * Convert parsed rows to VMEntry objects.
 */
function rowsToVMs(rows: ParsedRow[]): VMEntry[] {
  return rows
    .filter((row) => row.vmName || row.vcpu || row.memoryGB) // skip completely empty rows
    .map((row, index) => {
      const vm = createVM(row.vmName || `VM-${index + 1}`, {
        vcpu: row.vcpu ?? 0,
        memoryGB: row.memoryGB ?? 0,
        diskSizeGB: row.diskGB ?? 0,
        os: matchOS(row.os),
        backup: matchBackup(row.backup),
        sql: matchSQL(row.sql),
        monitoring: parseBool(row.monitoring),
        asr: parseBool(row.asr),
      });
      return vm;
    });
}

export const PasteFromExcel: React.FC<PasteFromExcelProps> = React.memo(({ onPaste }) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const [status, setStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const handlePaste = React.useCallback(
    (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') || '';
      if (!text.trim()) {
        setStatus({ type: 'error', message: 'Clipboard is empty' });
        return;
      }

      try {
        const rows = parseClipboardData(text);
        if (rows.length === 0) {
          setStatus({ type: 'error', message: 'No data found in clipboard' });
          return;
        }

        const vms = rowsToVMs(rows);
        if (vms.length === 0) {
          setStatus({ type: 'error', message: 'Could not parse any valid VM entries' });
          return;
        }

        onPaste(vms);
        setStatus({ type: 'success', message: `Appended ${vms.length} VM${vms.length > 1 ? 's' : ''} to the list!` });

        // Clear success message after 3 seconds
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setStatus(null);
          timeoutRef.current = null;
        }, 3000);
      } catch (err) {
        console.error('Paste import error:', err);
        setStatus({ type: 'error', message: 'Failed to parse clipboard data' });
      }
    },
    [onPaste],
  );

  // Global paste listener when panel is focused
  React.useEffect(() => {
    if (!isFocused) return;

    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Only handle if not already handled by the panel
      handlePaste(e);
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => {
      document.removeEventListener('paste', handleGlobalPaste);
    };
  }, [isFocused, handlePaste]);

  const handleClick = () => {
    setIsFocused(true);
  };

  // Handle container paste event
  const handleContainerPaste = (e: React.ClipboardEvent) => {
    handlePaste(e.nativeEvent);
  };

  return (
    <div
      className={`paste-panel ${isFocused ? 'paste-panel-focused' : ''}`}
      onClick={handleClick}
      onPaste={handleContainerPaste}
      tabIndex={0}
      role="button"
      aria-label="Paste from Excel or CSV"
    >
      <div className="paste-panel-content">
        <div className="paste-panel-icon">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <polyline points="12 11 16 11 16 15 12 15 12 11" />
            <line x1="12" y1="11" x2="12" y2="15" />
          </svg>
        </div>

        <div className="paste-panel-text">
          <h3>Paste from Excel or CSV</h3>
          <p>
            Click here and press{' '}
            <kbd className="paste-kbd">Ctrl+V</kbd> to paste your VM list. Expected columns:{' '}
            <strong>VM Name, vCPU, RAM (GB), Disk (GB), OS, Backup, SQL, Monitoring, ASR</strong>
          </p>
        </div>

        <div className="paste-panel-badge">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Excel / CSV / TSV
        </div>
      </div>

      {status && (
        <div className={`paste-status paste-status-${status.type}`}>
          {status.message}
        </div>
      )}

      {isFocused && (
        <div className="paste-hint">Ready to paste... Press Ctrl+V</div>
      )}
    </div>
  );
});
