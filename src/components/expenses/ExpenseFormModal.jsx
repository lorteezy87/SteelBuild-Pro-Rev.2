import React, { useState, useEffect } from 'react';
import { COST_CODES, COST_CODES_GROUPED } from '../shared/costCodes';
import { getCostCodeSummary } from '../shared/budgetCalculations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EXPENSE_TYPES = ['Labor', 'Materials', 'Equipment', 'Subcontractor', 'Misc.', 'Overhead'];
const PAYMENT_STATUSES = ['Unpaid', 'Paid', 'Pending Approval', 'Disputed', 'Voided'];
const UNITS = ['LS', 'HR', 'EA', 'TON', 'LF', 'SF', 'Day'];

const empty = {
  project_id: '', project_name: '', description: '',
  expense_type: 'Materials', cost_code: '', cost_code_name: '',
  amount: 0, quantity: 1, unit_cost: 0, unit: 'EA',
  vendor: '', invoice_number: '', invoice_date: '',
  payment_status: 'Unpaid', payment_date: '',
  work_package_id: '', work_package_name: '',
  sov_line_item_id: '', sov_line_item_name: '',
  expense_date: new Date().toISOString().split('T')[0],
  submitted_by: '', approved_by: '', approved_date: '',
  notes: '', receipt_url: '', tags: '',
};

const iStyle = {
  width: '100%',
  background: 'var(--bg-sidebar)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  padding: '7px 11px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s',
};

const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 8,
  letterSpacing: '0.14em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  marginBottom: 5,
  display: 'block',
};

const sectionLabel = {
  fontFamily: 'var(--font-mono)',
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: '0.16em',
  color: 'var(--accent)',
  textTransform: 'uppercase',
  marginBottom: 12,
  paddingBottom: 6,
  borderBottom: '1px solid var(--divider)',
};

const triggerStyle = {
  background: 'var(--bg-sidebar)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  height: 34,
};

