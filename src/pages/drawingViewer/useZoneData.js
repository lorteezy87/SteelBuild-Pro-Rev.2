import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ensureCurrentRevision,
  listZones,
  listLinksForZones,
  hydrateLinks,
  computeZoneDensity,
  summarizeLinks,
  computeZoneStatus,
  recomputeAndPersistZoneStatus,
  listZoneProposals,
  listZoneDependencies,
} from "@/lib/drawingHub";
import { invalidateEntity } from "@/services/cacheRegistry";

const EMPTY_ZONE_DATA = { summaries: new Map(), computed: new Map(), densities: new Map() };

// Pure helper extracted for clarity. Builds the dependencyEdges array
// that ZoneLayer consumes, given the active drawing's id, the showDeps
// toggle, and the raw rows returned by listZoneDependencies. Behaviour
// is byte-identical to the inline useMemo it replaces — same centroid
// math, same on-sheet / cross-sheet split, same crossSheetLabel strings.
export function buildDependencyEdges({ showDeps, sheetDependencies, activeDrawingId }) {
  if (!showDeps || sheetDependencies.length === 0) return [];
  const out = [];
  for (const d of sheetDependencies) {
    if (!d.__source || !d.__target) continue;
    const src = d.__source;
    const tgt = d.__target;
    const srcOnSheet = src.drawing_id === activeDrawingId;
    const tgtOnSheet = tgt.drawing_id === activeDrawingId;
    const srcCenter = srcOnSheet
      ? [(Number(src.x_min) + Number(src.x_max)) / 2, (Number(src.y_min) + Number(src.y_max)) / 2]
      : null;
    const tgtCenter = tgtOnSheet
      ? [(Number(tgt.x_min) + Number(tgt.x_max)) / 2, (Number(tgt.y_min) + Number(tgt.y_max)) / 2]
      : null;
    // Anchor cross-sheet pills at whichever endpoint IS on this sheet.
    if (!srcOnSheet && !tgtOnSheet) continue;
    if (srcOnSheet && tgtOnSheet) {
      out.push({
        id:                d.id,
        sourceCenter:      srcCenter,
        targetCenter:      tgtCenter,
        relationship:      d.relationship,
        propagationWeight: Number(d.propagation_weight ?? 1),
        isCrossSheet:      false,
        crossSheetLabel:   null,
      });
    } else if (srcOnSheet) {
      // Outbound to another sheet — pill at source.
      out.push({
        id:                d.id,
        sourceCenter:      srcCenter,
        targetCenter:      null,
        relationship:      d.relationship,
        propagationWeight: Number(d.propagation_weight ?? 1),
        isCrossSheet:      true,
        crossSheetLabel:   tgt.sheet_number || "other sheet",
      });
    } else {
      // Inbound from another sheet — pill at target (which IS on this sheet).
      out.push({
        id:                d.id,
        sourceCenter:      tgtCenter, // anchor at the on-sheet endpoint
        targetCenter:      null,
        relationship:      d.relationship,
        propagationWeight: Number(d.propagation_weight ?? 1),
        isCrossSheet:      true,
        crossSheetLabel:   `from ${src.sheet_number || "other sheet"}`,
      });
    }
  }
  return out;
}

