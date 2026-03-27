import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectContext } from '../components/shared/useProjectContext';
import { Pencil, Trash2, Download, CheckSquare, Square } from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import DeleteDialog from '../components/shared/DeleteDialog';
import ExpenseFormModal from '../components/expenses/ExpenseFormModal';
import { formatCurrency, formatDate, formatCurrencyShort } from '../components/shared/formatters';
import { COST_CODES, COST_CODES_GROUPED, CATEGORY_COLORS } from '../components/shared/costCodes';
import { toast } from 'sonner';
import { getNextNumber } from '../components/shared/numberSequencing';

const EXPENSE_TYPES = ['Labor', 'Materials', 'Equipment', 'Subcontractor', 'Misc.', 'Overhead'];
const PAYMENT_STATUSES = ['Unpaid', 'Paid', 'Pending Approval', 'Disputed', 'Voided'];

const PAYMENT_STATUS_COLOR = {
  Unpaid: 'var(--status-warning)',
  Paid: 'var(--status-success)',
  'Pending Approval': 'var(--status-warning)',
  Disputed: 'var(--status-error)',
  Voided: 'var(--text-muted)',
};

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 8,
  letterSpacing: '0.12em',
  color: 'var(--text-muted)',
  fontWeight: 700,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--divider)',
  background: 'var(--bg-sidebar)',
};

