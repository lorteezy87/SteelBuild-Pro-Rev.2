/**
 * Fab-release domain model + the SERVER-ARBITRATED release service.
 *
 * The fab-release RFI gate is enforced server-side (Phase 0): recording a
 * release inserts a row into `public.fab_release_log`, whose BEFORE INSERT
 * trigger refuses the insert when OPEN RFIs reference the package's sheets —
 * unless an explicit override reason is supplied (and the server snapshots
 * exactly which RFIs were open). This module is the typed client boundary for
 * that: callers go through `recordFabRelease()` and never write the table
 * directly, so the gate cannot be bypassed from the client.
 *
 * The deterministic display engine (src/lib/fabReleaseGate.js) mirrors the same
 * check for the pre-flight UI; the server remains the single arbiter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Where a package stands relative to the fab-release gate. */
export type ReleaseStatus =
  | "clean" // no open RFIs reference the package's sheets
  | "blocked" // open RFIs block the release; not releasable without an override
  | "overridden"; // released despite open RFIs, with a reason on record

/** The two gated release flavors (claims packages are NOT gated). */
export type FabReleaseKind = "fab_release" | "turnover";

export interface FabReleaseInput {
  projectId: string;
  packageKind: FabReleaseKind;
  packageName?: string | null;
  drawingIds: string[];
  /** Reason to release past the gate when RFIs block; null/"" = clean release. */
  overrideReason?: string | null;
}

/** The append-only release record (public.fab_release_log row). */
export interface FabReleaseRecord {
  id: string;
  project_id: string;
  released_by: string | null;
  package_kind: string;
  package_name: string | null;
  drawing_ids: string[];
  blocking_rfi_numbers: string[];
  override_reason: string | null;
  released_at: string;
}

/** The recognizable prefix the server trigger raises (mirror of the migration). */
export const FAB_RELEASE_BLOCKED_PREFIX = "FAB_RELEASE_BLOCKED";

/** Thrown when the server gate refuses a release (open RFIs, no override). */
export class FabReleaseBlockedError extends Error {
  readonly blocked = true as const;
  readonly blockingRfiNumbers: string[];
  constructor(message: string, blockingRfiNumbers: string[] = []) {
    super(message);
    this.name = "FabReleaseBlockedError";
    this.blockingRfiNumbers = blockingRfiNumbers;
  }
}

/**
 * Pull the RFI numbers out of the server message
 * "...reference sheets in this package (RFI-001, RFI-002). Resolve…".
 * The RFI list is the LAST parenthetical — anchoring there avoids grabbing the
 * "(s)" pluralizer in "RFI(s)" earlier in the same message.
 */
export function parseBlockedRfiNumbers(message: string): string[] {
  const all = [...String(message || "").matchAll(/\(([^)]*)\)/g)];
  if (!all.length) return [];
  const list = all[all.length - 1][1];
  if (list.trim() === "s") return []; // only the "RFI(s)" pluralizer was present
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when an error is the server gate's block exception (by message). */
export function isFabReleaseBlocked(err: unknown): boolean {
  const e = err as { message?: unknown; details?: unknown; hint?: unknown } | null;
  const blob = [e?.message, e?.details, e?.hint]
    .map((v) => (typeof v === "string" ? v : ""))
    .join(" ");
  return blob.includes(FAB_RELEASE_BLOCKED_PREFIX);
}

/** Derive the typed status for the pre-flight UI from a gate result + override intent. */
export function deriveReleaseStatus(
  gate: { blocked: boolean } | null | undefined,
  hasOverride: boolean,
): ReleaseStatus {
  if (!gate?.blocked) return "clean";
  return hasOverride ? "overridden" : "blocked";
}

/**
 * Record a fab release — the SERVER decides. Inserts into `fab_release_log`;
 * the gate trigger blocks open-RFI releases that lack an override reason and
 * snapshots the authoritative blocking set onto the row.
 *
 * `released_by` is left to the column default (auth.uid()) so it always matches
 * the RLS insert check; callers must not pass it.
 *
 * @returns the inserted release record (with the server-snapshotted blocking set)
 * @throws {FabReleaseBlockedError} when the gate refuses (open RFIs, no override)
 * @throws {Error} on any other failure (RLS role denial, network, …)
 */
export async function recordFabRelease(
  supabase: SupabaseClient,
  input: FabReleaseInput,
): Promise<FabReleaseRecord> {
  const drawingIds = (input.drawingIds || []).filter(Boolean);
  const overrideReason = (input.overrideReason || "").trim() || null;

  const { data, error } = await supabase
    .from("fab_release_log")
    .insert({
      project_id: input.projectId,
      package_kind: input.packageKind,
      package_name: input.packageName ?? null,
      drawing_ids: drawingIds,
      drawing_count: drawingIds.length,
      override_reason: overrideReason,
    })
    .select()
    .single();

  if (error) {
    if (isFabReleaseBlocked(error)) {
      throw new FabReleaseBlockedError(
        error.message || "Fab release blocked by open RFIs",
        parseBlockedRfiNumbers(error.message || ""),
      );
    }
    throw error;
  }
  return data as FabReleaseRecord;
}
