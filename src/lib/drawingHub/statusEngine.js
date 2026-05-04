/**
 * drawingHub/statusEngine.js — Pure status / heatmap / readiness rules
 * plus the Supabase-persisting wrappers around them.
 *
 * Extracted from src/lib/drawingHub.js. Everything here was already
 * there; logic + Supabase calls are byte-identical. The helpers
 * (predicates, _hydratedToArray, _daysUntil, etc.) move with the
 * engine because every consumer of those helpers also lives here.
 */

import { supabase } from "@/lib/supabase";

// ────────────────────────────────────────────────────────────────────
// Status rule engine (V1.5)
//
// Pure function: takes a zone's active links + the hydrated source
// records and returns {status, reason, drivers}. No I/O, no queries,
// easy to unit test and reuse from anywhere (viewer overlay, portfolio
// heatmap later, etc.).
//
// Priority order (per spec): red > amber > purple > blue > green >
// neutral. The first matching bucket wins — we DON'T sum severities;
// one blocker is enough to make the zone red.
//
// "Drivers" is an ordered list of short strings explaining WHY a
// given status triggered. The ZonePanel surfaces these verbatim so
// the user can see "RFI-012 overdue 3 days" next to the red chip
// instead of just a bare color.
// ────────────────────────────────────────────────────────────────────

const STATUS_THRESHOLDS = {
  RFI_DUE_SOON_DAYS:       3,
  DELIVERY_DUE_SOON_DAYS:  2,
  AI_WARN_CONFIDENCE:      0.80,
};

// Match whatever set of status strings your existing RFI / WP /
// Inspection / Delivery models use. Stay permissive — string comparison
// is case-insensitive so "In Progress" and "in progress" both count.
const IS_RFI_RESOLVED  = (s) => /^(answered|closed|void)$/i.test(s || "");
const IS_DEL_DONE      = (s) => /^(delivered|received|complete)$/i.test(s || "");
const IS_INSP_FAILED   = (s) => /^(failed|blocked|rejected)$/i.test(s || "");
const IS_INSP_INPROG   = (s) => /^(in progress|started|ongoing)$/i.test(s || "");
const IS_WP_BLOCKED    = (s) => /^(blocked|on hold|on-hold)$/i.test(s || "");
const IS_WP_WAITING    = (s) => /^(waiting|pending approval|pending release|submitted)$/i.test(s || "");
const IS_WP_ACTIVE     = (s) => /^(active|in progress|fabrication|erection|installation|fabricating|erecting|installing)$/i.test(s || "");
const IS_DEL_TRANSIT   = (s) => /^(in transit|dispatched|en route)$/i.test(s || "");
const IS_DEL_SCHED     = (s) => /^(scheduled|planned|pending)$/i.test(s || "");
const IS_DEL_EXCEPTION = (s) => /^(late|delayed|exception|rejected)$/i.test(s || "");

