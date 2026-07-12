import React, { useState, useMemo, useRef } from 'react';
import { Download, Upload, FileText, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { entities } from "@/api/supabaseClient";
import { COST_CODES } from '../shared/costCodes';
import { getNextNumber } from '../shared/numberSequencing';
import { toast } from 'sonner';

const EXPENSE_TYPES = ['Labor', 'Materials', 'Equipment', 'Subcontractor', 'Misc.', 'Overhead'];
const PAYMENT_STATUSES = ['Unpaid', 'Paid', 'Pending Approval', 'Disputed', 'Voided'];

/**
 * CSV columns (case-insensitive headers).
 * Required: Date, Description, Cost Code, Amount
 * Optional: Type, Quantity, Unit, Vendor, Invoice #, Invoice Date,
 *           Payment Status, Payment Date, Work Package, Submitted By, Notes
 */
const TEMPLATE_HEADERS = [
  'Date',
  'Description',
  'Type',
  'Cost Code',
  'Amount',
  'Quantity',
  'Unit',
  'Vendor',
  'Invoice #',
  'Invoice Date',
  'Payment Status',
  'Payment Date',
  'Work Package',
  'Submitted By',
  'Notes',
];

const TEMPLATE_EXAMPLES = [
  ['2026-04-01', 'Wide flange beams — Phase 1', 'Materials', '05', '45000', '25', 'TON', 'SteelCo Supply', 'INV-10234', '2026-04-01', 'Unpaid', '', 'WP-001', 'J. Smith', 'Rush order'],
  ['2026-04-02', 'Shop labor — detailing rework', 'Labor', '06', '3200', '40', 'HR', 'In-House', '', '', 'Paid', '2026-04-05', 'WP-002', 'J. Smith', ''],
  ['2026-04-03', 'Crane rental — erection week 1', 'Equipment', '09', '8500', '5', 'Day', 'Heavy Lift Rental', 'INV-98765', '2026-04-03', 'Pending Approval', '', 'WP-003', 'M. Jones', 'Incl. operator'],
];

// ── Minimal CSV parser (RFC 4180 handling of quoted fields) ──
function parseCSV(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { cur.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function buildTemplateCSV() {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    TEMPLATE_HEADERS.map(esc).join(','),
    ...TEMPLATE_EXAMPLES.map((row) => row.map(esc).join(',')),
  ];
  return lines.join('\n');
}

function downloadTemplate() {
  const csv = buildTemplateCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expense_import_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[#]/g, '').replace(/\s+/g, ' ');
}

const HEADER_MAP = {
  'date': 'expense_date',
  'expense date': 'expense_date',
  'description': 'description',
  'type': 'expense_type',
  'expense type': 'expense_type',
  'cost code': 'cost_code',
  'amount': 'amount',
  'quantity': 'quantity',
  'qty': 'quantity',
  'unit': 'unit',
  'vendor': 'vendor',
  'invoice': 'invoice_number',
  'invoice number': 'invoice_number',
  'invoice date': 'invoice_date',
  'payment status': 'payment_status',
  'status': 'payment_status',
  'payment date': 'payment_date',
  'work package': 'work_package_code',
  'wp': 'work_package_code',
  'submitted by': 'submitted_by',
  'notes': 'notes',
};

function coerceDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Accept YYYY-MM-DD, MM/DD/YYYY, M/D/YY
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
}

function coerceNumber(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[$,\s]/g, '');
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function parseRowsToExpenses(rows, workPackages) {
  if (rows.length === 0) return { headers: [], records: [] };
  const rawHeaders = rows[0].map(normalizeHeader);
  const fieldMap = rawHeaders.map((h) => HEADER_MAP[h] || null);
  const records = rows.slice(1).map((row, idx) => {
    const rec = { _row: idx + 2, _errors: [], _warnings: [] };
    row.forEach((cell, colIdx) => {
      const field = fieldMap[colIdx];
      if (!field) return;
      rec[field] = typeof cell === 'string' ? cell.trim() : cell;
    });

    // Coerce types
    rec.expense_date = coerceDate(rec.expense_date);
    rec.invoice_date = coerceDate(rec.invoice_date);
    rec.payment_date = coerceDate(rec.payment_date);
    rec.amount = coerceNumber(rec.amount);
    rec.quantity = coerceNumber(rec.quantity) || 1;

    // Validate required
    if (!rec.expense_date) rec._errors.push('Missing/invalid Date');
    if (!rec.description) rec._errors.push('Missing Description');
    if (!rec.cost_code) {
      rec._errors.push('Missing Cost Code');
    } else {
      const cc = String(rec.cost_code).trim();
      const found = COST_CODES.find((c) => c.code === cc || c.code === cc.padStart(2, '0'));
      if (!found) {
        rec._warnings.push(`Unknown Cost Code "${rec.cost_code}" — will import as-is`);
      } else {
        rec.cost_code = found.code;
        rec.cost_code_name = `${found.code} — ${found.name}`;
      }
    }
    if (rec.amount == null || rec.amount <= 0) {
      rec._errors.push('Amount must be > 0');
    }

    // Normalize enums
    if (rec.expense_type && !EXPENSE_TYPES.includes(rec.expense_type)) {
      const match = EXPENSE_TYPES.find(
        (t) => t.toLowerCase() === String(rec.expense_type).toLowerCase()
      );
      if (match) rec.expense_type = match;
      else { rec._warnings.push(`Unknown Type "${rec.expense_type}" — defaulting to Materials`); rec.expense_type = 'Materials'; }
    }
    if (!rec.expense_type) rec.expense_type = 'Materials';

    if (rec.payment_status && !PAYMENT_STATUSES.includes(rec.payment_status)) {
      const match = PAYMENT_STATUSES.find(
        (s) => s.toLowerCase() === String(rec.payment_status).toLowerCase()
      );
      if (match) rec.payment_status = match;
      else { rec._warnings.push(`Unknown Status "${rec.payment_status}" — defaulting to Unpaid`); rec.payment_status = 'Unpaid'; }
    }
    if (!rec.payment_status) rec.payment_status = 'Unpaid';

    // Link work package by code/name if provided
    if (rec.work_package_code && workPackages?.length) {
      const wpCode = String(rec.work_package_code).trim();
      const wp = workPackages.find(
        (w) => w.wp_number === wpCode || w.name === wpCode || `${w.wp_number} — ${w.name}` === wpCode
      );
      if (wp) {
        rec.work_package_id = wp.id;
        rec.work_package_name = `${wp.wp_number} — ${wp.name}`;
      } else {
        rec._warnings.push(`Work package "${wpCode}" not found — left blank`);
      }
    }

    return rec;
  });

  return { headers: rawHeaders, records };
}

export default function ExpenseImportModal({ open, onClose, activeProject, workPackages = [], onImported }) {
  const fileInputRef = useRef(null);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  const parsed = useMemo(() => {
    if (!csvText.trim()) return { headers: [], records: [] };
    try {
      return parseRowsToExpenses(parseCSV(csvText), workPackages);
    } catch (e) {
      return { headers: [], records: [], _parseError: e.message };
    }
  }, [csvText, workPackages]);

  const validCount = parsed.records.filter((r) => r._errors.length === 0).length;
  const errorCount = parsed.records.length - validCount;
  const warnCount = parsed.records.filter((r) => r._warnings.length > 0).length;

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
  };

  const reset = () => {
    setCsvText('');
    setFileName('');
    setProgress({ done: 0, total: 0, failed: 0 });
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose?.();
  };

  const handleImport = async () => {
    if (!activeProject?.id) { toast.error('No active project'); return; }
    const valid = parsed.records.filter((r) => r._errors.length === 0);
    if (valid.length === 0) { toast.error('No valid rows to import'); return; }

    setImporting(true);
    setProgress({ done: 0, total: valid.length, failed: 0 });

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < valid.length; i++) {
      const rec = valid[i];
      try {
        let expenseNumber;
        try {
          expenseNumber = await getNextNumber(activeProject.id, "EXPENSE");
        } catch (err) {
          failed += 1;
          console.error("Unable to reserve expense number for import row:", rec, err);
          setProgress({ done: i + 1, total: valid.length, failed });
          continue;
        }
        if (!expenseNumber) {
          failed += 1;
          setProgress({ done: i + 1, total: valid.length, failed });
          continue;
        }

        const payload = {
          project_id: activeProject.id,
          project_name: activeProject.name || '',
          expense_number: expenseNumber,
          expense_date: rec.expense_date,
          description: rec.description,
          expense_type: rec.expense_type,
          cost_code: rec.cost_code,
          cost_code_name: rec.cost_code_name || rec.cost_code,
          amount: Number(rec.amount) || 0,
          quantity: Number(rec.quantity) || 1,
          unit_cost: (Number(rec.amount) || 0) / (Number(rec.quantity) || 1),
          unit: rec.unit || 'EA',
          vendor: rec.vendor || '',
          invoice_number: rec.invoice_number || '',
          invoice_date: rec.invoice_date || null,
          payment_status: rec.payment_status || 'Unpaid',
          payment_date: rec.payment_date || null,
          work_package_id: rec.work_package_id || '',
          work_package_name: rec.work_package_name || '',
          submitted_by: rec.submitted_by || '',
          notes: rec.notes || '',
        };

        await entities.Expense.create(payload);
        succeeded += 1;
      } catch (e) {
        failed += 1;
        console.error('Import row failed', rec, e);
      }
      setProgress({ done: i + 1, total: valid.length, failed });
    }

    setImporting(false);
    if (succeeded > 0) toast.success(`Imported ${succeeded} expense${succeeded === 1 ? '' : 's'}${failed ? ` (${failed} failed)` : ''}`);
    else toast.error('Import failed');
    onImported?.();
    if (succeeded > 0 && failed === 0) handleClose();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(7,9,14,0.78)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(980px, 100%)',
          maxHeight: '92vh',
          background: 'var(--bg-surface-secondary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--divider)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-surface-low)',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              Import Expenses
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {activeProject?.name ? `Target: ${activeProject.name}` : 'No active project'}
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={importing}
            style={{
              background: 'transparent', border: '1px solid var(--border-default)',
              color: 'var(--text-muted)', padding: 6, borderRadius: 6,
              cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.5 : 1,
            }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Step 1: Template */}
          <div style={{
            padding: 14,
            borderRadius: 8,
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface-low)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Step 1 · Template
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Download the CSV template, fill it in, then upload or paste below.
              </div>
            </div>
            <button
              onClick={downloadTemplate}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 6,
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <Download size={12} /> Download Template
            </button>
          </div>

          {/* Step 2: Upload / Paste */}
          <div style={{
            padding: 14,
            borderRadius: 8,
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface-low)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
              Step 2 · Upload CSV or Paste
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 6,
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#07090E',
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                <Upload size={12} /> Choose File
              </button>
              {fileName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  <FileText size={12} /> {fileName}
                </div>
              )}
              {csvText && (
                <button
                  onClick={reset}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent', border: '1px solid var(--border-default)',
                    color: 'var(--text-muted)', padding: '6px 10px', borderRadius: 6,
                    fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer',
                  }}
                >
                  CLEAR
                </button>
              )}
            </div>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setFileName(''); }}
              placeholder="…or paste CSV content here"
              rows={4}
              style={{
                width: '100%',
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                padding: 10,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          {/* Step 3: Preview */}
          {parsed.records.length > 0 && (
            <div style={{
              padding: 14,
              borderRadius: 8,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface-low)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Step 3 · Preview · {parsed.records.length} row{parsed.records.length === 1 ? '' : 's'}
                </div>
                <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--status-success)' }}>
                    <CheckCircle2 size={12} /> {validCount} valid
                  </span>
                  {errorCount > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--status-error)' }}>
                      <AlertTriangle size={12} /> {errorCount} errors
                    </span>
                  )}
                  {warnCount > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--status-warning)' }}>
                      <AlertTriangle size={12} /> {warnCount} warnings
                    </span>
                  )}
                </div>
              </div>

              <div style={{
                maxHeight: 280, overflowY: 'auto',
                background: 'var(--bg-surface-low)', borderRadius: 6,
                border: '1px solid var(--divider)',
              }}>
                <table className="sbd-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface-low)' }}>
                    <tr>
                      {['Row', 'Date', 'Description', 'Type', 'Cost Code', 'Amount', 'Vendor', 'Status', 'Issues'].map((h) => (
                        <th key={h} style={{
                          padding: '8px 10px', textAlign: 'left',
                          fontSize: 9, color: 'var(--text-muted)',
                          letterSpacing: '0.12em', textTransform: 'uppercase',
                          borderBottom: '1px solid var(--divider)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.records.map((rec, i) => {
                      const hasError = rec._errors.length > 0;
                      const hasWarn = rec._warnings.length > 0;
                      return (
                        <tr key={i} style={{
                          borderBottom: '1px solid var(--divider)',
                          background: hasError
                            ? 'rgba(239,68,68,0.06)'
                            : hasWarn
                              ? 'rgba(245,158,11,0.04)'
                              : 'transparent',
                        }}>
                          <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{rec._row}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{rec.expense_date || '—'}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.description || '—'}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{rec.expense_type || '—'}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{rec.cost_code || '—'}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)', textAlign: 'right' }}>
                            {rec.amount != null ? `$${Number(rec.amount).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.vendor || '—'}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{rec.payment_status || '—'}</td>
                          <td style={{ padding: '6px 10px', color: hasError ? 'var(--status-error)' : hasWarn ? 'var(--status-warning)' : 'var(--text-muted)', maxWidth: 220 }}>
                            {hasError
                              ? rec._errors.join('; ')
                              : hasWarn
                                ? rec._warnings.join('; ')
                                : 'OK'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parsed._parseError && (
            <div style={{ color: 'var(--status-error)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              Parse error: {parsed._parseError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--divider)',
          background: 'var(--bg-surface-low)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            {importing
              ? `Importing ${progress.done} / ${progress.total}${progress.failed ? ` · ${progress.failed} failed` : ''}`
              : validCount > 0
                ? `Ready to import ${validCount} row${validCount === 1 ? '' : 's'}`
                : 'Upload a file to begin'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleClose}
              disabled={importing}
              style={{
                background: 'transparent', border: '1px solid var(--border-default)',
                color: 'var(--text-muted)', padding: '8px 16px', borderRadius: 6,
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: importing ? 'not-allowed' : 'pointer',
                opacity: importing ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || validCount === 0 || !activeProject?.id}
              style={{
                background: 'var(--accent)', border: 'none',
                color: '#07090E', padding: '8px 18px', borderRadius: 6,
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: importing || validCount === 0 ? 'not-allowed' : 'pointer',
                opacity: importing || validCount === 0 ? 0.5 : 1,
              }}
            >
              {importing ? 'Importing…' : `Import ${validCount || ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
