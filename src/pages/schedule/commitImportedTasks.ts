/**
 * Shared write path for MS Project XML and CSV schedule imports.
 *
 * A complete, fresh project read is mandatory before the first write. Source
 * UIDs identify retries; WBS and names only detect possible collisions. A
 * changed source row stops for manual reconciliation so an updated GC file
 * cannot silently replace field progress or create a second schedule.
 * Cross-device concurrent imports still require a database uniqueness guard;
 * this client preflight is not a transaction or a server-side lock.
 */
import type { QueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { PHASES } from "@/utils/phases";
import { batchProcess } from "@/utils/batchProcess";
import { invalidateEntity } from "@/services/cacheRegistry";
import { withProjectId } from "@/lib/mutations/standardMutation";
import { generateWBS } from "./wbs";
import {
  PHASE_NAME_MAP,
  deriveMppDependencies,
  deriveParentUids,
  derivePhaseFromHierarchy,
  inferTaskType,
} from "./mppImport";
import { assertScheduleDateRange } from "./scheduleDateValidation";
import type { ParsedMppTask, ScheduleTask } from "./types";

export interface ScheduleImportSource {
  kind: "csv" | "mpp-xml";
  fileName: string;
}

export interface CommitImportedTasksOpts {
  tasks: ParsedMppTask[];
  projectId: string;
  qc: QueryClient;
  source: ScheduleImportSource;
  /** Fill empty WBS codes only when the source phase is known. */
  generateMissingWbs?: boolean;
  /** Kept for existing callers; identity always comes from a fresh complete DB read. */
  existingTasks?: ScheduleTask[];
}

interface ImportMarker {
  version: 1;
  source_key: string;
  source_uid: string;
  content_fingerprint: string;
  links_finalized: boolean;
}

interface PreparedTask {
  source: ParsedMppTask;
  sourceUid: string;
  fingerprint: string;
  phase: string | null;
  parentUid: string | null;
}

function importSourceKey(source: ScheduleImportSource): string {
  const base = source.fileName.trim().replace(/\.(csv|tsv|txt|xml)$/i, "").trim().toLocaleLowerCase("en-US");
  if (!base) throw new Error("Schedule source file name is required for retry-safe import.");
  return `${source.kind}:${base}`;
}

function sourceUidFor(task: ParsedMppTask, source: ScheduleImportSource): string {
  const uid = (source.kind === "csv" ? task.sourceUid : task.uid)?.trim();
  if (!uid) {
    throw new Error(source.kind === "csv"
      ? `Activity ID is required for ${task.name || "every CSV row"}. Add a stable Activity ID before import; WBS and row order are not identities.`
      : `MS Project task UID is required for ${task.name || "every task"}.`);
  }
  return uid;
}

function phaseFor(task: ParsedMppTask, allParsed: ParsedMppTask[]): string | null {
  const phaseName = task.phaseHint || derivePhaseFromHierarchy(task, allParsed);
  if (phaseName && PHASES.includes(phaseName)) return phaseName;
  const mapped = PHASE_NAME_MAP[String(phaseName || "").toUpperCase()] || phaseName;
  return mapped && PHASES.includes(mapped) ? mapped : null;
}

function metadataObject(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Existing schedule metadata is malformed. Review that task before importing.");
  }
  return raw as Record<string, unknown>;
}

function markerFor(row: ScheduleTask): ImportMarker | null {
  const raw = metadataObject(row.metadata).schedule_import;
  if (raw === undefined) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Existing schedule import marker is malformed. Review that task before importing.");
  }
  const marker = raw as Partial<ImportMarker>;
  if (marker.version !== 1 || typeof marker.source_key !== "string"
    || typeof marker.source_uid !== "string" || typeof marker.content_fingerprint !== "string"
    || typeof marker.links_finalized !== "boolean") {
    throw new Error("Existing schedule import marker is incomplete. Review that task before importing.");
  }
  return marker as ImportMarker;
}

function identity(sourceKey: string, uid: string): string {
  return JSON.stringify([sourceKey, uid]);
}

