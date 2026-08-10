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
const sourcePageSize = 1000;

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

type PersistedDrawingImpact = Omit<
  DrawingImpactRow,
  "sheet_number" | "sheet_title" | "revision_code"
>;

async function fetchDrawingImpacts(projectId: string): Promise<DrawingImpactRow[]> {
  const rows: PersistedDrawingImpact[] = [];
  for (let from = 0; ; from += sourcePageSize) {
    const { data, error } = await db
      .from("drawing_impacts")
      .select("id, project_id, drawing_revision_id, impact_type, status, priority, title, notes, assigned_to, due_date, resolved_at, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + sourcePageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as PersistedDrawingImpact[]));
    if (!data || data.length < sourcePageSize) break;
  }
  return rows.map((impact) => ({
    ...impact,
    sheet_number: null,
    sheet_title: null,
    revision_code: null,
  }));
}

async function fetchRfis(projectId: string): Promise<PieceIntelligenceRfi[]> {
  const rows: PieceIntelligenceRfi[] = [];
  for (let from = 0; ; from += sourcePageSize) {
    const { data, error } = await db
      .from("rfis")
      .select("id, project_id, rfi_number, status, work_package_id")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + sourcePageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as PieceIntelligenceRfi[]));
    if (!data || data.length < sourcePageSize) return rows;
  }
}

async function fetchPieceEvents(projectId: string): Promise<PieceIntelligenceEvent[]> {
  const rows: PieceIntelligenceEvent[] = [];

  for (let from = 0; ; from += sourcePageSize) {
    const { data, error } = await db
      .from("piece_events")
      .select("id, project_id, piece_id, event_type, previous_state, next_state, reason, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + sourcePageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as PieceIntelligenceEvent[]));
    if (!data || data.length < sourcePageSize) return rows;
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
    optionalSource("drawing impacts", () => fetchDrawingImpacts(projectId)),
    optionalSource("RFIs", () => fetchRfis(projectId)),
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
