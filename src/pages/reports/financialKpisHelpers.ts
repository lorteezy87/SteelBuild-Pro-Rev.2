/**
 * Pure portfolio financial KPI helpers (FinancialKPIs report).
 * Presentation components stay on the page; math lives here.
 */

export type TrafficThresholds = {
  green: [number, number];
  amber: [number, number];
};

export type HealthTone = "good" | "watch" | "risk" | "neutral";

/** thresholds = { green: [lo, hi], amber: [lo, hi] }; outside = risk. */
export function trafficLight(
  value: number | null | undefined,
  thresholds: TrafficThresholds,
): HealthTone {
  if (value == null) return "neutral";
  if (value >= thresholds.green[0] && value <= thresholds.green[1]) return "good";
  if (value >= thresholds.amber[0] && value <= thresholds.amber[1]) return "watch";
  return "risk";
}

export function healthColor(
  health: string | null | undefined,
  healthColors: Record<string, string>,
): string {
  return healthColors[health || ""] || "var(--text-muted)";
}

export type SovLineLike = {
  project_id?: string | null;
  line_item_number?: string | number | null;
  application_number?: string | number | null;
  status?: string | null;
  scheduled_value?: number | string | null;
  current_percent_complete?: number | string | null;
  retainage_percent?: number | string | null;
  payment_received_date?: string | null;
  submitted_date?: string | null;
  [k: string]: unknown;
};

/** latestCertifiedPerLineItem — deduplicate SOV rows (latest Certified/Paid per line). */
export function latestCertifiedPerLineItem<T extends SovLineLike>(sovItems: T[]): T[] {
  const map = new Map<string, T>();
  for (const s of sovItems || []) {
    if (!["Certified", "Paid"].includes(String(s.status || ""))) continue;
    const key = `${s.project_id}::${s.line_item_number}`;
    const existing = map.get(key);
    if (
      !existing ||
      (Number(s.application_number) || 0) > (Number(existing.application_number) || 0)
    ) {
      map.set(key, s);
    }
  }
  return [...map.values()];
}

function lineBilledAmount(l: SovLineLike): number {
  return (
    (Number(l.scheduled_value) || 0) *
    ((Number(l.current_percent_complete) || 0) / 100)
  );
}

export type ProjectLike = {
  id?: string | null;
  name?: string | null;
  project_number?: string | null;
  phase?: string | null;
  health_status?: string | null;
  [k: string]: unknown;
};

export type IdScoped = { project_id?: string | null; [k: string]: unknown };

export type ExpenseLike = IdScoped & {
  payment_status?: string | null;
  amount?: number | string | null;
};

export type ContractValue = {
  original: number;
  revised: number;
  approvedCOTotal: number;
  pendingCOValue: number;
};

export type EvmBundle = {
  cpi: number | null;
  spi: number | null;
  eac: number;
  vac: number;
  bac: number;
  ev: number;
  ac: number;
};

export type ProjectFinancialMetric = {
  id: string | null | undefined;
  name: string;
  number: string;
  phase: string;
  healthStatus: string;
  original: number;
  revised: number;
  approvedCOs: number;
  pendingCOs: number;
  committed: number;
  paid: number;
  billed: number;
  collected: number;
  retention: number;
  unbilled: number;
  arOutstanding: number;
  cpi: number | null;
  spi: number | null;
  eac: number;
  vac: number;
  bac: number;
  ev: number;
  ac: number;
  wpPct: number;
  laborBurnPct: number;
  budgetUsedPct: number;
  budgetHealth: HealthTone;
  cpiHealth: HealthTone;
  billingHealth: HealthTone;
  billingRatio: number | null;
  marginPct: number;
  marginHealth: HealthTone;
  coGrowthPct: number;
  avgDSO: number | null;
  raw: ProjectLike;
};

