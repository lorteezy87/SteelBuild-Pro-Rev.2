import { supabase } from "@/lib/supabase";
import { unwrapPieceControlRpc } from "./rpcResult";
import type { BulkPieceAttributePatch } from "./bulkUpdatePieces";

export type BulkUpdatePieceAttributesResult = {
  project_id: string;
  updated: number;
  unchanged: number;
  fields: string[];
};

export async function bulkUpdatePieceAttributes(
  projectId: string,
  pieceIds: string[],
  patch: BulkPieceAttributePatch,
): Promise<BulkUpdatePieceAttributesResult> {
  const { data, error } = await (supabase as any).rpc(
    "bulk_update_piece_attributes",
    {
      p_project_id: projectId,
      p_piece_ids: pieceIds,
      p_patch: patch,
    },
  );
  if (error) throw error;
  return unwrapPieceControlRpc(
    data as BulkUpdatePieceAttributesResult,
  );
}
