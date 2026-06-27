const STATUS_ORDER = ["Scheduled", "Loading", "In Transit", "Partial", "Delayed", "Rejected", "Delivered"];
const CLOSED_STATUSES = new Set(["delivered", "complete", "completed", "closed", "cancelled", "canceled"]);
const ISSUE_STATUSES = new Set(["partial", "rejected", "delayed"]);
const PHASE_RANK = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };
const DAY_MS = 24 * 60 * 60 * 1000;

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function todayStart(input) {
  const today = input ? dateValue(input) : new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function normalizeStatus(status) {
  const text = String(status || "Scheduled").trim();
  return text || "Scheduled";
}

function isClosedStatus(status) {
  return CLOSED_STATUSES.has(normalizeStatus(status).toLowerCase());
}

function isSameDay(a, b) {
  return Boolean(a && b && a.getTime() === b.getTime());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

function workPackageFabReady(workPackage) {
  if (!workPackage) return true;
  const rank = PHASE_RANK[workPackage.phase] ?? 0;
  if (rank >= PHASE_RANK.Delivery) return true;
  return rank === PHASE_RANK.Fabrication && workPackage.status === "Complete";
}

export function getDeliveryDisplayName(delivery, workPackage) {
  return (
    delivery.delivery_title ||
    delivery.description ||
    delivery.load_number ||
    workPackage?.wp_number ||
    workPackage?.name ||
    delivery.vendor ||
    "Delivery"
  );
}

export function getDeliverySignals(delivery, options = {}) {
  const today = todayStart(options.today);
  const workPackage = options.workPackage || null;
  const status = normalizeStatus(delivery.status);
  const statusKey = status.toLowerCase();
  const scheduledDate = dateValue(delivery.scheduled_date);
  const requiredDate = dateValue(delivery.required_date);
  const actualDate = dateValue(delivery.actual_date);
  const expectedShipDate = dateValue(delivery.expected_ship_date);
  const open = !isClosedStatus(status);
  const daysUntilScheduled = scheduledDate ? daysBetween(today, scheduledDate) : null;
  const daysPastScheduled = scheduledDate ? daysBetween(scheduledDate, today) : null;
  const daysUntilRequired = requiredDate ? daysBetween(today, requiredDate) : null;
  const overdue = Boolean(open && scheduledDate && scheduledDate < today);
  const dueToday = Boolean(open && isSameDay(scheduledDate, today));
  const dueNext7 = Boolean(open && scheduledDate && daysUntilScheduled >= 0 && daysUntilScheduled <= 7);
  const unscheduled = Boolean(open && !scheduledDate);
  const issueStatus = ISSUE_STATUSES.has(statusKey);
  const criticalPriority = String(delivery.priority || "").toLowerCase() === "critical";
  const longLead = Boolean(delivery.is_long_lead || num(delivery.lead_time_weeks) >= 8);
  const fabReady = workPackageFabReady(workPackage);
  const weightTons = num(delivery.weight_tons);
  const capacityLbs = num(delivery.capacity_lbs);
  const capacityUsed = capacityLbs > 0 && weightTons > 0
    ? Math.round((weightTons * 2000 / capacityLbs) * 100)
    : null;
  const missingLogistics =
    ["loading", "in transit"].includes(statusKey) &&
    !String(delivery.carrier || delivery.tracking_number || "").trim();
  const needDateMiss =
    open &&
    ((requiredDate && scheduledDate && scheduledDate > requiredDate) ||
      (requiredDate && requiredDate < today && !actualDate));
  const notes = String(delivery.notes || "").toLowerCase();
  const noteIssue = ["damage", "short", "missing", "rejected", "issue", "problem", "backorder"].some((word) =>
    notes.includes(word)
  );

  const flags = [];
  if (overdue) flags.push({ key: "overdue", label: `${Math.max(1, daysPastScheduled)}d late`, severity: "high" });
  if (statusKey === "rejected") flags.push({ key: "rejected", label: "Rejected", severity: "high" });
  if (statusKey === "delayed") flags.push({ key: "delayed", label: "Delayed", severity: "high" });
  if (!fabReady) flags.push({ key: "fab_not_ready", label: "Fab not complete", severity: "high" });
  if (needDateMiss) flags.push({ key: "need_date", label: "Need date risk", severity: "high" });
  if (criticalPriority) flags.push({ key: "critical", label: "Critical priority", severity: "high" });
  if (statusKey === "partial") flags.push({ key: "partial", label: "Partial delivery", severity: "medium" });
  if (unscheduled) flags.push({ key: "unscheduled", label: "No scheduled date", severity: "medium" });
  if (missingLogistics) flags.push({ key: "logistics", label: "Carrier or tracking missing", severity: "medium" });
  if (delivery.inspection_required && open) flags.push({ key: "inspection", label: "Inspection required", severity: "medium" });
  if (longLead && open) flags.push({ key: "long_lead", label: "Long lead", severity: "medium" });
  if (capacityUsed !== null && capacityUsed > 100) flags.push({ key: "capacity", label: "Over trailer capacity", severity: "high" });
  if (noteIssue && open) flags.push({ key: "note_issue", label: "Issue noted", severity: "medium" });

  const readinessChecks = [
    Boolean(delivery.vendor),
    Boolean(scheduledDate),
    fabReady,
    statusKey === "scheduled" || Boolean(delivery.carrier || delivery.tracking_number),
    Boolean(delivery.receiving_location) || statusKey === "scheduled",
    statusKey !== "rejected",
  ];
  const readinessScore = Math.round(
    (readinessChecks.filter(Boolean).length / readinessChecks.length) * 100
  );
  const high = flags.some((flag) => flag.severity === "high");
  const medium = flags.some((flag) => flag.severity === "medium");

  return {
    status,
    open,
    scheduledDate,
    requiredDate,
    actualDate,
    expectedShipDate,
    daysUntilScheduled,
    daysUntilRequired,
    overdue,
    dueToday,
    dueNext7,
    unscheduled,
    issueStatus,
    longLead,
    fabReady,
    capacityUsed,
    flags,
    risk: high ? "high" : medium ? "medium" : "clear",
    readinessScore,
  };
}

export function buildDeliveryMetrics(deliveries = [], workPackages = [], options = {}) {
  const today = todayStart(options.today);
  const workPackagesById = new Map(workPackages.map((wp) => [String(wp.id), wp]));
  const active = deliveries.filter((delivery) => !delivery?.is_deleted);
  const enriched = active.map((delivery) => {
    const workPackage = delivery.work_package_id
      ? workPackagesById.get(String(delivery.work_package_id))
      : null;
    return {
      ...delivery,
      _workPackage: workPackage,
      _signals: getDeliverySignals(delivery, { today, workPackage }),
    };
  });

  const open = enriched.filter((delivery) => delivery._signals.open);
  const statusRollup = STATUS_ORDER.map((status) => {
    const items = enriched.filter((delivery) => delivery._signals.status === status);
    return {
      status,
      count: items.length,
      tons: items.reduce((sum, delivery) => sum + num(delivery.weight_tons), 0),
    };
  });
  const overdue = open.filter((delivery) => delivery._signals.overdue);
  const dueToday = open.filter((delivery) => delivery._signals.dueToday);
  const dueNext7 = open.filter((delivery) => delivery._signals.dueNext7);
  const unscheduled = open.filter((delivery) => delivery._signals.unscheduled);
  const longLeadOpen = open.filter((delivery) => delivery._signals.longLead);
  const exceptions = open.filter((delivery) => delivery._signals.risk !== "clear");
  const readyToReceive = open.filter((delivery) =>
    ["Loading", "In Transit"].includes(delivery._signals.status) &&
    delivery._signals.readinessScore >= 80 &&
    delivery._signals.risk !== "high"
  );
  const deliveredLast7 = enriched.filter((delivery) => {
    const actual = delivery._signals.actualDate;
    if (!actual) return false;
    const delta = daysBetween(actual, today);
    return delta >= 0 && delta <= 7;
  });
  const nextLoads = [...open]
    .sort(sortDeliveriesForDispatch)
    .filter((delivery) => delivery._signals.scheduledDate || delivery._signals.risk === "high")
    .slice(0, 8);
  const calendarDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    const items = open
      .filter((delivery) => isSameDay(delivery._signals.scheduledDate, date))
      .sort(sortDeliveriesForDispatch);
    return {
      date,
      iso: date.toISOString().split("T")[0],
      label: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      items,
      tons: items.reduce((sum, delivery) => sum + num(delivery.weight_tons), 0),
    };
  });

  return {
    today,
    enriched,
    totalCount: enriched.length,
    openCount: open.length,
    deliveredCount: enriched.length - open.length,
    totalOpenTons: open.reduce((sum, delivery) => sum + num(delivery.weight_tons), 0),
    totalOpenPieces: open.reduce((sum, delivery) => sum + num(delivery.pieces), 0),
    statusRollup,
    overdue,
    dueToday,
    dueNext7,
    unscheduled,
    longLeadOpen,
    exceptions,
    readyToReceive,
    deliveredLast7,
    nextLoads,
    calendarDays,
  };
}

export function sortDeliveriesForDispatch(a, b) {
  const riskRank = { high: 0, medium: 1, clear: 2 };
  const riskDiff = riskRank[a._signals?.risk || "clear"] - riskRank[b._signals?.risk || "clear"];
  if (riskDiff !== 0) return riskDiff;
  const dateA = a._signals?.scheduledDate?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
  const dateB = b._signals?.scheduledDate?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
  if (dateA !== dateB) return dateA - dateB;
  const requiredA = a._signals?.requiredDate?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
  const requiredB = b._signals?.requiredDate?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
  if (requiredA !== requiredB) return requiredA - requiredB;
  return String(a.vendor || a.description || "").localeCompare(String(b.vendor || b.description || ""));
}

export function deliveryLane(delivery) {
  const status = delivery._signals?.status || normalizeStatus(delivery.status);
  if (delivery._signals?.risk === "high" && status !== "Delivered") return "Exceptions";
  if (["Scheduled", "Loading", "In Transit", "Delivered"].includes(status)) return status;
  return "Exceptions";
}

export { STATUS_ORDER };
