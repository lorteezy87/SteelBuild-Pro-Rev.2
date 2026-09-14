/**
 * Fab-release domain model + the SERVER-ARBITRATED release service.
 *
 * The fab-release gate is enforced server-side: recording a release inserts a
 * row into `public.fab_release_log`, whose BEFORE INSERT trigger refuses the
 * insert when the package is not ready — unless an explicit override reason is
 * supplied. Callers go through `recordFabRelease()` and never write the table
 * directly.
 *
 * Package-scope preflight (`evaluate_fab_release_package`) evaluates the FULL
 * package membership (including superseded/rejected siblings) before the insert
 * that may only list approved drawing_ids for the export artifact.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Where a package stands relative to the fab-release gate. */
export type ReleaseStatus =
  | "clean" // package ready
  | "blocked" // not releasable without an override
  | "overridden"; // released despite blockers, with a reason on record

/** The two gated release flavors (claims packages are NOT gated). */
export type FabReleaseKind = "fab_release" | "turnover";

export interface FabReleaseInput {
  projectId: string;
  packageKind: FabReleaseKind;
  packageName?: string | null;
  /** Drawing IDs recorded on the release row (typically approved-for-fab only). */
  drawingIds: string[];
  /**
   * Full package membership used for gate evaluation. When omitted, `drawingIds`
   * is evaluated. Pass the unfiltered package so superseded/rejected siblings
   * cannot be bypassed by inserting only approved IDs.
   */
  packageDrawingIds?: string[];
  /** Reason to release past the gate when blockers exist; null/"" = clean release. */
  overrideReason?: string | null;
}

export interface FabReleasePackageBlocker {
  kind: string;
  title: string;
  sheet_numbers?: string[] | null;
  rfi_numbers?: string[] | null;
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

/** Thrown when the server gate refuses a release. */
export class FabReleaseBlockedError extends Error {
  readonly blocked = true as const;
  readonly blockingRfiNumbers: string[];
  readonly blockers: FabReleasePackageBlocker[];
  constructor(
    message: string,
    blockingRfiNumbers: string[] = [],
    blockers: FabReleasePackageBlocker[] = [],
  ) {
    super(message);
    this.name = "FabReleaseBlockedError";
    this.blockingRfiNumbers = blockingRfiNumbers;
    this.blockers = blockers;
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

function formatPackageBlockers(blockers: FabReleasePackageBlocker[]): string {
  if (!blockers.length) return "This package is not ready for fabrication release.";
  const parts = blockers.map((b) => {
    const sheets = (b.sheet_numbers || []).filter(Boolean);
    const rfis = (b.rfi_numbers || []).filter(Boolean);
    if (rfis.length) return `${b.title} (${rfis.join(", ")})`;
    if (sheets.length) return `${b.title}: ${sheets.join(", ")}`;
    return b.title;
  });
  return `FAB_RELEASE_BLOCKED: ${parts.join(" · ")}. Resolve them or release with an override reason.`;
}

/**
 * Server package-scope preflight. Returns structured blockers for the UI / service.
 */
export async function evaluateFabReleasePackage(
  supabase: SupabaseClient,
  drawingIds: string[],
): Promise<FabReleasePackageBlocker[]> {
  const ids = (drawingIds || []).filter(Boolean);
  if (!ids.length) return [];

  const callRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: FabReleasePackageBlocker[] | null; error: { message?: string } | null }>;

  const { data, error } = await callRpc("evaluate_fab_release_package", {
    p_drawing_ids: ids,
  });
  if (error) {
    // Fail closed when the RPC is unavailable — do not silently skip the package gate.
    throw new Error(
      error.message ||
        "Could not evaluate fabrication-release readiness for this package.",
    );
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Record a fab release — the SERVER decides. Package membership is evaluated
 * first (so sibling superseded/rejected sheets cannot be bypassed), then the
 * approved drawing_ids are inserted into `fab_release_log`.
 *
 * `released_by` is left to the column default (auth.uid()) so it always matches
 * the RLS insert check; callers must not pass it.
 *
 * @returns the inserted release record (with the server-snapshotted blocking set)
 * @throws {FabReleaseBlockedError} when the gate refuses
 * @throws {Error} on any other failure (RLS role denial, network, …)
 */
export async function recordFabRelease(
  supabase: SupabaseClient,
  input: FabReleaseInput,
): Promise<FabReleaseRecord> {
  const drawingIds = (input.drawingIds || []).filter(Boolean);
  const packageDrawingIds = (input.packageDrawingIds || drawingIds).filter(Boolean);
  const overrideReason = (input.overrideReason || "").trim() || null;

  if (!overrideReason) {
    const blockers = await evaluateFabReleasePackage(supabase, packageDrawingIds);
    if (blockers.length) {
      const rfiNums = blockers.flatMap((b) => b.rfi_numbers || []).filter(Boolean) as string[];
      throw new FabReleaseBlockedError(formatPackageBlockers(blockers), rfiNums, blockers);
    }
  }

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
        error.message || "Fab release blocked",
        parseBlockedRfiNumbers(error.message || ""),
      );
    }
    throw error;
  }
  return data as FabReleaseRecord;
}
