/**
 * PCC Scoring Engine — Deterministic, explainable, steel-specific
 * Every item scored here must have transparent, traceable reasons.
 */

// ─── Severity bands ───────────────────────────────────────────────────────────
export const SEVERITY = {
  CRITICAL: { label: "CRITICAL", value: 4, color: "#FF3B3B", bg: "rgba(255,59,59,0.10)", border: "rgba(255,59,59,0.25)" },
  HIGH:     { label: "HIGH",     value: 3, color: "#FFB400", bg: "rgba(255,180,0,0.10)",  border: "rgba(255,180,0,0.25)" },
  MEDIUM:   { label: "MEDIUM",   value: 2, color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.18)" },
  LOW:      { label: "LOW",      value: 1, color: "#8898A8", bg: "rgba(136,152,168,0.07)", border: "rgba(136,152,168,0.15)" },
};

// ─── Impact tags ──────────────────────────────────────────────────────────────
export const IMPACT_TAGS = {
  BLOCKS_DETAILING:  { label: "BLOCKS DETAILING",  color: "#0EA5E9" },
  BLOCKS_FAB:        { label: "BLOCKS FAB",         color: "#E8650A" },
  BLOCKS_DELIVERY:   { label: "BLOCKS DELIVERY",    color: "#10B981" },
  BLOCKS_ERECTION:   { label: "BLOCKS ERECTION",    color: "#06B6D4" },
  COST_EXPOSURE:     { label: "COST EXPOSURE",       color: "#FFB400" },
  REVISION_CONFLICT: { label: "REVISION CONFLICT",  color: "#FF7A7A" },
  EXTERNAL_WAIT:     { label: "EXTERNAL WAIT",       color: "#8B8B8B" },
  LONG_LEAD:         { label: "LONG LEAD",           color: "#F59E0B" },
  FIELD_COORD:       { label: "FIELD COORD",         color: "#00D68F" },
  SCHEDULE_RISK:     { label: "SCHEDULE RISK",       color: "#FF9F43" },
};

// ─── Recommended next actions by record type / state ─────────────────────────
export function recommendNextAction(item) {
  const { type, status, overdueDays, waitingOnExternal, blocksPhase } = item;

  if (type === "RFI") {
    if (overdueDays > 7) return "ESCALATE";
    if (waitingOnExternal) return "FOLLOW UP";
    if (status === "Open") return "ASSIGN";
    if (status === "Answered") return "CLOSE ITEM";
    return "REVIEW";
  }
  if (type === "Drawing") {
    if (status === "OFA" || status === "BFA") return "SEND TO ENGINEER";
    if (status === "Released" && blocksPhase === "Fabrication") return "RELEASE TO FAB";
    if (overdueDays > 0) return "ESCALATE";
    return "REVIEW";
  }
  if (type === "WorkPackage") {
    if (status === "On Hold") return "RESOLVE BLOCKER";
    if (blocksPhase === "Delivery") return "CONFIRM DELIVERY";
    if (blocksPhase === "Erection") return "COORDINATE WITH GC";
    return "RELEASE TO FAB";
  }
  if (type === "Delivery") {
    if (overdueDays > 0) return "ESCALATE";
    if (waitingOnExternal) return "CONFIRM DELIVERY";
    return "REVIEW";
  }
  if (type === "ChangeOrder") {
    if (status === "Pending") return "PRICE CO";
    if (status === "Submitted") return "FOLLOW UP";
    return "REVIEW";
  }
  return "REVIEW";
}

