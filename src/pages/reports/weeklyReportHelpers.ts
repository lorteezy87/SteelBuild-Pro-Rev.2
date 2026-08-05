/** Shared ISO-week helpers and weekly matrix builders for weekly reports. */

export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function isoWeekStart(yearWeekKey: string): Date {
  const [y, w] = yearWeekKey.split("-W").map(Number);
  const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
  const day = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - day + 1);
  return monday;
}

export function lastNWeekKeys(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i * 7);
    out.push(isoWeekKey(d));
  }
  // De-dup in case of timezone weirdness
  return Array.from(new Set(out));
}

export type WeekMatrix = {
  matrix: Record<string, Record<string, number>>;
  keys: string[];
  weeklyTotals: Record<string, number>;
};

function emptyWeekMatrix(weekKeys: string[]): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  for (const k of weekKeys || []) m[k] = {};
  return m;
}

function finalizeMatrix(
  weekKeys: string[],
  m: Record<string, Record<string, number>>,
  keySet: Set<string>,
): WeekMatrix {
  const keys = Array.from(keySet).sort();
  const weeklyTotals = Object.fromEntries(
    weekKeys.map((k) => [k, keys.reduce((s, c) => s + (m[k][c] || 0), 0)]),
  );
  return { matrix: m, keys, weeklyTotals };
}

export type ExpenseLike = {
  expense_date?: string | null;
  invoice_date?: string | null;
  payment_date?: string | null;
  cost_code_name?: string | null;
  cost_code?: string | null;
  amount?: number | string | null;
  payment_status?: string | null;
};

/** Aggregate matrix[week][category] = spend total. */
export function buildWeeklyCostMatrix(
  expenses: ExpenseLike[],
  weekKeys: string[],
): WeekMatrix & { categories: string[] } {
  const m = emptyWeekMatrix(weekKeys);
  const cats = new Set<string>();
  for (const e of expenses || []) {
    const dateSrc = e.expense_date || e.invoice_date || e.payment_date;
    if (!dateSrc) continue;
    const wk = isoWeekKey(new Date(dateSrc));
    if (!(wk in m)) continue;
    if (e.payment_status === "Voided") continue;
    const cat = e.cost_code_name || e.cost_code || "Uncategorised";
    const amt = Number(e.amount) || 0;
    m[wk][cat] = (m[wk][cat] || 0) + amt;
    cats.add(cat);
  }
  const { matrix, keys, weeklyTotals } = finalizeMatrix(weekKeys, m, cats);
  return { matrix, categories: keys, keys, weeklyTotals };
}

export type ActivityLike = {
  created_at?: string | null;
  timestamp?: string | null;
  event_type?: string | null;
};

/** Aggregate matrix[week][eventType] = event count. */
export function buildWeeklyActivityMatrix(
  activity: ActivityLike[],
  weekKeys: string[],
): WeekMatrix & { eventTypes: string[] } {
  const m = emptyWeekMatrix(weekKeys);
  const types = new Set<string>();
  for (const e of activity || []) {
    const ts = e.created_at || e.timestamp;
    if (!ts) continue;
    const wk = isoWeekKey(new Date(ts));
    if (!(wk in m)) continue;
    const t = e.event_type || "other";
    m[wk][t] = (m[wk][t] || 0) + 1;
    types.add(t);
  }
  const { matrix, keys, weeklyTotals } = finalizeMatrix(weekKeys, m, types);
  return { matrix, eventTypes: keys, keys, weeklyTotals };
}

export function formatWeekLabel(
  yearWeekKey: string,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return isoWeekStart(yearWeekKey).toLocaleDateString("en-US", opts);
}

/** Stable color palette for cost categories (no purple/pink). */
export const CATEGORY_COLORS = [
  "var(--accent)",
  "var(--status-success)",
  "var(--status-warning)",
  "var(--status-info)",
  "var(--status-error)",
  "var(--phase-fab)",
  "var(--phase-detailing)",
  "var(--phase-erection)",
  "var(--phase-closeout)",
  "var(--text-secondary)",
] as const;
