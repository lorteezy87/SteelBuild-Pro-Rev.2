// ============================================================================
// SteelBuild Pro — Tool Execution Handlers (Path B)
// ============================================================================
// Path B adaptation notes (see ../README or migration 046 for full context):
//
//   * We read schedule_tasks and adapt rows into the ScheduleActivity shape
//     the reasoning layer expects. baseline/forecast/actual columns don't
//     exist today, so we pass null → reasoning emits float_band=UNKNOWN +
//     lowers confidence, which is what we want.
//
//   * We read rfis + deliveries + drawings with SBP's column names and map
//     them to the blocker/activity shapes. Where a column literally doesn't
//     exist (e.g. rfis.impacts_phase, drawings.linked_fab_tickets) we pass
//     null rather than faking a value.
//
//   * Submittals + production tools are dropped in tool-schemas.ts; no
//     handler entries here either. The analyze_delay_risk pipeline feeds
//     empty arrays to buildScheduleFacts for those inputs — the reasoning
//     layer handles it gracefully and surfaces the gaps in data_gaps[].
// ============================================================================

// Keep in lockstep with index.ts — npm:@supabase/supabase-js@^2.47 supports
// ES256-signed JWTs (the asymmetric-key signing that Supabase migrated to
// for Auth). Older jsr:@supabase/supabase-js@2 threw
// "Unsupported JWT algorithm ES256" on auth.getUser().
import { SupabaseClient } from "npm:@supabase/supabase-js@^2.47";
import {
  buildScheduleFacts,
  normalizeActivity,
  THRESHOLDS,
  type ScheduleActivity,
  type NormalizedActivity,
} from "./schedule-reasoning.ts";
import {
  ProvenanceBuilder,
  success,
  failure,
  emptyResult,
  type WrappedResult,
} from "./provenance.ts";

type ToolInput = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Row → ScheduleActivity adapter
// ---------------------------------------------------------------------------
// schedule_tasks columns we read:
//   id, task_name, phase, status, start_date, end_date, updated_at,
//   dependencies (text CSV), priority, percent_complete
//
// Missing from SBP today (passed as null to trigger UNKNOWN / LOW confidence):
//   baseline_start/finish, actual_start/finish, total_float, successors[]
//
// predecessors: parsed from the `dependencies` TEXT column by splitting on
// comma/semicolon/whitespace. We don't resolve to uuids because legacy rows
// often use task names, not ids — leave as raw tokens; the chain-walker
// falls back to skipping unresolved ids cleanly.

interface ScheduleTaskRow {
  id: string;
  task_name: string | null;
  phase: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  updated_at: string | null;
  dependencies: string | null;
  priority: string | null;
  percent_complete: number | null;
  milestone: boolean | null;
}

function adaptTaskToActivity(row: ScheduleTaskRow): ScheduleActivity {
  const complete = (row.percent_complete ?? 0) >= 100 ? row.end_date : null;
  const preds = (row.dependencies ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    id: row.id,
    activity_name: row.task_name ?? "(unnamed)",
    wbs_phase: row.phase ?? "",
    status: normalizeTaskStatus(row.status),
    forecast_start: row.start_date,
    forecast_finish: row.end_date,
    baseline_finish: null, // Not tracked in SBP today
    actual_finish: complete,
    total_float: null,     // Not tracked in SBP today
    predecessors: preds,
    successors: [],        // Not tracked in SBP today
    last_updated: row.updated_at,
  };
}

function normalizeTaskStatus(raw: string | null): string {
  if (!raw) return "not_started";
  const s = raw.toLowerCase();
  if (s.includes("complete") || s === "done") return "complete";
  if (s.includes("progress") || s === "active") return "in_progress";
  if (s.includes("hold") || s.includes("pause")) return "on_hold";
  if (s.includes("delay") || s.includes("late")) return "delayed";
  return "not_started";
}

