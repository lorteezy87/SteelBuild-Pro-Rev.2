import { entities } from "@/api/supabaseClient";
import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import { supabase } from "@/lib/supabase";
import type {
  PieceIntelligenceEvent,
  PieceIntelligenceRfi,
  PieceIntelligenceSnapshot,
  SourceAvailability,
} from "./pieceIntelligenceTypes";
import {
  fetchPieceRelationshipSnapshot,
  type RelationshipSourceAvailability,
} from "./relationshipsRepository";

interface OptionalSourceResult<T> {
  rows: T[];
  availability: SourceAvailability;
}

const db = supabase as any;

async function optionalSource<T>(
  source: string,
  read: () => Promise<T[]>,
): Promise<OptionalSourceResult<T>> {
  try {
    return { rows: await read(), availability: "available" };
  } catch (error) {
    console.warn(`[piece-intelligence] optional ${source} source unavailable:`, error);
    return { rows: [], availability: "unavailable" };
  }
}

async function fetchPieceEvents(projectId: string): Promise<PieceIntelligenceEvent[]> {
  const rows: PieceIntelligenceEvent[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("piece_events")
      .select("id, project_id, piece_id, event_type, previous_state, next_state, reason, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as PieceIntelligenceEvent[]));
    if (!data || data.length < pageSize) return rows;
  }
}

function requiredRelationshipSourcesAvailable(
  availability: RelationshipSourceAvailability,
): boolean {
  return [
    availability.pieceDrawings,
    availability.pieceDrawingSets,
    availability.drawings,
    availability.drawingSets,
    availability.revisions,
  ].every((source) => source === "available");
}

export async function fetchPieceIntelligenceSnapshot(
  projectId: string,
): Promise<PieceIntelligenceSnapshot> {
  const relationships = await fetchPieceRelationshipSnapshot(projectId);
  const [impacts, rfis, events] = await Promise.all([
    optionalSource("drawing impacts", () =>
      entities.DrawingImpact.filter({ project_id: projectId }) as unknown as Promise<DrawingImpactRow[]>
    ),
    optionalSource("RFIs", () =>
      entities.RFI.filter({ project_id: projectId }) as Promise<PieceIntelligenceRfi[]>
    ),
    optionalSource("piece events", () => fetchPieceEvents(projectId)),
  ]);

  return {
    ...relationships,
    drawingImpacts: impacts.rows,
    rfis: rfis.rows,
    pieceEvents: events.rows,
    availability: {
      relationships: requiredRelationshipSourcesAvailable(relationships.sourceAvailability)
        ? "available"
        : "unavailable",
      approvals: relationships.sourceAvailability.approvals,
      impacts: impacts.availability,
      rfis: rfis.availability,
      events: events.availability,
    },
  };
}
