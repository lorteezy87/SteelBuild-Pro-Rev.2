import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDrawingCommand, getDrawingCommandCapabilities, getDrawingCommandReceipt, getDrawingRevisionSources, parseDrawingCommandResult } from '../drawingCommands';
import { buildCreateSetRequest, buildReviseSetRequest } from '@/lib/drawingCommands/requestBuilders';
import type { DrawingCommandOutcome, ReviewedDrawingCommand, ReviewedDrawingSheet } from '@/lib/drawingCommands/types';
import { DrawingCommandPreflightError } from '@/lib/drawingCommands/errors';

const { rpc, getUser, entity } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), entity: { create: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, auth: { getUser } } }));
vi.mock('../entities', () => ({ entities: { Drawing: entity, DrawingSet: entity } }));
const project = '11111111-1111-4111-8111-111111111111';
const org = '22222222-2222-4222-8222-222222222222';
const actor = '66666666-6666-4666-8666-666666666666';
const set = '33333333-3333-4333-8333-333333333333';
const drawing = '44444444-4444-4444-8444-444444444444';
const revision = '55555555-5555-4555-8555-555555555555';
const path = `${org}/uploads/${project}/review.pdf`;
const flags = { contract_version: 1, new_set: true, revision: true, write_boundary: true, source_protection: true, receipt_lookup: true };
const draftFixture = (): ReviewedDrawingCommand => ({
  version: 1, requestId: '77777777-7777-4777-8777-777777777777', operation: 'create_set',
  owner: { actorId: actor, orgId: org, projectId: project },
  payload: buildCreateSetRequest({ project_id: project, set_name: 'Review A', set_number: null, revision_label: 'A', discipline: null,
    issued_date: null, issued_by: null, notes: null, file_path: path, source_objects: [{ path, token: 'a'.repeat(64) }],
    sheets: [{ action: 'added', sheet_number: 'S1', sheet_title: 'Framing', revision_code: 'A', file_path: path, pdf_page: 2, reviewed: true,
      extraction: { text: { state: 'unavailable' }, callouts: { state: 'unavailable' } } }] }),
});
const resultFixture = () => ({ applied: true, contract_version: 1, operation: 'create_set', payload_sha256: 'b'.repeat(64),
  request_id: '77777777-7777-4777-8777-777777777777', project_id: project, set_id: set,
  revised: 0, added: 1, removed: 0, sheet_count: 1, zones_cloned: 0, links_cloned: 0, dependencies_cloned: 0,
  source_pages: [{ drawing_id: drawing, revision_id: revision, file_path: path, pdf_page: 2 }] });

// Construct exact typed requests directly: response safety must not rely on a builder rejecting a roster.
const revisionDraftFixture = (sheets: readonly ReviewedDrawingSheet[]): ReviewedDrawingCommand => ({
  ...draftFixture(), operation: 'revise_set', payload: {
    project_id: project, set_id: set, expected_set_updated_at: '2026-10-15T12:00:00Z', expected_set_revision: 'A',
    revision_label: 'B', issued_date: '2026-10-15', file_path: path,
    source_objects: [{ path, token: 'a'.repeat(64) }], sheets,
  },
});
const existingSheet = { drawing_id: drawing, expected_updated_at: '2026-10-15T12:00:00Z', expected_revision_id: org, sheet_number: 'S1' };
const impossibleCountCases = () => {
  const create = draftFixture();
  if (create.operation !== 'create_set') throw new Error('fixture');
  return [
    { name: 'all removed with zero active sheets', draft: revisionDraftFixture([{ ...existingSheet, action: 'removed' }]),
      result: { ...resultFixture(), operation: 'revise_set', added: 0, removed: 1, sheet_count: 0, source_pages: [] } },
    { name: 'same only with zero changes', draft: revisionDraftFixture([{ ...existingSheet, action: 'same' }]),
      result: { ...resultFixture(), operation: 'revise_set', added: 0, source_pages: [] } },
    ...(['zones_cloned', 'links_cloned', 'dependencies_cloned'] as const).map((field) => ({
      name: `revision ${field} without revised sheets`, draft: revisionDraftFixture(create.payload.sheets),
      result: { ...resultFixture(), operation: 'revise_set', [field]: 1 },
    })),
    ...(['zones_cloned', 'links_cloned', 'dependencies_cloned'] as const).map((field) => ({
      name: `new set ${field}`, draft: create, result: { ...resultFixture(), [field]: 1 },
    })),
  ];
};

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null });
  rpc.mockImplementation(async (name: string) => ({ data: name === 'get_drawing_command_capabilities' ? flags : resultFixture(), error: null }));
});