// ─── Core scoring function ────────────────────────────────────────────────────
export function scoreItem(item) {
  let score = 0;
  const reasons = [];
  const tags = [];

  const today = new Date();
  const overdueDays = item.due_date
    ? Math.max(0, Math.ceil((today - new Date(item.due_date)) / 86400000))
    : 0;
  const dueSoonDays = item.due_date && !overdueDays
    ? Math.ceil((new Date(item.due_date) - today) / 86400000)
    : null;

  // 1. Base score by type priority
  const typeBase = {
    RFI: 30,
    Drawing: 25,
    WorkPackage: 28,
    Delivery: 32,
    ChangeOrder: 20,
  };
  score += typeBase[item.type] || 10;

  // 2. Overdue logic — primary driver
  if (overdueDays > 14) {
    score += 50;
    reasons.push(`${overdueDays}d overdue`);
    tags.push("BLOCKS_FAB");
  } else if (overdueDays > 7) {
    score += 35;
    reasons.push(`${overdueDays}d overdue`);
  } else if (overdueDays > 0) {
    score += 20;
    reasons.push(`${overdueDays}d overdue`);
  }

  // 3. Due soon logic
  if (dueSoonDays !== null) {
    if (dueSoonDays <= 3) {
      score += 18;
      reasons.push(`Due in ${dueSoonDays}d`);
    } else if (dueSoonDays <= 7) {
      score += 10;
      reasons.push(`Due in ${dueSoonDays}d`);
    }
  }

  // 4. RFI-specific scoring
  if (item.type === "RFI") {
    if (item.affects_fabrication) { score += 25; tags.push("BLOCKS_FAB"); reasons.push("Affects fabrication"); }
    if (item.affects_drawings)    { score += 15; tags.push("BLOCKS_DETAILING"); reasons.push("Affects drawings"); }
    if (item.affects_erection)    { score += 20; tags.push("BLOCKS_ERECTION"); reasons.push("Affects erection"); }
    if (item.priority === "Critical" || item.priority === "High") { score += 15; reasons.push("High priority"); }
    if (!item.assigned_to)        { score += 8;  reasons.push("No owner assigned"); }
  }

  // 5. Drawing / Submittal scoring
  if (item.type === "Drawing") {
    if (item.stage === "OFA" || item.stage === "BFA") { score += 10; reasons.push("Pending engineer review"); tags.push("BLOCKS_DETAILING"); }
    if (item.priority_flag) { score += 12; reasons.push("Priority flagged"); }
  }

  // 6. Work package scoring
  if (item.type === "WorkPackage") {
    if (item.status === "On Hold") { score += 20; reasons.push("On hold — blocker"); tags.push("BLOCKS_FAB"); }
    if (item.percent_complete < 20 && overdueDays > 3) { score += 10; reasons.push("Low progress, overdue"); }
    if (item.phase === "Erection" || item.phase === "Installation") { score += 8; tags.push("BLOCKS_ERECTION"); }
  }

  // 7. Delivery scoring
  if (item.type === "Delivery") {
    if (item.status === "Delayed") { score += 30; tags.push("BLOCKS_DELIVERY"); reasons.push("Delivery delayed"); }
    if (item.priority === "Critical") { score += 20; reasons.push("Critical delivery"); }
  }

  // 8. Change order scoring
  if (item.type === "ChangeOrder") {
    const exposure = parseFloat(item.amount) || 0;
    if (exposure > 50000) { score += 20; tags.push("COST_EXPOSURE"); reasons.push(`$${(exposure / 1000).toFixed(0)}k exposure`); }
    else if (exposure > 10000) { score += 10; tags.push("COST_EXPOSURE"); reasons.push(`$${(exposure / 1000).toFixed(0)}k exposure`); }
    if (item.status === "Pending") { score += 12; reasons.push("Unsigned CO"); }
  }

  // 9. External wait penalty — aging
  const externalWait = item.external_wait_days || 0;
  if (externalWait > 14) { score += 20; tags.push("EXTERNAL_WAIT"); reasons.push(`${externalWait}d waiting on external`); }
  else if (externalWait > 7) { score += 10; tags.push("EXTERNAL_WAIT"); reasons.push(`${externalWait}d external wait`); }

  // 10. Determine severity band
  let severityKey = "LOW";
  if (score >= 80)      severityKey = "CRITICAL";
  else if (score >= 55) severityKey = "HIGH";
  else if (score >= 35) severityKey = "MEDIUM";

  const uniqueTags = [...new Set(tags)];
  const uniqueReasons = [...new Set(reasons)].slice(0, 3);

  return {
    ...item,
    score,
    severity: SEVERITY[severityKey],
    severityKey,
    tags: uniqueTags,
    reasons: uniqueReasons,
    overdueDays,
    dueSoonDays,
    nextAction: recommendNextAction({
      type: item.type,
      status: item.status || item.stage,
      overdueDays,
      waitingOnExternal: externalWait > 7,
      blocksPhase: tags.includes("BLOCKS_ERECTION") ? "Erection" : tags.includes("BLOCKS_DELIVERY") ? "Delivery" : null,
    }),
  };
}

// ─── Map raw entity records to normalized PCC items ─────────────────────────
export function mapRFIsToPCCItems(rfis) {
  return rfis
    .filter((r) => r.status !== "Closed" && r.status !== "Void")
    .map((r) => {
      const openedDate = r.created_date || r.date_submitted;
      const externalWait = openedDate
        ? Math.max(0, Math.ceil((Date.now() - new Date(openedDate).getTime()) / 86400000))
        : 0;
      return {
        id: `rfi-${r.id}`,
        entityId: r.id,
        type: "RFI",
        title: r.question || r.subject || `RFI #${r.rfi_number || r.id}`,
        subtitle: `RFI #${r.rfi_number || ""}`,
        status: r.status,
        due_date: r.due_date || r.required_by,
        assigned_to: r.assigned_to || r.ball_in_court,
        waiting_on: r.ball_in_court || r.assigned_to,
        affects_fabrication: r.affects_fabrication || false,
        affects_drawings: r.affects_drawings || false,
        affects_erection: r.affects_erection || false,
        priority: r.priority || r.severity,
        external_wait_days: externalWait,
        project_id: r.project_id,
        project_name: r.project_name,
      };
    });
}

