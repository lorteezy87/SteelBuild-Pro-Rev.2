import { createPageUrl } from "@/utils";
import {
  ELEMENT_STATUS_META,
  type ElementStatusKey,
  type ElementStatusSummary,
} from "@/services/modelElementStatus";
import { buildCanonicalViewerLinks } from "@/lib/ifc/canonicalViewerLinks";
import {
  buildFabByGuid,
  buildFabByMark,
  buildMarkByGuid,
  buildSeqByGuid,
  buildSeqByMark,
  buildStatusByGuid,
  buildStatusByMark,
  colorFnFor,
} from "@/lib/ifc/viewerColoring";
import {
  buildFabLegend,
  buildRowsByGuid,
  summarizeSelection,
  type FabLegendRow,
  type SelectionSummary,
  type ViewerCanonicalPiece,
  type ViewerRosterRow,
} from "@/lib/ifc/viewerSelection";

export type Model3DColorMode = "model" | "fab" | "type" | "sequence" | "status";

export interface Model3DColorStats {
  total: number;
  colored: number;
}

export interface Model3DStatusLegendRow {
  key: ElementStatusKey;
  label: string;
  color: string;
  count: number;
  guids: string[];
}

export type Model3DEvidenceState = "loading" | "error" | "ready";

export interface Model3DDisplayedClaims {
  evidenceState: Model3DEvidenceState;
  fabCoverage: string;
  findPlaceholder: string;
  loadingColorLabel: string | null;
  inferredLinkCount: number;
}

export interface Model3DViewModel {
  hasRoster: boolean;
  evidenceError: unknown;
  fabUnavailable: boolean;
  statusByGuid: Map<string, string>;
  sequenceByGuid: Map<string, string>;
  fabByGuid: Map<string, string>;
  markByGuid: Map<string, string>;
  sequenceByMark: Map<string, string>;
  statusByMark: Map<string, string>;
  fabByMark: Map<string, string>;
  rowsByGuid: Map<string, ViewerRosterRow>;
  canonicalPieceByGuid: Map<string, ViewerCanonicalPiece>;
  canonicalDisplayByGuid: Map<string, ViewerCanonicalPiece>;
  blockedGuids: Set<string>;
  colorFor: (info: { guid?: string | null; ifcType?: string | null }) => string | null;
  fabLegend: FabLegendRow[];
  selection: SelectionSummary;
  sequenceGuids: Map<string, string[]>;
  sequences: string[];
  statusLegend: Model3DStatusLegendRow[];
  registerHref: string;
  claims: Model3DDisplayedClaims;
}

interface ViewerColorMaps {
  statusByGuid: Map<string, string>;
  seqByGuid: Map<string, string>;
  fabByGuid: Map<string, string>;
  markByGuid: Map<string, string>;
  statusByMark: Map<string, string>;
  seqByMark: Map<string, string>;
  fabByMark: Map<string, string>;
  canonicalPieceByGuid: Map<string, ViewerCanonicalPiece>;
  blockedGuids: Set<string>;
  perPieceFab: boolean;
}

const buildColorFunction = colorFnFor as unknown as (
  mode: Model3DColorMode,
  maps: ViewerColorMaps,
) => Model3DViewModel["colorFor"];

interface BuildModel3DViewModelInput {
  projectId?: string | null;
  modelMapping?: Partial<ElementStatusSummary> | null;
  modelElementRows?: ViewerRosterRow[] | null;
  canonicalPieces?: ViewerCanonicalPiece[] | null;
  selectedGuids?: string[] | null;
  colorMode: Model3DColorMode;
  markFallback: boolean;
  piecesLoading: boolean;
  piecesError?: unknown;
  rosterLoading: boolean;
  rosterError?: unknown;
  colorStats?: Model3DColorStats | null;
}

const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true });

function buildSequenceGuids(sequenceByGuid: Map<string, string>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [guid, sequence] of sequenceByGuid) {
    const guids = groups.get(sequence) ?? [];
    guids.push(guid);
    groups.set(sequence, guids);
  }
  return groups;
}

function buildStatusLegend(
  modelMapping: Partial<ElementStatusSummary> | null | undefined,
): Model3DStatusLegendRow[] {
  const counts = modelMapping?.counts;
  const guidsByStatus = modelMapping?.guidsByStatus;
  return (Object.entries(ELEMENT_STATUS_META) as Array<
    [ElementStatusKey, (typeof ELEMENT_STATUS_META)[ElementStatusKey]]
  >)
    .map(([key, meta]) => ({
      key,
      ...meta,
      count: counts?.[key] ?? 0,
      guids: guidsByStatus?.[key] ?? [],
    }))
    .filter((bucket) => bucket.count > 0);
}

