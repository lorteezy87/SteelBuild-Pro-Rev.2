import { supabase } from "@/lib/supabase";
import { unwrapPieceControlRpc } from "./rpcResult";

export type PieceControlMode = "off" | "shadow" | "pilot" | "live";

export interface PilotReadinessReport {
  project_id: string;
  mode: PieceControlMode;
  generated_at: string;
  metrics: Record<string, number>;
  data_quality_warnings: string[];
  hard_release_blockers: string[];
  pilot_transition_blockers: string[];
  live_transition_blockers: string[];
  pilot_ready: boolean;
  live_ready: boolean;
}

export interface PieceControlModeEvent {
  id: string;
  previous_mode: PieceControlMode;
  next_mode: PieceControlMode;
  changed_by: string;
  changed_at: string;
}

export interface PilotReadinessSnapshot {
  report: PilotReadinessReport;
  role: string | null;
  modeEvents: PieceControlModeEvent[];
  recentFailureCount: number;
}

export async function fetchPilotReadiness(
  projectId: string,
): Promise<PilotReadinessSnapshot> {
  const db = supabase as any;
  const [reportResult, roleResult, eventsResult, failuresResult] =
    await Promise.all([
      db.rpc("piece_control_pilot_readiness", { p_project_id: projectId }),
      db.rpc("get_my_project_role", { p_project_id: projectId }),
      db
        .from("piece_control_mode_events")
        .select("id,previous_mode,next_mode,changed_by,changed_at")
        .eq("project_id", projectId)
        .order("changed_at", { ascending: false })
        .limit(10),
      db
        .from("piece_control_command_failures")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId),
    ]);
  if (reportResult.error) throw reportResult.error;
  if (roleResult.error) throw roleResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (failuresResult.error) throw failuresResult.error;

  return {
    report: reportResult.data as PilotReadinessReport,
    role: roleResult.data as string | null,
    modeEvents: eventsResult.data ?? [],
    recentFailureCount: failuresResult.count ?? 0,
  };
}

export async function setPieceControlMode(
  projectId: string,
  nextMode: PieceControlMode,
  confirmation: string,
): Promise<void> {
  const { data, error } = await (supabase as any).rpc("set_piece_control_mode", {
    p_project_id: projectId,
    p_next_mode: nextMode,
    p_confirmation: confirmation,
  });
  if (error) throw error;
  unwrapPieceControlRpc(data);
}