export function buildProjectFinancialMetrics(input: {
  projects: ProjectLike[];
  workPackages: IdScoped[];
  changeOrders: IdScoped[];
  expenses: ExpenseLike[];
  sovItems: SovLineLike[];
  calcContractValue: (p: ProjectLike, cos: IdScoped[]) => ContractValue;
  calcEVM: (wps: IdScoped[]) => EvmBundle;
  calcWpProgress: (wps: IdScoped[]) => { pct: number };
  calcLaborBurn: (wps: IdScoped[]) => { burnPct: number };
}): ProjectFinancialMetric[] {
  const {
    projects,
    workPackages,
    changeOrders,
    expenses,
    sovItems,
    calcContractValue,
    calcEVM,
    calcWpProgress,
    calcLaborBurn,
  } = input;

  return (projects || []).map((p) => {
    const pWPs = (workPackages || []).filter((w) => w.project_id === p.id);
    const pCOs = (changeOrders || []).filter((c) => c.project_id === p.id);
    const pExp = (expenses || []).filter(
      (e) => e.project_id === p.id && e.payment_status !== "Voided",
    );
    const pSOV = (sovItems || []).filter((s) => s.project_id === p.id);

    const cv = calcContractValue(p, pCOs);
    const evm = calcEVM(pWPs);
    const wp = calcWpProgress(pWPs);
    const labor = calcLaborBurn(pWPs);

    const committed = pExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const paid = pExp
      .filter((e) => e.payment_status === "Paid")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const certLines = latestCertifiedPerLineItem(pSOV);
    const billed = certLines.reduce((s, l) => s + lineBilledAmount(l), 0);
    const collected = certLines
      .filter((l) => l.payment_received_date)
      .reduce((s, l) => s + lineBilledAmount(l), 0);
    const retention = certLines.reduce((s, l) => {
      const toDate = lineBilledAmount(l);
      return s + toDate * ((Number(l.retainage_percent) || 0) / 100);
    }, 0);

    const dsoValues: number[] = [];
    for (const s of pSOV) {
      if (
        s.submitted_date &&
        s.payment_received_date &&
        ["Certified", "Paid"].includes(String(s.status || ""))
      ) {
        const days = Math.ceil(
          (new Date(s.payment_received_date).getTime() -
            new Date(s.submitted_date).getTime()) /
            86400000,
        );
        if (days > 0) dsoValues.push(days);
      }
    }
    const avgDSO =
      dsoValues.length > 0
        ? Math.round(dsoValues.reduce((a, b) => a + b, 0) / dsoValues.length)
        : null;

    const budgetUsedPct = cv.revised > 0 ? (committed / cv.revised) * 100 : 0;
    const budgetHealth = trafficLight(budgetUsedPct, {
      green: [0, 85],
      amber: [85.01, 95],
    });

    const cpiHealth =
      evm.cpi != null
        ? trafficLight(evm.cpi, { green: [0.95, 999], amber: [0.85, 0.9499] })
        : "neutral";

    const billingRatio = committed > 0 ? billed / committed : null;
    const billingHealth =
      billingRatio != null
        ? trafficLight(billingRatio, { green: [0.9, 1.1], amber: [0.75, 0.8999] })
        : "neutral";

    const marginPct =
      cv.revised > 0 ? ((cv.revised - committed) / cv.revised) * 100 : 0;
    const marginHealth = trafficLight(marginPct, {
      green: [15, 999],
      amber: [5, 14.99],
    });

    const coGrowthPct =
      cv.original > 0 ? (cv.approvedCOTotal / cv.original) * 100 : 0;

    return {
      id: p.id,
      name: p.name || "Untitled",
      number: p.project_number || `P-${p.id}`,
      phase: p.phase || "",
      healthStatus: p.health_status || "",
      original: cv.original,
      revised: cv.revised,
      approvedCOs: cv.approvedCOTotal,
      pendingCOs: cv.pendingCOValue,
      committed,
      paid,
      billed,
      collected,
      retention,
      unbilled: Math.max(0, cv.revised - billed),
      arOutstanding: Math.max(0, billed - collected),
      cpi: evm.cpi,
      spi: evm.spi,
      eac: evm.eac,
      vac: evm.vac,
      bac: evm.bac,
      ev: evm.ev,
      ac: evm.ac,
      wpPct: wp.pct,
      laborBurnPct: labor.burnPct,
      budgetUsedPct,
      budgetHealth,
      cpiHealth,
      billingHealth,
      billingRatio,
      marginPct,
      marginHealth,
      coGrowthPct,
      avgDSO,
      raw: p,
    };
  });
}

