/**
 * markupExportData — the reads behind "Export Markup PDF".
 *
 * Lifted out of ExportMarkupPDFModal so the two server reads are paged, typed
 * and testable, and so the modal holds no raw `supabase.from()` of its own.
 *
 * Both reads feed a DOCUMENT THAT LEAVES THE BUILDING — a marked-up drawing set
 * sent to a GC, an EOR or the shop. pagedQuery's own header names exports as the
 * case where short data is simply wrong, citing the claims package that shipped
 * incomplete for exactly this reason. So both page to completeness with
 * `fetchAllRows`, and neither swallows a failure: a read that cannot be
 * completed fails the export instead of quietly producing a PDF that looks
 * finished and is missing redlines.
 */
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/pagedQuery";

/**
 * Max drawing ids per `.in()` filter. Mirrors BULK_CHUNK_SIZE in
 * src/api/client/entityClient.ts — it keeps the URL and the resulting statement
 * inside PostgREST/Postgres limits. This is a limit on the FILTER, not on the
 * rows: each chunk is then paged to completeness.
 */
export const EXPORT_ID_CHUNK_SIZE = 500;

/** A markup row as the PDF helper's legacy item shape needs it. */
export interface MarkupRow {
  id: string;
  drawing_id: string;
  markup_type: string | null;
  page_number: number | null;
  status: string | null;
  comment: string | null;
  color: string | null;
  payload: unknown;
  author_name: string | null;
  author_email: string | null;
  created_at: string | null;
}

/**
 * A sign-off in the shape `generateMarkupSummaryPdf` documents and renders
 * (`signed_by · signed_at · status`, markupPDF.js:181 and :371).
 *
 * The TABLE does not use those names. Its columns are `stamped_by_name`,
 * `stamped_at` and `stamp_type` — verified against production. The modal used
 * to `select("drawing_id, signed_by, signed_at, status")`, three columns that
 * have never existed, so PostgREST rejected the request and the caller's
 * `console.warn` swallowed it: **every exported PDF has shipped with an empty
 * sign-off section since the feature was written.** The mapping lives here so
 * the PDF helper stays pure and its documented contract is unchanged.
 */
export interface SignoffRow {
  drawing_id: string;
  signed_by: string | null;
  signed_at: string | null;
  status: string | null;
}

function chunkIds(ids: readonly string[]): string[][] {
  const clean = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  const chunks: string[][] = [];
  for (let i = 0; i < clean.length; i += EXPORT_ID_CHUNK_SIZE) {
    chunks.push(clean.slice(i, i + EXPORT_ID_CHUNK_SIZE));
  }
  return chunks;
}

/**
 * Every markup row for the given sheets.
 *
 * A whole-set export covers every sheet in the set, so this read is the one
 * most likely to pass PostgREST's 1000-row ceiling — and a truncated read is
 * indistinguishable from a sheet that simply has no redlines on it.
 *
 * Ordered by `created_at` (the order the PDF lists items in) with `id` as the
 * stable unique tiebreaker paging requires — `created_at` is not unique, and
 * `.range()` windows over a non-total order can skip or repeat rows.
 */
