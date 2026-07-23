import { supabase } from "@/lib/supabase";
import type { PieceRegisterRow } from "./repository";
import type { LogisticsAction } from "./lifecycle";
import { unwrapPieceControlRpc } from "./rpcResult";

const LOGISTICS_EVENT_PIECE_BATCH_SIZE = 100;

export interface PieceLogisticsEvent {
  id: string;
  project_id: string;
  piece_id: string;
  event_type: "shipped" | "delivered" | "erected";
  previous_state: Record<string, unknown>;
  next_state: {
    lifecycle_status?: string;
    reference_data?: Record<string, unknown>;
  };
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LogisticsSnapshot {
  pieces: PieceRegisterRow[];
  events: PieceLogisticsEvent[];
}

export async function fetchLogisticsSnapshot(
  projectId: string,
  workPackageId?: string,
): Promise<LogisticsSnapshot> {
  const db = supabase as any;
  let piecesQuery = db
    .from("pieces")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .is("deleted_at", null)
    .order("normalized_piece_mark")
    .order("lot_code");
  if (workPackageId) piecesQuery = piecesQuery.eq("work_package_id", workPackageId);

  const piecesResult = await piecesQuery;
  if (piecesResult.error) throw piecesResult.error;

  const pieces = (piecesResult.data ?? []) as PieceRegisterRow[];
  const pieceIds = pieces.map((piece) => piece.id);
  if (pieceIds.length === 0) return { pieces, events: [] };

  const events: PieceLogisticsEvent[] = [];
  for (let start = 0; start < pieceIds.length; start += LOGISTICS_EVENT_PIECE_BATCH_SIZE) {
    const eventsResult = await db
      .from("piece_events")
      .select("*")
      .eq("project_id", projectId)
      .in("piece_id", pieceIds.slice(start, start + LOGISTICS_EVENT_PIECE_BATCH_SIZE))
      .in("event_type", ["shipped", "delivered", "erected"])
      .order("created_at", { ascending: false });
    if (eventsResult.error) throw eventsResult.error;
    events.push(...((eventsResult.data ?? []) as PieceLogisticsEvent[]));
  }
  events.sort((left, right) => right.created_at.localeCompare(left.created_at));

  return {
    pieces,
    events,
  };
}

export async function transitionPieceLots(
  action: LogisticsAction,
  projectId: string,
  pieceIds: string[],
  referenceData: Record<string, string>,
): Promise<void> {
  const rpcName = {
    ship: "ship_piece_lots",
    deliver: "deliver_piece_lots",
    erect: "erect_piece_lots",
  }[action];
  const cleanedReferenceData = Object.fromEntries(
    Object.entries(referenceData)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => Boolean(value)),
  );
  const { data, error } = await (supabase as any).rpc(rpcName, {
    p_project_id: projectId,
    p_piece_ids: pieceIds,
    p_reference_data: cleanedReferenceData,
  });
  if (error) throw error;
  unwrapPieceControlRpc(data);
}
