/**
 * rivetBriefEngine - the Rivet schedule-brief analysis engine, extracted
 * verbatim from ScheduleRivetBrief.jsx (behavior-preserving). buildBrief is
 * the public entry the component calls in a useMemo; phaseSpecificFix /
 * buildAtRiskEntry / buildScheduleAiNarrative are its internal stages. Pure
 * (no React) - takes the tasks array, returns the brief view-model.
 */
import { computeEffectiveDates } from "@/services/scheduleCascade";
import { PHASES } from "@/utils/phases";
import { formatDateShort } from "@/components/shared/formatters";
import { formatLocalDate } from "@/utils/dates";
import {
  isOpenTask, isWorkTask, taskOwner, daysFromToday, taskName, phaseOf,
  dependencyIds, dependencyCount, isCriticalTask, progressValue, taskDate,
  formatBriefTask, formatAnalysisDate, shiftedByDays,
} from "@/components/schedule/rivetBriefHelpers";

/** Phase-aware fix suggestions for steel construction workflows */
function phaseSpecificFix(task, context) {
  const phase = phaseOf(task).toLowerCase();
  const owner = taskOwner(task);
  const ownerNote = owner ? ` (${owner})` : "";

  if (context === "start_delay") {
    switch (phase) {
      case "detailing":
        return `Check if the modeling team${ownerNote} has the approved-for-detailing drawings and connection design. Confirm modeling hours are allocated and the detailer has current revision docs.`;
      case "fabrication":
        return `Verify that shop drawings are approved and material is procured${ownerNote}. Check if the fab shop has open capacity and the steel release package is complete.`;
      case "delivery":
        return `Confirm PO status and vendor lead times${ownerNote}. Check whether trucking is scheduled, and verify the site has a clear laydown area with crane access for unloading.`;
      case "erection":
        return `Verify crew availability and crane schedule${ownerNote}. Confirm anchor bolt surveys are done, base plates are set, and the erection sequence drawing is issued.`;
      default:
        return `Confirm the root cause with the responsible party${ownerNote}, and either mobilize the work or re-baseline the start/finish dates.`;
    }
  }

  if (context === "overdue") {
    switch (phase) {
      case "detailing":
        return `Check if the model is complete but approvals are pending${ownerNote}. Verify submittal status in the approval log — a stalled GC review can silently block this.`;
      case "fabrication":
        return `Confirm shop floor status${ownerNote} — is this piece welded, blasted, painted, or waiting on material? Update % complete or push the finish date and flag the delay to the field PM.`;
      case "delivery":
        return `Verify shipping status with the vendor${ownerNote}. If material shipped, confirm receipt and update to complete. If not, get a revised ETA and notify the erection crew.`;
      case "erection":
        return `Check field status${ownerNote} — is this piece set, bolted, or waiting on connections? If work is done, mark complete. If blocked, identify the hold (weather, crane, access) and communicate to the PM.`;
      default:
        return `Update the status if the work is done, or reset the finish date and notify downstream task owners${ownerNote}.`;
    }
  }

  return `Review owner, dates, dependencies, and current field/shop status${ownerNote} before publishing the schedule.`;
}

