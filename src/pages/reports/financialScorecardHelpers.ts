/**
 * Pure helpers for Financial Scorecard (project-scoped).
 */
import { latestCertifiedPerLineItem, type SovLineLike } from "./financialKpisHelpers";

export type GradeResult = { health: string; label: string };

export function gradeScore(
  value: number | null | undefined,
  thresholds: { green: [number, number]; amber: [number, number] },
): GradeResult {
  if (value == null) return { health: "neutral", label: "N/A" };
  if (value >= thresholds.green[0] && value <= thresholds.green[1])
    return { health: "good", label: "Good" };
  if (value >= thresholds.amber[0] && value <= thresholds.amber[1])
    return { health: "watch", label: "Watch" };
  return { health: "risk", label: "At Risk" };
}

/** Lower is better (e.g. DSO, budget %). */
export function gradeInverseScore(
  value: number | null | undefined,
  thresholds: { green: number; amber: number },
): GradeResult {
  if (value == null) return { health: "neutral", label: "N/A" };
  if (value <= thresholds.green) return { health: "good", label: "Good" };
  if (value <= thresholds.amber) return { health: "watch", label: "Watch" };
  return { health: "risk", label: "At Risk" };
}

export type ScorecardKpis = {
  cpi: number | null;
  spi: number | null;
  eac: number;
  bac: number;
  vac: number;
  tcpi: number | null | undefined;
  ev: number;
  ac: number;
  budgetUsedPct: number | null;
  costVariance: number | null;
  costVariancePct: number | null;
  committedVsBudget: number | null;
  totalBudget: number;
  committed: number;
  paid: number;
  billingRatio: number | null;
  avgDSO: number | null;
  retainagePct: number | null;
  billed: number;
  collected: number;
  retention: number;
  marginPct: number | null;
  projectedMargin: number | null;
  coGrowthPct: number | null;
  original: number;
  revised: number;
  approvedCOs: number;
  pendingCOs: number;
  pendingCOCount: number;
  riskExposure: number;
  laborBurnPct: number;
  wpPct: number;
};

function lineBilled(l: SovLineLike): number {
  return (
    (Number(l.scheduled_value) || 0) *
    ((Number(l.current_percent_complete) || 0) / 100)
  );
}

