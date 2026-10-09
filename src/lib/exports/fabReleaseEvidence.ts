/** Complete project-scoped reads used by fabrication and turnover exports. */
import { supabase } from "@/lib/supabase";
import { hydrateSubmittalRevisionCoverage } from '@/api/client/submittalWorkflow';
import { fetchAllRows, type PageResult } from "@/lib/pagedQuery";

/** Keep each PostgREST `in` filter short, then page every result in that filter. */
const DRAWING_ID_CHUNK_SIZE = 500;

export interface FabSubmittalRow {
  current_round_id?: string | null;
  revision_coverage?: import('@/lib/submittalRevisionEvidence').RevisionCoverageSummary | null;
  id: string;
  submittal_type: string | null;
  status: string;
  ball_in_court: string | null;
  drawing_set_ids: string[] | null;
  submitted_date: string | null;
  updated_at: string | null;
  round_number: number | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
}

export interface FabSignoffRow {
  id: string;
  drawing_id: string;
  drawing_revision_id: string;
  stamp_type: string;
  stamped_by_name: string | null;
  stamped_at: string | null;
  is_voided: boolean;
}

export interface FabRevisionRow {
  id: string;
  drawing_id: string;
  is_current: boolean;
  archived_at: string | null;
}

export interface FabRfiRow {
  id: string;
  rfi_number: string | null;
  title: string | null;
  status: string | null;
  is_deleted: boolean | null;
  ball_in_court: string | null;
}

export interface FabApprovalEvidenceRows {
  submittals: FabSubmittalRow[];
  drawingSignoffs: FabSignoffRow[];
  drawingRevisions: FabRevisionRow[];
}

function drawingIdChunks(drawingIds: readonly string[]): string[][] {
  const uniqueIds = [...new Set(drawingIds.filter((id) => typeof id === "string" && id.length > 0))];
  const chunks: string[][] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += DRAWING_ID_CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(offset, offset + DRAWING_ID_CHUNK_SIZE));
  }
  return chunks;
}

async function fetchForDrawingIds<T>(
  drawingIds: readonly string[],
  label: string,
  page: (ids: string[], start: number, end: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (const ids of drawingIdChunks(drawingIds)) {
    rows.push(...await fetchAllRows((start, end) => page(ids, start, end), label));
  }
  return rows;
}

/** An incomplete or errored page rejects the entire evidence load. */
export async function loadFabApprovalEvidence(
  projectId: string,
  drawingIds: readonly string[],
): Promise<FabApprovalEvidenceRows> {
  const [submittals, drawingSignoffs, drawingRevisions] = await Promise.all([
    fetchAllRows<FabSubmittalRow>(async (start, end) => {
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase
        .from("submittals")
        .select("id, submittal_type, status, ball_in_court, drawing_set_ids, current_round_id, submitted_date, updated_at, round_number, is_deleted, deleted_at")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .order("id")
        .range(start, end);
      return { data: data as FabSubmittalRow[] | null, error };
    }, "fabrication approval submittals"),
    fetchForDrawingIds<FabSignoffRow>(drawingIds, "fabrication sign-offs", async (ids, start, end) => {
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase
        .from("drawing_signoffs")
        .select("id, drawing_id, drawing_revision_id, stamp_type, stamped_by_name, stamped_at, is_voided")
        .eq("project_id", projectId)
        .in("drawing_id", ids)
        .eq("is_voided", false)
        .order("id")
        .range(start, end);
      return { data: data as FabSignoffRow[] | null, error };
    }),
    fetchForDrawingIds<FabRevisionRow>(drawingIds, "drawing revision ledger", async (ids, start, end) => {
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase
        .from("drawing_revisions")
        .select("id, drawing_id, is_current, archived_at")
        .eq("project_id", projectId)
        .in("drawing_id", ids)
        .order("id")
        .range(start, end);
      return { data: data as FabRevisionRow[] | null, error };
    }),
  ]);
  return { submittals: await hydrateSubmittalRevisionCoverage(submittals), drawingSignoffs, drawingRevisions };
}

/** RFI numbers are free-text links on sheets, so read the whole project register. */
export async function loadFabGateRfis(projectId: string): Promise<FabRfiRow[]> {
  return fetchAllRows<FabRfiRow>(async (start, end) => {
    // eslint-disable-next-line no-restricted-syntax
    const { data, error } = await supabase
      .from("rfis")
      .select("id, rfi_number, title, status, is_deleted, ball_in_court")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("id")
      .range(start, end);
    return { data: data as FabRfiRow[] | null, error };
  }, "fabrication gate RFIs");
}

/** A stamp must name both this drawing and its own current revision. */
export function currentRevisionSignoffs(evidence: FabApprovalEvidenceRows): FabSignoffRow[] {
  const currentDrawingByRevision = new Map(
    evidence.drawingRevisions
      .filter((revision) => revision.is_current && !revision.archived_at)
      .map((revision) => [revision.id, revision.drawing_id]),
  );
  return evidence.drawingSignoffs.filter((signoff) =>
    !signoff.is_voided
    && currentDrawingByRevision.get(signoff.drawing_revision_id) === signoff.drawing_id,
  );
}

/** The CSV builder's legacy sign-off shape uses different names than the table. */
export function toFabManifestSignoffs(signoffs: readonly FabSignoffRow[]): Array<{
  drawing_id: string;
  signed_by: string | null;
  signed_at: string | null;
  status: string;
}> {
  return signoffs.map((signoff) => ({
    drawing_id: signoff.drawing_id,
    signed_by: signoff.stamped_by_name,
    signed_at: signoff.stamped_at,
    status: signoff.stamp_type,
  }));
}