function buildAtRiskEntry(task, effectiveDates) {
  const name = taskName(task);
  const startLag = daysFromToday(task?.start_date);
  const finishLag = daysFromToday(task?.end_date);
  const effective = effectiveDates[task?.id];
  const shiftDays = shiftedByDays(effective);
  const criticalLabel = isCriticalTask(task) ? "critical-path " : "";
  const phase = phaseOf(task);

  const statusLower = String(task?.status || "").toLowerCase();
  if (startLag != null && startLag < 0 && progressValue(task) === 0 && !statusLower.includes("in progress") && !statusLower.includes("active") && !statusLower.includes("complete")) {
    const lateDays = Math.abs(startLag);
    return {
      task,
      label: name,
      why: `This ${criticalLabel}${phase} task was scheduled to start on ${formatDateShort(task.start_date)} but has not begun, creating a ${lateDays}-day start delay${lateDays > 7 ? " that is likely cascading to downstream work" : ""}.`,
      fix: phaseSpecificFix(task, "start_delay"),
    };
  }

  if (finishLag != null && finishLag < 0 && String(task?.status || "").toLowerCase() !== "complete") {
    const lateDays = Math.abs(finishLag);
    return {
      task,
      label: name,
      why: `This ${criticalLabel}${phase} task was due on ${formatDateShort(task.end_date)} and is now ${lateDays} day${lateDays === 1 ? "" : "s"} past due${isCriticalTask(task) ? ", directly impacting the critical path" : ""}.`,
      fix: phaseSpecificFix(task, "overdue"),
    };
  }

  if (shiftDays > 0) {
    return {
      task,
      label: name,
      why: `Dependency logic is pushing this ${phase} task ${shiftDays} day${shiftDays === 1 ? "" : "s"} later than its stored dates${isCriticalTask(task) ? " — this shift is on the critical path" : ""}.`,
      fix: `Review the predecessor chain for '${name}' and verify whether the upstream ${phase.toLowerCase()} work has actually slipped or if the link/lag needs to be corrected. ${shiftDays > 5 ? "A shift this large usually means a predecessor finish date was not updated after the work completed." : ""}`,
    };
  }

  if (!task?.start_date || !task?.end_date) {
    return {
      task,
      label: name,
      why: `This ${phase} task is missing ${!task?.start_date && !task?.end_date ? "both start and finish dates" : !task?.start_date ? "a start date" : "a finish date"}, so it cannot drive downstream planning.`,
      fix: `Work with the ${phase.toLowerCase()} lead to define the work window. ${phase === "Detailing" ? "Check when the detailer can begin and how many modeling hours are needed." : phase === "Fabrication" ? "Confirm material lead time and shop capacity to set realistic dates." : phase === "Delivery" ? "Get vendor-committed ship dates and trucking lead times." : phase === "Erection" ? "Check crane availability and crew schedule to set erection windows." : "Define scope and duration based on the responsible team's capacity."}`,
    };
  }

  return {
    task,
    label: name,
    why: `This ${criticalLabel}${phase} task carries schedule risk based on its current status, dates, and dependency position.`,
    fix: phaseSpecificFix(task, "general"),
  };
}

