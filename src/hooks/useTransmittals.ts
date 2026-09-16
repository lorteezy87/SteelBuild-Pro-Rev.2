/**
 * useTransmittals — the drawing transmittal / distribution log for a project:
 * each transmittal (who sent/received which revisions, when) plus the immutable
 * revision metadata for every attached sheet. drawing_transmittals is not a
 * SOFT_DELETE_TABLES member, so is_deleted is filtered here, not by the entity
 * client.
 */
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";

export interface TransmittalAttachment {
  id: string;
  /**
   * The revision it carried, or null when none was recorded. The shared DB
   * (2026's m4_1) keys items by drawing_id; send_transmittal fills this only
   * when the sheet had a current drawing_revisions row at send time.
   */
  drawing_revision_id: string | null;
  drawing_id: string | null;
  sheet_number: string | null;
  sheet_title: string | null;
  revision_code: string | null;
}

/**
 * m4_1's lifecycle. 'void' is the only retraction of a sent transmittal (a
 * sent one can't be soft-deleted). Rev.2's own inserts land as 'draft', dated
 * or not. Null/absent: a row from before the column existed.
 */
export type TransmittalStatus = "draft" | "sent" | "acknowledged" | "void";

export interface TransmittalRow {
  id: string;
  project_id: string;
  transmittal_number: string;
  direction: "incoming" | "outgoing" | "internal";
  status?: TransmittalStatus | null;
  source_company: string | null;
  received_from: string | null;
  sent_to: string | null;
  subject: string | null;
  date_sent: string | null;
  date_received: string | null;
  notes: string | null;
  created_at: string;
  is_deleted?: boolean;
  items: TransmittalAttachment[];
  item_count: number;
}

/**
 * EFFECTIVE_LIST_CAP (src/api/client/entityClient.ts): the row count at which a
 * default filter() read is cut off, PostgREST's 1000-row ceiling. Mirrored, not
 * imported: page tests mock "@/api/supabaseClient", and reading a named export
 * the mock doesn't define throws, which inside this queryFn would turn every
 * such test's log read into a quiet query error (ListTruncationNotice mirrors it
 * for the same reason). useTransmittals.test pins the two equal.
 */
export const TRANSMITTAL_LOG_READ_CAP = 1000;

/**
 * The log as the query returns it: the rows, plus `possiblyTruncated` when the
 * transmittals or items read came back at TRANSMITTAL_LOG_READ_CAP rows. Those
 * reads are newest first, so a cap drops the OLDEST rows without a trace, and a
 * set sent only on them would otherwise look never sent.
 *
 * The flag is a non-enumerable property on the array, so the Transmittals tab
 * and every other consumer still get a plain-looking array (spreads, equality
 * and JSON never see it). A log built anywhere else reads as complete.
 */
export type TransmittalLog = TransmittalRow[] & { readonly possiblyTruncated?: boolean };

function withTruncationFlag(rows: TransmittalRow[], possiblyTruncated: boolean): TransmittalLog {
  return Object.defineProperty(rows, "possiblyTruncated", { value: possiblyTruncated, enumerable: false });
}

/**
 * `enabled` lets a consumer that only needs the log on one tab (the Detailing
 * hub's Approval Matrix) defer the three-table read until that tab is open.
 */
export function useTransmittals(projectId: string | null, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ["drawing-transmittals", projectId],
    enabled: !!projectId && enabled,
    staleTime: 60_000,
    // Structural sharing rebuilds a changed array without the non-enumerable
    // flag, so a refetch would silently clear it. The log is rebuilt on every
    // fetch anyway.
    structuralSharing: false,
    queryFn: async (): Promise<TransmittalLog> => {
      const [rawTransmittals, rawItems, rawRevisions] = await Promise.all([
        entities.DrawingTransmittal.filter({ project_id: projectId }),
        entities.DrawingTransmittalItem.filter({ project_id: projectId }),
        // Paged to completeness: this is a LOOKUP TABLE keyed by revision id,
        // not a list. Capped at PostgREST's 1000 rows, every row whose revision
        // sat past the cap resolved to a blank sheet number and revision code —
        // indistinguishable from a genuinely unmatched row.
        entities.DrawingRevision.filterAll({ project_id: projectId }),
      ]);
      // Counted on the raw reads, before soft-deleted headers are dropped.
      // Revisions are read paged (above), so an unmatched item now means the
      // revision really is missing — it no longer also means "your project has
      // more than 1000 revisions".
      const possiblyTruncated =
        ((rawTransmittals as any[]) ?? []).length >= TRANSMITTAL_LOG_READ_CAP ||
        ((rawItems as any[]) ?? []).length >= TRANSMITTAL_LOG_READ_CAP;

      const revisionsById = new Map<string, any>();
      for (const revision of (rawRevisions as any[]) ?? []) {
        if (revision?.id) revisionsById.set(String(revision.id), revision);
      }

      const itemsByTransmittal = new Map<string, TransmittalAttachment[]>();
      for (const it of (rawItems as any[]) ?? []) {
        const tid = String(it?.transmittal_id ?? "");
        // A GC / contract drawing (m4_1's gc_drawing_id) is not a Rev.2 sheet.
        if (!tid || it?.gc_drawing_id) continue;
        // Kept without a revision: m4_1 items carry drawing_id, and a sheet
        // with no current revision at send leaves drawing_revision_id NULL.
        const revisionId = it?.drawing_revision_id ? String(it.drawing_revision_id) : "";
        const revision = revisionId ? revisionsById.get(revisionId) : undefined;
        const attachment: TransmittalAttachment = {
          id: String(it.id),
          drawing_revision_id: revisionId || null,
          drawing_id: it.drawing_id ? String(it.drawing_id) : revision?.drawing_id ? String(revision.drawing_id) : null,
          sheet_number: revision?.sheet_number ?? it.number_at_send ?? null,
          sheet_title: revision?.sheet_title ?? it.title_at_send ?? null,
          revision_code: revision?.revision_code ?? it.revision_at_send ?? null,
        };
        const transmittalItems = itemsByTransmittal.get(tid) ?? [];
        transmittalItems.push(attachment);
        itemsByTransmittal.set(tid, transmittalItems);
      }

      const rows = ((rawTransmittals as any[]) ?? [])
        .filter((t) => !t.is_deleted)
        .map((t) => {
          const items = (itemsByTransmittal.get(String(t.id)) ?? []).sort((a, b) =>
            String(a.sheet_number || "").localeCompare(String(b.sheet_number || ""), undefined, { numeric: true })
            || String(a.revision_code || "").localeCompare(String(b.revision_code || ""), undefined, { numeric: true }),
          );
          return { ...t, items, item_count: items.length };
        })
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      return withTruncationFlag(rows, possiblyTruncated);
    },
  });
}
