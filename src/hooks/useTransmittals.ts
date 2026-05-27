/**
 * useTransmittals — the drawing transmittal / distribution log for a project:
 * each transmittal (who sent/received which revisions, when) plus a count of the
 * revisions attached to it. drawing_transmittals is not a SOFT_DELETE_TABLES
 * member, so is_deleted is filtered here, not by the entity client.
 */
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

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
  item_count: number;
}

export function useTransmittals(projectId: string | null) {
  return useQuery({
    queryKey: ["drawing-transmittals", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<TransmittalRow[]> => {
      const [rawTransmittals, rawItems] = await Promise.all([
        base44.entities.DrawingTransmittal.filter({ project_id: projectId }),
        base44.entities.DrawingTransmittalItem.filter({ project_id: projectId }),
      ]);
      const counts = new Map<string, number>();
      for (const it of (rawItems as any[]) ?? []) {
        const tid = String(it?.transmittal_id ?? "");
        if (tid) counts.set(tid, (counts.get(tid) || 0) + 1);
      }
      return ((rawTransmittals as any[]) ?? [])
        .filter((t) => !t.is_deleted)
        .map((t) => ({ ...t, item_count: counts.get(String(t.id)) || 0 }))
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    },
  });
}
