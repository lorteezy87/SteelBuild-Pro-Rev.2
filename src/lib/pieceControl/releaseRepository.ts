import { supabase } from "@/lib/supabase";
import { unwrapPieceControlRpc } from "./rpcResult";

export interface ReleaseGateCheck {
  passed: boolean;
  blockers: string[];
  piece_count?: number;
  linked_count?: number;
  approved_count?: number;
  missing_count?: number;
  unmapped_piece_count?: number;
  requirement_count?: number;
  received_or_on_hand_count?: number;
  held_piece_count?: number;
}

export interface CanonicalReleaseGate {
  work_package_id: string;
  project_id: string;
  passes: boolean;
  already_released: boolean;
  checks: {
    scope: ReleaseGateCheck;
    drawings: ReleaseGateCheck;
    material: ReleaseGateCheck;
    holds: ReleaseGateCheck;
  };
  blockers: string[];
  evaluated_at: string;
}

export interface CanonicalReleaseResult {
  release_id: string;
  release_number: string;
  work_package_id: string;
  released_at: string;
  is_exception: boolean;
  risk_id: string | null;
  gate_snapshot: CanonicalReleaseGate;
}

const db = supabase as any;

export async function evaluateCanonicalReleaseGate(
  workPackageId: string,
): Promise<CanonicalReleaseGate> {
  const { data, error } = await db.rpc("evaluate_release_gate", {
    p_work_package_id: workPackageId,
  });
  if (error) throw error;
  return data as CanonicalReleaseGate;
}

export async function releaseCanonicalWorkPackage(
  workPackageId: string,
  exceptionReason: string | null,
): Promise<CanonicalReleaseResult> {
  const { data, error } = await db.rpc("release_work_package_canonical", {
    p_work_package_id: workPackageId,
    p_exception_reason: exceptionReason,
  });
  if (error) throw error;
  return unwrapPieceControlRpc(data as CanonicalReleaseResult);
}