export function buildModel3DDisplayedClaims({
  colorMode,
  colorStats,
  evidenceError,
  evidencePending,
  hasRoster,
  directLinkCount,
  displayLinkCount,
}: {
  colorMode: Model3DColorMode;
  colorStats?: Model3DColorStats | null;
  evidenceError: unknown;
  evidencePending: boolean;
  hasRoster: boolean;
  directLinkCount: number;
  displayLinkCount: number;
}): Model3DDisplayedClaims {
  const evidenceState: Model3DEvidenceState = evidenceError
    ? "error"
    : evidencePending
      ? "loading"
      : "ready";
  const fabCoverage = evidenceError
    ? "Status unavailable — piece or roster refresh failed."
    : evidencePending
      ? "Loading piece and roster status…"
      : colorStats
        ? `${colorStats.colored.toLocaleString()} of ${colorStats.total.toLocaleString()} rendered parts colored. Uncolored parts need status or roster-link review.`
        : "Loading model coverage…";
  const loadingColorLabel =
    evidencePending && (colorMode === "fab" || colorMode === "sequence" || colorMode === "status")
      ? colorMode === "fab"
        ? "fab"
        : colorMode
      : null;
  return {
    evidenceState,
    fabCoverage,
    findPlaceholder: evidencePending
      ? "Loading roster…"
      : hasRoster
        ? "e.g. 1B12 or C4"
        : "Save the model first",
    loadingColorLabel,
    inferredLinkCount: Math.max(0, displayLinkCount - directLinkCount),
  };
}

export function buildModel3DViewModel({
  projectId,
  modelMapping,
  modelElementRows,
  canonicalPieces,
  selectedGuids,
  colorMode,
  markFallback,
  piecesLoading,
  piecesError,
  rosterLoading,
  rosterError,
  colorStats,
}: BuildModel3DViewModelInput): Model3DViewModel {
  const rows = modelElementRows ?? [];
  const pieces = canonicalPieces ?? [];
  const statusByGuid = buildStatusByGuid(modelMapping) as Map<string, string>;
  const sequenceByGuid = buildSeqByGuid(rows) as Map<string, string>;
  const fabByGuid = buildFabByGuid(rows) as Map<string, string>;
  const markByGuid = buildMarkByGuid(rows) as Map<string, string>;
  const sequenceByMark = buildSeqByMark(rows) as Map<string, string>;
  const statusByMark = buildStatusByMark(modelMapping) as Map<string, string>;
  const fabByMark = buildFabByMark(rows) as Map<string, string>;
  const rowsByGuid = buildRowsByGuid(rows);
  const {
    direct: canonicalPieceByGuid,
    display: canonicalDisplayByGuid,
    blockedGuids,
  } = buildCanonicalViewerLinks(rows, pieces);
  const evidenceError = piecesError || rosterError;
  const evidencePending = Boolean((projectId && piecesLoading) || rosterLoading);
  const fabUnavailable = Boolean(evidenceError || evidencePending);
  const effectiveColorMode = colorMode === "fab" && fabUnavailable ? "model" : colorMode;
  const colorFor = buildColorFunction(effectiveColorMode, {
    statusByGuid,
    seqByGuid: sequenceByGuid,
    fabByGuid,
    markByGuid,
    statusByMark,
    seqByMark: sequenceByMark,
    fabByMark,
    canonicalPieceByGuid: canonicalDisplayByGuid,
    blockedGuids,
    perPieceFab: !markFallback,
  });
  const fabLegend = buildFabLegend({
    rows,
    canonicalPieceByGuid: canonicalDisplayByGuid,
    blockedGuids,
    fabByGuid,
    fabByMark,
    markByGuid,
    perPieceFab: !markFallback,
  });
  const selection = summarizeSelection(selectedGuids, {
    markByGuid,
    seqByGuid: sequenceByGuid,
    canonicalPieceByGuid,
    rowsByGuid,
  });
  const sequenceGuids = buildSequenceGuids(sequenceByGuid);
  const registerBase = createPageUrl("PieceRegister");
  const registerHref =
    selection.pieces.length === 1
      ? `${registerBase}?piece=${encodeURIComponent(selection.pieces[0].id)}`
      : registerBase;
  const hasRoster = rows.some((row) => Boolean(row && !row.is_deleted && !row.deleted_at));

  return {
    hasRoster,
    evidenceError,
    fabUnavailable,
    statusByGuid,
    sequenceByGuid,
    fabByGuid,
    markByGuid,
    sequenceByMark,
    statusByMark,
    fabByMark,
    rowsByGuid,
    canonicalPieceByGuid,
    canonicalDisplayByGuid,
    blockedGuids,
    colorFor,
    fabLegend,
    selection,
    sequenceGuids,
    sequences: [...sequenceGuids.keys()].sort(naturalCompare),
    statusLegend: buildStatusLegend(modelMapping),
    registerHref,
    claims: buildModel3DDisplayedClaims({
      colorMode,
      colorStats,
      evidenceError,
      evidencePending,
      hasRoster,
      directLinkCount: canonicalPieceByGuid.size,
      displayLinkCount: canonicalDisplayByGuid.size,
    }),
  };
}
