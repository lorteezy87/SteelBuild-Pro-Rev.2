import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectContext } from '../components/shared/useProjectContext';
import { Pencil, Trash2, Download, CheckSquare, Square, X } from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import DeleteDialog from '../components/shared/DeleteDialog';
import ExpenseFormModal from '../components/expenses/ExpenseFormModal';
import { formatCurrency, formatDate, formatCurrencyShort, roundCurrency } from '../components/shared/formatters';
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
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

// ── SVG Helper: Mini Progress Ring for KPI cards ──
function MiniProgressRing({ ratio, size = 32, stroke = 3, color = 'var(--accent)' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, ratio)) * circ;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-surface-highest)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  );
}

// ── SVG Helper: Budget Donut Chart ──
function BudgetDonutChart({ segments, totalCommitted }) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 65;
  const innerR = 45;
  const total = segments.reduce((s, seg) => s + seg.spend, 0);
  if (total === 0) {
    return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>No spend data</div>
    );
  }

  let cumAngle = -90; // start at top
  const paths = segments.map((seg) => {
    const frac = seg.spend / total;
    const startAngle = cumAngle;
    const sweep = frac * 360;
    cumAngle += sweep;
    const endAngle = startAngle + sweep;

    const toRad = (deg) => (deg * Math.PI) / 180;
    const x1o = cx + outerR * Math.cos(toRad(startAngle));
    const y1o = cy + outerR * Math.sin(toRad(startAngle));
    const x2o = cx + outerR * Math.cos(toRad(endAngle));
    const y2o = cy + outerR * Math.sin(toRad(endAngle));
    const x1i = cx + innerR * Math.cos(toRad(endAngle));
    const y1i = cy + innerR * Math.sin(toRad(endAngle));
    const x2i = cx + innerR * Math.cos(toRad(startAngle));
    const y2i = cy + innerR * Math.sin(toRad(startAngle));
    const large = sweep > 180 ? 1 : 0;
    const color = CATEGORY_COLORS[seg.category] || 'var(--accent)';

    const d = [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 ${large} 1 ${x2o} ${y2o}`,
      `L ${x1i} ${y1i}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${x2i} ${y2i}`,
      'Z',
    ].join(' ');

    return <path key={seg.code} d={d} fill={color} style={{ transition: 'opacity 0.2s' }} />;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text-muted)" style={{ fontFamily: 'var(--font-mono)', fontSize: 7 }}>COMMITTED</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text-primary)" style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700 }}>
          {formatCurrencyShort(totalCommitted)}
        </text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', justifyContent: 'center' }}>
        {segments.map(seg => (
          <div key={seg.code} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: CATEGORY_COLORS[seg.category] || 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-secondary)' }}>{seg.code}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrencyShort(seg.spend)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SVG Helper: Budget Burndown Sparkline ──
function BurndownSparkline({ expenses, totalBudget }) {
  if (!expenses.length || totalBudget <= 0) return null;

  const sorted = [...expenses]
    .filter(e => e.payment_status !== 'Voided')
    .sort((a, b) => new Date(a.expense_date) - new Date(b.expense_date));

  if (sorted.length === 0) return null;

  const points = [{ x: 0, y: totalBudget }];
  let running = totalBudget;
  sorted.forEach((e, i) => {
    running -= Number(e.amount) || 0;
    points.push({ x: i + 1, y: running });
  });

  const w = 120;
  const h = 28;
  const maxX = points.length - 1;
  const maxY = totalBudget;
  const minY = Math.min(0, ...points.map(p => p.y));
  const range = maxY - minY || 1;

  const toSVG = (p) => ({
    sx: maxX > 0 ? (p.x / maxX) * w : w / 2,
    sy: h - ((p.y - minY) / range) * h,
  });

  const svgPoints = points.map(toSVG);
  const polyline = svgPoints.map(p => `${p.sx},${p.sy}`).join(' ');

  const remaining = points[points.length - 1].y;
  const pctRemaining = totalBudget > 0 ? (remaining / totalBudget) * 100 : 0;
  const color = pctRemaining < 10 ? 'var(--status-error)' : pctRemaining < 20 ? 'var(--status-warning)' : 'var(--status-success)';

  // Build fill polygon (area under line)
  const fillPoints = `0,${h} ${polyline} ${w},${h}`;

  return (
    <svg width={w} height={h} style={{ marginTop: 6, display: 'block' }}>
      <polygon points={fillPoints} fill={color} opacity="0.12" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── SVG Helper: Monthly Trend Mini-Chart ──
function MonthlyTrendChart({ expenses }) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('default', { month: 'short' }), total: 0 });
  }

  const active = expenses.filter(e => e.payment_status !== 'Voided');
  active.forEach(e => {
    if (!e.expense_date) return;
    const d = new Date(e.expense_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = months.find(mm => mm.key === key);
    if (m) m.total += Number(e.amount) || 0;
  });

  const maxVal = Math.max(...months.map(m => m.total), 1);
  const w = 220;
  const h = 70;
  const padL = 0;
  const padR = 0;
  const padT = 6;
  const padB = 16;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const pts = months.map((m, i) => ({
    x: padL + (i / (months.length - 1)) * plotW,
    y: padT + plotH - (m.total / maxVal) * plotH,
  }));

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const fillPoly = `${padL},${padT + plotH} ${polyline} ${padL + plotW},${padT + plotH}`;

  return (
    <div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polygon points={fillPoly} fill="var(--accent)" opacity="0.12" />
        <polyline points={polyline} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--accent)" />
        ))}
        {months.map((m, i) => (
          <text key={m.key} x={pts[i].x} y={h - 2} textAnchor="middle" fill="var(--text-muted)" style={{ fontFamily: 'var(--font-mono)', fontSize: 7 }}>
            {m.label}
          </text>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {months.map(m => (
          <span key={m.key} style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-muted)', flex: 1, textAlign: 'center' }}>
            {m.total > 0 ? formatCurrencyShort(m.total) : '--'}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── SVG Helper: Payment Status Circle for table rows ──
function PaymentCircle({ status }) {
  const size = 14;
  const cx = size / 2;
  const cy = size / 2;
  const r = 5;

  if (status === 'Voided') {
    return (
      <svg width={size} height={size} style={{ verticalAlign: 'middle', marginRight: 4 }}>
        <line x1={3} y1={3} x2={size - 3} y2={size - 3} stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={size - 3} y1={3} x2={3} y2={size - 3} stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  }

  const colorMap = { Paid: 'var(--status-success)', 'Pending Approval': 'var(--status-warning)', Unpaid: 'var(--status-error)', Disputed: 'var(--status-error)' };
  const color = colorMap[status] || 'var(--text-muted)';
  const circ = 2 * Math.PI * r;
  const fillRatio = status === 'Paid' ? 1 : status === 'Pending Approval' ? 0.5 : 0;
  const filled = fillRatio * circ;

  return (
    <svg width={size} height={size} style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={`${color}`} strokeWidth={1.5} opacity={0.3} />
      {fillRatio > 0 && (
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={1.5}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
      )}
      {fillRatio === 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.5} />
      )}
    </svg>
  );
}


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
  const [activeKPI, setActiveKPI] = useState(null); // which KPI card is active for filtering
  const [dismissedAlerts, setDismissedAlerts] = useState([]); // dismissed red-flag alert keys

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
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: sovItems = [] } = useQuery({
    queryKey: ['sov-items', activeProject?.id],
    queryFn: () => (activeProject?.id ? base44.entities.SOVItem.filter({ project_id: activeProject.id }) : []),
    enabled: !!activeProject?.id,
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ['work-packages', activeProject?.id],
    queryFn: () => (activeProject?.id ? base44.entities.WorkPackage.filter({ project_id: activeProject.id }) : []),
    enabled: !!activeProject?.id,
  });

  const { data: costCodes = [] } = useQuery({
    queryKey: ['cost-codes', activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.CostCode.filter({ project_id: activeProject.id }, '-created_at')
      : [],
    enabled: !!activeProject?.id,
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
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setModalOpen(false);
      }
      if (deleteTarget?.id === deletedId) {
        setDeleteTarget(null);
      }
      toast.success('Expense deleted');
    },
    onError: () => { toast.error('Failed to delete expense'); },
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      let succeeded = 0, failed = 0;
      for (const id of ids) {
        try { await base44.entities.Expense.update(id, data); succeeded++; } catch { failed++; }
      }
      if (failed > 0) throw new Error(`${failed} of ${ids.length} updates failed`);
      return { succeeded };
    },
    onSuccess: (result, { ids }) => { qc.invalidateQueries({ queryKey: ['expenses'] }); setSelected([]); toast.success(`${result.succeeded} expense(s) updated`); },
    onError: (err) => { qc.invalidateQueries({ queryKey: ['expenses'] }); setSelected([]); toast.error(err.message); },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      let succeeded = 0, failed = 0;
      for (const id of ids) {
        try { await base44.entities.Expense.delete(id); succeeded++; } catch { failed++; }
      }
      if (failed > 0) throw new Error(`${failed} of ${ids.length} deletes failed`);
      return { succeeded };
    },
    onSuccess: (result) => { qc.invalidateQueries({ queryKey: ['expenses'] }); setSelected([]); toast.success(`${result.succeeded} expense(s) deleted`); },
    onError: (err) => { qc.invalidateQueries({ queryKey: ['expenses'] }); setSelected([]); toast.error(err.message); },
  });

  const handleSave = d => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  // ── KPI calculations ──
  const safeNum = (v) => Number(v) || 0;
  const totalBudget = roundCurrency(costCodes.reduce((s, c) => s + safeNum(c.budget_amount), 0));
  const activeExpenses = expenses.filter(e => e.payment_status !== 'Voided');
  const totalCommitted = roundCurrency(activeExpenses.reduce((s, e) => s + safeNum(e.amount), 0));
  const totalPaid = roundCurrency(activeExpenses.filter(e => e.payment_status === 'Paid').reduce((s, e) => s + safeNum(e.amount), 0));
  const paidCount = activeExpenses.filter(e => e.payment_status === 'Paid').length;
  const totalRemaining = roundCurrency(totalBudget - totalCommitted);
  const pctUsed = totalBudget > 0 ? Math.min(100, Math.round((totalCommitted / totalBudget) * 100)) : 0;
  const totalOutstanding = roundCurrency(activeExpenses
    .filter(e => e.payment_status === 'Unpaid' || e.payment_status === 'Pending Approval')
    .reduce((s, e) => s + safeNum(e.amount), 0));

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

  // ── Interactive KPI card click handler ──
  const handleKPIClick = (kpiKey) => {
    if (activeKPI === kpiKey) {
      // Deselect: clear KPI filter
      setActiveKPI(null);
      setStatusFilter('all');
    } else {
      setActiveKPI(kpiKey);
      if (kpiKey === 'paid') {
        setStatusFilter('Paid');
      } else if (kpiKey === 'outstanding') {
        // Outstanding means Unpaid or Pending — we cannot set both in a single select,
        // so we use a special sentinel and handle in filter logic
        setStatusFilter('_outstanding');
      } else if (kpiKey === 'remaining') {
        setStatusFilter('all');
        setActiveKPI('remaining');
      } else {
        setStatusFilter('all');
      }
    }
  };

  const kpiGlowStyle = (key) => activeKPI === key ? {
    boxShadow: '0 0 0 2px rgba(173,198,255,0.3), 0 0 16px rgba(173,198,255,0.15)',
    cursor: 'pointer',
  } : { cursor: 'pointer' };

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

  // ── Filtered list (with KPI-based status filtering) ──
  const filtered = useMemo(() => {
    return expenses.filter(e => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch = !q || e.description?.toLowerCase().includes(q) || e.expense_number?.toLowerCase().includes(q) || e.vendor?.toLowerCase().includes(q);
      const matchCC = costCodeFilter === 'all' || e.cost_code === costCodeFilter;
      const matchType = typeFilter === 'all' || e.expense_type === typeFilter;
      // Handle special '_outstanding' sentinel for KPI Outstanding click
      const matchStatus = statusFilter === 'all'
        ? true
        : statusFilter === '_outstanding'
          ? (e.payment_status === 'Unpaid' || e.payment_status === 'Pending Approval')
          : e.payment_status === statusFilter;
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

  // ── Cost code budget vs actual data ──
  const costCodeBudgetVsActual = useMemo(() => {
    const spendMap = {};
    activeExpenses.forEach(e => {
      if (!e.cost_code) return;
      spendMap[e.cost_code] = (spendMap[e.cost_code] || 0) + safeNum(e.amount);
    });
    // Build from costCodes (which has budget_amount) + COST_CODES for name/category
    const items = [];
    const seen = new Set();
    costCodes.forEach(cc => {
      const code = cc.code || cc.cost_code;
      if (!code || seen.has(code)) return;
      seen.add(code);
      const meta = COST_CODES.find(c => c.code === code) || {};
      const budget = safeNum(cc.budget_amount);
      const actual = spendMap[code] || 0;
      if (budget > 0 || actual > 0) {
        items.push({
          code,
          name: meta.name || cc.name || code,
          category: meta.category || cc.category || 'Misc.',
          budget,
          actual,
          pctUsed: budget > 0 ? Math.round((actual / budget) * 100) : actual > 0 ? 999 : 0,
        });
      }
    });
    // Also include cost codes with spend but no budget record
    Object.entries(spendMap).forEach(([code, actual]) => {
      if (seen.has(code)) return;
      const meta = COST_CODES.find(c => c.code === code) || {};
      items.push({
        code,
        name: meta.name || code,
        category: meta.category || 'Misc.',
        budget: 0,
        actual,
        pctUsed: 999,
      });
    });
    return items.sort((a, b) => b.actual - a.actual);
  }, [activeExpenses, costCodes]);

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

  // ── Red Flag Alerts ──
  const redFlagAlerts = useMemo(() => {
    const alerts = [];
    // Budget overrun
    if (totalCommitted > totalBudget && totalBudget > 0) {
      alerts.push({
        key: 'budget-overrun',
        severity: 'red',
        text: `BUDGET EXCEEDED by ${formatCurrencyShort(totalCommitted - totalBudget)}`,
      });
    }
    // High vendor concentration
    if (topVendors.length > 0 && totalCommitted > 0) {
      const topVendor = topVendors[0];
      const vendorPct = Math.round((topVendor.total / totalCommitted) * 100);
      if (vendorPct > 40) {
        alerts.push({
          key: 'vendor-concentration',
          severity: 'amber',
          text: `VENDOR CONCENTRATION: ${topVendor.vendor} accounts for ${vendorPct}% of spend`,
        });
      }
    }
    // Stale invoices (unpaid >30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const staleCount = activeExpenses.filter(e =>
      (e.payment_status === 'Unpaid' || e.payment_status === 'Pending Approval') &&
      e.expense_date && new Date(e.expense_date) < thirtyDaysAgo
    ).length;
    if (staleCount > 0) {
      alerts.push({
        key: 'stale-invoices',
        severity: 'amber',
        text: `${staleCount} invoice${staleCount > 1 ? 's' : ''} unpaid for 30+ days`,
      });
    }
    return alerts;
  }, [totalCommitted, totalBudget, topVendors, activeExpenses]);

  const visibleAlerts = redFlagAlerts.filter(a => !dismissedAlerts.includes(a.key));

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

      {/* ── KPI Strip (Interactive) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {/* Total Budget */}
        <div
          onClick={() => handleKPIClick('budget')}
          style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px',
            borderTop: '2px solid var(--accent)',
            transition: 'box-shadow 0.2s',
            ...kpiGlowStyle('budget'),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Total Budget</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                {totalBudget >= 10000 ? formatCurrencyShort(totalBudget) : formatCurrency(totalBudget)}
              </div>
            </div>
            <MiniProgressRing ratio={1} size={32} stroke={3} color="var(--accent)" />
          </div>
        </div>

        {/* Committed */}
        <div
          onClick={() => handleKPIClick('committed')}
          style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px',
            borderTop: `2px solid ${pctUsed >= 75 ? 'var(--status-warning)' : 'var(--accent)'}`,
            transition: 'box-shadow 0.2s',
            ...kpiGlowStyle('committed'),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Committed</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: pctUsed >= 90 ? 'var(--status-error)' : 'var(--status-warning)' }}>
                {totalCommitted >= 10000 ? formatCurrencyShort(totalCommitted) : formatCurrency(totalCommitted)}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>{pctUsed}% of budget</div>
            </div>
            <MiniProgressRing ratio={totalBudget > 0 ? totalCommitted / totalBudget : 0} size={32} stroke={3} color={pctUsed >= 90 ? 'var(--status-error)' : 'var(--status-warning)'} />
          </div>
        </div>

        {/* Paid to Date */}
        <div
          onClick={() => handleKPIClick('paid')}
          style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px',
            borderTop: '2px solid var(--status-success)',
            transition: 'box-shadow 0.2s',
            ...kpiGlowStyle('paid'),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Paid to Date</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--status-success)' }}>
                {totalPaid >= 10000 ? formatCurrencyShort(totalPaid) : formatCurrency(totalPaid)}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>{paidCount} invoices</div>
            </div>
            <MiniProgressRing ratio={totalBudget > 0 ? totalPaid / totalBudget : 0} size={32} stroke={3} color="var(--status-success)" />
          </div>
        </div>

        {/* Remaining (with burndown sparkline) */}
        <div
          onClick={() => handleKPIClick('remaining')}
          style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px',
            borderTop: `2px solid ${remainingBorderColor}`,
            transition: 'box-shadow 0.2s',
            ...kpiGlowStyle('remaining'),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Remaining</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: remainingColor }}>
                {Math.max(0, totalRemaining) >= 10000 ? formatCurrencyShort(Math.max(0, totalRemaining)) : formatCurrency(Math.max(0, totalRemaining))}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: totalRemaining < 0 ? 'var(--status-error)' : 'var(--text-muted)', marginTop: 4 }}>
                {totalRemaining < 0 ? `${formatCurrencyShort(Math.abs(totalRemaining))} over budget` : `${100 - pctUsed}% remaining`}
              </div>
            </div>
            <MiniProgressRing ratio={totalBudget > 0 ? Math.max(0, totalRemaining) / totalBudget : 0} size={32} stroke={3} color={remainingColor} />
          </div>
          {/* Budget Burndown Sparkline */}
          <BurndownSparkline expenses={expenses} totalBudget={totalBudget} />
        </div>

        {/* Outstanding */}
        <div
          onClick={() => handleKPIClick('outstanding')}
          style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '16px 20px',
            borderTop: '2px solid var(--status-warning)',
            transition: 'box-shadow 0.2s',
            ...kpiGlowStyle('outstanding'),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Outstanding</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--status-warning)' }}>
                {totalOutstanding >= 10000 ? formatCurrencyShort(totalOutstanding) : formatCurrency(totalOutstanding)}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>Unpaid / Pending</div>
            </div>
            <MiniProgressRing ratio={totalBudget > 0 ? totalOutstanding / totalBudget : 0} size={32} stroke={3} color="var(--status-warning)" />
          </div>
        </div>
      </div>

      {/* ── Analytics Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 20 }}>

        {/* Left Column: Donut Chart + Budget vs Actual */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Budget Donut Chart */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '18px 20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 14 }}>
              SPEND BY COST CODE
            </div>
            <BudgetDonutChart segments={spendByCostCode} totalCommitted={totalCommitted} />
          </div>

          {/* Cost Code Budget vs Actual */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '18px 20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 14 }}>
              COST CODE BUDGET vs ACTUAL
            </div>
            {costCodeBudgetVsActual.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>No cost code data</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {costCodeBudgetVsActual.map(cc => {
                  const maxVal = Math.max(cc.budget, cc.actual, 1);
                  const budgetPct = (cc.budget / maxVal) * 100;
                  const actualPct = (cc.actual / maxVal) * 100;
                  const overBudget = cc.actual > cc.budget && cc.budget > 0;
                  const barColor = CATEGORY_COLORS[cc.category] || 'var(--accent)';
                  return (
                    <div key={cc.code}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: overBudget ? 'var(--status-error)' : 'var(--text-secondary)' }}>
                          {cc.code} — {cc.name}
                        </span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                            color: overBudget ? 'var(--status-error)' : 'var(--text-muted)',
                          }}>
                            {cc.pctUsed > 900 ? 'N/A' : `${cc.pctUsed}%`}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                            {formatCurrencyShort(cc.actual)} / {formatCurrencyShort(cc.budget)}
                          </span>
                        </div>
                      </div>
                      <div style={{ position: 'relative', height: 8, background: 'var(--bg-surface-highest)', borderRadius: 4, overflow: 'hidden' }}>
                        {/* Budget bar (outlined) */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%',
                          width: `${budgetPct}%`,
                          border: `1px solid ${barColor}55`,
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }} />
                        {/* Actual bar (filled) */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%',
                          width: `${actualPct}%`,
                          background: overBudget ? 'var(--status-error)' : barColor,
                          borderRadius: 4,
                          transition: 'width 0.3s ease',
                          opacity: 0.85,
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Payment Status + Top Vendors + Monthly Trend */}
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

          {/* Monthly Trend Mini-Chart */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', padding: '18px 20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
              MONTHLY SPEND TREND
            </div>
            <MonthlyTrendChart expenses={expenses} />
          </div>
        </div>
      </div>

      {/* ── Red Flag Alert Banner ── */}
      {visibleAlerts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {visibleAlerts.map(alert => (
            <div
              key={alert.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 20,
                background: alert.severity === 'red' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                border: `1px solid ${alert.severity === 'red' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                color: alert.severity === 'red' ? 'var(--status-error)' : 'var(--status-warning)',
                letterSpacing: '0.04em',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: alert.severity === 'red' ? 'var(--status-error)' : 'var(--status-warning)', flexShrink: 0 }} />
              {alert.text}
              <button
                onClick={() => setDismissedAlerts(prev => [...prev, alert.key])}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  color: alert.severity === 'red' ? 'var(--status-error)' : 'var(--status-warning)',
                  display: 'flex', alignItems: 'center',
                  opacity: 0.7,
                }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div className="filter-bar-responsive" style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
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
        <select
          value={statusFilter === '_outstanding' ? '_outstanding' : statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setActiveKPI(null); }}
          style={selectStyle}
        >
          <option value="all">All Statuses</option>
          {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="_outstanding">Outstanding (Unpaid+Pending)</option>
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
        {activeKPI && (
          <button
            onClick={() => { setActiveKPI(null); setStatusFilter('all'); }}
            style={{
              ...selectStyle,
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(173,198,255,0.1)',
              border: '1px solid rgba(173,198,255,0.3)',
              color: 'var(--accent-light)',
              padding: '6px 10px',
            }}
          >
            <X size={10} />
            Clear KPI filter
          </button>
        )}
      </div>

      {/* ── Expense Table ── */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-card)', overflow: 'hidden', border: '1px solid var(--divider)' }}>
        <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
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
                <th style={{ ...thStyle, width: 140 }}>Status</th>
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: `${statusColor}18`, border: `1px solid ${statusColor}44`, fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: statusColor, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                          <PaymentCircle status={e.payment_status} />
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
          <button
            onClick={() => {
              if (!bulkUpdateMut.isPending && !bulkDeleteMut.isPending) {
                bulkUpdateMut.mutate({ ids: selected, data: { payment_status: 'Paid' } });
              }
            }}
            disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending}
            style={{
              background: 'var(--success-muted)',
              border: '1px solid var(--success-border)',
              borderRadius: 6,
              padding: '6px 14px',
              color: 'var(--status-success)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? 'not-allowed' : 'pointer',
              letterSpacing: '0.08em',
              opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? 0.6 : 1,
            }}
          >
            MARK PAID
          </button>
          <button
            onClick={() => {
              if (!bulkUpdateMut.isPending && !bulkDeleteMut.isPending) {
                bulkUpdateMut.mutate({ ids: selected, data: { payment_status: 'Voided' } });
              }
            }}
            disabled={bulkUpdateMut.isPending || bulkDeleteMut.isPending}
            style={{
              background: 'var(--warning-muted)',
              border: '1px solid var(--warning-border)',
              borderRadius: 6,
              padding: '6px 14px',
              color: 'var(--status-warning)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              cursor: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? 'not-allowed' : 'pointer',
              letterSpacing: '0.08em',
              opacity: bulkUpdateMut.isPending || bulkDeleteMut.isPending ? 0.6 : 1,
            }}
          >
            MARK VOIDED
          </button>
          <button
            onClick={() => {
              if (!bulkDeleteMut.isPending && !bulkUpdateMut.isPending) {
                bulkDeleteMut.mutate(selected);
              }
            }}
            disabled={bulkDeleteMut.isPending || bulkUpdateMut.isPending}
            style={{
              background: 'var(--danger-muted)',
              border: '1px solid var(--danger-border)',
              borderRadius: 6,
              padding: '6px 14px',
              color: 'var(--danger)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              cursor: bulkDeleteMut.isPending || bulkUpdateMut.isPending ? 'not-allowed' : 'pointer',
              letterSpacing: '0.08em',
              opacity: bulkDeleteMut.isPending || bulkUpdateMut.isPending ? 0.6 : 1,
            }}
          >
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
        isSaving={createMut.isPending || updateMut.isPending}
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
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Expense"
        description={`Delete ${deleteTarget?.expense_number}? This cannot be undone.`}
      />
    </div>
  );
}