export function mapDrawingsToPCCItems(drawings) {
  return drawings
    .filter((d) => d.stage !== "Released" && d.stage !== "Void")
    .map((d) => ({
      id: `dwg-${d.id}`,
      entityId: d.id,
      type: "Drawing",
      title: `${d.sheet_number || ""} ${d.title || ""}`.trim() || "Untitled Drawing",
      subtitle: d.drawing_set_name || "Ungrouped",
      status: d.stage,
      due_date: d.due_date,
      stage: d.stage,
      priority_flag: d.priority_flag || false,
      assigned_to: d.reviewer,
      waiting_on: d.reviewer,
      project_id: d.project_id,
      project_name: d.project_name,
    }));
}

export function mapWorkPackagesToPCCItems(wps) {
  return wps
    .filter((w) => w.status !== "Complete" && w.status !== "Cancelled")
    .map((w) => ({
      id: `wp-${w.id}`,
      entityId: w.id,
      type: "WorkPackage",
      title: w.name || `WP #${w.id}`,
      subtitle: w.phase || "",
      status: w.status,
      due_date: w.released_date,
      percent_complete: w.percent_complete || 0,
      phase: w.phase,
      assigned_to: w.assigned_to,
      waiting_on: null,
      project_id: w.project_id,
      project_name: w.project_name,
    }));
}

export function mapDeliveriesToPCCItems(deliveries) {
  return deliveries
    .filter((d) => d.status !== "Delivered" && d.status !== "Cancelled")
    .map((d) => ({
      id: `del-${d.id}`,
      entityId: d.id,
      type: "Delivery",
      title: d.description || `DEL-${d.delivery_id || d.id}`,
      subtitle: `Delivery`,
      status: d.status,
      due_date: d.scheduled_date,
      priority: d.priority,
      assigned_to: d.contact_name,
      waiting_on: d.vendor || d.supplier,
      project_id: d.project_id,
      project_name: d.project_name,
    }));
}

export function mapChangeOrdersToPCCItems(cos) {
  return cos
    .filter((c) => c.status !== "Approved" && c.status !== "Rejected" && c.status !== "Void")
    .map((c) => ({
      id: `co-${c.id}`,
      entityId: c.id,
      type: "ChangeOrder",
      title: c.title || c.description || `CO #${c.change_order_number || c.id}`,
      subtitle: `Change Order`,
      status: c.status,
      due_date: c.due_date || c.required_by,
      amount: c.amount || c.estimated_cost || 0,
      assigned_to: c.assigned_to,
      waiting_on: c.owner || c.gc_name,
      project_id: c.project_id,
      project_name: c.project_name,
    }));
}

// ─── Build scored + sorted priority feed ─────────────────────────────────────
export function buildPriorityFeed(allItems) {
  return allItems
    .map(scoreItem)
    .sort((a, b) => b.score - a.score);
}

// ─── Build signal card KPIs from scored feed ──────────────────────────────────
export function buildSignalKPIs(scoredItems, allDeliveries) {
  const critical   = scoredItems.filter((i) => i.severityKey === "CRITICAL").length;
  const highRisk   = scoredItems.filter((i) => i.severityKey === "HIGH").length;
  const external   = scoredItems.filter((i) => i.tags.includes("EXTERNAL_WAIT")).length;
  const overdueAll = scoredItems.filter((i) => i.overdueDays > 0).length;
  const blocksFab  = scoredItems.filter((i) => i.tags.includes("BLOCKS_FAB")).length;
  const blocksErec = scoredItems.filter((i) => i.tags.includes("BLOCKS_ERECTION")).length;
  const coExposure = scoredItems
    .filter((i) => i.type === "ChangeOrder")
    .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  return { critical, highRisk, external, overdueAll, blocksFab, blocksErec, coExposure };
}

// ─── Build waiting-on board ───────────────────────────────────────────────────
export function buildWaitingOnBoard(scoredItems) {
  const external = scoredItems.filter((i) => i.tags.includes("EXTERNAL_WAIT") || i.external_wait_days > 3);
  const grouped = {};
  external.forEach((item) => {
    const party = item.waiting_on || "Unknown";
    if (!grouped[party]) grouped[party] = [];
    grouped[party].push(item);
  });
  return Object.entries(grouped)
    .map(([party, items]) => ({ party, items, count: items.length, maxScore: items.length > 0 ? Math.max(...items.map((i) => i.score)) : 0 }))
    .sort((a, b) => b.maxScore - a.maxScore);
}
