import { describe, expect, it } from 'vitest';
import { digest, validateFixture } from '../../e2e/drawing-cutover-setup.ts';
import { selectDrawingIntakeProject, validateDrawingIntakeBindings } from '../../e2e/drawingCutoverIntakeBindings.ts';

const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = '1'.repeat(40);
const sourcePath = `${id(2)}/uploads/${id(4)}/synthetic.pdf`;
function fixture() {
  const projects = [4, 5, 6, 7].map(n => ({ id: id(n), orgId: id(n < 6 ? 2 : 3), createdBy: id(n < 6 ? 13 : 14) }));
  const changed = { action: 'added' as const, sheet_number: 'S1', sheet_title: 'Synthetic sheet', revision_code: '0',
    file_path: sourcePath, pdf_page: 2, reviewed: true as const,
    extraction: { text: { state: 'unavailable' as const }, callouts: { state: 'unavailable' as const } } };
  const create = { project_id: id(4), revision_label: '0', file_path: sourcePath,
    source_objects: [{ path: sourcePath, token: 'a'.repeat(64) }], set_name: 'E2E New Set', set_number: null,
    discipline: null, issued_date: null, issued_by: null, notes: "Robert'); DROP TABLE drawings;--", sheets: [changed] };
  return { version: 1, projectRef: 'ndyfjffsulfbwpmwdmic', candidateSha: sha, runId: id(1),
    expiresAt: '2099-01-01T00:00:00Z', publicKeySha256: 'b'.repeat(64),
    review: { reviewer: 'synthetic-reviewer', evidenceSha256: 'c'.repeat(64) }, organizations: [id(2), id(3)], projects,
    actors: ['pm', 'viewer', 'field', 'admin', 'foreign', 'removed', 'mfa'].map((alias, n) => ({ alias, id: id(10 + n),
      orgId: id(alias === 'foreign' ? 3 : 2), emailSha256: 'd'.repeat(64) })),
    entities: [{ table: 'drawing_sets', id: id(30), projectId: id(4) }, { table: 'drawings', id: id(31), projectId: id(4) },
      { table: 'drawing_revisions', id: id(32), projectId: id(4) }],
    storage: [{ projectId: id(4), path: sourcePath, sha256: 'e'.repeat(64), pages: 2 }],
    intakeBindings: { version: 1, projects: { A1: projects[0], A2: projects[1], B1: projects[2], B2: projects[3] },
      commands: {
        newSet: { requestId: id(40), actor: 'pm', operation: 'create_set', payload: create },
        manualIntake: { requestId: id(41), actor: 'pm', operation: 'create_set', payload: { ...structuredClone(create), set_name: 'E2E Manual Set' } },
        revision: { requestId: id(42), actor: 'pm', operation: 'revise_set', payload: {
          project_id: id(4), revision_label: '1', file_path: sourcePath, source_objects: [{ path: sourcePath, token: 'a'.repeat(64) }],
          set_id: id(30), expected_set_updated_at: '2026-10-16T12:00:00Z', expected_set_revision: '0', issued_date: '2026-10-16',
          sheets: [{ ...structuredClone(changed), action: 'revised', drawing_id: id(31), expected_updated_at: '2026-10-16T12:00:00Z', expected_revision_id: id(32) }],
        } },
      } },
  };
}
const validate = (value: unknown) => { const text = JSON.stringify(value); return validateFixture(text, digest(text), sha); };