function buildScheduleAiNarrative({
  riskScore,
  openTasks,
  delayed,
  tbd,
  overdue,
  critical,
  stalled,
  shiftedTasks,
  effectiveDates,
  logicGaps,
  unassignedTasks,
}) {
  const atRiskTasks = [
    ...stalled.filter(isCriticalTask),
    ...overdue.filter(isCriticalTask),
    ...delayed.filter(isCriticalTask),
    ...shiftedTasks.filter(isCriticalTask),
    ...stalled,
    ...overdue,
    ...delayed,
    ...shiftedTasks,
    ...tbd,
  ];
  const seen = new Set();
  const atRisk = atRiskTasks
    .filter((task) => {
      const key = task?.id || taskName(task);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4)
    .map((task) => buildAtRiskEntry(task, effectiveDates));

  const maxCriticalStartDelay = critical.reduce((max, task) => {
    const startLag = daysFromToday(task?.start_date);
    return startLag != null && startLag < 0 && progressValue(task) === 0
      ? Math.max(max, Math.abs(startLag))
      : max;
  }, 0);
  const maxFinishDelay = overdue.reduce((max, task) => {
    const finishLag = daysFromToday(task?.end_date);
    return finishLag != null && finishLag < 0 ? Math.max(max, Math.abs(finishLag)) : max;
  }, 0);
  const maxCascadeDelay = shiftedTasks.reduce((max, task) => Math.max(max, shiftedByDays(effectiveDates[task.id])), 0);
  const forecastDelayDays = Math.max(maxCriticalStartDelay, maxFinishDelay, maxCascadeDelay);

  const riskLevel = riskScore >= 70 || (critical.length > 0 && (stalled.length > 0 || overdue.length > 0))
    ? "HIGH"
    : riskScore >= 35
      ? "MEDIUM"
      : "LOW";

  const undefinedPct = openTasks.length ? Math.round((tbd.length / openTasks.length) * 100) : 0;
  const primaryAtRisk = atRisk[0];
  const hasPrimaryDelay = Boolean(primaryAtRisk && forecastDelayDays > 0);

  // Count issues by phase for narrative context
  const phaseIssues = {};
  [...delayed, ...overdue, ...stalled].forEach(t => {
    const p = phaseOf(t);
    phaseIssues[p] = (phaseIssues[p] || 0) + 1;
  });
  const topIssuePhases = Object.entries(phaseIssues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([phase, count]) => `${phase} (${count})`);
  const phaseContext = topIssuePhases.length ? ` Issue concentration: ${topIssuePhases.join(", ")}.` : "";

  const summary = riskLevel === "HIGH"
    ? `High schedule risk — ${delayed.length + overdue.length + stalled.length} tasks are delayed, overdue, or stalled across ${openTasks.length} open items.${primaryAtRisk ? ` '${primaryAtRisk.label}' is the primary pressure point.` : ""}${phaseContext} ${forecastDelayDays > 0 ? `Current forecast shows +${forecastDelayDays}d pressure on the critical path.` : ""} ${tbd.length ? `${undefinedPct}% of open tasks still have TBD dates, limiting downstream planning reliability.` : "Verify the critical path and publish recovery dates."}`
    : riskLevel === "MEDIUM"
      ? `Moderate schedule risk across ${openTasks.length} open tasks.${primaryAtRisk ? ` '${primaryAtRisk.label}' needs attention first.` : ""}${phaseContext} ${forecastDelayDays > 0 ? `Forecast pressure: +${forecastDelayDays}d.` : ""} Clean up dates, owners, and dependency logic before the lookahead hardens.`
      : `Low schedule risk across ${openTasks.length} open tasks.${phaseContext} ${tbd.length ? `${tbd.length} TBD-date task${tbd.length === 1 ? "" : "s"} should be resolved proactively.` : "Keep the lookahead clean by confirming dates, owners, and dependency links before they become blockers."}`;

  const blockers = [
    primaryAtRisk && hasPrimaryDelay ? `The '${primaryAtRisk.label}' task is the primary schedule blocker right now.` : null,
    tbd.length ? `${tbd.length} open task${tbd.length === 1 ? "" : "s"} still have TBD dates, blocking a complete forecast.` : null,
    logicGaps.length ? `${logicGaps.length} open task${logicGaps.length === 1 ? "" : "s"} have missing predecessor or successor logic.` : null,
    unassignedTasks.length ? `${unassignedTasks.length} open task${unassignedTasks.length === 1 ? "" : "s"} have no owner assigned.` : null,
  ].filter(Boolean).slice(0, 4);

  const sequenceSuggestions = [
    primaryAtRisk ? `Resolve or re-baseline '${primaryAtRisk.label}' (${phaseOf(primaryAtRisk.task)}) — ${primaryAtRisk.why.split(".")[0].toLowerCase()}.` : null,
    tbd.length ? `Define dates for the ${tbd.length} TBD task${tbd.length === 1 ? "" : "s"} (${undefinedPct}% of open work). Prioritize any that gate detailing starts or fabrication releases.` : null,
    logicGaps.length ? `Tighten predecessor/successor links on ${logicGaps.length} task${logicGaps.length === 1 ? "" : "s"} so critical-path movement surfaces before work slips.` : null,
    forecastDelayDays > 0 ? `Communicate the +${forecastDelayDays}d forecast pressure to the PM and affected ${[...new Set([...delayed, ...overdue].map(t => phaseOf(t).toLowerCase()))].join(", ") || "project"} teams.` : null,
    unassignedTasks.length ? `Assign owners to ${unassignedTasks.length} open task${unassignedTasks.length === 1 ? "" : "s"} before the next coordination meeting — these cannot be tracked on the lookahead without accountability.` : null,
  ].filter(Boolean).slice(0, 4);

  return {
    riskLevel,
    riskScore,
    forecastDelayDays,
    summary,
    atRisk,
    blockers,
    sequenceSuggestions,
    modelLabel: "schedule-risk-v1",
    analyzedAt: formatAnalysisDate(),
  };
}

export function buildBrief(tasks) {
  const effectiveDates = computeEffectiveDates(tasks);
  const parentIds = new Set(tasks.map((task) => task?.parent_task_id).filter(Boolean));

  const openTasks = [];
  const delayed = [];
  const tbd = [];
  const critical = [];
  const overdue = [];
  const stalled = [];
  const nearTermEntries = [];
  const startsSoonEntries = [];
  const dueSoonEntries = [];
  const activeNowEntries = [];
  const unassignedAll = [];
  const shiftedAll = [];
  const criticalEntries = [];
  const depCountById = {};
  const successorCountById = {};
  const phaseStats = Object.fromEntries(
    PHASES.map((phase) => [phase, { phase, open: 0, delayed: 0, overdue: 0, tbd: 0, critical: 0 }])
  );
  let totalShiftDays = 0;

  for (const task of tasks) {
    if (!isOpenTask(task)) continue;
    const actionable = isWorkTask(task, parentIds);
    const deps = dependencyIds(task);
    depCountById[String(task.id)] = deps.length;
    deps.forEach((predId) => {
      const key = String(predId);
      successorCountById[key] = (successorCountById[key] || 0) + 1;
    });

    if (!actionable) continue;

    openTasks.push(task);

    const phaseStatsRow = phaseStats[phaseOf(task)];
    if (phaseStatsRow) phaseStatsRow.open += 1;

    const status = String(task.status || "").toLowerCase();
    const startDays = daysFromToday(task.start_date);
    const endDays = daysFromToday(task.end_date);
    const dateDays = daysFromToday(task.start_date || task.end_date);

    if (status.includes("delay")) {
      delayed.push(task);
      if (phaseStatsRow) phaseStatsRow.delayed += 1;
    }
    if (!task.start_date || !task.end_date) {
      tbd.push(task);
      if (phaseStatsRow) phaseStatsRow.tbd += 1;
    }
    if (isCriticalTask(task)) {
      critical.push(task);
      criticalEntries.push({ task, days: daysFromToday(taskDate(task)) });
      if (phaseStatsRow) phaseStatsRow.critical += 1;
    }
    if (endDays != null && endDays < 0) {
      overdue.push(task);
      if (phaseStatsRow) phaseStatsRow.overdue += 1;
    }
    if (startDays != null && startDays < 0 && progressValue(task) === 0 && !status.includes("complete") && !status.includes("in progress") && !status.includes("active")) {
      stalled.push(task);
    }
    if (dateDays != null && dateDays >= 0 && dateDays <= 42) {
      nearTermEntries.push({ task, days: dateDays });
    }
    if (startDays != null && startDays >= 0 && startDays <= 14) {
      startsSoonEntries.push({ task, days: startDays });
    }
    if (endDays != null && endDays >= 0 && endDays <= 14) {
      dueSoonEntries.push({ task, days: endDays });
    }
    if (startDays != null && endDays != null && startDays <= 0 && endDays >= 0) {
      activeNowEntries.push({ task, days: endDays });
    }
    if (!taskOwner(task)) {
      unassignedAll.push(task);
    }

    const effective = effectiveDates[task.id];
    const shiftedBy = shiftedByDays(effective);
    totalShiftDays += shiftedBy;
    if (effective?.shifted) shiftedAll.push(task);
  }

  const nearTerm = nearTermEntries
    .sort((a, b) => a.days - b.days)
    .slice(0, 6)
    .map((entry) => entry.task);
  const startsSoon = startsSoonEntries
    .sort((a, b) => a.days - b.days)
    .slice(0, 5)
    .map((entry) => entry.task);
  const dueSoon = dueSoonEntries
    .sort((a, b) => a.days - b.days)
    .slice(0, 5)
    .map((entry) => entry.task);
  const activeNow = activeNowEntries
    .sort((a, b) => a.days - b.days)
    .slice(0, 5)
    .map((entry) => entry.task);
  const handoffCount = new Set([...startsSoon, ...dueSoon, ...activeNow].map((task) => task.id || taskName(task))).size;
  const unassignedTasks = unassignedAll.slice(0, 8);
  const shiftedTasks = shiftedAll
    .sort((a, b) => shiftedByDays(effectiveDates[b.id]) - shiftedByDays(effectiveDates[a.id]))
    .slice(0, 8);
  const logicGaps = [];
  const unlinked = [];
  for (const task of openTasks) {
    const predecessorCount = depCountById[String(task.id)] || 0;
    const successorCount = successorCountById[String(task.id)] || 0;
    if ((predecessorCount === 0 || successorCount === 0) && logicGaps.length < 8) {
      logicGaps.push(task);
    }
    if (predecessorCount === 0 && !task.parent_task_id) {
      unlinked.push(task);
    }
  }
  const nextCritical = criticalEntries
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))
    .slice(0, 5)
    .map((entry) => entry.task);

  const phaseRows = Object.values(phaseStats)
    .filter((row) => row.open > 0 || row.delayed > 0 || row.overdue > 0 || row.tbd > 0)
    .sort((a, b) => (b.delayed * 5 + b.overdue * 4 + b.critical * 3 + b.tbd) - (a.delayed * 5 + a.overdue * 4 + a.critical * 3 + a.tbd))
    .slice(0, 4);

  // Helper: summarize which phases are affected in each recovery bucket
  const phaseBreakdown = (taskList) => {
    const counts = {};
    taskList.forEach(t => { const p = phaseOf(t); counts[p] = (counts[p] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1] - a[1]).map(([p, c]) => `${c} ${p}`).join(", ");
  };

  const recoveryActions = [
    overdue.length ? {
      key: "overdue",
      title: "Clean up overdue finish dates",
      detail: `${overdue.length} open task${overdue.length === 1 ? "" : "s"} past due (${phaseBreakdown(overdue)}). The worst is '${taskName(overdue[0])}' at ${Math.abs(daysFromToday(overdue[0].end_date))}d late. Confirm actual completion status or push dates and notify downstream teams before the next coordination meeting.`,
      filter: "overdue",
      tone: "var(--status-error)",
    } : null,
    critical.length ? {
      key: "critical",
      title: "Walk the critical path",
      detail: `${critical.length} critical-path task${critical.length === 1 ? "" : "s"} (${phaseBreakdown(critical)}). Start with '${taskName(nextCritical[0] || critical[0])}' and verify its predecessor chain — a slip here directly pushes the project completion date.`,
      filter: "critical",
      tone: "var(--status-warning)",
    } : null,
    stalled.length ? {
      key: "stalled",
      title: "Resolve stalled starts",
      detail: `${stalled.length} task${stalled.length === 1 ? "" : "s"} with past start dates and 0% progress (${phaseBreakdown(stalled)}). Check '${taskName(stalled[0])}' first — is work blocked by a submittal, material, or crew issue, or does the status just need updating?`,
      filter: "stalled",
      tone: "var(--status-warning)",
    } : null,
    handoffCount ? {
      key: "lookahead",
      title: "Review the 14-day handoff",
      detail: `${handoffCount} task${handoffCount === 1 ? "" : "s"} in the two-week lookahead window. ${startsSoonEntries.length ? `${startsSoonEntries.length} starting` : ""}${startsSoonEntries.length && dueSoonEntries.length ? ", " : ""}${dueSoonEntries.length ? `${dueSoonEntries.length} finishing` : ""}${activeNowEntries.length ? `, ${activeNowEntries.length} active now` : ""}. Confirm crews, material releases, and blockers before the weekly coordination meeting.`,
      filter: "lookahead",
      tone: "var(--status-info)",
    } : null,
    shiftedAll.length ? {
      key: "shifted",
      title: "Review cascade variance",
      detail: `${shiftedAll.length} task${shiftedAll.length === 1 ? "" : "s"} drifted from stored dates by predecessor cascade (${totalShiftDays} total shift-days). Worst: '${taskName(shiftedTasks[0])}' shifted +${shiftedByDays(effectiveDates[shiftedTasks[0]?.id])}d. Decide whether to re-baseline stored dates or fix the dependency logic.`,
      filter: "shifted",
      tone: "var(--status-warning)",
    } : null,
    unassignedAll.length ? {
      key: "unassigned",
      title: "Assign owners to open work",
      detail: `${unassignedAll.length} open task${unassignedAll.length === 1 ? "" : "s"} have no owner (${phaseBreakdown(unassignedAll)}). Unowned tasks drift silently — assign a detailer, fab lead, or field foreman before relying on the lookahead.`,
      filter: "unassigned",
      tone: "var(--status-error)",
    } : null,
    logicGaps.length ? {
      key: "logic",
      title: "Tighten schedule logic",
      detail: `${logicGaps.length} task${logicGaps.length === 1 ? "" : "s"} missing predecessor or successor links (${phaseBreakdown(logicGaps)}). Add links where work gates on drawing approval, steel release, fab completion, or delivery receipt.`,
      filter: "logic",
      tone: "var(--status-warning)",
    } : null,
    tbd.length ? {
      key: "tbd",
      title: "Convert TBD dates",
      detail: `${tbd.length} task${tbd.length === 1 ? "" : "s"} still need dates (${Math.round(tbd.length / Math.max(openTasks.length, 1) * 100)}% of open work). Focus on tasks gating ${phaseBreakdown(tbd)} — downstream teams cannot plan without upstream commitments.`,
      filter: "tbd",
      tone: "var(--status-info)",
    } : null,
    unlinked.length ? {
      key: "unlinked",
      title: "Add missing logic links",
      detail: `${unlinked.length} root-level task${unlinked.length === 1 ? "" : "s"} with no predecessor/successor logic. Add links where work depends on detailing approvals, steel release packages, fab/delivery gates, or erection sequences.`,
      filter: "unlinked",
      tone: "var(--text-secondary)",
    } : null,
  ].filter(Boolean).slice(0, 4);

  // Risk score normalized by project size — a 200-task project with 3 delayed
  // items should not score as high as a 15-task project with 3 delayed items.
  const taskCount = Math.max(openTasks.length, 1);
  const rawScore =
    delayed.length * 16
    + overdue.length * 12
    + critical.length * 7
    + stalled.length * 6
    + tbd.length * 5
    + Math.min(20, shiftedTasks.length * 4)
    + Math.min(18, unassignedAll.length * 3)
    + Math.min(18, logicGaps.length * 3)
    + Math.min(20, unlinked.length * 2);
  // For small schedules (≤20 tasks) use the raw score directly.
  // For larger ones, dampen: a 100-task project needs proportionally more
  // issues to hit the same score as a 20-task one.
  const sizeNorm = taskCount <= 20 ? 1 : 20 / Math.sqrt(20 * taskCount);
  const riskScore = Math.min(100, Math.round(rawScore * sizeNorm));

  const morningPlan = [
    recoveryActions[0] ? `1. ${recoveryActions[0].title}: ${recoveryActions[0].detail}` : null,
    nextCritical[0] ? `2. Critical path check: confirm status of '${taskName(nextCritical[0])}' (${phaseOf(nextCritical[0])} / ${nextCritical[0]?.status || "No status"}) — this is the nearest critical-path gate.` : null,
    startsSoon[0] ? `3. Start handoff: verify '${taskName(startsSoon[0])}' (${phaseOf(startsSoon[0])}) is ready to begin — check ${phaseOf(startsSoon[0]) === "Detailing" ? "modeling capacity and approved-for-detailing docs" : phaseOf(startsSoon[0]) === "Fabrication" ? "material procurement and shop drawing approvals" : phaseOf(startsSoon[0]) === "Delivery" ? "PO status and trucking schedule" : phaseOf(startsSoon[0]) === "Erection" ? "crew and crane availability" : "resources and predecessor status"}.` : null,
    dueSoon[0] ? `4. Finish handoff: confirm closeout path for '${taskName(dueSoon[0])}' (${phaseOf(dueSoon[0])}) — due ${formatDateShort(dueSoon[0].end_date)}.` : null,
    shiftedTasks.length ? `5. Variance review: ${shiftedTasks.length} task${shiftedTasks.length === 1 ? "" : "s"} shifted by predecessor cascade (${totalShiftDays} total days). Worst: '${taskName(shiftedTasks[0])}' +${shiftedByDays(effectiveDates[shiftedTasks[0]?.id])}d.` : null,
    unassignedAll.length ? `6. Ownership cleanup: assign owners to ${unassignedAll.length} open task${unassignedAll.length === 1 ? "" : "s"} — unowned work drifts silently.` : null,
    logicGaps.length ? `7. Logic cleanup: ${logicGaps.length} task${logicGaps.length === 1 ? "" : "s"} missing predecessor or successor links. Add logic where work gates on approvals, releases, or deliveries.` : null,
  ].filter(Boolean);

  const aiNarrative = buildScheduleAiNarrative({
    riskScore,
    openTasks,
    delayed,
    tbd,
    overdue,
    critical,
    stalled,
    shiftedTasks,
    effectiveDates,
    logicGaps,
    unassignedTasks,
  });

  const clipboardText = [
    `Rivet Schedule Brief - ${formatLocalDate()}`,
    `Project: ${tasks[0]?.project_name || "Selected Project"}`,
    `Pressure: ${riskScore}%`,
    `Risk: ${aiNarrative.riskLevel}`,
    `Forecast Pressure: +${aiNarrative.forecastDelayDays}d`,
    aiNarrative.summary,
    `Open: ${openTasks.length}`,
    `Delayed: ${delayed.length}`,
    `Overdue: ${overdue.length}`,
    `Critical: ${critical.length}`,
    `TBD Dates: ${tbd.length}`,
    `14-Day Handoff: ${handoffCount}`,
    `Cascade Variance: ${shiftedTasks.length} tasks / ${totalShiftDays} total days`,
    `Unassigned Open Work: ${unassignedTasks.length}`,
    `Logic Gaps: ${logicGaps.length}`,
    "",
    "Recommended morning plan:",
    ...(morningPlan.length ? morningPlan : ["No recovery action is currently recommended."]),
    "",
    "14-day handoff - starting:",
    ...(startsSoon.length ? startsSoon.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open tasks start in the next 14 days."]),
    "",
    "14-day handoff - due:",
    ...(dueSoon.length ? dueSoon.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open tasks finish in the next 14 days."]),
    "",
    "14-day handoff - active now:",
    ...(activeNow.length ? activeNow.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open tasks are currently spanning today."]),
    "",
    "Dependency logic gaps:",
    ...(logicGaps.length ? logicGaps.map((task, index) => `${index + 1}. ${formatBriefTask(task)} - pred ${dependencyCount(task)}, succ ${successorCountById[String(task.id)] || 0}`) : ["No open dependency logic gaps found."]),
    "",
    "Cascade variance:",
    ...(shiftedTasks.length ? shiftedTasks.map((task, index) => {
      const effective = effectiveDates[task.id];
      return `${index + 1}. ${formatBriefTask(task)} - stored ${formatDateShort(task.start_date)} to ${formatDateShort(task.end_date)}, effective ${formatDateShort(effective.start)} to ${formatDateShort(effective.end)}, +${shiftedByDays(effective)}d`;
    }) : ["No dependency cascade variance found."]),
    "",
    "Unassigned open work:",
    ...(unassignedTasks.length ? unassignedTasks.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No unassigned open work found."]),
    "",
    "Upcoming critical path watch:",
    ...(nextCritical.length ? nextCritical.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open critical path tasks are marked."]),
  ].join("\n");

  return { openTasks, delayed, tbd, overdue, critical, stalled, nearTerm, startsSoon, dueSoon, activeNow, handoffCount, unassignedTasks, shiftedTasks, effectiveDates, totalShiftDays, logicGaps, successorCountById, unlinked, nextCritical, phaseRows, recoveryActions, morningPlan, clipboardText, riskScore, aiNarrative };
}
