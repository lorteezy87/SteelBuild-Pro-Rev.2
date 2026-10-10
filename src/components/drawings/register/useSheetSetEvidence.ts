import { useEffect } from "react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { evaluateDrawingSetGate, fetchSelectedSetScope } from "./sheetSetEvidence";

// These project reads contain inputs to evaluate_fab_release_set. Mutations in
// several feature areas refresh their own source query without knowing which
// drawing set is selected here. Observe those refreshes locally so the selected
// set cannot keep showing a cached clearance after an RFI, approval, revision,
// hold, or set change. The project filter prevents another workspace from
// disturbing the current sheet.
const GATE_SOURCE_FAMILIES = new Set([
  "drawing-register", "drawing-revisions", "drawing-sets", "drawing-holds",
  "drawing-reviews", "drawings", "rfis", "submittals", "submittal-rounds",
]);
const SCOPE_SOURCE_FAMILIES = new Set([
  "piece-register", "piece-relationships", "piece-register-work-packages",
  "work-packages", "workPackages", "drawings", "drawing-register", "drawing-sets",
]);

export function isDrawingGateSource(queryKey: readonly unknown[], projectId: string | null): boolean {
  return Boolean(projectId && queryKey[1] === projectId
    && typeof queryKey[0] === "string" && GATE_SOURCE_FAMILIES.has(queryKey[0]));
}

export function isDrawingScopeSource(queryKey: readonly unknown[], projectId: string | null): boolean {
  return Boolean(projectId && queryKey[1] === projectId
    && typeof queryKey[0] === "string" && SCOPE_SOURCE_FAMILIES.has(queryKey[0]));
}

/** Two independent reads: a scope failure must not hide a valid server gate. */
export function useSheetSetEvidence(projectId: string | null, setId: string | null) {
  const queryClient = useQueryClient();
  const enabled = Boolean(projectId && setId);
  const sourceReadsFetching = useIsFetching({
    predicate: (query) => isDrawingGateSource(query.queryKey, projectId),
  }) > 0;
  const scopeSourcesFetching = useIsFetching({
    predicate: (query) => isDrawingScopeSource(query.queryKey, projectId),
  }) > 0;
  useEffect(() => {
    if (!enabled) return;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.action.type !== "invalidate" && event.action.type !== "success") return;
      if (isDrawingGateSource(event.query.queryKey, projectId)) {
        void queryClient.invalidateQueries({ queryKey: ["drawing-set-gate", projectId, setId] });
      }
      if (isDrawingScopeSource(event.query.queryKey, projectId)) {
        void queryClient.invalidateQueries({ queryKey: ["drawing-set-canonical-scope", projectId, setId] });
      }
    });
  }, [enabled, projectId, queryClient, setId]);
  const gate = useQuery({
    queryKey: ["drawing-set-gate", projectId, setId],
    queryFn: () => evaluateDrawingSetGate(projectId!, setId!),
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 30_000 : false,
  });
  const scope = useQuery({
    queryKey: ["drawing-set-canonical-scope", projectId, setId],
    queryFn: () => fetchSelectedSetScope(projectId!, setId!),
    enabled,
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  return { gate, scope, sourceReadsFetching, scopeSourcesFetching };
}