describe('finite drawing intake binding book', () => {
  const context = () => { const { intakeBindings: _book, ...base } = fixture(); return validate(base); };
  it('accepts admin-created A1 with PM commands, literal notes and separate source-token/PDF digests', () => {
    const result = validate(fixture());
    expect(result).toMatchObject({ intakeBindings: { projects: { A1: { id: id(4), createdBy: id(13) } }, commands: {
      newSet: { requestId: id(40), actor: 'pm', operation: 'create_set', payload: {
        issued_date: null, notes: "Robert'); DROP TABLE drawings;--", source_objects: [{ path: sourcePath, token: 'a'.repeat(64) }],
      } }, manualIntake: { payload: { sheets: [{ pdf_page: 2, extraction: { text: { state: 'unavailable' }, callouts: { state: 'unavailable' } } }] } },
    } } });
    expect(result.storage[0].sha256).toBe('e'.repeat(64));
  });

  const invalidCases: [string, (value: ReturnType<typeof fixture>) => void][] = [
    ['unknown command plan', f => Object.assign(f.intakeBindings.commands, { arbitrary: f.intakeBindings.commands.newSet })],
    ['callback authority', f => Object.assign(f.intakeBindings, { callback: 'https://example.invalid/private' })],
    ['UI authority', f => Object.assign(f.intakeBindings.commands.newSet.payload, { approved: true })],
    ['actor substitution', f => { f.intakeBindings.commands.newSet.actor = 'admin'; }],
    ['operation substitution', f => { f.intakeBindings.commands.newSet.operation = 'revise_set'; }],
    ['partial payload', f => { Reflect.deleteProperty(f.intakeBindings.commands.newSet.payload, 'notes'); }],
    ['invalid request id', f => { f.intakeBindings.commands.newSet.requestId = 'unstable'; }],
    ['reused request id', f => { f.intakeBindings.commands.manualIntake.requestId = id(40); }],
    ['duplicate project alias', f => { f.intakeBindings.projects.A2 = f.intakeBindings.projects.A1; }],
    ['missing A1', f => { Reflect.deleteProperty(f.intakeBindings.projects, 'A1'); }],
    ['PM-created A1', f => { f.projects[0].createdBy = id(10); }],
    ['foreign creator substitution', f => { f.intakeBindings.projects.B1.createdBy = id(13); }],
    ['PM organization substitution', f => { f.actors[0].orgId = id(3); }],
    ['different declared project identity', f => { f.intakeBindings.projects.A1 = { ...f.projects[0], id: id(999) }; }],
    ['cross-project command', f => { f.intakeBindings.commands.newSet.payload.project_id = id(5); }],
    ['undeclared set', f => { f.intakeBindings.commands.revision.payload.set_id = id(999); }],
    ['cross-project drawing', f => { f.entities[1].projectId = id(5); }],
    ['cross-project history', f => { f.entities[2].projectId = id(5); }],
    ['undeclared history', f => { f.intakeBindings.commands.revision.payload.sheets[0].expected_revision_id = id(999); }],
    ['changed source path', f => { f.intakeBindings.commands.newSet.payload.sheets[0].file_path = sourcePath.replace('synthetic', 'other'); }],
    ['undeclared source and header', f => { const p = f.intakeBindings.commands.newSet.payload; p.file_path = p.source_objects[0].path = p.sheets[0].file_path = sourcePath.replace('synthetic', 'other'); }],
    ['foreign storage path', f => { f.storage[0].projectId = id(5); }],
    ['duplicate storage identity', f => { f.storage.push({ ...f.storage[0] }); }],
    ['conflicting metadata source tokens', f => { f.intakeBindings.commands.manualIntake.payload.source_objects[0].token = 'f'.repeat(64); }],
    ['zero page', f => { f.intakeBindings.commands.newSet.payload.sheets[0].pdf_page = 0; }],
    ['fractional page', f => { f.intakeBindings.commands.newSet.payload.sheets[0].pdf_page = 1.5; }],
    ['undeclared PDF page', f => { f.intakeBindings.commands.newSet.payload.sheets[0].pdf_page = 3; }],
    ['over-bound PDF pages', f => { f.storage[0].pages = 251; }],
    ['missing extraction', f => { Reflect.deleteProperty(f.intakeBindings.commands.newSet.payload.sheets[0], 'extraction'); }],
    ['manual harvested empty text', f => Object.assign(f.intakeBindings.commands.manualIntake.payload.sheets[0].extraction, { text: { state: 'harvested', value: '' } })],
    ['manual harvested empty callouts', f => Object.assign(f.intakeBindings.commands.manualIntake.payload.sheets[0].extraction, { callouts: { state: 'harvested', value: [] } })],
    ['manual revision action', f => Object.assign(f.intakeBindings.commands.manualIntake.payload.sheets[0], { action: 'revised' })],
    ['new set adoption name', f => { f.intakeBindings.commands.newSet.payload.set_name = 'Existing customer set'; }],
    ['duplicate synthetic names', f => { f.intakeBindings.commands.manualIntake.payload.set_name = ' e2e new set '; }],
    ['oversized UTF8 extraction', f => Object.assign(f.intakeBindings.commands.newSet.payload.sheets[0].extraction, { text: { state: 'harvested', value: 'é'.repeat(32769) } })],
    ['oversized request', f => { f.intakeBindings.commands.newSet.payload.notes = 'x'.repeat(1048577); }],
    ['invalid calendar date', f => { f.intakeBindings.commands.revision.payload.issued_date = '2026-02-30'; }],
  ];
  it.each(invalidCases)('rejects %s', (_name, change) => {
    const value = fixture(); change(value); expect(() => validate(value)).toThrow();
  });

  it('selects explicit A1 independent of manifest order and refuses legacy inference', () => {
    const value = fixture(); value.projects.reverse(); value.actors.reverse(); value.organizations.reverse();
    const result = validate(value);
    expect(selectDrawingIntakeProject(result)).toEqual({ id: id(4), orgId: id(2), createdBy: id(13) });
    expect(() => selectDrawingIntakeProject(context())).toThrow('INTAKE_BINDINGS_REQUIRED');
    expect(() => validateDrawingIntakeBindings(null, context())).toThrow('INTAKE_BINDINGS_INVALID');
    const ambiguous = structuredClone(result); ambiguous.projects.push({ ...ambiguous.projects[0] });
    expect(() => selectDrawingIntakeProject(ambiguous)).toThrow('INTAKE_BINDINGS_INVALID');
  });

  it('detaches and freezes all returned project, command and nested callout state', () => {
    const value = fixture();
    const callouts = [{ nested: { marks: ['S1'] } }];
    Object.assign(value.intakeBindings.commands.newSet.payload.sheets[0].extraction, { callouts: { state: 'harvested', value: callouts } });
    const book = validateDrawingIntakeBindings(value.intakeBindings, context());
    callouts[0].nested.marks[0] = 'caller-change'; value.intakeBindings.projects.A1.id = id(999);
    expect(book.projects.A1.id).toBe(id(4));
    expect(book.commands.newSet.payload.sheets[0].extraction.callouts).toEqual({ state: 'harvested', value: [{ nested: { marks: ['S1'] } }] });
    expect(() => Object.assign(book.projects.A1, { id: id(999) })).toThrow();
    expect(() => Object.assign(book.commands.newSet, { actor: 'admin' })).toThrow();
    expect(() => Object.assign(book, { version: 2 })).toThrow();
    const extraction = book.commands.newSet.payload.sheets[0].extraction.callouts;
    if (extraction.state !== 'harvested') throw new Error('Expected reviewed callouts');
    expect(Object.isFrozen(extraction.value[0])).toBe(true);
    expect(() => Object.assign(extraction.value, { 0: null })).toThrow();
  });

  it.each(['undefined', 'function', 'date', 'nan', 'infinity', 'symbol', 'accessor', 'cycle', 'sparse-array', 'array-property', 'array-nonindex'])('rejects non-JSON %s without invoking caller code', kind => {
    const value = fixture().intakeBindings; let calls = 0;
    const payload = value.commands.newSet.payload;
    if (kind === 'undefined') Object.assign(value, { extra: undefined });
    if (kind === 'function') Object.assign(payload, { notes: () => { calls++; } });
    if (kind === 'date') Object.assign(payload.sheets[0].extraction, { callouts: { state: 'harvested', value: [new Date()] } });
    if (kind === 'nan') payload.sheets[0].pdf_page = NaN;
    if (kind === 'infinity') payload.sheets[0].pdf_page = Infinity;
    if (kind === 'symbol') Object.assign(value, { [Symbol('authority')]: true });
    if (kind === 'accessor') Object.defineProperty(payload, 'notes', { enumerable: true, get: () => { calls++; return 'unreviewed'; } });
    if (kind === 'cycle') Object.assign(payload, { notes: value });
    if (kind === 'sparse-array') Object.assign(payload.sheets[0].extraction, { callouts: { state: 'harvested', value: Array(1) } });
    if (kind === 'array-property') Object.assign(payload.sheets, { execute: 'private' });
    if (kind === 'array-nonindex') {
      const malformed = Array(1); Object.assign(malformed, { 4294967295: 'not an array index' });
      Object.assign(payload.sheets[0].extraction, { callouts: { state: 'harvested', value: malformed } });
    }
    expect(() => validateDrawingIntakeBindings(value, context())).toThrow('INTAKE_BINDINGS_INVALID');
    expect(calls).toBe(0);
  });

  it('retains valid extracted values at the 65,536 UTF8 byte bound and stable plan identity across revalidation', () => {
    const value = fixture();
    Object.assign(value.intakeBindings.commands.newSet.payload.sheets[0].extraction, { text: { state: 'harvested', value: 'é'.repeat(32768) } });
    const first = validate(value).intakeBindings!;
    const second = validateDrawingIntakeBindings(first, context());
    expect(second).toEqual(first);
    expect(second.commands.newSet.requestId).toBe(id(40));
    expect(second.commands.newSet.payload.sheets[0].extraction.text).toEqual({ state: 'harvested', value: 'é'.repeat(32768) });
  });
});
