import React, { useState, useMemo, useRef } from 'react';
import { Download, Upload, FileText, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { entities } from "@/api/supabaseClient";
import { getNextNumber } from '../shared/numberSequencing';
import { toast } from 'sonner';
import { withProjectId } from '@/lib/mutations/standardMutation';
import {
  parseCSV,
  buildTemplateCSV,
  parseRowsToExpenses,
} from "./expenseImportHelpers";



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

        const payload = withProjectId({
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
        }, activeProject.id);

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
                  color: 'var(--on-accent)',
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
                color: 'var(--on-accent)', padding: '8px 18px', borderRadius: 6,
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