export function filterFinancialProjectMetrics<T extends { name: string; number: string }>(
  rows: T[],
  search: string,
): T[] {
  if (!(search || "").trim()) return rows;
  const q = search.trim().toLowerCase();
  return (rows || []).filter(
    (r) => r.name.toLowerCase().includes(q) || r.number.toLowerCase().includes(q),
  );
}

export type FinancialAgg = {
  totalRevised: number;
  totalCommitted: number;
  totalBilled: number;
  totalCollected: number;
  totalRetention: number;
  totalUnbilled: number;
  totalAR: number;
  totalBacklog: number;
  portfolioCPI: number | null;
  portfolioSPI: number | null;
  portfolioMargin: number;
  avgDSO: number | null;
};

export function aggregateFinancialKpis(
  filtered: Array<{
    revised: number;
    committed: number;
    billed: number;
    collected: number;
    retention: number;
    unbilled: number;
    arOutstanding: number;
    bac: number;
    ev: number;
    ac: number;
    avgDSO: number | null;
  }>,
): FinancialAgg {
  const rows = filtered || [];
  const totalRevised = rows.reduce((s, r) => s + r.revised, 0);
  const totalCommitted = rows.reduce((s, r) => s + r.committed, 0);
  const totalBilled = rows.reduce((s, r) => s + r.billed, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalRetention = rows.reduce((s, r) => s + r.retention, 0);
  const totalUnbilled = rows.reduce((s, r) => s + r.unbilled, 0);
  const totalAR = rows.reduce((s, r) => s + r.arOutstanding, 0);

  const totalBAC = rows.reduce((s, r) => s + r.bac, 0);
  const totalEV = rows.reduce((s, r) => s + r.ev, 0);
  const totalAC = rows.reduce((s, r) => s + r.ac, 0);
  const portfolioCPI = totalAC > 0 ? totalEV / totalAC : null;
  const portfolioSPI = totalBAC > 0 ? totalEV / totalBAC : null;

  const portfolioMargin =
    totalRevised > 0 ? ((totalRevised - totalCommitted) / totalRevised) * 100 : 0;

  const dsoProjects = rows.filter((r) => r.avgDSO != null);
  const avgDSO =
    dsoProjects.length > 0
      ? Math.round(dsoProjects.reduce((s, r) => s + (r.avgDSO as number), 0) / dsoProjects.length)
      : null;

  const totalBacklog = Math.max(0, totalRevised - totalBilled);

  return {
    totalRevised,
    totalCommitted,
    totalBilled,
    totalCollected,
    totalRetention,
    totalUnbilled,
    totalAR,
    totalBacklog,
    portfolioCPI,
    portfolioSPI,
    portfolioMargin,
    avgDSO,
  };
}

export type FinancialAlert = {
  project: ProjectFinancialMetric;
  type: string;
  msg: string;
  severity: "risk" | "watch";
};

export function buildFinancialAlerts(
  filtered: ProjectFinancialMetric[],
): FinancialAlert[] {
  const items: FinancialAlert[] = [];
  for (const p of filtered || []) {
    if (p.cpi != null && p.cpi < 0.9)
      items.push({ project: p, type: "CPI", msg: `CPI ${p.cpi.toFixed(2)} — over budget`, severity: "risk" });
    else if (p.cpi != null && p.cpi < 0.95)
      items.push({ project: p, type: "CPI", msg: `CPI ${p.cpi.toFixed(2)} — trending over`, severity: "watch" });

    if (p.budgetUsedPct > 95)
      items.push({ project: p, type: "Budget", msg: `${p.budgetUsedPct.toFixed(0)}% budget consumed`, severity: "risk" });
    else if (p.budgetUsedPct > 85)
      items.push({ project: p, type: "Budget", msg: `${p.budgetUsedPct.toFixed(0)}% budget consumed`, severity: "watch" });

    if (p.marginPct < 5 && p.revised > 0)
      items.push({ project: p, type: "Margin", msg: `${p.marginPct.toFixed(1)}% margin — critical`, severity: "risk" });
    else if (p.marginPct < 10 && p.revised > 0)
      items.push({ project: p, type: "Margin", msg: `${p.marginPct.toFixed(1)}% margin — low`, severity: "watch" });

    if (p.avgDSO != null && p.avgDSO > 60)
      items.push({ project: p, type: "DSO", msg: `${p.avgDSO}d avg payment cycle`, severity: "risk" });
    else if (p.avgDSO != null && p.avgDSO > 45)
      items.push({ project: p, type: "DSO", msg: `${p.avgDSO}d avg payment cycle`, severity: "watch" });

    if (p.coGrowthPct > 10 && p.original > 0)
      items.push({ project: p, type: "CO Growth", msg: `${p.coGrowthPct.toFixed(1)}% CO growth`, severity: "risk" });
  }
  return items.sort(
    (a, b) =>
      (a.severity === "risk" ? -1 : 1) - (b.severity === "risk" ? -1 : 1),
  );
}

export function buildEvmScatterData(filtered: ProjectFinancialMetric[]) {
  return (filtered || [])
    .filter((r) => r.cpi != null && r.spi != null)
    .map((r) => ({
      name: r.number,
      fullName: r.name,
      cpi: Number((r.cpi as number).toFixed(2)),
      spi: Number((r.spi as number).toFixed(2)),
      size: Math.max(r.revised / 100000, 4),
      health: r.cpiHealth,
    }));
}

export function buildCashFlowChartData(
  agg: FinancialAgg,
  colors: {
    primary: string;
    info: string;
    success: string;
    warning: string;
    muted: string;
  },
) {
  return [
    { name: "Contract Value", value: agg.totalRevised, fill: colors.primary },
    { name: "Billed", value: agg.totalBilled, fill: colors.info },
    { name: "Collected", value: agg.totalCollected, fill: colors.success },
    { name: "AR Outstanding", value: agg.totalAR, fill: colors.warning },
    { name: "Retention Held", value: agg.totalRetention, fill: colors.muted },
  ];
}

export function buildMarginChartData(filtered: ProjectFinancialMetric[]) {
  return (filtered || [])
    .filter((r) => r.revised > 0)
    .sort((a, b) => a.marginPct - b.marginPct)
    .map((r) => ({
      name: r.number,
      fullName: r.name,
      margin: Number(r.marginPct.toFixed(1)),
      health: r.marginHealth,
    }));
}

export type ArAgingBucket = { name: string; value: number };

/** Outstanding certified AR aging buckets from SOV lines. */
export function buildArAgingBuckets(
  sovItems: SovLineLike[],
  nowMs: number = Date.now(),
): ArAgingBucket[] {
  const buckets: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const s of sovItems || []) {
    if (!s.submitted_date || s.payment_received_date) continue;
    if (!["Certified"].includes(String(s.status || ""))) continue;
    const days = Math.ceil((nowMs - new Date(s.submitted_date).getTime()) / 86400000);
    const amt =
      (Number(s.scheduled_value) || 0) *
      ((Number(s.current_percent_complete) || 0) / 100);
    if (days <= 30) buckets["0-30"] += amt;
    else if (days <= 60) buckets["31-60"] += amt;
    else if (days <= 90) buckets["61-90"] += amt;
    else buckets["90+"] += amt;
  }
  return Object.entries(buckets).map(([name, value]) => ({ name, value }));
}

export function kpiScatterColors(chartTheme: {
  colors: Record<string, string>;
  text: Record<string, string>;
}) {
  return {
    good: chartTheme.colors.success,
    watch: chartTheme.colors.warning,
    risk: chartTheme.colors.error,
    neutral: chartTheme.text.muted,
  };
}

export function kpiBarColors(chartTheme: { colors: Record<string, string> }) {
  return {
    good: chartTheme.colors.success,
    watch: chartTheme.colors.warning,
    risk: chartTheme.colors.error,
  };
}