// Owns every drawing-hub server query + the derived memos consumed by the
// canvas, the floating zone toolbar, the zone filter bar, and the right-
// rail panels. State setters (zoneMode, zoneFilter, etc.) stay in the page
// because so many other things read them — this hook is just the data side.
//
// Inputs:
//   - projectId / activeId / activeDrawing — identify what to query.
//   - zoneMode / showDeps                  — gating flags for queries
//                                            (don't load deps until DEPS is on).
//   - zoneFilter                           — filters zonesWithComputed.
//
// Returns:
//   - currentRevision, zones, refetchZones — backbone of the overlay.
//   - pendingProposalCount                 — drawer-launcher badge.
//   - dependencyEdges                      — payload for ZoneLayer DEPS arrows.
//   - zoneSummaries / zoneDensities        — per-zone link counts + density.
//   - zonesWithComputed                    — zones with rule-engine status.
//   - zoneStatusCounts                     — counts grouped by status.
//   - filteredZones                        — zonesWithComputed * zoneFilter.
export function useZoneData({ projectId, activeId, activeDrawing, zoneMode, showDeps, zoneFilter }) {
  // Resolve (or create) the drawing_revisions row that zones attach to.
  // MVP: every drawing gets a v1 revision the first time the user opens
  // zones on it. No explicit revision onboarding required.
  const { data: currentRevision } = useQuery({
    queryKey: ["drawing-revision-current", activeId],
    queryFn: async () => {
      if (!activeDrawing?.id) return null;
      return ensureCurrentRevision({ drawing: activeDrawing });
    },
    enabled: !!activeDrawing?.id && zoneMode !== "off",
    staleTime: 5 * 60 * 1000,
  });

  // If the current revision was just PROVISIONED on demand (first zone-open on
  // an untracked drawing), the Doc Control register + hub "Rev" rollup are
  // stale — refresh them. Gated on __provisioned so the common found-existing
  // path does no needless invalidation (and never the ["drawing-revision-current"]
  // key this hook owns, so there's no refetch loop).
  const qc = useQueryClient();
  useEffect(() => {
    if (currentRevision?.__provisioned && projectId) {
      invalidateEntity(qc, "drawing_revision", projectId);
    }
  }, [currentRevision?.__provisioned, currentRevision?.id, projectId, qc]);

  const { data: zones = [], refetch: refetchZones } = useQuery({
    queryKey: ["drawing-zones", currentRevision?.id],
    queryFn: () => listZones(currentRevision?.id),
    enabled: !!currentRevision?.id,
    staleTime: 30 * 1000,
  });

  // V3.0 — pending proposal count for the drawer-launcher badge.
  // Quiet query (limit:1) just to read the total; the panel itself
  // refetches the full list when it opens.
  const { data: proposalCountData } = useQuery({
    queryKey: ["drawing-zone-proposals-count", projectId, activeDrawing?.id, currentRevision?.id || null],
    queryFn: () => listZoneProposals({
      projectId,
      drawingId:         activeDrawing.id,
      drawingRevisionId: currentRevision?.id || undefined,
      status:            "pending",
      limit:             1,
    }),
    enabled: !!projectId && !!activeDrawing?.id,
    staleTime: 30 * 1000,
  });
  const pendingProposalCount = proposalCountData?.total ?? 0;

  // V3.1 — pull every active dependency edge incident to this drawing
  // (either source or target zone lives on the current sheet). Used
  // for the canvas DEPS overlay; cross-sheet edges still come back so
  // we can render their "→ Sheet X" pills.
  const { data: depsData = { rows: [], total: 0 } } = useQuery({
    queryKey: ["drawing-zone-dependencies-sheet", projectId, activeDrawing?.id],
    queryFn: () => listZoneDependencies({
      projectId,
      drawingId: activeDrawing.id,
    }),
    enabled: !!projectId && !!activeDrawing?.id && showDeps,
    staleTime: 30 * 1000,
  });
  const dependencyEdges = useMemo(
    () => buildDependencyEdges({
      showDeps,
      sheetDependencies: depsData.rows || [],
      activeDrawingId: activeDrawing?.id
    }),
    [showDeps, depsData.rows, activeDrawing?.id],
  );

  // Link-count summaries keyed by zone id + rule-engine computed status
  // + density for the heatmap. This query also fires a fire-and-forget
  // background write that persists the computed status when it drifts.
  const { data: zoneData = EMPTY_ZONE_DATA } = useQuery({
    queryKey: ["drawing-zones-summaries", currentRevision?.id, zones.length, zones.map((z) => z.id + ":" + z.status).join(",")],
    queryFn: async () => {
      const ids = zones.map((z) => z.id);
      if (ids.length === 0) return { summaries: new Map(), computed: new Map(), densities: new Map() };
      const byZone = await listLinksForZones(ids);
      const summaries = new Map();
      const computed = new Map();
      const densities = new Map();
      // Pre-hydrate every link in one sweep per record type (hydrateLinks
      // already batches by type), then feed each zone's subset into the
      // rule engine.
      const allLinks = [];
      for (const arr of byZone.values()) allLinks.push(...arr);
      const hydrated = await hydrateLinks(allLinks); // Map<linkId, {link, record}>
      for (const z of zones) {
        const zoneLinks = byZone.get(z.id) || [];
        summaries.set(z.id, summarizeLinks(zoneLinks));
        const zoneItems = zoneLinks
          .map((l) => hydrated.get(l.id))
          .filter(Boolean);
        computed.set(z.id, computeZoneStatus(zoneItems));
        densities.set(z.id, computeZoneDensity(zoneItems));
      }
      // Fire-and-forget: persist computed status for any zone where
      // the stored value drifted and the user hasn't manually pinned
      // it. Never blocks the overlay render on these writes.
      (async () => {
        for (const z of zones) {
          const c = computed.get(z.id);
          if (!c) continue;
          if (z.is_manual_status_override) continue;
          if (c.status === z.status) continue;
          try {
            await recomputeAndPersistZoneStatus(
              z,
              (byZone.get(z.id) || []).map((l) => hydrated.get(l.id)).filter(Boolean),
            );
          } catch {
            // Silent — rule-engine writes are advisory; panel still
            // shows the right answer.
          }
        }
      })();
      return { summaries, computed, densities };
    },
    enabled: zones.length > 0,
    staleTime: 30 * 1000,
  });
  const zoneSummaries = zoneData.summaries;
  const zoneComputed  = zoneData.computed;
  const zoneDensities = zoneData.densities;

  // Overlay reads the computed status when available so colors are
  // live even if the DB write hasn't caught up yet. is_manual_status_override
  // wins — rule engine is advisory when the user has explicitly pinned.
  const zonesWithComputed = useMemo(() => {
    return zones.map((z) => {
      if (z.is_manual_status_override) return z;
      const c = zoneComputed?.get?.(z.id);
      if (!c || !c.status) return z;
      return { ...z, status: c.status };
    });
  }, [zones, zoneComputed]);

  // Status counts over the live (post-compute) zones — feeds the
  // filter bar chips and the "X/Y visible" summary.
  const zoneStatusCounts = useMemo(() => {
    const out = {};
    for (const z of zonesWithComputed) {
      out[z.status] = (out[z.status] || 0) + 1;
    }
    return out;
  }, [zonesWithComputed]);

  // Apply the filter bar's choices. Empty statusSet = "no filter".
  const filteredZones = useMemo(() => {
    const { statusSet, typeKey } = zoneFilter;
    const statusActive = statusSet && statusSet.size > 0;
    const typeActive   = typeKey && typeKey !== "all";
    if (!statusActive && !typeActive) return zonesWithComputed;
    return zonesWithComputed.filter((z) => {
      if (statusActive && !statusSet.has(z.status)) return false;
      if (typeActive && z.zone_type !== typeKey) return false;
      return true;
    });
  }, [zonesWithComputed, zoneFilter]);

  return {
    currentRevision,
    zones,
    refetchZones,
    pendingProposalCount,
    dependencyEdges,
    zoneSummaries,
    zoneDensities,
    zonesWithComputed,
    zoneStatusCounts,
    filteredZones,
  };
}
