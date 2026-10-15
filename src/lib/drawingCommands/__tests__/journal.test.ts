import { beforeEach, expect, it, vi } from 'vitest';
import { IDBDatabase, IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { completeDrawingCommand, loadDrawingCommands, saveDrawingCommand } from '../journal';
import { draftFixture, nextId, owner } from './fixtures';
import type { ReviewedDrawingCommand } from '../types';

beforeEach(() => { vi.restoreAllMocks(); vi.stubGlobal('indexedDB', new IDBFactory()); });

it('reloadReusesExactKeyAndPayload through independent connections and structured clones', async () => {
  const originalDraft = draftFixture();
  await saveDrawingCommand(originalDraft);
  const [reloaded] = await loadDrawingCommands(owner);
  expect(reloaded).toEqual(originalDraft);
  expect(reloaded).not.toBe(originalDraft);
  expect(reloaded.payload).not.toBe(originalDraft.payload);
});

it('two-tab reservations serialize and reject a second unresolved owner/project draft', async () => {
  const first = draftFixture();
  const second = draftFixture(nextId);
  const outcomes = await Promise.allSettled([saveDrawingCommand(first), saveDrawingCommand(second)]);
  expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  expect(await loadDrawingCommands(owner)).toHaveLength(1);
  await expect(saveDrawingCommand(first)).resolves.toBeUndefined();
  await expect(saveDrawingCommand({ ...first, payload: { ...first.payload, revision_label: 'CHANGED' } })).rejects.toThrow();
  expect(await loadDrawingCommands(owner)).toEqual([first]);
});

it('lateOldReplyCannotDeleteNewDraft and owner partitions stay separate', async () => {
  const old = draftFixture();
  const newerDraft = draftFixture(nextId);
  await saveDrawingCommand(old);
  await completeDrawingCommand(owner, old.requestId);
  await saveDrawingCommand(newerDraft);
  await completeDrawingCommand(owner, old.requestId);
  expect(await loadDrawingCommands(owner)).toContainEqual(newerDraft);
  expect(await loadDrawingCommands({ ...owner, actorId: nextId })).toEqual([]);
  await completeDrawingCommand({ ...owner, actorId: nextId }, newerDraft.requestId);
  expect(await loadDrawingCommands(owner)).toContainEqual(newerDraft);
});

it('journal write failure does not report persistence or reserve a partial record', async () => {
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => { throw new DOMException('Quota', 'QuotaExceededError'); });
  await expect(saveDrawingCommand(draftFixture())).rejects.toThrow();
  expect(await loadDrawingCommands(owner)).toEqual([]);
});

it('requests strict commit durability for both reservation and exact acknowledgement', async () => {
  const transactions = vi.spyOn(IDBDatabase.prototype, 'transaction');
  await saveDrawingCommand(draftFixture());
  await completeDrawingCommand(owner, draftFixture().requestId);
  expect(transactions.mock.calls.filter(([, mode]) => mode === 'readwrite')).toEqual([
    ['commands', 'readwrite', { durability: 'strict' }], ['commands', 'readwrite', { durability: 'strict' }],
  ]);
});

it('unsupported strict durability refuses the reservation instead of silently downgrading', async () => {
  const transact = IDBDatabase.prototype.transaction;
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<typeof transact>) {
    const tx = transact.apply(this, args);
    if (args[1] === 'readwrite') Object.defineProperty(tx, 'durability', { value: 'default' });
    return tx;
  });
  await expect(saveDrawingCommand(draftFixture())).rejects.toMatchObject({ code: 'journal_unavailable' });
  expect(await loadDrawingCommands(owner)).toEqual([]);
});

it('unknown IndexedDB database version refuses access without reset', async () => {
  const database = await new Promise<globalThis.IDBDatabase>((resolve) => {
    const request = indexedDB.open('steelbuild-drawing-commands-v1', 2);
    request.onsuccess = () => resolve(request.result);
  });
  database.close();
  await expect(saveDrawingCommand(draftFixture())).rejects.toMatchObject({ code: 'journal_unavailable' });
  await expect(loadDrawingCommands(owner)).rejects.toMatchObject({ code: 'journal_unavailable' });
});

it.each([2, 'corrupt'])('corrupt/unknown journal version %s fails closed without erasing evidence', async (version) => {
  await saveDrawingCommand(draftFixture());
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('steelbuild-drawing-commands-v1', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('commands', 'readwrite');
    transaction.objectStore('commands').put({ ...draftFixture(), version });
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
  await expect(loadDrawingCommands(owner)).rejects.toThrow();
  await expect(saveDrawingCommand(draftFixture(nextId))).rejects.toThrow();
});

it('rejects extra credentials, blobs, URLs and mismatched source ownership', async () => {
  const draft = draftFixture();
  for (const bad of [
    { ...draft, accessToken: 'credential' }, { ...draft, pdf: new Blob(['pdf']) },
    { ...draft, payload: { ...draft.payload, file_path: 'https://example.test/signed.pdf?token=secret' } },
    { ...draft, owner: { ...owner, orgId: nextId } },
  ]) await expect(saveDrawingCommand(bad as ReviewedDrawingCommand)).rejects.toThrow();
  expect(await loadDrawingCommands(owner)).toEqual([]);
});
