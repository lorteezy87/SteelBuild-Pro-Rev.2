/**
 * scheduleBaselines — take, list, and read back a schedule baseline.
 *
 * Audit §1.5 / §7.2. Baseline used to be three keys on `schedule_tasks.metadata`
 * (baseline_start / baseline_end / baseline_set_at): no schema, no author, no
 * reason, no history, and overwrite-only. It also snapshotted the CASCADED
 * dates, so the "contract" schedule baked in whatever position the predecessors
 * happened to be in that afternoon.
 *
 * Three rules this module exists to hold:
 *
 * 1. **Snapshot stored dates, never cascaded ones.** `buildBaselineRows` reads
 *    `_stored_start_date ?? start_date`, which is what the Gantt's effective-date
 *    overlay preserves. Baselining a derived date is how you end up defending a
 *    contract date nobody agreed to.
 * 2. **Never overwrite.** There is no update path here, and no UPDATE policy on
 *    either table. A correction is a new baseline plus a retraction.
 * 3. **Whole project, never the filtered view.** Callers pass the unfiltered
 *    task list; §1.5 shipped a version that baselined only the visible phase
 *    while the dialog counted the whole job.
 */

import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { batchProcess } from "@/utils/batchProcess";

export interface BaselineTaskLike {
  id?: string | null;
  wbs_code?: string | null;
  task_name?: string | null;
  phase?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration?: number | string | null;
  is_summary?: boolean | null;
  _hasChildren?: boolean;
  _stored_start_date?: string | null;
  _stored_end_date?: string | null;
}

export interface BaselineRow {
  task_id: string;
  wbs_code: string | null;
  task_name: string | null;
  phase: string | null;
  baseline_start: string | null;
  baseline_finish: string | null;
  baseline_duration: number | null;
  is_summary: boolean;
}

export interface ScheduleBaseline {
  id: string;
  project_id: string;
  name: string;
  reason: string | null;
  set_by: string | null;
  set_by_name: string | null;
  set_at: string;
  task_count: number;
  is_original: boolean;
}

/** The stored (entered) start for a task, seeing through the effective overlay. */
export function storedStart(task: BaselineTaskLike): string | null {
  return task?._stored_start_date ?? task?.start_date ?? null;
}

/** The stored (entered) finish for a task, seeing through the effective overlay. */
export function storedFinish(task: BaselineTaskLike): string | null {
  return task?._stored_end_date ?? task?.end_date ?? null;
}

/**
 * Snapshot rows for every task that has at least one stored date.
 *
 * Tasks with no dates at all are skipped rather than written as a row of nulls:
 * a baseline row that records nothing is indistinguishable from a task that was
 * never baselined, and inflates task_count into a number that overstates the
 * coverage of the snapshot.
 *
 * Summary rows ARE included, flagged. Their dates roll up from children, so the
 * snapshot is derived — but a baseline that omits every parent cannot answer
 * "what was this phase supposed to span", which is the question a delay
 * argument actually asks.
 */
export function buildBaselineRows(tasks: readonly BaselineTaskLike[] | null | undefined): BaselineRow[] {
  if (!Array.isArray(tasks)) return [];
  const rows: BaselineRow[] = [];

  for (const task of tasks) {
    if (!task?.id) continue;
    const start = storedStart(task);
    const finish = storedFinish(task);
    if (!start && !finish) continue;

    // An inverted window would trip schedule_baseline_tasks_range_chk and take
    // the whole snapshot down. Two such rows exist in production (pre-validator
    // legacy, audit census), so drop the finish rather than lose the baseline.
    const safeFinish = start && finish && finish < start ? null : finish;

    const duration = Number.parseInt(String(task.duration ?? ""), 10);

    rows.push({
      task_id: String(task.id),
      wbs_code: task.wbs_code ?? null,
      task_name: task.task_name ?? null,
      phase: task.phase ?? null,
      baseline_start: start,
      baseline_finish: safeFinish,
      baseline_duration: Number.isFinite(duration) ? duration : null,
      is_summary: Boolean(task.is_summary || task._hasChildren),
    });
  }

  return rows;
}

export interface CreateBaselineInput {
  projectId: string;
  name: string;
  reason?: string | null;
  /** The WHOLE project's tasks, not the filtered view. */
  tasks: readonly BaselineTaskLike[];
  setBy?: string | null;
  setByName?: string | null;
  /** Baseline 0 — the contract schedule. At most one per project. */
  isOriginal?: boolean;
}

export interface CreateBaselineResult {
  baseline: ScheduleBaseline;
  rowsWritten: number;
  rowsFailed: number;
}