export default function ExpenseFormModal({
  open, onClose, onSave, expense,
  projects = [], workPackages = [],
  sovItems = [], expenses = [], nextNumber,
  defaultProjectId,
}) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(expense
      ? { ...empty, ...expense }
      : { ...empty, expense_number: nextNumber || '', project_id: defaultProjectId || '' }
    );
    setErrors({});
  }, [expense, open, nextNumber, defaultProjectId]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.project_id) e.project_id = 'Required';
    if (!form.description?.trim()) e.description = 'Required';
    if (!form.cost_code) e.cost_code = 'Required';
    if (!form.amount || Number(form.amount) <= 0) e.amount = 'Must be > 0';
    if (!form.expense_date) e.expense_date = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const proj = projects.find(p => p.id === form.project_id);
    const ccData = COST_CODES.find(cc => cc.code === form.cost_code);
    const wp = workPackages.find(w => w.id === form.work_package_id);
    onSave({
      ...form,
      amount: Number(form.amount) || 0,
      quantity: Number(form.quantity) || 1,
      unit_cost: (Number(form.amount) || 0) / (Number(form.quantity) || 1),
      project_name: proj?.name || form.project_name,
      cost_code_name: ccData ? `${ccData.code} — ${ccData.name}` : form.cost_code_name,
      work_package_name: wp ? `${wp.wp_number} — ${wp.name}` : form.work_package_name,
    });
  };

  const ccSummary = getCostCodeSummary(
    form.cost_code,
    sovItems.filter(s => s.project_id === form.project_id),
    expenses.filter(e => e.project_id === form.project_id && (!expense || e.id !== expense.id))
  );
  const newTotal = ccSummary.committed + (Number(form.amount) || 0);
  const willExceed = newTotal > ccSummary.budget;
  const exceedAmount = Math.max(0, newTotal - ccSummary.budget);
  const proj = projects.find(p => p.id === form.project_id);

  const isFormValid =
    !!form.project_id &&
    !!form.description?.trim() &&
    !!form.cost_code &&
    !!form.expense_date &&
    Number(form.amount) > 0;

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%',
        maxWidth: 900,
        height: '88vh',
        maxHeight: '88vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--accent-border)',
        borderRadius: 8,
        boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* ── HEADER ── */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-default)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {expense ? `Edit Expense` : 'New Expense'}
            </div>
            {proj && <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{proj.name}</div>}
          </div>
          {expense?.expense_number && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-muted)', padding: '4px 10px', borderRadius: 4, border: '1px solid var(--accent-border)', letterSpacing: '0.06em' }}>
              {expense.expense_number}
            </span>
          )}
        </div>

        {/* ── BODY ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Section 1 — Core Details */}
          <div>
            <div style={sectionLabel}>Core Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Left */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Description *</label>
                  <input value={form.description} onChange={e => set('description', e.target.value)} style={iStyle} placeholder="e.g., Anchor bolts — Grid A-D" />
                  {errors.description && <p style={{ fontSize: 10, color: 'var(--status-error)', marginTop: 3 }}>{errors.description}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <Select value={form.expense_type} onValueChange={v => set('expense_type', v)}>
                    <SelectTrigger style={triggerStyle}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ background: 'var(--bg-surface-low)', zIndex: 10001 }}>
                      {EXPENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={labelStyle}>Cost Code *</label>
                  <select value={form.cost_code} onChange={e => set('cost_code', e.target.value)} style={{ ...iStyle, appearance: 'none' }}>
                    <option value="">Select cost code</option>
                    {COST_CODES_GROUPED.map(g => (
                      <optgroup key={g.category} label={g.category}>
                        {g.codes.map(cc => <option key={cc.code} value={cc.code}>{cc.code} — {cc.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {errors.cost_code && <p style={{ fontSize: 10, color: 'var(--status-error)', marginTop: 3 }}>{errors.cost_code}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Expense Date *</label>
                  <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} style={iStyle} />
                  {errors.expense_date && <p style={{ fontSize: 10, color: 'var(--status-error)', marginTop: 3 }}>{errors.expense_date}</p>}
                </div>
              </div>
              {/* Right */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Amount *</label>
                  <input type="number" step="0.01" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} style={{ ...iStyle, fontFamily: 'var(--font-mono)' }} placeholder="0.00" />
                  {errors.amount && <p style={{ fontSize: 10, color: 'var(--status-error)', marginTop: 3 }}>{errors.amount}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Quantity</label>
                  <input type="number" step="0.01" min="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} style={{ ...iStyle, fontFamily: 'var(--font-mono)' }} />
                </div>
                <div>
                  <label style={labelStyle}>Unit</label>
                  <Select value={form.unit} onValueChange={v => set('unit', v)}>
                    <SelectTrigger style={triggerStyle}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ background: 'var(--bg-surface-low)', zIndex: 10001 }}>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={labelStyle}>Unit Cost (calculated)</label>
                  <div style={{ ...iStyle, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center' }}>
                    ${((Number(form.amount) || 0) / (Number(form.quantity) || 1)).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 — Invoice & Payment */}
          <div>
            <div style={sectionLabel}>Invoice & Payment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Left */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Vendor</label>
                  <input value={form.vendor} onChange={e => set('vendor', e.target.value)} style={iStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Invoice Number</label>
                  <input value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} style={iStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Invoice Date</label>
                  <input type="date" value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} style={iStyle} />
                </div>
              </div>
              {/* Right */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Payment Status</label>
                  <Select value={form.payment_status} onValueChange={v => set('payment_status', v)}>
                    <SelectTrigger style={triggerStyle}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ background: 'var(--bg-surface-low)', zIndex: 10001 }}>
                      {PAYMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.payment_status === 'Paid' && (
                  <div>
                    <label style={labelStyle}>Payment Date</label>
                    <input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} style={iStyle} />
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Submitted By</label>
                  <input value={form.submitted_by} onChange={e => set('submitted_by', e.target.value)} style={iStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Approved By</label>
                  <input value={form.approved_by} onChange={e => set('approved_by', e.target.value)} style={iStyle} />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 — Project Linkage */}
          <div>
            <div style={sectionLabel}>Project Linkage</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Left */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Project *</label>
                  <select value={form.project_id} onChange={e => set('project_id', e.target.value)} style={{ ...iStyle, appearance: 'none' }}>
                    <option value="">Select project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {errors.project_id && <p style={{ fontSize: 10, color: 'var(--status-error)', marginTop: 3 }}>{errors.project_id}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Work Package</label>
                  <Select value={form.work_package_id || '__none__'} onValueChange={v => set('work_package_id', v === '__none__' ? '' : v)}>
                    <SelectTrigger style={triggerStyle}><SelectValue placeholder="Select WP" /></SelectTrigger>
                    <SelectContent style={{ background: 'var(--bg-surface-low)', zIndex: 10001 }}>
                      <SelectItem value="__none__">None</SelectItem>
                      {workPackages.filter(wp => wp.project_id === form.project_id).map(wp => (
                        <SelectItem key={wp.id} value={wp.id}>{wp.wp_number} — {wp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Right */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>SOV Line Item</label>
                  <Select value={form.sov_line_item_id || '__none__'} onValueChange={v => set('sov_line_item_id', v === '__none__' ? '' : v)}>
                    <SelectTrigger style={triggerStyle}><SelectValue placeholder="Select SOV item" /></SelectTrigger>
                    <SelectContent style={{ background: 'var(--bg-surface-low)', zIndex: 10001 }}>
                      <SelectItem value="__none__">None</SelectItem>
                      {sovItems.filter(s => s.project_id === form.project_id).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} style={{ ...iStyle, fontFamily: 'var(--font-body)', resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Budget Impact Panel */}
          {form.cost_code && (
            <div style={{
              padding: 14, borderRadius: 6,
              background: willExceed ? 'var(--warning-muted)' : 'var(--info-muted)',
              border: `1px solid ${willExceed ? 'var(--warning-border)' : 'var(--accent-border)'}`,
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10, color: willExceed ? 'var(--status-warning)' : 'var(--text-muted)', fontWeight: 700 }}>
                {willExceed ? '⚠ OVER BUDGET' : '📊 BUDGET IMPACT'} — {form.cost_code}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  ['Budget', `$${ccSummary.budget.toFixed(2)}`, 'var(--text-primary)'],
                  ['Committed', `$${ccSummary.committed.toFixed(2)}`, 'var(--status-warning)'],
                  ['This Expense', `+$${(Number(form.amount)||0).toFixed(2)}`, 'var(--text-primary)'],
                  ['New Total', `$${newTotal.toFixed(2)}`, willExceed ? 'var(--status-warning)' : 'var(--status-success)'],
                ].map(([label, value, color]) => (
                  <div key={label}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
              {willExceed && (
                <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(245,158,11,0.10)', borderLeft: '2px solid var(--status-warning)', borderRadius: 4, fontSize: 10, color: 'var(--status-warning)', fontFamily: 'var(--font-body)' }}>
                  ⚠ Exceeds budget by ${exceedAmount.toFixed(2)} — expense will still be saved
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── FOOTER ── */}
        <div style={{
          flexShrink: 0,
          padding: '14px 24px',
          borderTop: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            {expense ? `EDITING · ${expense.expense_number || ''}` : 'NEW EXPENSE'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-btn)', padding: '9px 18px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer', transition: 'all 0.15s' }}>
              CANCEL
            </button>
            <button
              onClick={handleSave}
              disabled={!isFormValid}
              style={{
                background: isFormValid ? 'var(--accent)' : 'var(--bg-surface-highest)',
                border: 'none',
                borderRadius: 'var(--radius-btn)',
                padding: '9px 22px',
                color: isFormValid ? 'var(--on-accent)' : 'var(--text-disabled)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: isFormValid ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              {expense ? 'UPDATE EXPENSE' : 'CREATE EXPENSE'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}