export async function fetchMarkupRows(drawingIds: readonly string[]): Promise<MarkupRow[]> {
  const rows: MarkupRow[] = [];
  for (const ids of chunkIds(drawingIds)) {
    const chunk = await fetchAllRows<MarkupRow>(
      async (start, end) => {
        // The no-restricted-syntax rule matches any `supabase.from()`, including
        // inside the page callback it recommends, so fetchAllRows cannot be used
        // without this. `.range()` is what bounds the read.
        // eslint-disable-next-line no-restricted-syntax
        const { data, error } = await supabase
          .from("drawing_markups")
          .select(
            "id, drawing_id, markup_type, page_number, status, comment, color, payload, author_name, author_email, created_at",
          )
          .in("drawing_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(start, end);
        return { data: data as MarkupRow[] | null, error };
      },
      "markup rows",
    );
    rows.push(...chunk);
  }
  return rows;
}

/**
 * The CURRENT revision id of each given sheet.
 *
 * `drawing_revisions.is_current` is the canonical marker — the viewer resolves
 * its `currentRevision` the same way and hands that id to `listSignoffs`. The
 * `drawings` table has no current-revision column (only `revision_number`), so
 * this is the only place the answer lives.
 */
async function fetchCurrentRevisionIds(drawingIds: readonly string[]): Promise<string[]> {
  const revisionIds: string[] = [];
  for (const ids of chunkIds(drawingIds)) {
    const chunk = await fetchAllRows<{ id: string }>(
      async (start, end) => {
        // eslint-disable-next-line no-restricted-syntax
        const { data, error } = await supabase
          .from("drawing_revisions")
          .select("id")
          .in("drawing_id", ids)
          .eq("is_current", true)
          .order("id", { ascending: true })
          .range(start, end);
        return { data: data as { id: string }[] | null, error };
      },
      "current revisions",
    );
    for (const row of chunk) revisionIds.push(row.id);
  }
  return revisionIds;
}

/**
 * Every live sign-off for the CURRENT revision of the given sheets, mapped to
 * the PDF helper's shape.
 *
 * Scoped by revision, not by drawing. Sign-offs are revision-scoped — the
 * viewer's `listSignoffs` filters on `drawing_revision_id` whenever it has one
 * (drawingHub/signoffs.js:63) — so filtering only on `drawing_id` returns every
 * approval ever recorded for the sheet, including ones belonging to superseded
 * revisions. On a shop-facing PDF that prints an approval of revision A
 * underneath current revision B and asserts B was approved when nobody approved
 * it. Caught by a Codex review of this PR before it shipped.
 *
 * That risk arrived WITH this PR: before it, the sign-off query named columns
 * that do not exist and the section was always empty, so nothing could print.
 * Repairing the query is what made a stale approval printable. Nothing has
 * actually gone out wrong — production currently has 0 non-voided sign-offs on
 * superseded revisions — but drawings with multiple revisions do exist, so it
 * would have fired the first time someone re-stamped a resubmitted sheet.
 *
 * A sheet with no current revision contributes no revision id and therefore no
 * sign-offs, which is correct: nothing current means nothing approved.
 *
 * `is_voided` rows are excluded — a retracted stamp must not print as a
 * sign-off. Ordered by `stamped_at` with `id` as the unique tiebreaker, for the
 * same paging reason as above.
 */
export async function fetchSignoffRows(drawingIds: readonly string[]): Promise<SignoffRow[]> {
  const rows: SignoffRow[] = [];
  const currentRevisionIds = await fetchCurrentRevisionIds(drawingIds);
  for (const ids of chunkIds(currentRevisionIds)) {
    const chunk = await fetchAllRows<{
      drawing_id: string;
      stamped_by_name: string | null;
      stamped_at: string | null;
      stamp_type: string | null;
    }>(
      async (start, end) => {
        // eslint-disable-next-line no-restricted-syntax
        const { data, error } = await supabase
          .from("drawing_signoffs")
          .select("id, drawing_id, stamped_by_name, stamped_at, stamp_type")
          .in("drawing_revision_id", ids)
          .eq("is_voided", false)
          .order("stamped_at", { ascending: true })
          .order("id", { ascending: true })
          .range(start, end);
        return { data: data as { drawing_id: string; stamped_by_name: string | null; stamped_at: string | null; stamp_type: string | null }[] | null, error };
      },
      "sign-off rows",
    );
    for (const row of chunk) {
      rows.push({
        drawing_id: row.drawing_id,
        signed_by: row.stamped_by_name,
        signed_at: row.stamped_at,
        status: row.stamp_type,
      });
    }
  }
  return rows;
}
