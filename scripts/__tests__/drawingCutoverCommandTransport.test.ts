import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { bindDrawingCommandEnvelope, proposeDrawingCommandReadback, validateDrawingCommandReadback } from '../../e2e/drawingCutoverCommandTransport.ts';
import { assertDrawingMutationReadiness } from '../../e2e/drawing-cutover-setup.ts';
import type { FixtureManifest, RunConfig } from '../../e2e/drawing-cutover-setup.ts';
import { classifyRequest, guardRequest } from '../../e2e/drawingCutoverNetworkGuard.ts';
import type { GuardedRequest } from '../../e2e/drawingCutoverNetworkGuard.ts';
import type { DrawingCommandResult } from '../../src/lib/drawingCommands/types.ts';

const id = (n: number) => `abcdef00-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourcePath = `${id(2)}/uploads/${id(4)}/Synthetic_CASE.pdf`;
const stamp = '2026-10-16T12:00:00Z';
function freezeInput<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeInput); Object.freeze(value); }
  return value;
}
function fixture() {
  const projects = [4, 5, 6, 7].map(n => ({ id: id(n), orgId: id(n < 6 ? 2 : 3), createdBy: id(n < 6 ? 13 : 14) }));
  const added = { action: 'added' as const, sheet_number: 'S1', sheet_title: 'Synthetic sheet', revision_code: '0',
    file_path: sourcePath, pdf_page: 2, reviewed: true as const,
    extraction: { text: { state: 'unavailable' as const }, callouts: { state: 'unavailable' as const } } };
  const create = { project_id: id(4), revision_label: '0', file_path: sourcePath,
    source_objects: [{ path: sourcePath, token: 'a'.repeat(64) }], set_name: 'E2E New Set', set_number: null,
    discipline: null, issued_date: null, issued_by: null, notes: "Robert'); DROP TABLE drawings;--", sheets: [added] };
  return { version: 1 as const, projectRef: 'ndyfjffsulfbwpmwdmic' as const, candidateSha: '1'.repeat(40), runId: id(1),
    expiresAt: '2099-01-01T00:00:00Z', publicKeySha256: 'b'.repeat(64), review: { reviewer: 'synthetic-reviewer', evidenceSha256: 'c'.repeat(64) },
    organizations: [id(2), id(3)], projects,
    actors: (['pm', 'viewer', 'field', 'admin', 'foreign', 'removed', 'mfa'] as const).map((alias, n) => ({ alias, id: id(10 + n),
      orgId: id(alias === 'foreign' ? 3 : 2), emailSha256: 'd'.repeat(64) })),
    entities: [
      { table: 'drawing_sets' as const, id: id(30), projectId: id(4) },
      ...[31, 33, 35].map(n => ({ table: 'drawings' as const, id: id(n), projectId: id(4) })),
      ...[32, 34, 36].map(n => ({ table: 'drawing_revisions' as const, id: id(n), projectId: id(4) })),
    ], storage: [{ projectId: id(4), path: sourcePath, sha256: 'e'.repeat(64), pages: 250 }],
    intakeBindings: { version: 1 as const, projects: { A1: projects[0], A2: projects[1], B1: projects[2], B2: projects[3] }, commands: {
      newSet: { requestId: id(40), actor: 'pm' as const, operation: 'create_set' as const, payload: create },
      manualIntake: { requestId: id(41), actor: 'pm' as const, operation: 'create_set' as const,
        payload: { ...structuredClone(create), set_name: 'E2E Manual Set' } },
      revision: { requestId: id(42), actor: 'pm' as const, operation: 'revise_set' as const, payload: {
        project_id: id(4), revision_label: '1', file_path: sourcePath, source_objects: [{ path: sourcePath, token: 'a'.repeat(64) }],
        set_id: id(30), expected_set_updated_at: stamp, expected_set_revision: '0', issued_date: '2026-10-16', sheets: [
          { action: 'same' as const, drawing_id: id(33), expected_updated_at: stamp, expected_revision_id: id(34), sheet_number: 'S0' },
          { ...structuredClone(added), sheet_number: 'S2', pdf_page: 3 },
          { ...structuredClone(added), action: 'revised' as const, drawing_id: id(31), expected_updated_at: stamp, expected_revision_id: id(32) },
          { action: 'removed' as const, drawing_id: id(35), expected_updated_at: stamp, expected_revision_id: id(36), sheet_number: 'S3' },
        ],
      } },
    } },
  };
}
type Slot = 'newSet' | 'revision' | 'manualIntake';
function request(f: FixtureManifest, slot: Slot = 'newSet', receipt = false): GuardedRequest {
  const plan = f.intakeBindings!.commands[slot];
  return { actor: 'pm', method: 'POST', path: `/rest/v1/rpc/${receipt ? 'get_drawing_command_receipt'
    : plan.operation === 'create_set' ? 'create_drawing_set_from_review' : 'apply_drawing_set_revision'}`,
  body: { p_request_id: plan.requestId, ...(receipt ? { p_operation: plan.operation } : {}), p_request: structuredClone(plan.payload) } };
}
function result(slot: Slot = 'newSet'): DrawingCommandResult {
  const revised = slot === 'revision';
  return { applied: true, contract_version: 1, operation: revised ? 'revise_set' : 'create_set',
    request_id: id(revised ? 42 : slot === 'manualIntake' ? 41 : 40), project_id: id(4), set_id: id(revised ? 30 : 50),
    payload_sha256: 'f'.repeat(64), revised: revised ? 1 : 0, added: 1, removed: revised ? 1 : 0, sheet_count: revised ? 3 : 1,
    zones_cloned: revised ? 1 : 0, links_cloned: revised ? 2 : 0, dependencies_cloned: revised ? 1 : 0,
    source_pages: revised ? [
      { drawing_id: id(51), revision_id: id(52), file_path: sourcePath, pdf_page: 3 },
      { drawing_id: id(31), revision_id: id(53), file_path: sourcePath, pdf_page: 2 },
    ] : [{ drawing_id: id(51), revision_id: id(52), file_path: sourcePath, pdf_page: 2 }],
  };
}
function observations(paths: readonly { path: string }[], response = result()) {
  const rows: Record<string, unknown>[] = [
    { id: id(4), org_id: id(2) },
    { id: response.set_id, project_id: id(4), is_deleted: false, deleted_at: null },
    ...response.source_pages.flatMap(page => [
      { id: page.drawing_id, project_id: id(4), drawing_set_id: response.set_id, file_url: sourcePath,
        pdf_page: page.pdf_page, is_deleted: false, deleted_at: null, is_superseded: null },
      { id: page.revision_id, project_id: id(4), drawing_id: page.drawing_id, file_url: sourcePath,
        pdf_page: page.pdf_page, is_current: true, archived_at: null, release_status: 'received' },
    ]),
  ];
  return paths.map(({ path }, i) => ({ path, rows: [rows[i]] }));
}

describe('finite proposed drawing command envelopes', () => {
  it.each(['newSet', 'revision', 'manualIntake'] as const)('binds exact %s writer and receipt to PM/A1 without altering payload', slot => {
    const f = fixture();
    for (const receipt of [false, true]) {
      const bound = bindDrawingCommandEnvelope(f, request(f, slot, receipt));
      expect(bound).toEqual({ slot, kind: receipt ? 'receipt' : 'writer', review: {
        version: 1, requestId: f.intakeBindings.commands[slot].requestId, operation: f.intakeBindings.commands[slot].operation,
        owner: { actorId: id(10), orgId: id(2), projectId: id(4) }, payload: f.intakeBindings.commands[slot].payload,
      } });
    }
  });
  it('accepts object key reordering while retaining exact SQL-shaped notes and nested array order', () => {
    const f = fixture();
    Object.assign(f.intakeBindings.commands.newSet.payload.sheets[0].extraction,
      { callouts: { state: 'harvested', value: [{ marks: ['S1', 'S2'] }] } });
    const req = request(f); const body = req.body as Record<string, unknown>;
    const payload = body.p_request as Record<string, unknown>;
    body.p_request = Object.fromEntries(Object.entries(payload).reverse());
    expect(bindDrawingCommandEnvelope(f, req).review.payload).toEqual(f.intakeBindings.commands.newSet.payload);
    Object.assign((body.p_request as Record<string, unknown>), { notes: 'changed' });
    expect(() => bindDrawingCommandEnvelope(f, req)).toThrow('COMMAND_ENVELOPE_REFUSED');
    const wrongArray = request(f); const p = (wrongArray.body as { p_request: { sheets: { extraction: unknown }[] } }).p_request;
    p.sheets[0].extraction = { text: { state: 'unavailable' }, callouts: { state: 'harvested', value: [{ marks: ['S2', 'S1'] }] } };
    expect(() => bindDrawingCommandEnvelope(f, wrongArray)).toThrow();
  });
  it.each([
    ['method', { method: 'GET' }], ['lower method', { method: 'post' }], ['wrong actor', { actor: 'admin' }],
    ['query', { path: '/rest/v1/rpc/create_drawing_set_from_review?' }],
    ['query credentials', { path: '/rest/v1/rpc/create_drawing_set_from_review?apikey=private' }],
    ['encoded route', { path: '/rest/v1/rpc/%63reate_drawing_set_from_review' }],
    ['absolute credentials', { path: 'https://user:private@ndyfjffsulfbwpmwdmic.supabase.co/rest/v1/rpc/create_drawing_set_from_review' }],
    ['unknown route', { path: '/rest/v1/rpc/unknown' }], ['fragment', { path: '/rest/v1/rpc/create_drawing_set_from_review#x' }],
    ['representation', { representation: true }], ['extra credentials', { credentials: 'private' }],
  ])('refuses %s', (_name, patch) => {
    const f = fixture(); expect(() => bindDrawingCommandEnvelope(f, Object.assign(request(f), patch))).toThrow('COMMAND_ENVELOPE_REFUSED');
  });
  it.each(['extra', 'missing', 'request', 'project', 'operation', 'nullable', 'source-token', 'page', 'nested-revision', 'payload-spelling'])('refuses altered %s envelope', kind => {
    const f = fixture(); const req = request(f, 'revision', true); const body = req.body as Record<string, unknown>;
    const payload = body.p_request as Record<string, unknown>;
    if (kind === 'extra') body.retry = true;
    if (kind === 'missing') delete body.p_operation;
    if (kind === 'request') body.p_request_id = id(40);
    if (kind === 'project') payload.project_id = id(5);
    if (kind === 'operation') body.p_operation = 'create_set';
    if (kind === 'nullable') payload.notes = null;
    if (kind === 'source-token') payload.source_objects = [{ path: sourcePath, token: 'b'.repeat(64) }];
    if (kind === 'page') Object.assign((payload.sheets as object[])[1], { pdf_page: 2 });
    if (kind === 'nested-revision') Object.assign((payload.sheets as object[])[2], { expected_revision_id: id(34) });
    if (kind === 'payload-spelling') payload.set_id = id(30).toUpperCase();
    expect(() => bindDrawingCommandEnvelope(f, req)).toThrow('COMMAND_ENVELOPE_REFUSED');
  });
  it.each(['undefined', 'function', 'bigint', 'nan', 'infinity', 'date', 'map', 'symbol', 'accessor', 'cycle', 'sparse', 'array-extra', 'nonenumerable', 'prototype', 'toJSON'])('refuses non-JSON %s without invoking caller code or echoing input', kind => {
    const f = fixture(); const req = request(f); const body = req.body as Record<string, unknown>; let calls = 0;
    if (kind === 'undefined') body.private = undefined;
    if (kind === 'function') body.private = () => { calls++; };
    if (kind === 'bigint') body.private = 1n;
    if (kind === 'nan') body.private = NaN;
    if (kind === 'infinity') body.private = Infinity;
    if (kind === 'date') body.private = new Date();
    if (kind === 'map') body.private = new Map();
    if (kind === 'symbol') Object.assign(body, { [Symbol('private')]: true });
    if (kind === 'accessor') Object.defineProperty(body, 'p_request', { get: () => { calls++; return 'private'; }, enumerable: true });
    if (kind === 'cycle') body.private = body;
    if (kind === 'sparse') body.private = Array(2);
    if (kind === 'array-extra') body.private = Object.assign([], { private: true });
    if (kind === 'nonenumerable') Object.defineProperty(body, 'private', { value: true });
    if (kind === 'prototype') Object.setPrototypeOf(body, { private: true });
    if (kind === 'toJSON') body.toJSON = () => { calls++; return {}; };
    expect(() => bindDrawingCommandEnvelope(f, req)).toThrow('COMMAND_ENVELOPE_REFUSED'); expect(calls).toBe(0);
  });
  it('revalidates the complete book at every public boundary and never accepts a fabricated binding', () => {
    const f = fixture(); const req = request(f); const binding = bindDrawingCommandEnvelope(f, req);
    Object.assign(f.intakeBindings.commands.manualIntake, { actor: 'admin' });
    expect(() => bindDrawingCommandEnvelope(f, req)).toThrow();
    expect(() => proposeDrawingCommandReadback(f, req, result())).toThrow();
    expect(() => proposeDrawingCommandReadback(fixture(), Object.assign(request(fixture()), binding), result())).toThrow();
    const versioned = fixture(); Object.assign(versioned.intakeBindings, { version: 2 });
    expect(() => bindDrawingCommandEnvelope(versioned, request(versioned))).toThrow();
  });
  it('uses literal declared Storage namespace and canonical UUID lookup without rewriting exact review', () => {
    const f = fixture(); f.intakeBindings.projects.A1 = { ...f.projects[0], id: id(4).toUpperCase(), orgId: id(2).toUpperCase() };
    f.intakeBindings.commands.newSet.requestId = id(40).toUpperCase();
    const bound = bindDrawingCommandEnvelope(f, request(f));
    expect(bound.review.owner).toEqual({ actorId: id(10), projectId: id(4), orgId: id(2) });
    expect(bound.review.requestId).toBe(id(40).toUpperCase());
    expect(bound.review.payload.file_path).toBe(sourcePath);
  });
  it('refuses a malformed declared PM UUID instead of returning a fabricated reviewed owner', () => {
    const f = fixture(); f.actors[0].id = 'not-a-uuid';
    expect(() => bindDrawingCommandEnvelope(f, request(f))).toThrow('COMMAND_ENVELOPE_REFUSED');
  });
  it.each(['proxy', 'negative-zero', 'oversized', 'root-getter', 'null-request', 'null-fixture'])('refuses %s at the public boundary without executing input', kind => {
    const f = fixture(); const req = request(f); let calls = 0;
    if (kind === 'proxy') Object.assign(req.body as object, { private: new Proxy({}, { getPrototypeOf: () => { calls++; return null; } }) });
    if (kind === 'negative-zero') Object.assign(req.body as object, { private: -0 });
    if (kind === 'oversized') Object.assign(req.body as object, { private: 'x'.repeat(1_048_577) });
    if (kind === 'root-getter') Object.defineProperty(req, 'actor', { get: () => { calls++; return 'pm'; }, enumerable: true });
    expect(() => Reflect.apply(bindDrawingCommandEnvelope, undefined,
      [kind === 'null-fixture' ? null : f, kind === 'null-request' ? null : req])).toThrow('COMMAND_ENVELOPE_REFUSED');
    expect(calls).toBe(0);
  });
  it('detaches and deeply freezes inputs without mutating callers', () => {
    const f = fixture(); const req = request(f); const before = structuredClone(f);
    const bound = bindDrawingCommandEnvelope(f, req);
    f.intakeBindings.commands.newSet.payload.notes = 'caller change';
    expect(bound.review.payload).toEqual(before.intakeBindings.commands.newSet.payload);
    expect(() => Object.assign(bound.review.owner, { actorId: id(99) })).toThrow();
    const sheet = bound.review.payload.sheets[0];
    if (sheet.action !== 'added' && sheet.action !== 'revised') throw new Error('Expected changed fixture sheet');
    expect(() => Object.assign(sheet.extraction.text, { state: 'harvested' })).toThrow();
    expect(Object.isFrozen(bound)).toBe(true); expect(Object.isFrozen(req)).toBe(false);
  });
});

describe('proposed returned-record observations only', () => {
  it.each(['newSet', 'manualIntake', 'revision'] as const)('plans exact PM reads for %s direct/committed parity, omitting same/removed pages', slot => {
    const f = fixture(); const response = result(slot);
    const direct = proposeDrawingCommandReadback(f, request(f, slot), response);
    const receipt = proposeDrawingCommandReadback(f, request(f, slot, true), { state: 'committed', result: response });
    expect(direct.requests).toEqual(receipt.requests);
    expect(direct.requests).toHaveLength(slot === 'revision' ? 6 : 4);
    expect(direct.requests[0]).toEqual({ actor: 'pm', method: 'GET', path: `/rest/v1/projects?id=eq.${id(4)}&select=id,org_id` });
    expect(direct.requests[1]).toEqual({ actor: 'pm', method: 'GET', path: `/rest/v1/drawing_sets?id=eq.${id(slot === 'revision' ? 30 : 50)}&project_id=eq.${id(4)}&select=id,project_id,is_deleted,deleted_at` });
    expect(direct.requests[2]).toEqual({ actor: 'pm', method: 'GET', path: `/rest/v1/drawings?id=eq.${id(51)}&project_id=eq.${id(4)}&select=id,project_id,drawing_set_id,file_url,pdf_page,is_deleted,deleted_at,is_superseded` });
    expect(direct.requests[3]).toEqual({ actor: 'pm', method: 'GET', path: `/rest/v1/drawing_revisions?id=eq.${id(52)}&project_id=eq.${id(4)}&select=id,project_id,drawing_id,file_url,pdf_page,is_current,archived_at,release_status` });
    const rows = observations(direct.requests, response);
    expect(validateDrawingCommandReadback(f, request(f, slot), response, rows)).toEqual(direct);
  });
  it.each(['pending', 'not_committed'])('gives %s no readback plan or retry authority', state => {
    const f = fixture(); expect(() => proposeDrawingCommandReadback(f, request(f, 'newSet', true), { state })).toThrow();
    expect(() => validateDrawingCommandReadback(f, request(f, 'newSet', true), { state }, [])).toThrow();
  });
  it.each([null, {}, { error: 'private' }, { ...result(), applied: false }, { ...result(), request_id: id(99) },
    { ...result(), contract_version: 2 }, { ...result(), source_pages: [] }])('refuses malformed/unbound result %#', value => {
    const f = fixture(); expect(() => proposeDrawingCommandReadback(f, request(f), value)).toThrow();
  });
  it.each(['duplicate-drawing', 'duplicate-revision', 'prior-reuse', 'existing-drawing-reuse', 'order'])('rejects %s result identities before proposing reads', kind => {
    const f = fixture(); const response = result('revision'); const pages = response.source_pages.map(p => ({ ...p }));
    if (kind === 'duplicate-drawing') pages[0].drawing_id = pages[1].drawing_id.toUpperCase();
    if (kind === 'duplicate-revision') pages[1].revision_id = pages[0].revision_id.toUpperCase();
    if (kind === 'prior-reuse') pages[1].revision_id = id(32).toUpperCase();
    if (kind === 'existing-drawing-reuse') pages[0].drawing_id = id(33).toUpperCase();
    if (kind === 'order') pages.reverse();
    expect(() => proposeDrawingCommandReadback(f, request(f, 'revision'), { ...response, source_pages: pages })).toThrow();
  });
  it('accepts frozen fixture/request/rows, reorders path-labelled observations, and isolates plan from response mutation', () => {
    const f = fixture(); const req = request(f); const response = result();
    freezeInput(f); freezeInput(req);
    const plan = proposeDrawingCommandReadback(f, req, response);
    const rows = observations(plan.requests).reverse(); rows.forEach(row => { Object.freeze(row.rows[0]); Object.freeze(row.rows); Object.freeze(row); });
    expect(validateDrawingCommandReadback(f, req, response, Object.freeze(rows))).toEqual(plan);
    Object.assign(response.source_pages[0], { pdf_page: 99 });
    expect(plan.result.source_pages[0].pdf_page).toBe(2);
  });
  it('accepts exactly 250 changed pages/502 GETs and rejects over-bound rather than truncating', () => {
    const f = fixture(); const sheet = f.intakeBindings.commands.newSet.payload.sheets[0];
    f.intakeBindings.commands.newSet.payload.sheets = Array.from({ length: 250 }, (_, n) => ({ ...sheet, sheet_number: `S${n}`, pdf_page: n + 1 }));
    const response = { ...result(), added: 250, sheet_count: 250, source_pages: Array.from({ length: 250 }, (_, n) => ({
      drawing_id: id(1000 + n), revision_id: id(2000 + n), file_path: sourcePath, pdf_page: n + 1,
    })) };
    const plan = proposeDrawingCommandReadback(f, request(f), response); expect(plan.requests).toHaveLength(502);
    expect(validateDrawingCommandReadback(f, request(f), response, observations(plan.requests, response)).requests).toHaveLength(502);
    expect(() => proposeDrawingCommandReadback(f, request(f), { ...response, source_pages: [...response.source_pages, response.source_pages[0]] })).toThrow();
    f.intakeBindings.commands.newSet.payload.sheets.push({ ...sheet, sheet_number: 'S251' });
    expect(() => proposeDrawingCommandReadback(f, request(f), response)).toThrow();
  });
  it.each(['missing', 'duplicate', 'extra', 'missing-row', 'duplicate-row', 'unknown-path', 'malformed-row', 'extra-field'])('rejects %s observations', kind => {
    const f = fixture(); const req = request(f); const response = result(); const plan = proposeDrawingCommandReadback(f, req, response);
    const rows = observations(plan.requests);
    if (kind === 'missing') rows.pop();
    if (kind === 'duplicate') rows[1] = rows[0];
    if (kind === 'extra') rows.push(rows[0]);
    if (kind === 'missing-row') rows[2].rows = [];
    if (kind === 'duplicate-row') rows[2].rows.push(rows[2].rows[0]);
    if (kind === 'unknown-path') rows[2].path += '&or=(id.not.is.null)';
    if (kind === 'malformed-row') delete rows[2].rows[0].is_superseded;
    if (kind === 'extra-field') rows[2].rows[0].authority = true;
    expect(() => validateDrawingCommandReadback(f, req, response, rows)).toThrow();
  });
  it.each([
    [0, 'id', id(5)], [0, 'org_id', id(3)],
    [1, 'id', id(99)], [1, 'project_id', id(5)], [1, 'is_deleted', true], [1, 'deleted_at', stamp],
    [2, 'id', id(99)], [2, 'project_id', id(5)], [2, 'drawing_set_id', id(30)], [2, 'pdf_page', 1],
    [2, 'file_url', sourcePath.toLowerCase()], [2, 'is_deleted', true], [2, 'deleted_at', stamp], [2, 'is_superseded', true],
    [3, 'id', id(99)], [3, 'project_id', id(5)], [3, 'drawing_id', id(31)], [3, 'pdf_page', 1],
    [3, 'file_url', sourcePath.toLowerCase()], [3, 'is_current', false], [3, 'archived_at', stamp], [3, 'release_status', 'released'],
  ] as const)('rejects row %s with foreign or inactive %s', (index, key, value) => {
    const f = fixture(); const req = request(f); const response = result(); const plan = proposeDrawingCommandReadback(f, req, response);
    const rows = observations(plan.requests); rows[index].rows[0][key] = value;
    expect(() => validateDrawingCommandReadback(f, req, response, rows)).toThrow();
  });
  it('compares UUID content canonically while retaining cross-table coincident identities and frozen snapshots', () => {
    const f = fixture(); const req = request(f); const response = { ...result(), source_pages: [{ ...result().source_pages[0], revision_id: id(51) }] };
    const plan = proposeDrawingCommandReadback(f, req, response); const rows = observations(plan.requests, response);
    rows.forEach(o => Object.keys(o.rows[0]).forEach(k => {
      if (k === 'id' || k.endsWith('_id') || k === 'created_by') o.rows[0][k] = String(o.rows[0][k]).toUpperCase();
    }));
    rows[2].rows[0].is_superseded = false;
    expect(validateDrawingCommandReadback(f, req, response, rows)).toEqual(plan);
    expect(Object.isFrozen(plan.requests[0])).toBe(true); expect(Object.isFrozen(plan.result.source_pages[0])).toBe(true);
    expect(() => Object.assign(plan.requests[0], { method: 'POST' })).toThrow();
  });
  it('never appends returned IDs to the fixture or enables unchanged live guard/readiness', async () => {
    const f = fixture(); const before = structuredClone(f); const req = request(f); const receipt = request(f, 'newSet', true);
    const plan = proposeDrawingCommandReadback(f, req, result());
    validateDrawingCommandReadback(f, req, result(), observations(plan.requests)); expect(f).toEqual(before);
    const config: RunConfig = { phase: 'acceptance', candidateSha: f.candidateSha, manifest: f,
      manifestSha256: 'b'.repeat(64), anonKey: 'synthetic-public-key', actors: {} as RunConfig['actors'] };
    const transport = vi.fn();
    for (const command of [req, receipt]) {
      expect(() => classifyRequest(config, command)).toThrow('COMMAND_REVIEW_BINDINGS_REQUIRED');
      await expect(guardRequest(config, command, transport)).rejects.toThrow('COMMAND_REVIEW_BINDINGS_REQUIRED');
    }
    expect(() => classifyRequest(config, plan.requests[2])).toThrow('UNKNOWN_FIXTURE_ENTITY');
    expect(transport).not.toHaveBeenCalled(); expect(() => assertDrawingMutationReadiness()).toThrow('MUTATION_PREREQUISITES_UNPROVED');
  });
  it('imports pure transport planning under Node with no configured app environment or network', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      "globalThis.fetch=()=>{throw new Error('NETWORK_FORBIDDEN')}; const m=await import('./e2e/drawingCutoverCommandTransport.ts'); console.log(typeof m.bindDrawingCommandEnvelope,typeof m.proposeDrawingCommandReadback)"],
    { cwd: process.cwd(), env: {}, encoding: 'utf8' });
    expect(output.trim()).toBe('function function');
  });
});
