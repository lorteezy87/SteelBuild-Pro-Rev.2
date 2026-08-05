/**
 * Pure CSV parse/validate for ExpenseImportModal.
 */
import { COST_CODES } from "../shared/costCodes";

export const EXPENSE_TYPES = ['Labor', 'Materials', 'Equipment', 'Subcontractor', 'Misc.', 'Overhead'];
export const PAYMENT_STATUSES = ['Unpaid', 'Paid', 'Pending Approval', 'Disputed', 'Voided'];

/**
 * CSV columns (case-insensitive headers).
 * Required: Date, Description, Cost Code, Amount
 * Optional: Type, Quantity, Unit, Vendor, Invoice #, Invoice Date,
 *           Payment Status, Payment Date, Work Package, Submitted By, Notes
 */
export const TEMPLATE_HEADERS = [
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

export const TEMPLATE_EXAMPLES = [
  ['2026-04-01', 'Wide flange beams — Phase 1', 'Materials', '05', '45000', '25', 'TON', 'SteelCo Supply', 'INV-10234', '2026-04-01', 'Unpaid', '', 'WP-001', 'J. Smith', 'Rush order'],
  ['2026-04-02', 'Shop labor — detailing rework', 'Labor', '06', '3200', '40', 'HR', 'In-House', '', '', 'Paid', '2026-04-05', 'WP-002', 'J. Smith', ''],
  ['2026-04-03', 'Crane rental — erection week 1', 'Equipment', '09', '8500', '5', 'Day', 'Heavy Lift Rental', 'INV-98765', '2026-04-03', 'Pending Approval', '', 'WP-003', 'M. Jones', 'Incl. operator'],
];

// ── Minimal CSV parser (RFC 4180 handling of quoted fields) ──
export function parseCSV(text) {
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

export function buildTemplateCSV() {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    TEMPLATE_HEADERS.map(esc).join(','),
    ...TEMPLATE_EXAMPLES.map((row) => row.map(esc).join(',')),
  ];
  return lines.join('\n');
}


export function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[#]/g, '').replace(/\s+/g, ' ');
}

export const HEADER_MAP = {
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

export function coerceDate(v) {
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

export function coerceNumber(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[$,\s]/g, '');
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export function parseRowsToExpenses(rows, workPackages) {
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