// ---------------------------------------------------------------------------
// rfi row → Blocker-compatible shape
// ---------------------------------------------------------------------------
interface RfiRow {
  id: string;
  rfi_number: string;
  title: string | null;
  status: string | null;
  submitted_date: string | null;
  date_required: string | null;
  impacts_activity_ids: string[] | null;
  priority: string | null;
}

function rfiForReasoning(r: RfiRow) {
  const daysOpen = r.submitted_date
    ? Math.max(
        0,
        Math.round(
          (Date.now() - new Date(r.submitted_date).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;
  return {
    rfi_number: r.rfi_number,
    status: r.status ?? "Open",
    days_open: daysOpen,
    submitted_date: r.submitted_date ?? new Date().toISOString(),
    response_required_by: r.date_required,
    impacts_activity_ids: r.impacts_activity_ids ?? [],
    subject: r.title ?? "",
  };
}

// ---------------------------------------------------------------------------
// delivery row → Blocker-compatible shape
// ---------------------------------------------------------------------------
interface DeliveryRow {
  id: string;
  po_number: string | null;
  status: string | null;
  scheduled_date: string | null;
  required_date: string | null;
  created_at: string | null;
  load_category: string | null;
  procurement_category: string | null;
  impacts_activity_ids: string[] | null;
}

function deliveryForReasoning(d: DeliveryRow) {
  return {
    po_number: d.po_number ?? "(no PO)",
    status: d.status ?? "ordered",
    promised_eta: d.scheduled_date,
    needed_by_date: d.required_date,
    ordered_date: d.created_at,
    material_type: d.load_category ?? d.procurement_category ?? "(uncategorized)",
    impacts_activity_ids: d.impacts_activity_ids ?? [],
  };
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------
export async function executeToolCall(
  toolName: string,
  input: ToolInput,
  supabase: SupabaseClient,
): Promise<WrappedResult> {
  const pb = new ProvenanceBuilder();
  try {
    switch (toolName) {
      case "get_schedule_activities":
        return await getScheduleActivities(input, supabase);
      case "get_open_rfis":
        return await getOpenRfis(input, supabase);
      case "get_delivery_status":
        return await getDeliveryStatus(input, supabase);
      case "get_drawings_log":
        return await getDrawingsLog(input, supabase);
      case "get_critical_path":
        return await getCriticalPath(input, supabase);
      case "analyze_delay_risk":
        return await analyzeDelayRisk(input, supabase);
      case "list_projects":
        return await listProjects(input, supabase);
      case "get_project_summary":
        return await getProjectSummary(input, supabase);
      default:
        return failure(`Unknown tool: ${toolName}`, pb.build("LOW"));
    }
  } catch (err) {
    return failure(
      err instanceof Error ? err.message : "Unknown error",
      pb.build("LOW"),
    );
  }
}

// ---------------------------------------------------------------------------
// get_schedule_activities — reads schedule_tasks via the adapter
// ---------------------------------------------------------------------------
async function getScheduleActivities(
  input: ToolInput,
  supabase: SupabaseClient,
): Promise<WrappedResult> {
  const { project_id, phase, status, date_range, limit = 50 } = input as {
    project_id: string;
    phase?: string;
    status?: string;
    date_range?: { start: string; end: string };
    limit?: number;
  };

  const pb = new ProvenanceBuilder();
  let query = supabase
    .from("schedule_tasks")
    .select(
      "id, task_name, phase, status, start_date, end_date, updated_at, dependencies, priority, percent_complete, milestone",
    )
    .eq("project_id", project_id)
    .limit(Math.min(limit, 500));

  if (phase) query = query.eq("phase", phase);
  if (status) query = query.ilike("status", status);
  if (date_range?.start) query = query.gte("start_date", date_range.start);
  if (date_range?.end) query = query.lte("end_date", date_range.end);

  const { data, error } = await query;
  if (error) return failure(error.message, pb.build("LOW"));

  const normalized = (data ?? []).map((row: ScheduleTaskRow) =>
    normalizeActivity(adaptTaskToActivity(row)),
  );
  pb.addSource("schedule_tasks", normalized.length);
  pb.addEvidence(`${normalized.length} tasks retrieved`);

  // Path B caveat is a real data gap — surface it honestly.
  pb.addGap(
    "SBP does not track baseline/forecast dates or total float today — " +
      "variance and float bands are UNKNOWN. Critical-path claims require " +
      "scheduler input.",
  );

  const staleCount = normalized.filter((a) => a.freshness === "STALE").length;
  if (staleCount > 0) {
    pb.addStaleness(
      `${staleCount} tasks not updated in >${THRESHOLDS.FRESHNESS_AGING_MAX_DAYS}d`,
    );
  }

  if (normalized.length === 0) {
    return emptyResult(
      { activities: [] },
      "schedule_tasks",
      "No tasks match the filter criteria",
    );
  }

  return success(
    {
      activities: normalized,
      summary: {
        total: normalized.length,
        critical: 0, // Unknown without float
        near_critical: 0,
        behind_schedule: normalized.filter((a) => a.is_behind).length,
      },
    },
    pb.build(),
  );
}

// ---------------------------------------------------------------------------
// get_open_rfis
// ---------------------------------------------------------------------------
async function getOpenRfis(
  input: ToolInput,
  supabase: SupabaseClient,
): Promise<WrappedResult> {
  const { project_id, min_age_days } = input as {
    project_id: string;
    min_age_days?: number;
  };

  const pb = new ProvenanceBuilder();
  const { data, error } = await supabase
    .from("rfis")
    .select(
      "id, rfi_number, title, status, submitted_date, date_required, priority, impacts_activity_ids",
    )
    .eq("project_id", project_id)
    .in("status", ["Open", "Under Review"]);

  if (error) return failure(error.message, pb.build("LOW"));

  const rfis = (data ?? []).map((r: RfiRow) => {
    const forReasoning = rfiForReasoning(r);
    return {
      ...r,
      days_open: forReasoning.days_open,
    };
  });

  const filtered = min_age_days
    ? rfis.filter((r) => r.days_open >= min_age_days)
    : rfis;

  pb.addSource("rfis", filtered.length);
  pb.addEvidence(`${filtered.length} open RFIs`);

  const stale = filtered.filter((r) => r.days_open >= THRESHOLDS.RFI_STALE_DAYS);
  const orphaned = filtered.filter(
    (r) => !r.impacts_activity_ids || r.impacts_activity_ids.length === 0,
  );
  if (stale.length > 0) {
    pb.addEvidence(`${stale.length} stale (>${THRESHOLDS.RFI_STALE_DAYS}d)`);
  }
  if (orphaned.length > 0) {
    pb.addGap(
      `${orphaned.length} RFIs have no impacts_activity_ids link — upstream impact unknown`,
    );
  }

  return success(
    {
      rfis: filtered.sort((a, b) => b.days_open - a.days_open),
      summary: {
        total: filtered.length,
        stale_count: stale.length,
        avg_age_days:
          filtered.length > 0
            ? Math.round(
                filtered.reduce((s, r) => s + r.days_open, 0) / filtered.length,
              )
            : 0,
        orphaned_count: orphaned.length,
      },
    },
    pb.build(),
  );
}

// ---------------------------------------------------------------------------
// get_delivery_status — with promised-vs-needed gap analysis
// ---------------------------------------------------------------------------
async function getDeliveryStatus(
  input: ToolInput,
  supabase: SupabaseClient,
): Promise<WrappedResult> {
  const { project_id, status, material_type } = input as {
    project_id: string;
    status?: string;
    material_type?: string;
  };

  const pb = new ProvenanceBuilder();
  let query = supabase
    .from("deliveries")
    .select(
      "id, po_number, vendor, status, scheduled_date, required_date, actual_date, pieces, weight_tons, load_category, procurement_category, description, impacts_activity_ids, created_at",
    )
    .eq("project_id", project_id);

  if (status) query = query.ilike("status", status);
  if (material_type) {
    // material_type is interpolated into the PostgREST .or() filter DSL, so a
    // value containing , . ( ) * could break out of the ilike into another
    // column/operator. Strip those metacharacters before building the string.
    // (The client is RLS-scoped, so this is defense-in-depth.)
    const safe = material_type.replace(/[,.()*\\]/g, " ").trim();
    if (safe) {
      query = query.or(
        `load_category.ilike.%${safe}%,procurement_category.ilike.%${safe}%`,
      );
    }
  }

  const { data, error } = await query.order("scheduled_date", { ascending: true });
  if (error) return failure(error.message, pb.build("LOW"));

  const deliveries = data ?? [];
  pb.addSource("deliveries", deliveries.length);

  // Compute gap days for each delivery (promised_eta - needed_by_date)
  const enriched = deliveries.map((d) => {
    let gap_days: number | null = null;
    if (d.scheduled_date && d.required_date) {
      gap_days = Math.round(
        (new Date(d.scheduled_date).getTime() -
          new Date(d.required_date).getTime()) /
          (1000 * 60 * 60 * 24),
      );
    }
    return { ...d, gap_days };
  });

  const lateForNeed = enriched.filter(
    (d) => d.gap_days !== null && d.gap_days > 0,
  );
  const missingNeedDate = enriched.filter((d) => !d.required_date).length;

  pb.addEvidence(`${deliveries.length} deliveries tracked`);
  if (lateForNeed.length > 0) {
    pb.addEvidence(`${lateForNeed.length} with ETA past need date`);
  }
  if (missingNeedDate > 0) {
    pb.addGap(`${missingNeedDate} deliveries missing need-by (required_date)`);
  }

  const delayedStatuses = new Set(["delayed", "backordered", "late"]);
  const delayed = enriched.filter((d) =>
    delayedStatuses.has((d.status ?? "").toLowerCase()),
  ).length;

  return success(
    {
      deliveries: enriched,
      summary: {
        total: deliveries.length,
        delayed,
        late_for_need: lateForNeed.length,
        received: enriched.filter(
          (d) => (d.status ?? "").toLowerCase() === "received",
        ).length,
      },
    },
    pb.build(),
  );
}

// ---------------------------------------------------------------------------
// get_drawings_log
// ---------------------------------------------------------------------------
async function getDrawingsLog(
  input: ToolInput,
  supabase: SupabaseClient,
): Promise<WrappedResult> {
  const { project_id, sheet_number, stage } = input as {
    project_id: string;
    sheet_number?: string;
    stage?: string;
  };
  const pb = new ProvenanceBuilder();

  let query = supabase
    .from("drawings")
    .select(
      "id, sheet_number, title, revision_number, stage, discipline, submitted_date, return_date, due_date, reviewer, linked_rfi_ids, fabrication_start_date, fabrication_finish_date, final_delivery_date",
    )
    .eq("project_id", project_id)
    .eq("is_deleted", false);

  if (sheet_number) query = query.eq("sheet_number", sheet_number);
  if (stage) query = query.eq("stage", stage);

  const { data, error } = await query;
  if (error) return failure(error.message, pb.build("LOW"));

  const drawings = data ?? [];
  pb.addSource("drawings", drawings.length);
  pb.addEvidence(`${drawings.length} drawings`);

  return success({ drawings }, pb.build());
}

// ---------------------------------------------------------------------------
// get_critical_path — priority='Critical' proxy + milestones
// ---------------------------------------------------------------------------
async function getCriticalPath(
  input: ToolInput,
  supabase: SupabaseClient,
): Promise<WrappedResult> {
  const { project_id } = input as { project_id: string };
  const pb = new ProvenanceBuilder();

  // Without total_float, "critical" = priority='Critical' OR milestone=true.
  // This is a rough proxy; the data gap is called out in provenance.
  const { data, error } = await supabase
    .from("schedule_tasks")
    .select(
      "id, task_name, phase, status, start_date, end_date, updated_at, dependencies, priority, percent_complete, milestone",
    )
    .eq("project_id", project_id)
    .or("priority.eq.Critical,milestone.eq.true")
    .order("start_date", { ascending: true });

  if (error) return failure(error.message, pb.build("LOW"));

  const activities = (data ?? [])
    .filter((row: ScheduleTaskRow) => (row.percent_complete ?? 0) < 100)
    .map((row: ScheduleTaskRow) =>
      normalizeActivity(adaptTaskToActivity(row)),
    );

  pb.addSource("schedule_tasks", activities.length);
  pb.addEvidence(
    `${activities.length} critical-priority / milestone tasks (not complete)`,
  );
  pb.addGap(
    "Float not tracked in SBP — 'critical path' here means priority=Critical " +
      "or milestone=true, not true zero-float activities.",
  );

  if (activities.length === 0) {
    return emptyResult(
      { critical_path: [] },
      "schedule_tasks",
      "No critical-priority or milestone tasks found",
    );
  }

  const starts = activities
    .map((a) => a.forecast_start)
    .filter(Boolean) as string[];
  const finishes = activities
    .map((a) => a.forecast_finish)
    .filter(Boolean) as string[];
  const length_days =
    starts.length && finishes.length
      ? Math.round(
          (new Date([...finishes].sort().reverse()[0]).getTime() -
            new Date([...starts].sort()[0]).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

  return success(
    { critical_path: activities, length_days },
    pb.build("MEDIUM"),
  );
}

// ---------------------------------------------------------------------------
// analyze_delay_risk — uses the reasoning layer; feeds empty arrays for
// entities SBP doesn't track yet (submittals).
// ---------------------------------------------------------------------------
async function analyzeDelayRisk(
  input: ToolInput,
  supabase: SupabaseClient,
): Promise<WrappedResult> {
  const { project_id, lookahead_days = 21 } = input as {
    project_id: string;
    lookahead_days?: number;
  };
  const pb = new ProvenanceBuilder();

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + lookahead_days);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const [tasksRes, rfisRes, deliveriesRes, projectRes] = await Promise.all([
    supabase
      .from("schedule_tasks")
      .select(
        "id, task_name, phase, status, start_date, end_date, updated_at, dependencies, priority, percent_complete, milestone",
      )
      .eq("project_id", project_id)
      .lte("start_date", horizonIso)
      .not("status", "ilike", "complete"),
    supabase
      .from("rfis")
      .select(
        "id, rfi_number, title, status, submitted_date, date_required, priority, impacts_activity_ids",
      )
      .eq("project_id", project_id)
      .in("status", ["Open", "Under Review"]),
    supabase
      .from("deliveries")
      .select(
        "id, po_number, status, scheduled_date, required_date, created_at, load_category, procurement_category, impacts_activity_ids",
      )
      .eq("project_id", project_id),
    supabase
      .from("projects")
      .select("updated_at")
      .eq("id", project_id)
      .single(),
  ]);

  for (const res of [tasksRes, rfisRes, deliveriesRes]) {
    if (res.error) return failure(res.error.message, pb.build("LOW"));
  }

  const activities = (tasksRes.data ?? []).map((row: ScheduleTaskRow) =>
    adaptTaskToActivity(row),
  );
  const rfis = (rfisRes.data ?? []).map((r: RfiRow) => rfiForReasoning(r));
  const deliveries = (deliveriesRes.data ?? []).map((d: DeliveryRow) =>
    deliveryForReasoning(d),
  );

  const facts = buildScheduleFacts({
    project_id,
    activities,
    rfis,
    submittals: [], // Not tracked in SBP today
    deliveries,
    schedule_last_updated: projectRes.data?.updated_at ?? null,
  });

  pb.addSource("schedule_tasks", activities.length);
  pb.addSource("rfis", rfis.length);
  pb.addSource("deliveries", deliveries.length);

  pb.addEvidence(`${activities.length} tasks in ${lookahead_days}d lookahead`);
  pb.addEvidence(`${facts.summary.open_rfi_count} open RFIs`);
  pb.addEvidence(`${facts.summary.late_delivery_count} late/backordered deliveries`);
  const highRisk = facts.at_risk_activities.filter(
    (a) => a.risk === "HIGH" || a.risk === "CRITICAL",
  ).length;
  pb.addEvidence(`${highRisk} HIGH/CRITICAL risk activities`);

  // Path B caveats — always surface
  pb.addGap(
    "Submittals not tracked in SBP — submittal-driven risk is NOT in this analysis.",
  );
  if (activities.every((a) => a.total_float === null)) {
    pb.addGap(
      "Total float not tracked — float-band risk signals (CRITICAL/NEAR_CRITICAL) " +
        "are unavailable; risk is derived from RFI staleness + delivery gaps only.",
    );
  }

  facts.staleness_warnings.forEach((w) => pb.addStaleness(w));
  facts.data_gaps.forEach((g) => pb.addGap(g));

  return success(facts, pb.build(facts.confidence));
}

// ---------------------------------------------------------------------------
// list_projects
// ---------------------------------------------------------------------------
async function listProjects(
  input: ToolInput,
  supabase: SupabaseClient,
): Promise<WrappedResult> {
  const { phase } = input as { phase?: string };
  const pb = new ProvenanceBuilder();

  let query = supabase
    .from("projects")
    .select(
      "id, project_number, name, general_contractor, address, phase, health_status, start_date, target_completion_date, forecast_completion_date",
    );
  if (phase) query = query.ilike("phase", `%${phase}%`);

  const { data, error } = await query;
  if (error) return failure(error.message, pb.build("LOW"));

  // Normalize for the assistant — expose both SBP names and v1-compatible aliases
  const projects = (data ?? []).map((p) => ({
    id: p.id,
    job_number: p.project_number,
    name: p.name,
    gc: p.general_contractor,
    address: p.address,
    phase: p.phase,
    status: p.health_status,
    start_date: p.start_date,
    target_completion_date: p.target_completion_date,
    forecast_completion_date: p.forecast_completion_date,
  }));

  pb.addSource("projects", projects.length);
  pb.addEvidence(`${projects.length} projects accessible to user`);

  return success({ projects }, pb.build());
}

// ---------------------------------------------------------------------------
// get_project_summary
// ---------------------------------------------------------------------------
async function getProjectSummary(
  input: ToolInput,
  supabase: SupabaseClient,
): Promise<WrappedResult> {
  const { project_id } = input as { project_id: string };
  const pb = new ProvenanceBuilder();

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, project_number, name, general_contractor, engineer_of_record, project_manager, superintendent, address, phase, health_status, start_date, target_completion_date, forecast_completion_date, original_contract_value, updated_at",
    )
    .eq("id", project_id)
    .single();

  if (error) return failure(error.message, pb.build("LOW"));

  pb.addSource("projects", 1);
  pb.addEvidence("Project summary loaded");

  if (data?.updated_at) {
    const daysOld = Math.round(
      (Date.now() - new Date(data.updated_at).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (daysOld > THRESHOLDS.DATA_STALENESS_WARN_DAYS) {
      pb.addStaleness(`Project record last updated ${daysOld}d ago`);
    }
  }

  const project = data
    ? {
        id: data.id,
        job_number: data.project_number,
        name: data.name,
        gc: data.general_contractor,
        engineer_of_record: data.engineer_of_record,
        project_manager: data.project_manager,
        superintendent: data.superintendent,
        address: data.address,
        phase: data.phase,
        health_status: data.health_status,
        start_date: data.start_date,
        target_completion_date: data.target_completion_date,
        forecast_completion_date: data.forecast_completion_date,
        original_contract_value: data.original_contract_value,
        schedule_last_updated: data.updated_at,
      }
    : null;

  return success({ project }, pb.build());
}
