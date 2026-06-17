// ── useGettingStarted — resolves the onboarding checklist signals ────────
//
// Fetches the four-step workflow signals for a project via cheap COUNT-only
// queries (head:true → no rows returned) and reads the per-project localStorage
// flags (dismissed / RFI-skipped). The done/current/todo logic lives in the pure
// computeGettingStartedSteps helper. Fail-safe: if the signal fetch errors the
// card simply doesn't render (onboarding is never load-bearing).
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { computeGettingStartedSteps } from "@/lib/gettingStarted";
import type { GettingStartedState } from "@/lib/gettingStarted";

type FlagKind = "dismissed" | "rfi-skipped";
const lsKey = (projectId: string, kind: FlagKind) => `sbp:getting-started:${projectId}:${kind}`;
const readFlag = (projectId: string | undefined, kind: FlagKind): boolean => {
  if (!projectId) return false;
  try { return localStorage.getItem(lsKey(projectId, kind)) === "1"; } catch { return false; }
};
const writeFlag = (projectId: string, kind: FlagKind) => {
  try { localStorage.setItem(lsKey(projectId, kind), "1"); } catch { /* ignore */ }
};

// fab_release_log isn't in the generated DB types and the table name varies; a
// single loose handle keeps the head-count queries simple and contained.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sbFrom = (table: string): any => (supabase.from as unknown as (t: string) => any)(table);

async function countRows(
  table: string,
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refine?: (q: any) => any,
): Promise<number> {
  let q = sbFrom(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if (refine) q = refine(q);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

export interface UseGettingStarted {
  state: GettingStartedState | null;
  dismissed: boolean;
  isLoading: boolean;
  skipRfi: () => void;
  dismiss: () => void;
}

export function useGettingStarted(projectId: string | undefined): UseGettingStarted {
  const [flags, setFlags] = useState(() => ({
    rfiSkipped: readFlag(projectId, "rfi-skipped"),
    dismissed: readFlag(projectId, "dismissed"),
  }));

  // Re-read the per-project flags when the active project changes.
  useEffect(() => {
    setFlags({ rfiSkipped: readFlag(projectId, "rfi-skipped"), dismissed: readFlag(projectId, "dismissed") });
  }, [projectId]);

  const { data, isLoading } = useQuery({
    queryKey: ["getting-started", projectId],
    enabled: !!projectId && !flags.dismissed, // dismissed → no need to fetch
    staleTime: 60_000,
    queryFn: async () => {
      const pid = projectId as string;
      const [drawings, submittals, rfis, fabLog, released] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        countRows("drawings", pid, (q: any) => q.eq("is_deleted", false)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        countRows("submittals", pid, (q: any) => q.eq("is_deleted", false)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        countRows("rfis", pid, (q: any) => q.eq("is_deleted", false)),
        countRows("fab_release_log", pid),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        countRows("submittals", pid, (q: any) => q.eq("is_deleted", false).eq("status", "Released for Fabrication")),
      ]);
      return {
        hasDrawings: drawings > 0,
        hasSubmittal: submittals > 0,
        hasRfi: rfis > 0,
        hasFabRelease: fabLog > 0 || released > 0,
      };
    },
  });

  const skipRfi = useCallback(() => {
    if (!projectId) return;
    writeFlag(projectId, "rfi-skipped");
    setFlags((f) => ({ ...f, rfiSkipped: true }));
  }, [projectId]);

  const dismiss = useCallback(() => {
    if (!projectId) return;
    writeFlag(projectId, "dismissed");
    setFlags((f) => ({ ...f, dismissed: true }));
  }, [projectId]);

  const state = data ? computeGettingStartedSteps({ ...data, rfiSkipped: flags.rfiSkipped }) : null;

  return { state, dismissed: flags.dismissed, isLoading, skipRfi, dismiss };
}
