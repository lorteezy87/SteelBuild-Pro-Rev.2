import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
const backend = vi.hoisted(() => ({ current: null as Record<string, unknown> | null, error: null as unknown, revisionCreate: vi.fn(), writes: vi.fn(), filters: [] as unknown[][] }));
vi.mock('@/lib/supabase', () => ({ supabase: { from(table: string) {
  const result = () => ({ data: table === 'drawing_zone_proposals' ? { id: 'p', status: 'pending', project_id: 'project', drawing_id: 'drawing', drawing_revision_id: null, suggested_zone_type: 'area' } : table === 'drawings' ? { id: 'drawing', project_id: 'project' } : backend.current, error: backend.error });
  const query = { select: () => query, eq: (key: string, value: unknown) => { backend.filters.push([key, value]); return query; }, is: (key: string, value: unknown) => { backend.filters.push([key, value]); return query; }, insert: (payload: unknown) => { backend.revisionCreate(payload); return query; }, update: (payload: unknown) => { backend.writes(payload); return query; }, maybeSingle: async () => result(), single: async () => result() };
  return query;
} } }));
import { ensureCurrentRevision } from '@/lib/drawingHub/revisions';
import { acceptZoneProposal } from '@/lib/drawingHub/proposals';
import { provisionRegisterRevision } from '@/components/drawings/register/registerProvision';
beforeEach(() => { backend.current = null; backend.error = null; backend.filters = []; vi.clearAllMocks(); });
describe('read-only revision tracking', () => {
  it('openingViewerDoesNotCreateHistory', async () => {
    await expect(ensureCurrentRevision({ drawing: { id: 'drawing', project_id: 'project' } })).rejects.toThrow(/tracking required/i);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
  });
  it('proposalAcceptanceDoesNotProvision', async () => {
    await expect(acceptZoneProposal('p')).rejects.toThrow(/tracking required/i);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
    expect(backend.writes).not.toHaveBeenCalled();
  });
  it('register setup cannot invent history from a parent PDF', async () => {
    await expect(provisionRegisterRevision({ row: { drawing_id: 'drawing', project_id: 'project' }, projectId: 'project', userId: 'actor' })).rejects.toThrow(/tracking required/i);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
  });
  it('returns authorized existing history without changing it', async () => {
    backend.current = { id: 'rev', project_id: 'project', drawing_id: 'drawing', is_current: true, archived_at: null, file_url: 'a.pdf', pdf_page: 2, revision_code: 'A' };
    await expect(ensureCurrentRevision({ drawing: { id: 'drawing', project_id: 'project', file_url: 'a.pdf', pdf_page: 2, revision_number: 'A' } })).resolves.toBe(backend.current);
    expect(backend.filters).toContainEqual(['project_id', 'project']);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
  });
  it.each([{ file_url: 'b.pdf' }, { pdf_page: 3 }, { revision_code: 'B' }])('does not bind newer history to an older visible source %j', async change => {
    backend.current = { id: 'rev', project_id: 'project', drawing_id: 'drawing', is_current: true, archived_at: null, file_url: 'a.pdf', pdf_page: 2, revision_code: 'A', ...change };
    await expect(ensureCurrentRevision({ drawing: { id: 'drawing', project_id: 'project', file_url: 'a.pdf', pdf_page: 2, revision_number: 'A' } })).rejects.toThrow(/reload|source/i);
    expect(backend.writes).not.toHaveBeenCalled();
  });
  it('holds incomplete source snapshots even when current history exists', async () => {
    backend.current = { id: 'rev', project_id: 'project', drawing_id: 'drawing', is_current: true, archived_at: null, file_url: 'a.pdf', pdf_page: 2, revision_code: 'A' };
    await expect(ensureCurrentRevision({ drawing: { id: 'drawing', project_id: 'project' } })).rejects.toThrow(/reload|source/i);
  });
  it('does not reinterpret an ambiguous lookup as missing history', async () => {
    backend.error = { code: 'PGRST116', message: 'ambiguous rows' };
    await expect(ensureCurrentRevision({ drawing: { id: 'drawing', project_id: 'project' } })).rejects.toEqual(backend.error);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
  });
});

describe('retired runtime writer inventory', () => {
  const retired = new Set(['carryZonesForward', 'createNewRevisionAndCarryZones', 'recordSheetSlipSheet']);
  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.name === '__tests__' ? [] :
      entry.isDirectory() ? files(join(dir, entry.name)) : /\.[jt]sx?$/.test(entry.name) ? [join(dir, entry.name)] : []);
  }
  it('has no runtime imports, reexports or callable exports of retired split revision writers', () => {
    const reachable: string[] = [];
    for (const path of files('src')) {
      const text = readFileSync(path, 'utf8');
      if (![...retired].some(name => text.includes(name))) continue;
      const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && retired.has((node.propertyName || node.name).text)) reachable.push(path);
        if (ts.isFunctionDeclaration(node) && node.name && retired.has(node.name.text) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) reachable.push(path);
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(reachable).toEqual([]);
  });
  it('holds the actual Control Board stage mutation before any direct write', async () => {
    const path = 'src/pages/DrawingSubmittalHub.tsx';
    const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    let callback = '';
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'updateDetailingStateMut' && node.initializer && ts.isCallExpression(node.initializer)) {
        const options = node.initializer.arguments[0];
        if (ts.isObjectLiteralExpression(options)) for (const p of options.properties) if (ts.isPropertyAssignment(p) && p.name.getText(file) === 'mutationFn') callback = p.initializer.getText(file);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(callback).not.toBe('');
    const update = vi.fn();
    const compiled = ts.transpile('const mutation = ' + callback, { target: ts.ScriptTarget.ES2022 });
    const mutation = new Function('entities', 'validateDetailingStateWrite', compiled + '; return mutation;')({ DrawingSet: { update } }, (): null => null);
    await expect(mutation({ item: { _drawingSetId: 'set' }, next: 'released' })).rejects.toThrow(/held|governing|workflow/i);
    expect(update).not.toHaveBeenCalled();
  });
});
