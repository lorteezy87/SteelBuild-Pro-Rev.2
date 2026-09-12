/** 2026 sheet-completeness checks adapted to Rev 2 revision and viewer authorities.
 * This report checks recorded references, not file accessibility or release eligibility.
 */
import { normalizeSheetKey, normalizeSheetTitle } from '@/lib/sheetKey';

export interface ValidationSheet {
  id: string;
  sheet_number?: string | null;
  title?: string | null;
  revision_number?: string | null;
  file_url?: string | null;
  drawing_set_id?: string | null;
  drawing_set_name?: string | null;
  deleted_at?: string | null;
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
  piece_missing_quantity_or_weight: { label: 'Missing quantity or weight', severity: 'error', detail: 'Record a positive quantity and usable weight for this lot.' },
  piece_unlinked: { label: 'No active drawing link', severity: 'error', detail: 'Link this lot to an active sheet or a drawing set containing active sheets.' },
  piece_erected_drawing_on_hold: { label: 'Erected lot with drawing hold', severity: 'error', detail: 'Review this erected lot against its current drawing holds.' },
  missing_title: { label: 'Missing title', severity: 'warning', detail: 'Add the sheet title so recipients can identify its content.' },
  duplicate_live_sheet: { label: 'Sheet number live in more than one set', severity: 'warning', detail: 'This sheet number is also live in another set. Check which copy is current.' },
} as const;
export type ValidationRule = keyof typeof VALIDATION_RULES;
export interface DetailingFinding {
  id: string; recordType: 'sheet' | 'piece'; recordId: string; recordLabel: string; set: string; rule: ValidationRule;
  severity: 'error' | 'warning'; label: string; detail: string; href: string;
}
const blank = (value: string | null | undefined) => !value?.trim();
const joinNames = (names: readonly string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * Read-only safety net for the revise-as-a-new-set workflow: a sheet number
 * (normalizeSheetKey, the key the upload wizard matches on) live in two or more
 * sets. Each copy gets its own warning naming the other set(s). A set is its
 * drawing_set_id; a legacy row without one belongs to the linked set of the same
 * name when exactly one exists, else to 'name:' + its set name.
 */
function duplicateLiveSheetDetails(live: readonly ValidationSheet[]): Map<string, string> {
  const idsByName = new Map<string, Set<string>>();
  for (const sheet of live) {
    if (!sheet.drawing_set_id || !sheet.drawing_set_name) continue;
    const ids = idsByName.get(sheet.drawing_set_name) || new Set<string>();
    ids.add(sheet.drawing_set_id);
    idsByName.set(sheet.drawing_set_name, ids);
  }
  const setOf = (sheet: ValidationSheet) => {
    if (sheet.drawing_set_id) return sheet.drawing_set_id;
    const ids = idsByName.get(sheet.drawing_set_name || '');
    return ids && ids.size === 1 ? [...ids][0] : `name:${sheet.drawing_set_name || ''}`;
  };
  const byKey = new Map<string, ValidationSheet[]>();
  for (const sheet of live) {
    const key = normalizeSheetKey(sheet.sheet_number);
    if (!key) continue;
    const group = byKey.get(key);
    if (group) group.push(sheet);
    else byKey.set(key, [sheet]);
  }
  const details = new Map<string, string>();
  for (const group of byKey.values()) {
    if (new Set(group.map(setOf)).size < 2) continue;
    for (const sheet of group) {
      const own = setOf(sheet);
      const title = normalizeSheetTitle(sheet.title);
      const others = new Map<string, 'same title' | 'different title' | 'title missing'>();
      for (const other of group) {
        if (setOf(other) === own) continue;
        const otherTitle = normalizeSheetTitle(other.title);
        const relation = !title || !otherTitle ? 'title missing' : otherTitle === title ? 'same title' : 'different title';
        const name = other.drawing_set_name || 'Unassigned';
        const known = others.get(name);
        others.set(name, known && known !== relation ? 'title missing' : relation);
      }
      const names = [...others.keys()];
      const relations = new Set(others.values());
      details.set(sheet.id,
        relations.size === 1 && relations.has('same title') ? `Also live in ${joinNames(names)} — same title, likely a replaced copy: check which one is current.`
          : relations.size === 1 && relations.has('different title') ? `Also live in ${joinNames(names)} — different title: the same number is used for a different drawing.`
            : `Also live in ${joinNames([...others].map(([name, relation]) => `${name} (${relation})`))} — check which copy is current.`);
    }
  }
  return details;
}

export function validateDetailingSheets(sheets: readonly ValidationSheet[], revisions: readonly ValidationRevision[], holds: readonly ValidationHold[]) {
  const live = sheets.filter(sheet => !sheet.is_deleted && !sheet.deleted_at && !sheet.is_superseded);
  const duplicates = duplicateLiveSheetDetails(live);
  const current = new Map<string, ValidationRevision[]>();
  for (const revision of revisions) {
    if (revision.is_current) current.set(revision.drawing_id, [...(current.get(revision.drawing_id) || []), revision]);
  }
  const noReason = new Set(holds.filter(hold => hold.is_active && blank(hold.reason)).map(hold => hold.drawing_id));
  const findings: DetailingFinding[] = [];
  for (const sheet of live) {
    const sheetRevisions = current.get(sheet.id) || [];
    const add = (rule: ValidationRule, detail?: string) => findings.push({ id: `${sheet.id}:${rule}`, recordType: 'sheet', recordId: sheet.id, recordLabel: sheet.sheet_number || 'Unnumbered sheet', set: sheet.drawing_set_name || 'Unassigned', rule, ...VALIDATION_RULES[rule], ...(detail ? { detail } : {}), href: `/DrawingViewer?drawingId=${encodeURIComponent(sheet.id)}` });
    if (sheetRevisions.length > 1) add('multiple_current_revisions');
    else if (blank(sheetRevisions.length ? sheetRevisions[0].revision_code : sheet.revision_number)) add('missing_revision');
    if (blank(sheet.file_url) && !sheetRevisions.some(revision => !blank(revision.file_url))) add('missing_pdf');
    if (noReason.has(sheet.id)) add('hold_no_reason');
    if (blank(sheet.title)) add('missing_title');
    const duplicateDetail = duplicates.get(sheet.id);
    if (duplicateDetail) add('duplicate_live_sheet', duplicateDetail);
  }
  findings.sort((a,b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || a.recordLabel.localeCompare(b.recordLabel, undefined, { numeric: true }));
  const errors = new Set(findings.filter(f => f.severity === 'error').map(f => f.recordId));
  const warnings = new Set(findings.filter(f => !errors.has(f.recordId)).map(f => f.recordId));
  return { findings, checked: live.length, errors: errors.size, warnings: warnings.size, clear: live.length - errors.size - warnings.size };
}
export type DetailingValidationReport = ReturnType<typeof validateDetailingSheets>;