/**
 * Take a baseline. Writes the parent row first so the snapshot rows have a
 * `baseline_id` to hang off; a partial snapshot is reported rather than hidden,
 * because a baseline missing rows is worse than no baseline if nobody knows.
 */
export async function createBaseline({
  projectId,
  name,
  reason,
  tasks,
  setBy,
  setByName,
  isOriginal = false,
}: CreateBaselineInput): Promise<CreateBaselineResult> {
  if (!projectId) throw new Error("Cannot take a baseline without a project");
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("A baseline needs a name");

  const rows = buildBaselineRows(tasks);
  if (rows.length === 0) throw new Error("No tasks with dates to baseline");

  // Resolve the author here rather than threading user props through three
  // components. A baseline with no author is the exact gap §7.2 is about — the
  // old metadata shape recorded only a timestamp, so "who re-baselined the job
  // and on what authority" was unanswerable.
  const author = await resolveAuthor(setBy, setByName);

  const baseline = (await entities.ScheduleBaseline.create({
    project_id: projectId,
    name: trimmed,
    reason: reason?.trim() || null,
    set_by: author.id,
    set_by_name: author.name,
    task_count: rows.length,
    is_original: isOriginal,
  } as never)) as unknown as ScheduleBaseline;

  const results = await batchProcess(rows, (row: any) =>
    entities.ScheduleBaselineTask.create({
      baseline_id: baseline.id,
      project_id: projectId,
      ...row,
    } as never),
  );

  return {
    baseline,
    rowsWritten: results.succeeded.length,
    rowsFailed: results.failed.length,
  };
}

/**
 * The signed-in user, for `set_by` / `set_by_name`.
 *
 * Reads the Supabase session rather than localStorage — the same fix
 * auditLogger made, because localStorage is spoofable and this field is meant to
 * be evidence. A lookup failure records "Unknown" instead of throwing: losing
 * the baseline because the name could not be resolved would be worse than
 * recording it without one, and `set_by` still carries the uuid when available.
 */
async function resolveAuthor(
  setBy: string | null | undefined,
  setByName: string | null | undefined,
): Promise<{ id: string | null; name: string }> {
  if (setBy && setByName) return { id: setBy, name: setByName };
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (user) {
      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      return {
        id: setBy || user.id || null,
        name: setByName || (meta.full_name as string) || user.email || "Unknown",
      };
    }
  } catch {
    /* fall through — recorded as Unknown below */
  }
  return { id: setBy || null, name: setByName || "Unknown" };
}

/** Baselines for a project, newest first. */
export async function listBaselines(projectId: string): Promise<ScheduleBaseline[]> {
  if (!projectId) return [];
  const rows = await entities.ScheduleBaseline.filter(
    { project_id: projectId },
    "-set_at",
  );
  return (rows || []) as unknown as ScheduleBaseline[];
}

/** Snapshot rows for one baseline, keyed by task id for O(1) lookup. */
export async function fetchBaselineMap(
  baselineId: string | null | undefined,
): Promise<Record<string, BaselineRow>> {
  if (!baselineId) return {};
  const rows = (await entities.ScheduleBaselineTask.filter({ baseline_id: baselineId })) as
    | BaselineRow[]
    | null;
  const map: Record<string, BaselineRow> = {};
  for (const row of rows || []) {
    if (row?.task_id) map[String(row.task_id)] = row;
  }
  return map;
}

/**
 * Baseline dates for one task, table first, `metadata` second.
 *
 * The fallback is transitional and deliberate: migrations here are pushed by
 * hand (`supabase db push`), so a deploy can land before the table exists or
 * before it is populated. Reading the table only would make every existing
 * baseline vanish from the Gantt in that window. Remove the fallback once the
 * migration is confirmed applied.
 */
export function resolveTaskBaseline(
  task: BaselineTaskLike & { metadata?: unknown },
  baselineMap: Record<string, BaselineRow> | null | undefined,
): { start: string | null; finish: string | null; source: "table" | "metadata" } | null {
  const fromTable = task?.id ? baselineMap?.[String(task.id)] : undefined;
  if (fromTable && (fromTable.baseline_start || fromTable.baseline_finish)) {
    return {
      start: fromTable.baseline_start ?? null,
      finish: fromTable.baseline_finish ?? null,
      source: "table",
    };
  }

  const metadata = readMetadata(task?.metadata);
  const start = (metadata.baseline_start as string) || null;
  const finish = (metadata.baseline_end as string) || null;
  if (!start && !finish) return null;
  return { start, finish, source: "metadata" };
}

function readMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}
