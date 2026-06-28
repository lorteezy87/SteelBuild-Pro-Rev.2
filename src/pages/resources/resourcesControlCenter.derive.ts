/**
 * Pure derivations for the Resources Control Center (command_ui redesign).
 * No React, no network. Operates on the same data ResourceManagement.jsx
 * loads: `resources` rows filtered by project_id, cross-referenced with
 * `work_packages` (via work_packages.crew text-match to resource.name).
 *
 * Real DB columns (resources table):
 *   id, name, resource_type, role, availability, capacity (hours budget),
 *   cost_rate, unit, notes, metadata (JSONB), project_id, parent_resource_id
 *
 * Availability values in use: "Available", "Partially Available",
 * "Committed", "Allocated", "Over-Allocated", "On Leave", "Unavailable"
 *
 * Utilization %: derived from capacity vs. assigned WP field_hours_budget.
 * There is NO resource_assignments table — the text cross-ref (WP.crew ↔
 * resource.name) is the live approach in ResourceManagement.jsx.
 */

export interface ResourceRecord {
  id: string;
  name: string | null;
  resource_type: string | null;
  role: string | null;
  availability: string | null;
  capacity: number | null;
  cost_rate: number | null;
  unit: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  project_id: string;
  parent_resource_id: string | null;
  [key: string]: unknown;
}

export interface WorkPackageRecord {
  id: string;
  crew: string | null;
  field_hours_budget: number | null;
  field_hours_actual: number | null;
  name: string | null;
  phase: string | null;
  [key: string]: unknown;
}

/** Labor-type resource_type values (mirrors ResourceManagement stats). */
const LABOR_TYPES = new Set(["Person", "Crew", "Labor"]);
/** Equipment-type resource_type values. */
const EQUIPMENT_TYPES = new Set(["Equipment", "Bay"]);

/** Field from the DB; fallback mirrors ResourceManagement.getStatus(). */
export function getAvailability(r: ResourceRecord): string {
  return r.availability || "Available";
}

export interface TradeRow {
  trade: string;
  /** Number of resources with this role. */
  count: number;
  /** Number available (availability = "Available" or "Partially Available"). */
  available: number;
  /** Derived utilization 0–100. */
  utilizationPct: number;
}

export interface EquipmentRow {
  id: string;
  name: string;
  type: string;
  availability: string;
  /** Matched WP name, if any. */
  assignedTo: string | null;
}

export interface ConflictRow {
  id: string;
  name: string;
  type: string;
  /** The real DB value driving this conflict. */
  availability: string;
  /** Assigned WP name (crew text-match). */
  assignedTo: string | null;
}

export interface ResourcesSummary {
  // KPIs
  totalResources: number;
  laborPool: number;       // Person + Crew + Labor
  equipmentCount: number;  // Equipment + Bay
  overAllocated: number;   // availability = "Over-Allocated"
  /** Rough utilization %: allocated+over-allocated / total (excludes Material/Sub). */
  utilizationPct: number;

  // Decision panels
  laborByTrade: TradeRow[];
  equipmentStatus: EquipmentRow[];
  conflicts: ConflictRow[];

  // Tone helpers
  overAllocTone: "danger" | "neutral";
  utilizationTone: "good" | "warn" | "danger" | "neutral";
}

/** Build a name→WP text lookup from work_packages.crew (mirrors ResourceManagement). */
function buildCrewWpMap(workPackages: WorkPackageRecord[]): Map<string, WorkPackageRecord[]> {
  const map = new Map<string, WorkPackageRecord[]>();
  for (const wp of workPackages) {
    const key = (wp.crew || "").trim().toLowerCase();
    if (!key) continue;
    const bucket = map.get(key);
    if (bucket) bucket.push(wp);
    else map.set(key, [wp]);
  }
  return map;
}

function resourceKey(r: ResourceRecord): string {
  return (r.name || "").trim().toLowerCase();
}

function pct(a: number, b: number): number {
  if (!b) return 0;
  return Math.min(100, Math.round((a / b) * 100));
}

export function buildResourcesSummary(
  resources: ResourceRecord[],
  workPackages: WorkPackageRecord[] = [],
): ResourcesSummary {
  const wpByCrewName = buildCrewWpMap(workPackages);

  const laborResources = resources.filter((r) => LABOR_TYPES.has(r.resource_type || ""));
  const equipmentResources = resources.filter((r) => EQUIPMENT_TYPES.has(r.resource_type || ""));
  const overAllocList = resources.filter((r) => getAvailability(r) === "Over-Allocated");

  // --- Utilization: allocated+over / total non-material resources ---
  const countable = resources.filter(
    (r) => r.resource_type !== "Material" && r.resource_type !== "Subcontractor",
  );
  const activeCount = countable.filter((r) => {
    const av = getAvailability(r);
    return av === "Allocated" || av === "Over-Allocated" || av === "Committed";
  }).length;
  const utilizationPct = pct(activeCount, countable.length);

  // --- Labor by Trade: group by role ---
  const roleGroups = new Map<string, ResourceRecord[]>();
  for (const r of laborResources) {
    const trade = r.role || "Unknown";
    const bucket = roleGroups.get(trade);
    if (bucket) bucket.push(r);
    else roleGroups.set(trade, [r]);
  }
  const laborByTrade: TradeRow[] = [];
  for (const [trade, members] of roleGroups) {
    const availableCount = members.filter((r) => {
      const av = getAvailability(r);
      return av === "Available" || av === "Partially Available";
    }).length;
    // Utilization for trade: members that are allocated/committed/over
    const tradeActive = members.filter((r) => {
      const av = getAvailability(r);
      return av === "Allocated" || av === "Over-Allocated" || av === "Committed";
    }).length;
    laborByTrade.push({
      trade,
      count: members.length,
      available: availableCount,
      utilizationPct: pct(tradeActive, members.length),
    });
  }
  laborByTrade.sort((a, b) => b.count - a.count);

  // --- Equipment Status ---
  const equipmentStatus: EquipmentRow[] = equipmentResources.slice(0, 8).map((r) => {
    const wps = wpByCrewName.get(resourceKey(r)) || [];
    return {
      id: r.id,
      name: r.name || "Unnamed",
      type: r.resource_type || "Equipment",
      availability: getAvailability(r),
      assignedTo: wps.length > 0 ? (wps[0].name || null) : null,
    };
  });

  // --- Conflicts: resources marked Over-Allocated ---
  // This is the real authoritative conflict signal in the DB (set by users or
  // ResourceFormModal). No resource_assignments table exists.
  const conflicts: ConflictRow[] = overAllocList.map((r) => {
    const wps = wpByCrewName.get(resourceKey(r)) || [];
    return {
      id: r.id,
      name: r.name || "Unnamed",
      type: r.resource_type || "Resource",
      availability: getAvailability(r),
      assignedTo: wps.length > 0 ? (wps[0].name || null) : null,
    };
  });

  // --- Tones ---
  const overAllocTone: "danger" | "neutral" = overAllocList.length > 0 ? "danger" : "neutral";
  let utilizationTone: "good" | "warn" | "danger" | "neutral" = "neutral";
  if (utilizationPct >= 90) utilizationTone = "danger";
  else if (utilizationPct >= 70) utilizationTone = "warn";
  else if (utilizationPct > 0) utilizationTone = "good";

  return {
    totalResources: resources.length,
    laborPool: laborResources.length,
    equipmentCount: equipmentResources.length,
    overAllocated: overAllocList.length,
    utilizationPct,
    laborByTrade,
    equipmentStatus,
    conflicts,
    overAllocTone,
    utilizationTone,
  };
}
