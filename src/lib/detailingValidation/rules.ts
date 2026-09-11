/** 2026 sheet-completeness checks adapted to Rev 2 revision and viewer authorities.
 * This report checks recorded references, not file accessibility or release eligibility.
 */
export interface ValidationSheet {
  id: string;
  sheet_number?: string | null;
  title?: string | null;
  revision_number?: string | null;
  file_url?: string | null;
  drawing_set_name?: string | null;
  is_deleted?: boolean | null;
  is_superseded?: boolean | null;
}
export interface ValidationRevision {
  drawing_id: string;
  is_current: boolean;
  revision_code?: string | null;
  file_url?: string | null;
}
export interface ValidationHold { drawing_id: string; is_active: boolean; reason?: string | null }
export const VALIDATION_RULES = {
  missing_revision: { label: 'Missing revision', severity: 'error', detail: 'Record a revision code before issuing this sheet.' },
  missing_pdf: { label: 'No PDF reference', severity: 'error', detail: 'Neither the sheet nor its current revision has a PDF reference.' },
  hold_no_reason: { label: 'Hold without a reason', severity: 'error', detail: 'An active hold has no recorded reason. Review it in Holds & Blockers.' },
  multiple_current_revisions: { label: 'Conflicting current revisions', severity: 'error', detail: 'More than one revision is current. Resolve the revision history before issuing.' },
  missing_title: { label: 'Missing title', severity: 'warning', detail: 'Add the sheet title so recipients can identify its content.' },
} as const;
export type ValidationRule = keyof typeof VALIDATION_RULES;
export interface DetailingFinding {
  id: string; drawingId: string; sheet: string; set: string; rule: ValidationRule;
  severity: 'error' | 'warning'; label: string; detail: string; href: string;
}
const blank = (value: string | null | undefined) => !value?.trim();

export function validateDetailingSheets(sheets: readonly ValidationSheet[], revisions: readonly ValidationRevision[], holds: readonly ValidationHold[]) {
  const live = sheets.filter(sheet => !sheet.is_deleted && !sheet.is_superseded);
  const current = new Map<string, ValidationRevision[]>();
  for (const revision of revisions) {
    if (revision.is_current) current.set(revision.drawing_id, [...(current.get(revision.drawing_id) || []), revision]);
  }
  const noReason = new Set(holds.filter(hold => hold.is_active && blank(hold.reason)).map(hold => hold.drawing_id));
  const findings: DetailingFinding[] = [];
  for (const sheet of live) {
    const sheetRevisions = current.get(sheet.id) || [];
    const add = (rule: ValidationRule) => findings.push({ id: `${sheet.id}:${rule}`, drawingId: sheet.id, sheet: sheet.sheet_number || 'Unnumbered sheet', set: sheet.drawing_set_name || 'Unassigned', rule, ...VALIDATION_RULES[rule], href: `/DrawingViewer?drawingId=${encodeURIComponent(sheet.id)}` });
    if (sheetRevisions.length > 1) add('multiple_current_revisions');
    else if (blank(sheetRevisions.length ? sheetRevisions[0].revision_code : sheet.revision_number)) add('missing_revision');
    if (blank(sheet.file_url) && !sheetRevisions.some(revision => !blank(revision.file_url))) add('missing_pdf');
    if (noReason.has(sheet.id)) add('hold_no_reason');
    if (blank(sheet.title)) add('missing_title');
  }
  findings.sort((a,b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || a.sheet.localeCompare(b.sheet, undefined, { numeric: true }));
  const errors = new Set(findings.filter(f => f.severity === 'error').map(f => f.drawingId));
  const warnings = new Set(findings.filter(f => !errors.has(f.drawingId)).map(f => f.drawingId));
  return { findings, checked: live.length, errors: errors.size, warnings: warnings.size, clear: live.length - errors.size - warnings.size };
}
export type DetailingValidationReport = ReturnType<typeof validateDetailingSheets>;
