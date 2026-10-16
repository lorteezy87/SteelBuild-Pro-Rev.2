import type { DrawingCommandResult, ReviewedDrawingCommand } from '../types';

export const owner = { actorId: '66666666-6666-4666-8666-666666666666', orgId: '22222222-2222-4222-8222-222222222222', projectId: '11111111-1111-4111-8111-111111111111' };
export const requestId = '77777777-7777-4777-8777-777777777777';
export const nextId = '88888888-8888-4888-8888-888888888888';
const path = `${owner.orgId}/uploads/${owner.projectId}/review.pdf`;
export function draftFixture(id = requestId): Extract<ReviewedDrawingCommand, { operation: 'create_set' }> {
  return { version: 1, requestId: id, operation: 'create_set', owner: { ...owner }, payload: {
    project_id: owner.projectId, set_name: 'Reviewed set', set_number: null, revision_label: 'A', discipline: null,
    issued_date: null, issued_by: null, notes: 'Retained project text', file_path: path,
    source_objects: [{ path, token: 'a'.repeat(64) }], sheets: [{ action: 'added', sheet_number: 'S1', sheet_title: 'Framing',
      revision_code: 'A', file_path: path, pdf_page: 2, reviewed: true,
      extraction: { text: { state: 'unavailable' }, callouts: { state: 'harvested', value: [] } } }],
  } };
}
export function resultFixture(id = requestId): DrawingCommandResult {
  return { applied: true, contract_version: 1, operation: 'create_set', payload_sha256: 'b'.repeat(64), request_id: id,
    project_id: owner.projectId, set_id: '33333333-3333-4333-8333-333333333333', added: 1, revised: 0, removed: 0,
    sheet_count: 1, zones_cloned: 0, links_cloned: 0, dependencies_cloned: 0,
    source_pages: [{ drawing_id: '44444444-4444-4444-8444-444444444444', revision_id: '55555555-5555-4555-8555-555555555555', file_path: path, pdf_page: 2 }] };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Small FIFO model of the exclusive same-origin Web Lock API used by this journal. IDB remains independent/transactional. */
export function createTestDrawingLocks() {
  const tails = new Map<string, Promise<void>>();
  return {
    async request<T>(name: string, options: LockOptions, callback: (lock: Lock) => T | PromiseLike<T>): Promise<T> {
      if (options.mode !== 'exclusive') throw new Error('Expected an exclusive lock');
      const previous = tails.get(name) ?? Promise.resolve();
      const released = deferred<void>();
      tails.set(name, released.promise);
      await previous;
      try { return await callback({ name, mode: 'exclusive' }); }
      finally { released.resolve(undefined); }
    },
  };
}