export default function ExpensesPage() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [costCodeFilter, setCostCodeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [wpFilter, setWpFilter] = useState('all');
  const [selected, setSelected] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: expenses = [], isLoading, refetch } = useQuery({
    queryKey: ['expenses', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const projectExpenses = await base44.entities.Expense.filter({ project_id: activeProject.id });
      return projectExpenses.sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
    },
    enabled: !!activeProject?.id,
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: sovItems = [] } = useQuery({
    queryKey: ['sov-items', activeProject?.id],
    queryFn: () => (activeProject?.id ? base44.entities.SOVItem.filter({ project_id: activeProject.id }) : []),
    enabled: !!activeProject?.id,
    initialData: [],
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ['work-packages', activeProject?.id],
    queryFn: () => (activeProject?.id ? base44.entities.WorkPackage.filter({ project_id: activeProject.id }) : []),
    enabled: !!activeProject?.id,
    initialData: [],
  });

  const { data: costCodes = [] } = useQuery({
    queryKey: ['cost-codes', activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.CostCode.filter({ project_id: activeProject.id }, '-created_date')
      : [],
    enabled: !!activeProject?.id,
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: async d => {
      let expenseNumber;
      try {
        expenseNumber = activeProject?.id ? await getNextNumber(activeProject.id, 'EXPENSE') : null;
      } catch (e) { expenseNumber = null; }
      if (!expenseNumber) expenseNumber = `EXP-${String((expenses.length || 0) + 1).padStart(3, '0')}`;
      return base44.entities.Expense.create({ ...d, expense_number: expenseNumber, project_id: d.project_id || activeProject?.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setModalOpen(false); setEditing(null); toast.success('Expense created'); },
    onError: (err) => { toast.error('Failed to create expense: ' + (err?.message || 'Unknown error')); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Expense.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setModalOpen(false); setEditing(null); toast.success('Expense updated'); },
    onError: (err) => { toast.error('Failed to update expense: ' + (err?.message || 'Unknown error')); },
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Expense.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setDeleteTarget(null); toast.success('Expense deleted'); },
    onError: () => { toast.error('Failed to delete expense'); },
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => Promise.all(ids.map(id => base44.entities.Expense.update(id, data))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setSelected([]); toast.success('Updated'); },
    onError: () => toast.error('Bulk update failed'),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => Promise.all(ids.map(id => base44.entities.Expense.delete(id))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setSelected([]); toast.success('Deleted'); },
    onError: () => toast.error('Bulk delete failed'),
  });

  const handleSave = d => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  // ── KPI calculations ──
  const safeNum = (v) => Number(v) || 0;
  const totalBudget = costCodes.reduce((s, c) => s + safeNum(c.budget_amount), 0);
  const activeExpenses = expenses.filter(e => e.payment_status !== 'Voided');
  const totalCommitted = activeExpenses.reduce((s, e) => s + safeNum(e.amount), 0);
  const totalPaid = activeExpenses.filter(e => e.payment_status === 'Paid').reduce((s, e) => s + safeNum(e.amount), 0);
  const paidCount = activeExpenses.filter(e => e.payment_status === 'Paid').length;
  const totalRemaining = totalBudget - totalCommitted;
  const pctUsed = totalBudget > 0 ? Math.min(100, Math.round((totalCommitted / totalBudget) * 100)) : 0;
  const totalOutstanding = activeExpenses
    .filter(e => e.payment_status === 'Unpaid' || e.payment_status === 'Pending Approval')
    .reduce((s, e) => s + safeNum(e.amount), 0);

  const remainingColor = totalRemaining < 0
    ? 'var(--status-error)'
    : (100 - pctUsed) < 10
      ? 'var(--status-warning)'
      : 'var(--status-success)';
  const remainingBorderColor = totalRemaining < 0
    ? 'var(--status-error)'
    : (100 - pctUsed) < 10
      ? 'var(--status-warning)'
      : 'var(--status-success)';

  // ── Date range filter ──
  const now = new Date();
  const filterByDate = (e) => {
    if (dateRangeFilter === 'all') return true;
    const d = new Date(e.expense_date);
    if (dateRangeFilter === 'this_month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (dateRangeFilter === 'last_30') return (now - d) <= 30 * 86400000;
    if (dateRangeFilter === 'this_quarter') {
      const q = Math.floor(now.getMonth() / 3);
      return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === now.getFullYear();
    }
    return true;
  };

  // ── Filtered list ──
  const filtered = useMemo(() => {
    return expenses.filter(e => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch = !q || e.description?.toLowerCase().includes(q) || e.expense_number?.toLowerCase().includes(q) || e.vendor?.toLowerCase().includes(q);
      const matchCC = costCodeFilter === 'all' || e.cost_code === costCodeFilter;
      const matchType = typeFilter === 'all' || e.expense_type === typeFilter;
      const matchStatus = statusFilter === 'all' || e.payment_status === statusFilter;
      const matchWP = wpFilter === 'all' || e.work_package_id === wpFilter;
      return matchSearch && matchCC && matchType && matchStatus && matchWP && filterByDate(e);
    });
  }, [expenses, debouncedSearch, costCodeFilter, typeFilter, statusFilter, wpFilter, dateRangeFilter]);

  // ── Spend by cost code ──
  const spendByCostCode = useMemo(() => {
    const map = {};
    activeExpenses.forEach(e => {
      if (!e.cost_code) return;
      map[e.cost_code] = (map[e.cost_code] || 0) + safeNum(e.amount);
    });
    const totalSpend = Object.values(map).reduce((s, v) => s + v, 0);
    return COST_CODES
      .filter(cc => map[cc.code] > 0)
      .map(cc => ({ ...cc, spend: map[cc.code], pct: totalSpend > 0 ? Math.round((map[cc.code] / totalSpend) * 100) : 0 }))
      .sort((a, b) => b.spend - a.spend);
  }, [activeExpenses]);

  // ── Payment status breakdown ──
  const statusBreakdown = useMemo(() => {
    const map = {};
    expenses.forEach(e => {
      const s = e.payment_status || 'Unknown';
      if (!map[s]) map[s] = { count: 0, total: 0 };
      map[s].count++;
      map[s].total += safeNum(e.amount);
    });
    return Object.entries(map).map(([status, d]) => ({ status, ...d })).sort((a, b) => b.total - a.total);
  }, [expenses]);

  // ── Top vendors ──
  const topVendors = useMemo(() => {
    const map = {};
    activeExpenses.forEach(e => {
      const v = e.vendor?.trim() || '(No Vendor)';
      map[v] = (map[v] || 0) + safeNum(e.amount);
    });
    return Object.entries(map).map(([vendor, total]) => ({ vendor, total })).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [activeExpenses]);

  const exportCSV = () => {
    const headers = ['Expense #','Date','Description','Type','Cost Code','Cost Code Name','Amount','Quantity','Unit','Payment Status','Vendor','Invoice #','Work Package','SOV Item','Submitted By','Notes'];
    const rows = filtered.map(e => [e.expense_number,e.expense_date,e.description,e.expense_type,e.cost_code,e.cost_code_name,e.amount,e.quantity,e.unit,e.payment_status,e.vendor,e.invoice_number,e.work_package_name,e.sov_line_item_name,e.submitted_by,e.notes]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject?.name}_Expenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(e => e.id));

  const selectStyle = {
    background: 'var(--bg-surface-low)',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    padding: '6px 10px',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    outline: 'none',
    cursor: 'pointer',
  };

  if (!activeProject?.id) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📌</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 700, color: 'var(--text-disabled)', marginBottom: 6 }}>
          Select a project to view Expenses
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>
          Use the project selector in the top right.
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: selected.length > 0 ? 72 : 0 }}>
      {/* ── Page Header ── */}
      <PageHeader
        title="Expenses"
        subtitle={`${expenses.length} entries · ${activeProject?.name}`}
        onAdd={() => { setEditing(null); setModalOpen(true); }}
        onRefresh={refetch}
        addLabel="+ New Expense"
      />

      {/* ── KPI Strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {/* Total Budget */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px', borderTop: '2px solid var(--accent)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Total Budget</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
            {totalBudget >= 10000 ? formatCurrencyShort(totalBudget) : formatCurrency(totalBudget)}
          </div>
        </div>

        {/* Committed */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px', borderTop: `2px solid ${pctUsed >= 75 ? 'var(--status-warning)' : 'var(--accent)'}` }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Committed</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: pctUsed >= 90 ? 'var(--status-error)' : 'var(--status-warning)' }}>
            {totalCommitted >= 10000 ? formatCurrencyShort(totalCommitted) : formatCurrency(totalCommitted)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>{pctUsed}% of budget</div>
        </div>

        {/* Paid to Date */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px', borderTop: '2px solid var(--status-success)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Paid to Date</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--status-success)' }}>
            {totalPaid >= 10000 ? formatCurrencyShort(totalPaid) : formatCurrency(totalPaid)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>{paidCount} invoices</div>
        </div>

        {/* Remaining */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px', borderTop: `2px solid ${remainingBorderColor}` }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Remaining</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: remainingColor }}>
            {Math.max(0, totalRemaining) >= 10000 ? formatCurrencyShort(Math.max(0, totalRemaining)) : formatCurrency(Math.max(0, totalRemaining))}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: totalRemaining < 0 ? 'var(--status-error)' : 'var(--text-muted)', marginTop: 4 }}>
            {totalRemaining < 0 ? `⚠ ${formatCurrencyShort(Math.abs(totalRemaining))} over budget` : `${100 - pctUsed}% remaining`}
          </div>
        </div>

        {/* Outstanding */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px', borderTop: '2px solid var(--status-warning)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Outstanding</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--status-warning)' }}>
            {totalOutstanding >= 10000 ? formatCurrencyShort(totalOutstanding) : formatCurrency(totalOutstanding)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>Unpaid / Pending</div>
        </div>
      </div>

      {/* ── Analytics Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: 12, marginBottom: 20 }}>

        {/* Left: Spend by Cost Code */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '18px 20px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 14 }}>
            SPEND BY COST CODE
          </div>
          {spendByCostCode.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>No spend data</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {spendByCostCode.map(cc => {
                const barColor = CATEGORY_COLORS[cc.category] || 'var(--accent)';
                return (
                  <div key={cc.code}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)' }}>{cc.code} — {cc.name}</span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{cc.pct}%</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrencyShort(cc.spend)}</span>
                      </div>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg-surface-highest)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${cc.pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Payment Status + Top Vendors */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Payment Status */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '18px 20px', flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
              PAYMENT STATUS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {statusBreakdown.map(({ status, count, total }) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: PAYMENT_STATUS_COLOR[status] || 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)', flex: 1 }}>{status}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{count}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: PAYMENT_STATUS_COLOR[status] || 'var(--text-primary)' }}>{formatCurrencyShort(total)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Vendors */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '18px 20px', flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
              TOP VENDORS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topVendors.length === 0
                ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>No vendor data</div>
                : topVendors.map(({ vendor, total }) => (
                  <div key={vendor} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{vendor}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrencyShort(total)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="Search description, #, vendor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...selectStyle, flex: 1, minWidth: 180 }}
        />
        <select value={costCodeFilter} onChange={e => setCostCodeFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Cost Codes</option>
          {COST_CODES_GROUPED.map(g => (
            <optgroup key={g.category} label={g.category}>
              {g.codes.map(cc => <option key={cc.code} value={cc.code}>{cc.code} — {cc.name}</option>)}
            </optgroup>
          ))}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Types</option>
          {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={wpFilter} onChange={e => setWpFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Work Packages</option>
          {workPackages.map(w => <option key={w.id} value={w.id}>{w.wp_number} — {w.name}</option>)}
        </select>
        <select value={dateRangeFilter} onChange={e => setDateRangeFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Time</option>
          <option value="this_month">This Month</option>
          <option value="last_30">Last 30 Days</option>
          <option value="this_quarter">This Quarter</option>
        </select>
        <button onClick={exportCSV} style={{ ...selectStyle, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)', padding: '6px 14px' }}>
          <Download size={12} />
          Export CSV
        </button>
      </div>

      {/* ── Expense Table ── */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', overflow: 'hidden', border: '1px solid var(--divider)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40, textAlign: 'center', cursor: 'pointer' }} onClick={toggleAll}>
                  {selected.length === filtered.length && filtered.length > 0
                    ? <CheckSquare size={12} color="var(--accent)" />
                    : <Square size={12} color="var(--text-muted)" />}
                </th>
                <th style={{ ...thStyle, width: 90 }}>#</th>
                <th style={{ ...thStyle, width: 88 }}>Date</th>
                <th style={thStyle}>Description</th>
                <th style={{ ...thStyle, width: 110 }}>Cost Code</th>
                <th style={{ ...thStyle, width: 100 }}>Type</th>
                <th style={{ ...thStyle, width: 110 }}>Vendor</th>
                <th style={{ ...thStyle, width: 110, textAlign: 'right' }}>Amount</th>
                <th style={{ ...thStyle, width: 120 }}>Status</th>
                <th style={{ ...thStyle, width: 120 }}>Work Package</th>
                <th style={{ ...thStyle, width: 76, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>No expenses found</td></tr>
              ) : (
                filtered.map((e, idx) => {
                  const isSelected = selected.includes(e.id);
                  const isHovered = hoveredRow === e.id;
                  const isVoided = e.payment_status === 'Voided';
                  const isPaid = e.payment_status === 'Paid';
                  const rowBg = isSelected
                    ? 'rgba(173,198,255,0.06)'
                    : isHovered
                      ? 'var(--bg-row-hover)'
                      : idx % 2 === 0
                        ? 'var(--bg-surface)'
                        : 'var(--bg-surface-low)';
                  const amtColor = isPaid ? 'var(--status-success)' : isVoided ? 'var(--text-disabled)' : 'var(--status-warning)';
                  const statusColor = PAYMENT_STATUS_COLOR[e.payment_status] || 'var(--text-muted)';

                  return (
                    <tr
                      key={e.id}
                      style={{ background: rowBg, borderBottom: '1px solid var(--divider)', transition: 'background 0.1s' }}
                      onMouseEnter={() => setHoveredRow(e.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      <td style={{ padding: '9px 14px', textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSelect(e.id)}>
                        {isSelected
                          ? <CheckSquare size={12} color="var(--accent)" />
                          : <Square size={12} color="var(--text-muted)" />}
                      </td>
                      <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-light)', fontWeight: 600 }}>{e.expense_number}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(e.expense_date)}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isVoided ? 'line-through' : 'none' }}>{e.description}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)' }}>{e.cost_code}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)' }}>{e.expense_type}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.vendor || '—'}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right', color: amtColor, fontWeight: 700, textDecoration: isVoided ? 'line-through' : 'none' }}>{formatCurrency(e.amount)}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, background: `${statusColor}18`, border: `1px solid ${statusColor}44`, fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: statusColor, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />
                          {e.payment_status}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-light)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.work_package_name || '—'}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }}>
                          <button
                            onClick={() => { setEditing(e); setModalOpen(true); }}
                            style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--bg-surface-high)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(e)}
                            style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--danger-muted)', border: '1px solid var(--danger-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--danger)' }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        {filtered.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--divider)', background: 'var(--bg-surface-low)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.10em' }}>
              {filtered.length} EXPENSES SHOWN
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
              TOTAL: {formatCurrency(filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0))}
            </span>
          </div>
        )}
      </div>

      {/* ── Bulk Action Bar ── */}
      {selected.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 500,
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--accent-border)',
          padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.08em' }}>
            {selected.length} SELECTED
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => bulkUpdateMut.mutate({ ids: selected, data: { payment_status: 'Paid' } })} style={{ background: 'var(--success-muted)', border: '1px solid var(--success-border)', borderRadius: 6, padding: '6px 14px', color: 'var(--status-success)', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.08em' }}>
            MARK PAID
          </button>
          <button onClick={() => bulkUpdateMut.mutate({ ids: selected, data: { payment_status: 'Voided' } })} style={{ background: 'var(--warning-muted)', border: '1px solid var(--warning-border)', borderRadius: 6, padding: '6px 14px', color: 'var(--status-warning)', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.08em' }}>
            MARK VOIDED
          </button>
          <button onClick={() => { bulkDeleteMut.mutate(selected); }} style={{ background: 'var(--danger-muted)', border: '1px solid var(--danger-border)', borderRadius: 6, padding: '6px 14px', color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.08em' }}>
            DELETE SELECTED
          </button>
          <button onClick={() => setSelected([])} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Modal ── */}
      <ExpenseFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        expense={editing}
        projects={projects}
        workPackages={workPackages}
        sovItems={sovItems}
        expenses={expenses}
        costCodes={costCodes}
        nextNumber={`EXP-${String((expenses.length || 0) + 1).padStart(3, '0')}`}
        defaultProjectId={activeProject?.id}
      />

      {/* ── Delete Dialog ── */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Expense"
        description={`Delete ${deleteTarget?.expense_number}? This cannot be undone.`}
      />
    </div>
  );
}
