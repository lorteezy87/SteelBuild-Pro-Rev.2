import { z } from 'zod';
import { buildCreateSetRequest, buildReviseSetRequest, validateDrawingSourcePath } from './requestBuilders';
import type { CreateSetRequest, DrawingCommandOwner, ReviewedDrawingCommand, ReviseSetRequest } from './types';

const databaseName = 'steelbuild-drawing-commands-v1';
const ownerFields = ['owner.actorId', 'owner.orgId', 'owner.projectId'];
const ownerSchema = z.object({ actorId: z.string().uuid(), orgId: z.string().uuid(), projectId: z.string().uuid() }).strict();
const envelopeSchema = z.object({ version: z.literal(1), requestId: z.string().uuid(), operation: z.enum(['create_set', 'revise_set']),
  owner: ownerSchema, payload: z.unknown() }).strict();

export class DrawingCommandJournalError extends Error {
  constructor(readonly code: 'journal_unavailable' | 'journal_corrupt' | 'reservation_conflict') {
    super(`Drawing command journal: ${code}`);
    this.name = 'DrawingCommandJournalError';
  }
}

/** Strictly decode persisted/untrusted values; no credentials, URLs or binary attachments are fields of this contract. */
export function decodeDrawingCommand(value: unknown): ReviewedDrawingCommand {
  try {
    const parsed = envelopeSchema.parse(value);
    const owner = Object.freeze(ownerSchema.parse(parsed.owner) as DrawingCommandOwner);
    const payload = parsed.operation === 'create_set'
      ? buildCreateSetRequest(parsed.payload as CreateSetRequest) : buildReviseSetRequest(parsed.payload as ReviseSetRequest);
    if (payload.project_id !== owner.projectId
      || !payload.source_objects.every(({ path }) => validateDrawingSourcePath(path, owner.projectId, owner.orgId))) throw new Error();
    return Object.freeze({ version: 1, requestId: parsed.requestId, operation: parsed.operation, owner, payload }) as ReviewedDrawingCommand;
  } catch { throw new DrawingCommandJournalError('journal_corrupt'); }
}

function ownerKey(owner: DrawingCommandOwner): string[] {
  const parsed = ownerSchema.safeParse(owner);
  if (!parsed.success) throw new DrawingCommandJournalError('journal_corrupt');
  return [owner.actorId, owner.orgId, owner.projectId];
}

function openJournal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('commands', { keyPath: [...ownerFields, 'requestId'] });
      store.createIndex('owner', ownerFields, { unique: true });
    };
    request.onblocked = () => { blocked = true; reject(new DrawingCommandJournalError('journal_unavailable')); };
    request.onerror = () => reject(new DrawingCommandJournalError('journal_unavailable'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (blocked) database.close(); else resolve(database);
    };
  });
}

/** A fresh connection per operation also makes reservation serialization work across tabs. No awaits inside IDB transactions. */
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, setResult: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  let database: IDBDatabase | undefined;
  try {
    database = await openJournal();
    return await new Promise<T>((resolve, reject) => {
      const tx = mode === 'readwrite' ? database!.transaction('commands', mode, { durability: 'strict' })
        : database!.transaction('commands', mode);
      let result: T;
      let failure: unknown;
      const fail = (error: unknown) => { failure = error; tx.abort(); };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? new DrawingCommandJournalError('journal_unavailable'));
      tx.onerror = () => { failure ??= new DrawingCommandJournalError('journal_unavailable'); };
      try {
        if (mode === 'readwrite' && tx.durability !== 'strict') throw new DrawingCommandJournalError('journal_unavailable');
        run(tx.objectStore('commands'), (value) => { result = value; }, fail);
      } catch (error) { fail(error); }
    });
  } catch (error) {
    if (error instanceof DrawingCommandJournalError) throw error;
    throw new DrawingCommandJournalError('journal_unavailable');
  } finally { database?.close(); }
}

/** Resolve only after commit. An owner/project has one unresolved draft; same-key payload changes are forbidden. */
export async function saveDrawingCommand(draft: ReviewedDrawingCommand): Promise<void> {
  const snapshot = decodeDrawingCommand(draft);
  const key = ownerKey(snapshot.owner);
  await transaction<void>('readwrite', (store, done, fail) => {
    const existing = store.index('owner').get(key);
    existing.onsuccess = () => {
      try {
        if (existing.result !== undefined) {
          const saved = decodeDrawingCommand(existing.result);
          if (JSON.stringify(saved) !== JSON.stringify(snapshot)) throw new DrawingCommandJournalError('reservation_conflict');
        } else store.add(snapshot); // IndexedDB structured-clones the complete reviewed JSON.
        done(undefined);
      } catch (error) { fail(error); }
    };
  });
}

export async function loadDrawingCommands(owner: DrawingCommandOwner): Promise<ReviewedDrawingCommand[]> {
  const key = ownerKey(owner);
  return transaction('readonly', (store, done, fail) => {
    const request = store.index('owner').getAll(key);
    request.onsuccess = () => {
      try {
        const records: unknown[] = request.result;
        const commands = records.map(decodeDrawingCommand);
        if (commands.some((draft) => JSON.stringify(ownerKey(draft.owner)) !== JSON.stringify(key))) throw new DrawingCommandJournalError('journal_corrupt');
        done(commands);
      } catch (error) { fail(error); }
    };
  });
}

/** Caller must have acknowledged this request. Never delete by project or by whichever draft is latest. */
export async function completeDrawingCommand(owner: DrawingCommandOwner, requestId: string): Promise<void> {
  const key = ownerKey(owner);
  if (!z.string().uuid().safeParse(requestId).success) throw new DrawingCommandJournalError('journal_corrupt');
  await transaction<void>('readwrite', (store, done) => { store.delete([...key, requestId]); done(undefined); });
}

/** A stale tab must not resurrect an explicitly resolved reservation. */
export async function assertDrawingCommandReserved(draft: ReviewedDrawingCommand): Promise<void> {
  const saved = await loadDrawingCommands(draft.owner);
  if (saved.length !== 1 || JSON.stringify(saved[0]) !== JSON.stringify(decodeDrawingCommand(draft))) {
    throw new DrawingCommandJournalError('reservation_conflict');
  }
}