function _daysUntil(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ms = d.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

function _shortNum(record) {
  return (
    record?.rfi_number ||
    record?.wp_number ||
    record?.delivery_number ||
    record?.co_number ||
    record?.inspection_number ||
    record?.document_number ||
    null
  );
}

/**
 * Compute status + drivers for a single zone given its hydrated link
 * records. `hydrated` is the same shape hydrateLinks() returns —
 * Map<linkId, {link, record}> OR an array of those entries.
 *
 * Treats links with is_confirmed=false as advisory (shown in UI but
 * excluded from the engine), so AI suggestions can't spook the status
 * until a human confirms them.
 */
export function computeZoneStatus(hydrated, { today = new Date(), thresholds = STATUS_THRESHOLDS } = {}) {
  const items = _hydratedToArray(hydrated).filter(
    (x) => x.link && (x.link.is_confirmed === undefined || x.link.is_confirmed === true) && !x.link.removed_at,
  );

  if (items.length === 0) {
    return { status: "neutral", drivers: [], reason: "No confirmed links yet." };
  }

  const drivers = { red: [], amber: [], purple: [], blue: [] };

  for (const { link, record } of items) {
    if (!record) continue; // orphaned link — ignored here, surfaced separately in UI
    const role = link.link_role;
    const type = link.linked_record_type;
    const status = String(record.status || "").trim();
    const num = _shortNum(record);
    const label = num ? `${type.toUpperCase()} ${num}` : type.toUpperCase();

    // Explicit "blocks" role always wins → red.
    if (role === "blocks") {
      drivers.red.push(`${label} flagged as blocker`);
      continue;
    }

    switch (type) {
      case "rfi": {
        if (IS_RFI_RESOLVED(status)) break;
        const due = _daysUntil(record.date_required, new Date(today));
        if (due !== null && due < 0) {
          drivers.red.push(`${label} overdue ${Math.abs(due)}d`);
        } else if (due !== null && due <= thresholds.RFI_DUE_SOON_DAYS) {
          drivers.amber.push(due === 0 ? `${label} due today` : `${label} due in ${due}d`);
        }
        break;
      }
      case "inspection": {
        if (IS_INSP_FAILED(status) && !record.resolved_at) {
          drivers.red.push(`${label} ${status.toLowerCase()}`);
        } else if (IS_INSP_INPROG(status)) {
          drivers.blue.push(`${label} in progress`);
        }
        break;
      }
      case "work_package": {
        if (IS_WP_BLOCKED(status)) drivers.red.push(`${label} ${status.toLowerCase()}`);
        else if (IS_WP_WAITING(status)) drivers.amber.push(`${label} ${status.toLowerCase()}`);
        else if (IS_WP_ACTIVE(status)) drivers.blue.push(`${label} ${status.toLowerCase()}`);
        break;
      }
      case "delivery": {
        if (IS_DEL_DONE(status)) break;
        if (IS_DEL_EXCEPTION(status)) {
          // Only escalate to red when the link role explicitly gates the zone.
          const gates = role === "delivers_to" || link.metadata?.required_for_zone === true;
          if (gates) drivers.red.push(`${label} ${status.toLowerCase()}`);
          else drivers.amber.push(`${label} ${status.toLowerCase()}`);
          break;
        }
        const sch = _daysUntil(record.scheduled_date, new Date(today));
        if (sch !== null && sch <= thresholds.DELIVERY_DUE_SOON_DAYS) {
          drivers.amber.push(sch === 0 ? `${label} arrives today` : `${label} arrives in ${sch}d`);
        } else if (IS_DEL_TRANSIT(status) || IS_DEL_SCHED(status)) {
          drivers.blue.push(`${label} ${status.toLowerCase() || "scheduled"}`);
        }
        break;
      }
      case "ai_insight": {
        if (record.resolved_at) break;
        const severity = record.severity || "info";
        const conf = Number(record.confidence_score || 0);
        if (severity === "warning" && conf >= thresholds.AI_WARN_CONFIDENCE) {
          drivers.amber.push(`${label} warning (${Math.round(conf * 100)}% confidence)`);
        }
        break;
      }
      case "change_order": {
        // COs don't block a zone on their own; just surface activity.
        const open = !/^(approved|rejected|void)$/i.test(status);
        if (open) drivers.blue.push(`${label} ${status.toLowerCase() || "open"}`);
        break;
      }
      default:
        // Photos / documents / daily logs count as activity but don't
        // drive color on their own.
        break;
    }
  }

  // Purple: zone's been revised. Surfaced via link metadata or zone
  // flags — left as a hook for V2; today the engine only infers it
  // from explicit `revision_impact: true` metadata on any link.
  for (const { link } of items) {
    if (link.metadata?.revision_impact === true) {
      drivers.purple.push("Revision impact on linked record");
    }
  }

  // Priority resolution — pick the highest-priority bucket that has
  // at least one driver.
  const order = ["red", "amber", "purple", "blue"];
  for (const bucket of order) {
    if (drivers[bucket].length > 0) {
      return {
        status: bucket,
        drivers: drivers[bucket].slice(0, 5),
        reason: drivers[bucket][0],
      };
    }
  }
  // Some activity exists but nothing urgent → green.
  return {
    status: "green",
    drivers: [`${items.length} linked record${items.length !== 1 ? "s" : ""}, nothing urgent`],
    reason: "Clear",
  };
}

function _hydratedToArray(h) {
  if (!h) return [];
  if (h instanceof Map) return Array.from(h.values());
  if (Array.isArray(h)) return h;
  return [];
}

// ── Heatmap density (V2) ─────────────────────────────────────────────
//
// Each zone also carries a "density" score — a weighted sum of the
// unresolved issues attached to it. The heatmap toggle on the Drawing
// Viewer recolors every zone by this score instead of by status, so
// a PM can see at a glance which part of the sheet is swallowing the
// most coordination load.
//
// Weights reflect how painful each kind of issue usually is on a
// steel project:
//   overdue RFI            5   (waiting on info → blocks everything)
//   failed inspection      4   (cannot proceed until resolved)
//   blocked work package   4
//   late delivery          3
//   open RFI (in-window)   2
//   pending delivery       1
//   active WP              1
//   any other link         0.25 (photos, logs — adds texture, not pain)
//
// The numbers are intentionally small integers rather than floats so
// the resulting density value is easy to reason about in the debugger.
// Returns 0 for a zone with no links — the heatmap renders those as
// fully transparent (cool).
const HEATMAP_WEIGHTS = {
  rfiOverdue:     5,
  inspFailed:     4,
  wpBlocked:      4,
  delLate:        3,
  rfiOpen:        2,
  delPending:     1,
  wpActive:       1,
  otherActivity:  0.25,
};

export function computeZoneDensity(hydrated) {
  const items = _hydratedToArray(hydrated).filter(
    (x) => x.link && (x.link.is_confirmed === undefined || x.link.is_confirmed === true) && !x.link.removed_at,
  );
  let score = 0;
  for (const { link, record } of items) {
    if (!record) continue;
    const status = String(record.status || "").trim();
    switch (link.linked_record_type) {
      case "rfi": {
        if (IS_RFI_RESOLVED(status)) break;
        const due = _daysUntil(record.date_required, new Date());
        if (due !== null && due < 0) score += HEATMAP_WEIGHTS.rfiOverdue;
        else score += HEATMAP_WEIGHTS.rfiOpen;
        break;
      }
      case "inspection": {
        if (IS_INSP_FAILED(status) && !record.resolved_at) score += HEATMAP_WEIGHTS.inspFailed;
        else score += HEATMAP_WEIGHTS.otherActivity;
        break;
      }
      case "work_package": {
        if (IS_WP_BLOCKED(status)) score += HEATMAP_WEIGHTS.wpBlocked;
        else if (IS_WP_ACTIVE(status)) score += HEATMAP_WEIGHTS.wpActive;
        else score += HEATMAP_WEIGHTS.otherActivity;
        break;
      }
      case "delivery": {
        if (IS_DEL_DONE(status)) break;
        if (IS_DEL_EXCEPTION(status)) score += HEATMAP_WEIGHTS.delLate;
        else score += HEATMAP_WEIGHTS.delPending;
        break;
      }
      default:
        score += HEATMAP_WEIGHTS.otherActivity;
        break;
    }
  }
  return score;
}

// ── Readiness scoring (V2) ───────────────────────────────────────────
//
// Each zone carries three companion scores — Fabrication, Delivery,
// Erection — that answer "can we proceed here?" rather than "is
// something on fire?" (which is what computeZoneStatus covers).
// Scores are 0–100 percentages. A score of null means "no data" —
// the UI shows a dash instead of a misleading 0% or 100%.
//
// Rules are deterministic and mirror the rule-engine drivers so the
// reasons the UI surfaces stay consistent across status chips and
// readiness gauges.
//
// Fabrication: driven by linked drawings reaching "Released" stage +
//              linked work packages in fab phase + the absence of
//              blocking RFIs.
// Delivery:    % of linked deliveries that are Delivered / Received
//              (with penalties for late / rejected).
// Erection:    the composite — min(Fab, Delivery) capped further by
//              any failed inspection or blocked work package. If a
//              zone has no installation-phase signal, returns null.
const READINESS_DRAWING_STAGE_SCORES = {
  Released: 100,
  IFC:      100, // alias for Released per elsewhere in app
  FFF:       85,
  BFS:       70,
  OFS:       60,
  BFA:       40,
  OFA:       20,
  "Not Started": 0,
};

function _recordStage(rec) {
  // Drawings use `stage`; work packages use `status`. We look at both
  // because the app uses the same vocabulary ("Fabrication", "Erection",
  // "Installation") across tables.
  return String(rec?.stage || rec?.status || "").trim();
}

/**
 * Compute the three readiness percentages for a zone given its
 * hydrated links (as from hydrateLinks). Returns numbers in [0,100]
 * or null where there's no input signal of that kind.
 *
 *   {
 *     fabrication: 72 | null,
 *     delivery:    100 | null,
 *     erection:    55 | null,
 *     drivers: {
 *       fabrication: ["3/4 drawings released"],
 *       delivery:    ["2 of 3 delivered"],
 *       erection:    ["Blocked by INSP-12 failed"],
 *     }
 *   }
 *
 * Safe to call with zero links — returns all-null. Ignores orphaned
 * links (link without resolved record) so a stale row doesn't skew
 * the score.
 */
export function computeZoneReadiness(hydrated, options = {}) {
  // V3.1: optional `dependencyImpact` from computeDependencyImpact()
  // pulls every readiness score down by `(1 - drag)`. Backward-
  // compatible — calls without options behave identically to V3.0.
  // The drivers.upstream array surfaces the top contributors so the
  // UI can explain WHY the rings dropped.
  const dependencyImpact = options.dependencyImpact || null;
  const drag = dependencyImpact && Number.isFinite(Number(dependencyImpact.drag))
    ? Math.max(0, Math.min(1, Number(dependencyImpact.drag)))
    : 0;

  const items = _hydratedToArray(hydrated).filter(
    (x) => x.link && (x.link.is_confirmed === undefined || x.link.is_confirmed === true) && !x.link.removed_at && x.record,
  );

  const out = {
    fabrication: null,
    delivery:    null,
    erection:    null,
    drivers: { fabrication: [], delivery: [], erection: [], upstream: [] },
  };

  // ── Collect per-type buckets ──────────────────────────────────────
  const drawings   = [];
  const workPkgs   = [];
  const rfis       = [];
  const deliveries = [];
  const inspections = [];

  for (const { link, record } of items) {
    switch (link.linked_record_type) {
      case "drawing":      drawings.push(record); break;
      case "work_package": workPkgs.push(record); break;
      case "rfi":          rfis.push(record); break;
      case "delivery":     deliveries.push({ rec: record, link }); break;
      case "inspection":   inspections.push(record); break;
      default: break;
    }
  }

  const blockingOpenRFIs = rfis.filter((r) => {
    if (IS_RFI_RESOLVED(r.status)) return false;
    // A blocking RFI for readiness is either explicitly flagged (role
    // elsewhere) or simply overdue — both indicate "waiting on info".
    const due = _daysUntil(r.date_required, new Date());
    return due !== null && due < 0;
  });

  const failedInspections = inspections.filter(
    (r) => IS_INSP_FAILED(r.status) && !r.resolved_at,
  );

  // ── Fabrication ───────────────────────────────────────────────────
  // Weighted: 60% driven by drawings reaching Released, 30% by linked
  // fab-phase work package progress, 10% by absence of blocking RFIs.
  // If no drawings + no WPs are linked, return null — we genuinely
  // don't know how fab-ready this zone is without either signal.
  {
    const parts = [];
    if (drawings.length > 0) {
      const avg = drawings.reduce((s, d) => s + (READINESS_DRAWING_STAGE_SCORES[_recordStage(d)] ?? 0), 0) / drawings.length;
      parts.push({ weight: 0.6, score: avg });
      const released = drawings.filter((d) => /released|ifc/i.test(_recordStage(d))).length;
      out.drivers.fabrication.push(`${released}/${drawings.length} drawing${drawings.length !== 1 ? "s" : ""} released`);
    }
    const fabWPs = workPkgs.filter((w) => /fabric/i.test(_recordStage(w)));
    if (fabWPs.length > 0) {
      const avg = fabWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / fabWPs.length;
      parts.push({ weight: 0.3, score: avg });
      out.drivers.fabrication.push(
        `${fabWPs.length} fab WP${fabWPs.length !== 1 ? "s" : ""} avg ${Math.round(avg)}%`,
      );
    }
    if (blockingOpenRFIs.length > 0) {
      parts.push({ weight: 0.1, score: 0 });
      out.drivers.fabrication.push(
        `${blockingOpenRFIs.length} blocking RFI${blockingOpenRFIs.length !== 1 ? "s" : ""} open`,
      );
    } else if (rfis.length > 0) {
      parts.push({ weight: 0.1, score: 100 });
    }
    if (parts.length > 0) {
      const totalW = parts.reduce((s, p) => s + p.weight, 0);
      const weighted = parts.reduce((s, p) => s + p.weight * p.score, 0);
      out.fabrication = Math.max(0, Math.min(100, Math.round(weighted / totalW)));
    }
  }

  // ── Delivery ──────────────────────────────────────────────────────
  // Count-based: % of linked deliveries that are done, minus a 20pt
  // hit for each exception (late/rejected). Clamped to [0,100].
  {
    if (deliveries.length > 0) {
      const done = deliveries.filter(({ rec }) => IS_DEL_DONE(rec.status)).length;
      const exceptions = deliveries.filter(({ rec }) => IS_DEL_EXCEPTION(rec.status)).length;
      const base = (done / deliveries.length) * 100;
      const penalty = exceptions * 20;
      out.delivery = Math.max(0, Math.min(100, Math.round(base - penalty)));
      out.drivers.delivery.push(`${done}/${deliveries.length} delivered`);
      if (exceptions > 0) out.drivers.delivery.push(`${exceptions} exception${exceptions !== 1 ? "s" : ""}`);
    }
  }

  // ── Erection ──────────────────────────────────────────────────────
  // Erection is the composite: you need both the steel fabbed AND on
  // site before the crew can touch it. We take min(fab, delivery),
  // then apply hard blockers (failed inspection, blocked WP) that
  // snap the score toward 0 regardless of upstream readiness.
  {
    const fab = out.fabrication;
    const del = out.delivery;
    if (fab === null && del === null) {
      // No upstream signal — leave null. But erection-phase WPs alone
      // can inform us too.
      const erectWPs = workPkgs.filter((w) => /erect|install/i.test(_recordStage(w)));
      if (erectWPs.length > 0) {
        const avg = erectWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / erectWPs.length;
        out.erection = Math.max(0, Math.min(100, Math.round(avg)));
        out.drivers.erection.push(
          `${erectWPs.length} erect/install WP${erectWPs.length !== 1 ? "s" : ""} avg ${Math.round(avg)}%`,
        );
      }
    } else {
      const base = Math.min(fab ?? 100, del ?? 100);
      let score = base;
      const reasons = [];
      reasons.push(`min(fab ${fab ?? "—"}, del ${del ?? "—"}) = ${base}`);

      if (failedInspections.length > 0) {
        score = Math.min(score, 20);
        reasons.push(
          `blocked by ${failedInspections.length} failed inspection${failedInspections.length !== 1 ? "s" : ""}`,
        );
      }
      const blockedWPs = workPkgs.filter((w) => IS_WP_BLOCKED(w.status));
      if (blockedWPs.length > 0) {
        score = Math.min(score, 30);
        reasons.push(
          `${blockedWPs.length} WP${blockedWPs.length !== 1 ? "s" : ""} blocked`,
        );
      }
      if (blockingOpenRFIs.length > 0) {
        score = Math.min(score, 50);
        reasons.push(
          `${blockingOpenRFIs.length} RFI${blockingOpenRFIs.length !== 1 ? "s" : ""} overdue`,
        );
      }

      out.erection = Math.max(0, Math.min(100, Math.round(score)));
      out.drivers.erection = reasons;
    }
  }

  // ── V3.1: dependency drag ─────────────────────────────────────────
  // Apply the upstream-zone drag uniformly to all three rings. We
  // multiply by (1 - drag) rather than subtracting a flat amount so a
  // zone that's already at 30% doesn't get pushed below zero by a
  // small drag, and a 100% zone with serious upstream drag still
  // visibly drops. drag is bounded [0,1] by computeDependencyImpact.
  if (drag > 0) {
    if (out.fabrication !== null) {
      out.fabrication = Math.max(0, Math.min(100, Math.round(out.fabrication * (1 - drag))));
    }
    if (out.delivery !== null) {
      out.delivery = Math.max(0, Math.min(100, Math.round(out.delivery * (1 - drag))));
    }
    if (out.erection !== null) {
      out.erection = Math.max(0, Math.min(100, Math.round(out.erection * (1 - drag))));
    }
    // Top contributors land in drivers.upstream so the UI can render
    // a "Drag from N upstream zones: Z-014 RFI overdue (-22%)…" tip
    // alongside the existing fab/delivery/erection driver bullets.
    const top = Array.isArray(dependencyImpact.contributors) ? dependencyImpact.contributors : [];
    out.drivers.upstream = top.slice(0, 5).map((c) => ({
      zoneId:       c.zoneId,
      zoneLabel:    c.zoneLabel || null,
      distance:     c.distance,
      contribution: c.contribution,
      relationship: c.relationship,
      reason:       c.reason || null,
    }));
  }

  return out;
}

/**
 * Recompute + persist a zone's status from its current hydrated link
 * records. Writes back only when the computed value differs from the
 * stored one, so we don't churn updated_at on every render. Honours
 * is_manual_status_override — if the user pinned the status, we leave
 * it alone and return { skipped: true }.
 */
export async function recomputeAndPersistZoneStatus(zone, hydrated, opts = {}) {
  if (!zone?.id) throw new Error("recomputeAndPersistZoneStatus: zone required");
  if (zone.is_manual_status_override) {
    return { skipped: true, reason: "manual_override" };
  }
  const { status, reason } = computeZoneStatus(hydrated, opts);
  if (status === zone.status) return { skipped: true, reason: "unchanged" };

  // Import-on-demand to avoid a circular when tests pull just the
  // pure engine. Browser bundler will tree-shake this inline.
  const { data, error } = await supabase
    .from("drawing_zones")
    .update({
      status,
      status_reason: reason || null,
      status_computed_at: new Date().toISOString(),
      status_computed_by: "rule_engine",
    })
    .eq("id", zone.id)
    .select()
    .single();
  if (error) throw error;
  return { skipped: false, status, reason, zone: data };
}

/**
 * Recompute + persist a zone's status, optionally factoring a
 * dependency impact into the readiness scores. Sister to
 * recomputeAndPersistZoneStatus — kept separate so existing callers
 * that don't have a dependency index don't pay for one.
 *
 * Note: drag does NOT change the rule-engine status (red/amber/etc.)
 * itself — that still comes from the zone's direct linked records.
 * Drag only affects readiness rings (computed on demand in the UI).
 * This function exists so callers that want a "full recompute" path
 * can persist the rule-engine status while having the readiness
 * computation available alongside.
 */
export async function recomputeAndPersistZoneStatusWithDependencies(
  zone,
  hydrated,
  depImpact,
  opts = {},
) {
  // The persistence path is identical to the non-dep version — drag
  // doesn't alter the stored zone.status. We keep the dep-aware
  // entry point so callers can compute readiness in one place if they
  // want to. The drag-aware readiness is returned alongside so the
  // caller can render it without recomputing.
  const persistResult = await recomputeAndPersistZoneStatus(zone, hydrated, opts);
  const readiness = computeZoneReadiness(hydrated, { dependencyImpact: depImpact });
  return { ...persistResult, readiness };
}