export function buildScorecardKpis(input: {
  project: Record<string, unknown> | null | undefined;
  workPackages: unknown[];
  expenses: Array<{ payment_status?: string | null; amount?: number | string | null }>;
  changeOrders: unknown[];
  sovItems: SovLineLike[];
  costCodes: unknown[];
  rfis: unknown[];
  deliveries: unknown[];
  inspections: unknown[];
  scheduleTasks: unknown[];
  calcContractValue: (p: any, cos: any[]) => {
    original: number;
    revised: number;
    approvedCOTotal: number;
    pendingCOValue: number;
    pendingCOCount: number;
  };
  calcEVM: (wps: any[]) => {
    cpi: number | null;
    spi: number | null;
    eac: number;
    bac: number;
    vac: number;
    tcpi?: number | null;
    ev: number;
    ac: number;
  };
  calcWpProgress: (wps: any[]) => { pct: number };
  calcLaborBurn: (wps: any[]) => { burnPct: number };
  computeCostCodeTotals: (codes: any[]) => { budget: number };
  calculateMarginRisk: (input: any) => { totalExposure?: number };
}): ScorecardKpis | null {
  const {
    project,
    workPackages,
    expenses,
    changeOrders,
    sovItems,
    costCodes,
    rfis,
    deliveries,
    inspections,
    scheduleTasks,
    calcContractValue,
    calcEVM,
    calcWpProgress,
    calcLaborBurn,
    computeCostCodeTotals,
    calculateMarginRisk,
  } = input;

  if (!project) return null;

  const validExpenses = (expenses || []).filter((e) => e.payment_status !== "Voided");
  const cv = calcContractValue(project, changeOrders as any[]);
  const evm = calcEVM(workPackages as any[]);
  const wp = calcWpProgress(workPackages as any[]);
  const labor = calcLaborBurn(workPackages as any[]);

  const totalBudget = computeCostCodeTotals(costCodes as any[]).budget;
  const committed = validExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const paid = validExpenses
    .filter((e) => e.payment_status === "Paid")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const budgetUsedPct = cv.revised > 0 ? (committed / cv.revised) * 100 : null;
  const costVariance = totalBudget > 0 ? totalBudget - committed : null;
  const costVariancePct =
    totalBudget > 0 ? ((totalBudget - committed) / totalBudget) * 100 : null;
  const committedVsBudget = totalBudget > 0 ? committed / totalBudget : null;

  const certLines = latestCertifiedPerLineItem(sovItems || []);
  const billed = certLines.reduce((s, l) => s + lineBilled(l), 0);
  const collected = certLines
    .filter((l) => l.payment_received_date)
    .reduce((s, l) => s + lineBilled(l), 0);
  const retention = certLines.reduce((s, l) => {
    return s + lineBilled(l) * ((Number(l.retainage_percent) || 0) / 100);
  }, 0);
  const billingRatio = committed > 0 ? billed / committed : null;
  const retainagePct = billed > 0 ? (retention / billed) * 100 : null;

  const dsoValues: number[] = [];
  for (const s of sovItems || []) {
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

  const marginPct =
    cv.revised > 0 ? ((cv.revised - committed) / cv.revised) * 100 : null;
  const projectedMargin =
    cv.revised > 0 && evm.eac > 0
      ? ((cv.revised - evm.eac) / cv.revised) * 100
      : marginPct;
  const coGrowthPct =
    cv.original > 0 ? (cv.approvedCOTotal / cv.original) * 100 : null;

  let riskExposure = 0;
  try {
    const riskResult = calculateMarginRisk({
      rfis,
      submittals: [],
      workPackages,
      deliveries,
      inspections,
      scheduleTasks,
      changeOrders,
    });
    riskExposure = riskResult.totalExposure || 0;
  } catch {
    riskExposure = 0;
  }

  return {
    cpi: evm.cpi,
    spi: evm.spi,
    eac: evm.eac,
    bac: evm.bac,
    vac: evm.vac,
    tcpi: evm.tcpi,
    ev: evm.ev,
    ac: evm.ac,
    budgetUsedPct,
    costVariance,
    costVariancePct,
    committedVsBudget,
    totalBudget,
    committed,
    paid,
    billingRatio,
    avgDSO,
    retainagePct,
    billed,
    collected,
    retention,
    marginPct,
    projectedMargin,
    coGrowthPct,
    original: cv.original,
    revised: cv.revised,
    approvedCOs: cv.approvedCOTotal,
    pendingCOs: cv.pendingCOValue,
    pendingCOCount: cv.pendingCOCount,
    riskExposure,
    laborBurnPct: labor.burnPct,
    wpPct: wp.pct,
  };
}

export type OverallScore = {
  pct: number;
  label: string;
  health: string;
};

export function computeOverallScorecardScore(
  kpis: ScorecardKpis | null | undefined,
): OverallScore | null {
  if (!kpis) return null;
  let score = 0;
  let count = 0;
  const check = (value: number | null | undefined, green: number, amber: number) => {
    if (value == null) return;
    count++;
    if (value >= green) score += 3;
    else if (value >= amber) score += 2;
    else score += 1;
  };
  const checkInv = (value: number | null | undefined, green: number, amber: number) => {
    if (value == null) return;
    count++;
    if (value <= green) score += 3;
    else if (value <= amber) score += 2;
    else score += 1;
  };
  check(kpis.cpi, 0.95, 0.85);
  check(kpis.spi, 0.95, 0.85);
  check(kpis.marginPct, 15, 5);
  check(kpis.billingRatio, 0.9, 0.75);
  checkInv(kpis.budgetUsedPct, 85, 95);
  checkInv(kpis.avgDSO, 30, 45);
  checkInv(kpis.coGrowthPct, 5, 10);
  checkInv(kpis.laborBurnPct, 100, 110);

  if (count === 0) return null;
  const pct = (score / (count * 3)) * 100;
  return {
    pct: Math.round(pct),
    label: pct >= 80 ? "Strong" : pct >= 60 ? "Moderate" : "Weak",
    health: pct >= 80 ? "good" : pct >= 60 ? "watch" : "risk",
  };
}
