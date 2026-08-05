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
  drawing_revision_id: string;
  drawing_id: string | null;
  sheet_number: string | null;
  sheet_title: string | null;
  revision_code: string | null;
}

export interface TransmittalRow {
  id: string;
  project_id: string;
  transmittal_number: string;
  direction: "incoming" | "outgoing" | "internal";
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

export function useTransmittals(projectId: string | null) {
  return useQuery({
    queryKey: ["drawing-transmittals", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<TransmittalRow[]> => {
      const [rawTransmittals, rawItems, rawRevisions] = await Promise.all([
        entities.DrawingTransmittal.filter({ project_id: projectId }),
        entities.DrawingTransmittalItem.filter({ project_id: projectId }),
        entities.DrawingRevision.filter({ project_id: projectId }),
      ]);

      const revisionsById = new Map<string, any>();
      for (const revision of (rawRevisions as any[]) ?? []) {
        if (revision?.id) revisionsById.set(String(revision.id), revision);
      }

      const itemsByTransmittal = new Map<string, TransmittalAttachment[]>();
      for (const it of (rawItems as any[]) ?? []) {
        const tid = String(it?.transmittal_id ?? "");
        const revisionId = String(it?.drawing_revision_id ?? "");
        if (!tid || !revisionId) continue;
        const revision = revisionsById.get(revisionId);
        const attachment: TransmittalAttachment = {
          id: String(it.id),
          drawing_revision_id: revisionId,
          drawing_id: revision?.drawing_id ? String(revision.drawing_id) : null,
          sheet_number: revision?.sheet_number ?? null,
          sheet_title: revision?.sheet_title ?? null,
          revision_code: revision?.revision_code ?? null,
        };
        const transmittalItems = itemsByTransmittal.get(tid) ?? [];
        transmittalItems.push(attachment);
        itemsByTransmittal.set(tid, transmittalItems);
      }

      return ((rawTransmittals as any[]) ?? [])
        .filter((t) => !t.is_deleted)
        .map((t) => {
          const items = (itemsByTransmittal.get(String(t.id)) ?? []).sort((a, b) =>
            String(a.sheet_number || "").localeCompare(String(b.sheet_number || ""), undefined, { numeric: true })
            || String(a.revision_code || "").localeCompare(String(b.revision_code || ""), undefined, { numeric: true }),
          );
          return { ...t, items, item_count: items.length };
        })
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    },
  });
}