function normalizedLabel(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

async function fingerprintFor(prepared: Omit<PreparedTask, "fingerprint">): Promise<string> {
  const task = prepared.source;
  const content = JSON.stringify([
    "steelbuild-schedule-import-v1", prepared.sourceUid, task.name.trim(),
    task.outlineNumber.trim(), task.outlineLevel, prepared.parentUid,
    prepared.phase, task.phaseHint ?? null, task.start ?? null, task.finish ?? null,
    task.durationDays ?? null, task.statusHint ?? null, task.pct,
    task.isSummary, task.milestone, task.resources, task.notes,
    task.preds.map((link) => [link.predUid, link.linkType, link.lagDuration]),
  ]);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function commitImportedScheduleTasks({
  tasks: allParsed,
  projectId,
  qc,
  source,
  generateMissingWbs = false,
}: CommitImportedTasksOpts): Promise<{ created: number; skipped: number }> {
  if (!projectId) throw new Error("Select a project before importing a schedule.");
  if (!allParsed.length) throw new Error("No tasks to import.");
  const sourceKey = importSourceKey(source);
  const parentUids = deriveParentUids(allParsed);
  const parsedUids = new Set<string>();
  const sourceUids = new Set<string>();
  const sourceWbs = new Set<string>();
  const prepared: PreparedTask[] = [];

  for (const task of allParsed) {
    assertScheduleDateRange({ start_date: task.start ?? null, end_date: task.finish ?? null });
    if (task.unresolvedPredecessors?.length) {
      throw new Error(`Unresolved predecessor ${task.unresolvedPredecessors.join(", ")} for ${task.name}. Correct or exclude the row before importing.`);
    }
    if (!task.uid?.trim() || parsedUids.has(task.uid)) throw new Error(`Duplicate or missing parsed task UID ${task.uid || ""}; no tasks imported.`);
    parsedUids.add(task.uid);
    const sourceUid = sourceUidFor(task, source);
    if (sourceUids.has(sourceUid)) throw new Error(`Duplicate source UID/Activity ID ${sourceUid}; no tasks imported.`);
    sourceUids.add(sourceUid);
    const wbs = normalizedLabel(task.outlineNumber);
    if (wbs && sourceWbs.has(wbs)) throw new Error(`Duplicate source WBS ${task.outlineNumber}; review the source before import.`);
    if (wbs) sourceWbs.add(wbs);
    const partial = {
      source: task,
      sourceUid,
      phase: phaseFor(task, allParsed),
      parentUid: parentUids[task.uid] || null,
    };
    prepared.push({ ...partial, fingerprint: await fingerprintFor(partial) });
  }
  for (const item of prepared) {
    for (const predecessor of item.source.preds) {
      if (!predecessor.predUid || !parsedUids.has(predecessor.predUid)) {
        throw new Error(`Predecessor ${predecessor.predUid || "(missing UID)"} for ${item.source.name} is outside this import. Review the schedule before importing.`);
      }
    }
  }

  // The page list is capped at the PostgREST max. filterAll is a complete,
  // fresh project read; a failed/incomplete read must stop before any create.
  const existing = await entities.ScheduleTask.filterAll({ project_id: projectId }) as unknown as ScheduleTask[];
  if (existing.some((row) => row.project_id !== projectId || !row.id)) {
    throw new Error("Schedule import evidence is incomplete or outside the selected project.");
  }
  const existingByIdentity = new Map<string, ScheduleTask[]>();
  const existingWbs = new Set<string>();
  const existingNamePhase = new Set<string>();
  for (const row of existing) {
    const wbs = normalizedLabel(row.wbs_code);
    const label = normalizedLabel(row.task_name);
    if (wbs) existingWbs.add(wbs);
    if (label) existingNamePhase.add(identity(label, normalizedLabel(row.phase)));
    const marker = markerFor(row);
    if (!marker) continue;
    const key = identity(marker.source_key, marker.source_uid);
    existingByIdentity.set(key, [...(existingByIdentity.get(key) || []), row]);
  }

  // Preflight the whole batch. A changed task or possible legacy/manual match
  // must reject before even the first new row is created.
  const priorByUid = new Map<string, ScheduleTask>();
  for (const item of prepared) {
    const matches = existingByIdentity.get(identity(sourceKey, item.sourceUid)) || [];
    if (matches.length > 1) throw new Error(`Multiple existing tasks carry Activity ID ${item.sourceUid}. Review duplicates before importing.`);
    const prior = matches[0];
    if (prior) {
      const marker = markerFor(prior)!;
      if (marker.content_fingerprint !== item.fingerprint) {
        throw new Error(`Activity ID ${item.sourceUid} changed in ${source.fileName}. Review and reconcile the existing task; no new tasks were imported.`);
      }
      if (!marker.links_finalized && prior.dependencies) {
        throw new Error(`Activity ID ${item.sourceUid} has unfinished import links and edited dependencies. Review it before retrying.`);
      }
      priorByUid.set(item.source.uid, prior);
      continue;
    }
    const wbs = normalizedLabel(item.source.outlineNumber);
    const label = normalizedLabel(item.source.name);
    const collision = wbs
      ? existingWbs.has(wbs)
      : Boolean(label && existingNamePhase.has(identity(label, normalizedLabel(item.phase))));
    if (collision) {
      throw new Error(wbs
        ? `WBS ${item.source.outlineNumber} already exists in this project. Review the existing task before importing; no duplicate was created.`
        : `Task ${item.source.name} may already exist in this project. Review it before importing; no duplicate was created.`);
    }
  }

  const uidToDbId: Record<string, string> = Object.create(null);
  const metadataByDbId = new Map<string, Record<string, unknown>>();
  const snapshot: ScheduleTask[] = [...existing];
  let created = 0;
  let writeAttempted = false;
  try {
    for (const item of prepared) {
      const task = item.source;
      const prior = priorByUid.get(task.uid);
      if (prior?.id) {
        uidToDbId[task.uid] = prior.id;
        metadataByDbId.set(prior.id, metadataObject(prior.metadata));
        continue;
      }
      const parentDbId = item.parentUid ? uidToDbId[item.parentUid] : null;
      if (item.parentUid && !parentDbId) throw new Error(`Parent task for ${task.name} could not be resolved. No further tasks imported.`);
      const wbs = task.outlineNumber || (generateMissingWbs && item.phase ? generateWBS(item.phase, snapshot) : null);
      const status = task.statusHint || (task.pct >= 100 ? "Complete" : task.pct > 0 ? "In Progress" : "Not Started");
      const marker: ImportMarker = {
        version: 1, source_key: sourceKey, source_uid: item.sourceUid,
        content_fingerprint: item.fingerprint, links_finalized: task.preds.length === 0,
      };
      const metadata = { schedule_import: marker };
      writeAttempted = true;
      const record = await entities.ScheduleTask.create(withProjectId({
        task_name: task.name,
        task_type: inferTaskType(task.name, task.isSummary, task.milestone),
        phase: item.phase,
        start_date: task.start ?? null,
        end_date: task.finish ?? null,
        status,
        percent_complete: task.pct,
        priority: "Normal",
        milestone: task.milestone,
        wbs_code: wbs,
        outline_level: task.outlineLevel,
        duration: task.durationDays,
        resource_names: task.resources.length > 0 ? task.resources.join(", ") : null,
        parent_task_id: parentDbId,
        notes: task.notes || null,
        is_summary: task.isSummary || false,
        metadata,
      }, projectId) as any) as { id: string };
      if (!record?.id) throw new Error(`Task ${task.name} was not confirmed after create. Refresh the project before retrying.`);
      uidToDbId[task.uid] = record.id;
      metadataByDbId.set(record.id, metadata);
      snapshot.push({ id: record.id, phase: item.phase ?? undefined, wbs_code: wbs } as ScheduleTask);
      created += 1;
    }

    const pendingLinks = deriveMppDependencies(allParsed, uidToDbId).filter(({ dbId }) => {
      const marker = metadataByDbId.get(dbId)?.schedule_import as ImportMarker | undefined;
      return marker?.links_finalized === false;
    });
    if (pendingLinks.length > 0) {
      const results = await batchProcess(pendingLinks, async ({ dbId, predLinks }: {
        dbId: string;
        predLinks: Array<{ id: string; type: string; lag_days: number }>;
      }) => {
        const metadata = metadataByDbId.get(dbId)!;
        const marker = metadata.schedule_import as ImportMarker;
        writeAttempted = true;
        await entities.ScheduleTask.update(dbId, {
          dependencies: JSON.stringify(predLinks),
          metadata: { ...metadata, schedule_import: { ...marker, links_finalized: true } },
        });
      });
      if (results.failed.length > 0) {
        throw new Error(`${results.failed.length} predecessor link update${results.failed.length === 1 ? "" : "s"} failed. Retry the same source file to finish linking; ${results.failed[0].error}`);
      }
    }
    return { created, skipped: prepared.length - created };
  } finally {
    if (writeAttempted) invalidateEntity(qc, "schedule_task", projectId);
  }
}
