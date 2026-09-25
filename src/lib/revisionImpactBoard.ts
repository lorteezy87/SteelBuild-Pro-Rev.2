/**
 * revisionImpactBoard.ts — enrich computeRevisionImpact() change-revisions for
 * the Hub's Revision Impact board. Joins each changed sheet to its set's work
 * package, linked RFIs (open/all), fab-release-blocked state, and an
 * affected-piece count. Pure + deterministic (no React, no I/O).
 *
 * Affected pieces: `model_elements.drawing_set_id` is the EXACT link when
 * populated, but most rosters don't set it (the IFC import writes piece_mark +
 * sequence_number, not the set FK — verified 12/38,870 live). So we fall back to
 * matching the set's linked-WP sequence to `model_elements.sequence_number`, and
 * `null` (rendered "—") when neither resolves. `work_package_id` is unpopulated
 * live (0 rows), so it is not used.
 */

import { isRfiOpen } from "@/lib/entityPredicates";
import { linkedRfiNumbers, normNum } from "@/lib/fabReleaseGate";
import {
  deriveRevisionControlEvidence,
  modelScopeEvidence,
  type ModelScopeEvidence,
  type RevisionControlEvidence,
} from "@/lib/revisionControlEvidence";

/**
 * Is fabrication held on this RFI? The flag has NO top-level column — `rfis`
 * carries it inside `metadata` (written by RFIFormModal, read by RfiDetailModal).
 * Rows arrive here straight from entities.RFI.filter with no transform, so the
 * old `r.fab_hold === true` was always comparing against undefined and the
 * column rendered a confident "No" for every RFI, including the 43 live ones the
 * detailer had explicitly ticked "hold fabrication".
 */

function isFabHeld(r: any): boolean {
  return r?.fab_hold === true || r?.metadata?.fab_hold === true;
}


function wpSequenceOf(wp: any): string | null {
  const v = wp?.sequence_number ?? wp?.erection_sequence ?? wp?.sequence ?? wp?.area_sequence ?? null;
  return v != null && v !== "" ? String(v) : null;
}

 
function isOpenRfi(r: any): boolean {
  return isRfiOpen(r);
}

export interface RevisionImpactSources {
   
  drawings?: any[];
   
  drawingSets?: any[];
   
  workPackages?: any[];
   
  rfis?: any[];
   
  modelElements?: any[];
  modelRosterCount?: number | null;
  modelRosterLoaded?: boolean;
  comparisonByRevisionId?: Record<string, { status?: string | null } | null | undefined>;
}

export interface RevisionImpactRow {
  // ...spread from the computeRevisionImpact entry (revisionId, drawingId, sheetNumber,
  // revisionCode, issuedAt, drawingSetName, fabricated, delivered, inField, severity)
   
  [k: string]: any;
  setName: string;
  wpNames: string[];
  rfiCount: number;
  openRfiCount: number;
  fabBlocked: boolean;
  affectedPieces: number | null;
  modelScope: ModelScopeEvidence;
  revisionControl: RevisionControlEvidence;
}

/**
 * @param revisionImpact computeRevisionImpact() output (one entry per change-revision)
 */
export function buildRevisionImpactRows(
   
  revisionImpact: any[] = [],
  sources: RevisionImpactSources = {},
): RevisionImpactRow[] {
  const { drawings = [], drawingSets = [], workPackages = [], rfis = [], modelElements = [] } = sources;
  const rosterLoaded = sources.modelRosterLoaded ?? Object.prototype.hasOwnProperty.call(sources, "modelElements");
  const rosterCount = sources.modelRosterCount ?? (rosterLoaded ? modelElements.length : null);

   
  const drawingsById = new Map<string, any>();
  for (const d of drawings || []) if (d?.id) drawingsById.set(String(d.id), d);
   
  const setById = new Map<string, any>();
  for (const s of drawingSets || []) if (s?.id) setById.set(String(s.id), s);
   
  const wpById = new Map<string, any>();
  for (const w of workPackages || []) if (w?.id && !w.is_deleted) wpById.set(String(w.id), w);
   
  const rfiByNum = new Map<string, any>();
  for (const r of rfis || []) if (r && !r.is_deleted) rfiByNum.set(normNum(r.rfi_number), r);

  return (revisionImpact || []).map((imp) => {
    const dwg = drawingsById.get(String(imp?.drawingId)) || null;
    const set = dwg?.drawing_set_id ? setById.get(String(dwg.drawing_set_id)) : null;
    const wpIds: string[] = (set?.linked_work_package_ids as string[]) || [];
    const wps = wpIds.map((id) => wpById.get(String(id))).filter(Boolean);
    const wpNames = wps.map((w) => w.wp_number || w.name || w.title).filter(Boolean);

    // Split on COMMAS only and normalize with the canonical normNum. Splitting
    // on whitespace tore the canonical "RFI #001" into ["RFI", "#001"], and the
    // old normalizer kept the "#", so the key became "rfi#001" and no RFI ever
    // matched — the column rendered "—" while an RFI was open on the sheet.
    const nums = [...new Set(linkedRfiNumbers(dwg).map(normNum).filter(Boolean))];
    const linkedRfis = nums.map((n) => rfiByNum.get(n)).filter(Boolean);
    const openRfis = linkedRfis.filter(isOpenRfi);
    const fabBlocked = openRfis.some(isFabHeld);

    const setId = set?.id ? String(set.id) : (dwg?.drawing_set_id ? String(dwg.drawing_set_id) : null);
    const modelScope = modelScopeEvidence({
      rosterCount,
      rosterLoaded,
      drawingSetId: setId,
      workPackageSequences: wps.map(wpSequenceOf),
      elements: modelElements,
    });
    const comparisonKey = imp?.revisionId ? String(imp.revisionId) : String(imp?.drawingId || "");
    const revisionControl = deriveRevisionControlEvidence({
      isChanged: true,
      comparison: sources.comparisonByRevisionId?.[comparisonKey] ?? null,
      downstreamSeverity: imp?.severity,
      model: modelScope,
      hardBlockers: fabBlocked
        ? [{ code: "OPEN_FAB_HOLD", message: "An open linked RFI holds fabrication." }]
        : [],
    });

    return {
      ...imp,
      setName: imp?.drawingSetName || set?.set_name || "—",
      wpNames,
      rfiCount: linkedRfis.length,
      openRfiCount: openRfis.length,
      fabBlocked,
      affectedPieces: modelScope.affectedPieces,
      modelScope,
      revisionControl,
    };
  });
}
