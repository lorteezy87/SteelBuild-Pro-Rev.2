import type { DocControlAttestations } from "@/lib/docControl";
import { buildReviseSetRequest } from '@/lib/drawingCommands/requestBuilders';
import type { DrawingJson, DrawingSourceObject, ReviewedDrawingSheet } from '@/lib/drawingCommands/types';

export interface RevisionRosterSheet {
  id: string; project_id: string; drawing_set_id: string; sheet_number: string;
  updated_at: string; expected_revision_id: string | null;
}
export interface RevisionRoster {
  set: { id: string; project_id: string; updated_at: string; revision: string | null };
  sheets: RevisionRosterSheet[];
}
interface IncomingRevisionSheet {
  sheetNumber: string; sheetTitle: string; revision: string; pdfPage: number;
  sourceFileUrl: string; sourceSnapshot?: DrawingSourceObject; reviewed?: boolean; sourceReviewRequired?: boolean;
  extractedText?: string | null; callouts?: DrawingJson[] | null;
}
interface RevisionMatch { change: string; oldSheet?: { id: string }; newSheet?: IncomingRevisionSheet }

/** Maps only the frozen, complete review; missing matches are an error, never removals. */
export function buildReviewedRevisionPayload(input: {
  projectId: string; roster: RevisionRoster; matches: RevisionMatch[]; removeUnlisted: boolean;
  revisionLabel: string; issueDate: string; issuedBy: string; notes: string;
  sources: readonly DrawingSourceObject[]; sourcePages: Record<string, number>;
}) {
  const { roster, matches } = input;
  if (!input.issueDate) throw new Error('Enter and review the actual revision issue date before applying.');
  if (!roster?.set?.id || roster.set.project_id !== input.projectId || !roster.set.updated_at) throw new Error('A complete supported set roster is required. Reopen review.');
  const seen = new Set<string>();
  const sheets: ReviewedDrawingSheet[] = matches.map(match => {
    if (match.change === 'ambiguous') throw new Error('Resolve ambiguous sheet matches before applying.');
    const previous = match.oldSheet && roster.sheets.find(sheet => sheet.id === match.oldSheet!.id);
    if (match.oldSheet && (!previous || seen.has(previous.id))) throw new Error('The complete reviewed roster changed. Reopen review.');
    if (previous) seen.add(previous.id);
    const expected = previous ? { drawing_id: previous.id, expected_updated_at: previous.updated_at,
      expected_revision_id: previous.expected_revision_id, sheet_number: previous.sheet_number } : null;
    if (previous && (previous.project_id !== input.projectId || previous.drawing_set_id !== roster.set.id)) throw new Error('Legacy set routing requires explicit reconciliation before revision.');
    if (!match.newSheet) {
      if (!expected) throw new Error('The complete reviewed roster is required.');
      if (input.removeUnlisted) {
        if (!expected.expected_revision_id) throw new Error('Complete explicit revision tracking is required before changing existing sheets.');
        return { ...expected, action: 'removed', expected_revision_id: expected.expected_revision_id };
      }
      return { ...expected, action: 'same' };
    }
    const incoming = match.newSheet;
    const source = input.sources.find(source => source.path === incoming.sourceFileUrl);
    const count = input.sourcePages[incoming.sourceFileUrl];
    if (!source || incoming.sourceSnapshot?.path !== source.path || incoming.sourceSnapshot.token !== source.token) throw new Error('The reviewed source identity changed. Start a fresh source review.');
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(incoming.pdfPage) || incoming.pdfPage < 1 || incoming.pdfPage > count) throw new Error('Every incoming sheet needs a confirmed in-range PDF page.');
    if (!incoming.reviewed || incoming.sourceReviewRequired) throw new Error('Complete a fresh source review of each sheet and its physical PDF page.');
    const changed = { sheet_number: incoming.sheetNumber, sheet_title: incoming.sheetTitle, revision_code: incoming.revision,
      file_path: incoming.sourceFileUrl, pdf_page: incoming.pdfPage, reviewed: true as const,
      extraction: { text: typeof incoming.extractedText === 'string' ? { state: 'harvested' as const, value: incoming.extractedText } : { state: 'unavailable' as const },
        callouts: Array.isArray(incoming.callouts) ? { state: 'harvested' as const, value: incoming.callouts } : { state: 'unavailable' as const } } };
    if (!expected) return { ...changed, action: 'added' };
    if (!expected.expected_revision_id) throw new Error('Complete explicit revision tracking is required before changing existing sheets.');
    if (incoming.sheetNumber !== expected.sheet_number) throw new Error('Changing an existing sheet number requires a fresh exact-match review.');
    return { ...changed, ...expected, action: 'revised', expected_revision_id: expected.expected_revision_id };
  });
  if (seen.size !== roster.sheets.length || matches.length > 250) throw new Error('The complete reviewed roster is required; missing sheets are not removals.');
  if (!sheets.some(sheet => sheet.action === 'added' || sheet.action === 'revised')) throw new Error('Review at least one incoming sheet.');
  return buildReviseSetRequest({ project_id: input.projectId, set_id: roster.set.id,
    expected_set_updated_at: roster.set.updated_at, expected_set_revision: roster.set.revision,
    revision_label: input.revisionLabel, issued_date: input.issueDate, issued_by: input.issuedBy || null, notes: input.notes || null,
    file_path: input.sources[0].path, source_objects: input.sources, sheets });
}

/** Typed boundary for the reviewed-PDF handoff into the existing JSX wizard. */
export interface RevisionUploadHandoffProps {
  open: boolean;
  onClose: () => void;
  onComplete?: (result: { complete?: boolean; failed?: number; historyFailed?: number; setId?: string; setName?: string; revisionLabel?: string }) => void;
  activeProject: { id: string; name?: string | null; [key: string]: unknown };
  preSelectedSet?: { id?: string | null; [key: string]: unknown } | null;
  drawingSets?: Array<{ id?: string | null; [key: string]: unknown }>;
  initialPdfFile?: File | null;
  initialAttestations?: Record<string, Partial<DocControlAttestations>>;
  initialReview?: {
    sheets: unknown[];
    setMeta: Record<string, unknown> | null;
    scanned: boolean;
    pageCount?: number;
    sourcePages: Record<string, number>;
    revisionLabel: string;
    issueDate: string;
    issuedBy: string;
  } | null;
}