it('owner fence invalidated during capabilities prevents a mutation RPC', async () => {
  let current = true;
  rpc.mockImplementation(async () => { current = false; return { data: flags, error: null }; });
  await expect(applyDrawingCommand(draftFixture(), { assertCurrent: () => {
    if (!current) throw new DrawingCommandPreflightError('identity_changed');
  } })).rejects.toMatchObject({ dispatched: false, code: 'identity_changed' });
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('receipt fence invalidated during Auth prevents stale lookup', async () => {
  let current = true;
  getUser.mockImplementation(async () => { current = false; return { data: { user: { id: actor } }, error: null }; });
  await expect(getDrawingCommandReceipt(draftFixture(), { assertCurrent: () => {
    if (!current) throw new DrawingCommandPreflightError('identity_changed');
  } })).rejects.toMatchObject({ dispatched: false, code: 'identity_changed' });
  expect(rpc).not.toHaveBeenCalled();
});

it('guard storage failure before send remains explicitly undispatched', async () => {
  await expect(applyDrawingCommand(draftFixture(), { dispatch: async () => { throw new Error('storage unavailable'); } }))
    .rejects.toMatchObject({ dispatched: false, code: 'unavailable' });
  expect(rpc.mock.calls.filter(([name]) => name === 'create_drawing_set_from_review')).toHaveLength(0);
});

it.each([
  new DrawingCommandPreflightError('identity_changed'),
  { code: '40001', message: 'DRAWING_REVISION_STALE: guard is not SQL evidence' },
])('a guard failure after send never claims rollback or dispatched=false: %j', async (guardError) => {
  const outcome = await applyDrawingCommand(draftFixture(), { dispatch: async (send) => {
    await send();
    throw guardError;
  } });
  expect(outcome.kind).toBe('uncertain');
  expect(rpc.mock.calls.filter(([name]) => name === 'create_drawing_set_from_review')).toHaveLength(1);
});

it('duplicate send cannot dispatch twice', async () => {
  const outcome = await applyDrawingCommand(draftFixture(), { dispatch: async (send) => { await send(); return send(); } });
  expect(outcome.kind).toBe('uncertain');
  expect(rpc.mock.calls.filter(([name]) => name === 'create_drawing_set_from_review')).toHaveLength(1);
});

it('a send closure cannot escape its dispatch guard lifetime', async () => {
  let escaped!: () => Promise<DrawingCommandOutcome>;
  await expect(applyDrawingCommand(draftFixture(), { dispatch: async (send) => {
    escaped = send;
    return { kind: 'uncertain', error: { code: 'unused', message: 'unused' } };
  } })).rejects.toMatchObject({ dispatched: false, code: 'unavailable' });
  expect(() => escaped()).toThrow();
  expect(rpc.mock.calls.filter(([name]) => name === 'create_drawing_set_from_review')).toHaveLength(0);
});

describe('strict response parsing', () => {
  it('matches complete reviewed project and accepts only server supplied hash', () => {
    const draft = draftFixture();
    const parsed = parseDrawingCommandResult(resultFixture(), draft);
    expect(parsed.project_id).toBe(draft.owner.projectId);
    expect(parsed.payload_sha256).toBe('b'.repeat(64));
  });
  it.each([
    { added: 0 }, { removed: 1 }, { sheet_count: 2 }, { revised: -1 }, { zones_cloned: 1001 },
    { links_cloned: 2001 }, { dependencies_cloned: 2001 }, { set_id: 'bad' },
    { project_id: org }, { request_id: actor }, { operation: 'revise_set' }, { payload_sha256: '' },
    { source_pages: [] }, { source_pages: [{ drawing_id: drawing, revision_id: revision, file_path: path, pdf_page: 3 }] },
    { source_pages: [{ drawing_id: drawing, revision_id: revision, file_path: `${path}?signed`, pdf_page: 2 }] },
  ])('rejectsPartialOrForeignReceipt %j', (patch) => {
    expect(() => parseDrawingCommandResult({ ...resultFixture(), ...patch }, draftFixture())).toThrow();
  });
  it('rejectsUnknownContractVersion', () => {
    expect(() => parseDrawingCommandResult({ ...resultFixture(), contract_version: 2 }, draftFixture())).toThrow();
  });
  it.each(impossibleCountCases())('independently rejects impossible committed counts: $name', ({ draft, result }) => {
    expect(() => parseDrawingCommandResult(result, draft)).toThrow();
  });
  it('rejects duplicate IDs and reordered or foreign source pages', () => {
    const first = draftFixture();
    if (first.operation !== 'create_set') throw new Error('fixture');
    const draft: ReviewedDrawingCommand = { ...first, payload: buildCreateSetRequest({ ...first.payload,
      sheets: [first.payload.sheets[0], { ...first.payload.sheets[0], sheet_number: 'S2', pdf_page: 4 }],
    }) };
    const page1 = resultFixture().source_pages[0];
    const page2 = { drawing_id: actor, revision_id: org, file_path: path, pdf_page: 4 };
    const result = { ...resultFixture(), added: 2, sheet_count: 2, source_pages: [page1, page2] };
    expect(parseDrawingCommandResult(result, draft).source_pages).toHaveLength(2);
    for (const source_pages of [[page1, { ...page2, drawing_id: drawing }], [page1, { ...page2, revision_id: revision }], [page2, page1]]) {
      expect(() => parseDrawingCommandResult({ ...result, source_pages }, draft)).toThrow();
    }
  });
});

describe('fail closed drawing transport', () => {
  it.each(['\u0000', '\ud800', '\udfff'])('rejects JSONB-incompatible strings and keys before apply or receipt RPC %j', async (bad) => {
    const created = draftFixture();
    if (created.operation !== 'create_set') throw new Error('fixture');
    const revised = revisionDraftFixture([{ ...created.payload.sheets[0], ...existingSheet, action: 'revised', expected_revision_id: revision }]);
    for (const original of [created, revised]) for (const callout of [{ nested: [bad] }, { [bad]: 'value' }]) {
      const draft: ReviewedDrawingCommand = { ...original, payload: { ...original.payload, sheets: [{ ...original.payload.sheets[0],
        extraction: { text: { state: 'unavailable' }, callouts: { state: 'harvested', value: [callout] } },
      }] } } as ReviewedDrawingCommand;
      await expect(applyDrawingCommand(draft)).rejects.toThrow();
      await expect(getDrawingCommandReceipt(draft)).rejects.toThrow();
      expect(rpc).not.toHaveBeenCalled();
    }
  });
  it.each(impossibleCountCases())('direct success remains uncertain for impossible committed counts: $name', async ({ draft, result }) => {
    rpc.mockImplementation(async (name: string) => ({ data: name === 'get_drawing_command_capabilities' ? flags : result, error: null }));
    expect((await applyDrawingCommand(draft)).kind).toBe('uncertain');
  });
  it.each(impossibleCountCases())('committed receipt rejects impossible committed counts: $name', async ({ draft, result }) => {
    rpc.mockResolvedValue({ data: { state: 'committed', result }, error: null });
    await expect(getDrawingCommandReceipt(draft)).rejects.toThrow();
  });
  it('preserves mixed rosters with real changes, active sheets and coordination cloned from revised sheets', async () => {
    const create = draftFixture();
    if (create.operation !== 'create_set') throw new Error('fixture');
    const draft = revisionDraftFixture([
      { ...existingSheet, action: 'same', drawing_id: actor, sheet_number: 'S0', expected_revision_id: null },
      { ...create.payload.sheets[0], sheet_number: 'S2', pdf_page: 4 },
      { ...create.payload.sheets[0], ...existingSheet, action: 'revised' },
      { ...existingSheet, action: 'removed', drawing_id: org, sheet_number: 'S3', expected_revision_id: actor },
    ]);
    const result = { ...resultFixture(), operation: 'revise_set', revised: 1, removed: 1, sheet_count: 3,
      zones_cloned: 1, links_cloned: 2, dependencies_cloned: 1,
      source_pages: [
        { drawing_id: set, revision_id: '88888888-8888-4888-8888-888888888888', file_path: path, pdf_page: 4 },
        resultFixture().source_pages[0],
      ],
    };
    expect(parseDrawingCommandResult(result, draft)).toEqual(result);
    rpc.mockImplementation(async (name: string) => ({ data: name === 'get_drawing_command_capabilities' ? flags : result, error: null }));
    expect(await applyDrawingCommand(draft)).toEqual({ kind: 'committed', result });
    rpc.mockResolvedValue({ data: { state: 'committed', result }, error: null });
    expect(await getDrawingCommandReceipt(draft)).toEqual({ state: 'committed', result });
  });
  it('checks every capability before exactly one command dispatch with exact payload', async () => {
    const capabilities = await getDrawingCommandCapabilities(project);
    expect(capabilities.write_boundary).toBe(true);
    rpc.mockClear();
    const draft = draftFixture();
    expect((await applyDrawingCommand(draft)).kind).toBe('committed');
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['get_drawing_command_capabilities', 'create_drawing_set_from_review']);
    expect(rpc).toHaveBeenLastCalledWith('create_drawing_set_from_review', { p_request_id: draft.requestId, p_request: draft.payload });
  });
  it.each(['new_set', 'revision', 'write_boundary', 'source_protection', 'receipt_lookup', 'contract_version'])('missing %s blocks Apply', async (key) => {
    const incomplete: Record<string, unknown> = { ...flags };
    delete incomplete[key];
    rpc.mockResolvedValue({ data: incomplete, error: null });
    await expect(applyDrawingCommand(draftFixture())).rejects.toThrow();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['get_drawing_command_capabilities']);
  });
  it('false and unknown capability flags block Apply', async () => {
    for (const patch of [{ revision: false }, { receipt_lookup: 'true' }, { contract_version: 2 }]) {
      rpc.mockResolvedValue({ data: { ...flags, ...patch }, error: null });
      await expect(applyDrawingCommand(draftFixture())).rejects.toThrow();
    }
  });
  it('neverFallsBackToEntityCrud', async () => {
    rpc.mockImplementation(async (name: string) => name === 'get_drawing_command_capabilities'
      ? { data: flags, error: null } : { data: null, error: { code: 'PGRST202', message: 'missing RPC' } });
    expect((await applyDrawingCommand(draftFixture())).kind).toBe('uncertain');
    expect(entity.create).not.toHaveBeenCalled();
  });
  it('distinguishes SQL rejection, rejected network calls and malformed success', async () => {
    for (const failure of [
      { response: { data: null as unknown, error: { code: '40001', message: 'DRAWING_REVISION_STALE: changed' } }, kind: 'rejected' },
      { response: { data: { ...resultFixture(), added: 2 }, error: null }, kind: 'uncertain' },
    ]) {
      rpc.mockImplementation(async (name: string) => name === 'get_drawing_command_capabilities' ? { data: flags, error: null } : failure.response);
      expect((await applyDrawingCommand(draftFixture())).kind).toBe(failure.kind);
    }
    rpc.mockImplementation(async (name: string) => { if (name === 'get_drawing_command_capabilities') return { data: flags, error: null }; throw new TypeError('Failed to fetch'); });
    expect((await applyDrawingCommand(draftFixture())).kind).toBe('uncertain');
  });
  it('rejects foreign owner, project or operation before command dispatch', async () => {
    for (const patch of [{ owner: { actorId: org, orgId: org, projectId: project } }, { owner: { actorId: actor, orgId: org, projectId: org } }, { operation: 'revise_set' }]) {
      await expect(applyDrawingCommand({ ...draftFixture(), ...patch } as ReviewedDrawingCommand)).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rechecks actor identity after capability preflight before dispatch', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: actor } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: org } }, error: null });
    await expect(applyDrawingCommand(draftFixture())).rejects.toMatchObject({ code: 'identity_changed', dispatched: false });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['get_drawing_command_capabilities']);
  });
  it('unavailable preflight stays distinguishable from dispatched uncertainty', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(applyDrawingCommand(draftFixture())).rejects.toBeInstanceOf(DrawingCommandPreflightError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('dispatches revision with complete identity and rejects wrong returned set or sheet', async () => {
    const create = draftFixture().payload;
    const draft: ReviewedDrawingCommand = { ...draftFixture(), operation: 'revise_set', payload: buildReviseSetRequest({
      project_id: project, set_id: set, expected_set_updated_at: '2026-10-15T12:00:00Z', expected_set_revision: 'A',
      revision_label: 'B', issued_date: '2026-10-15', file_path: path, source_objects: create.source_objects,
      sheets: [{ ...create.sheets[0], action: 'revised', drawing_id: drawing, expected_revision_id: org, expected_updated_at: '2026-10-15T12:00:00Z' }] as never,
    }) };
    const response = { ...resultFixture(), operation: 'revise_set', revised: 1, added: 0 };
    rpc.mockImplementation(async (name: string) => ({ data: name === 'get_drawing_command_capabilities' ? flags : response, error: null }));
    expect((await applyDrawingCommand(draft)).kind).toBe('committed');
    expect(rpc).toHaveBeenLastCalledWith('apply_drawing_set_revision', { p_request_id: draft.requestId, p_request: draft.payload });
    expect(() => parseDrawingCommandResult({ ...response, set_id: org }, draft)).toThrow();
    expect(() => parseDrawingCommandResult({ ...response, source_pages: [{ ...response.source_pages[0], drawing_id: org }] }, draft)).toThrow();
  });
  it('receipt lookup sends full reviewed JSON and strictly validates committed results', async () => {
    const draft = draftFixture();
    rpc.mockResolvedValue({ data: { state: 'committed', result: resultFixture() }, error: null });
    expect((await getDrawingCommandReceipt(draft)).state).toBe('committed');
    expect(rpc).toHaveBeenLastCalledWith('get_drawing_command_receipt', { p_request_id: draft.requestId, p_operation: 'create_set', p_request: draft.payload });
    for (const data of [{ state: 'pending' }, { state: 'not_committed' }]) {
      rpc.mockResolvedValue({ data, error: null });
      expect(await getDrawingCommandReceipt(draft)).toEqual(data);
    }
    rpc.mockResolvedValue({ data: { state: 'committed', result: { ...resultFixture(), project_id: org } }, error: null });
    await expect(getDrawingCommandReceipt(draft)).rejects.toThrow();
  });
  it('source reader requires every exact requested path and preserves server tokens', async () => {
    rpc.mockResolvedValue({ data: [{ path, token: 'c'.repeat(64) }], error: null });
    expect(await getDrawingRevisionSources(project, [path])).toEqual([{ path, token: 'c'.repeat(64) }]);
    expect(rpc).toHaveBeenLastCalledWith('get_drawing_revision_sources', { p_project_id: project, p_paths: [path] });
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(getDrawingRevisionSources(project, [path])).rejects.toThrow();
    await expect(getDrawingRevisionSources(project, [`${path}?token=secret`])).rejects.toThrow();
  });
});
