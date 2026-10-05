// Storage cleanup runs with service-role access only after database erasure has
// established the exact owned prefixes. Never turn a partial purge into success.
interface StorageEntry {
  name: string;
  id: string | null;
  metadata?: unknown;
}

interface StorageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export interface StorageAdmin {
  storage: {
    from(bucket: string): {
      list(path: string, options: {
        limit: number;
        offset: number;
        sortBy: { column: string; order: 'asc' };
      }): Promise<StorageResult<StorageEntry>>;
      remove(paths: string[]): Promise<StorageResult<{ name: string }>>;
    };
  };
}

export class StoragePurgeError extends Error {
  constructor(readonly bucket: string, readonly prefix: string, readonly operation: 'list' | 'remove' | 'verify', detail: string) {
    super(`Storage ${operation} failed for ${bucket}/${prefix}: ${detail}`);
    this.name = 'StoragePurgeError';
  }
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 100;

// Finish every directory's stable, paginated census before removing any object.
// Advancing an offset after deletion would skip objects shifted into earlier pages.
async function listAllPaths(admin: StorageAdmin, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [prefix];
  while (stack.length) {
    const dir = stack.pop() as string;
    let offset = 0;
    while (true) {
      let response: StorageResult<StorageEntry>;
      try {
        response = await admin.storage.from(bucket).list(dir, {
          limit: LIST_PAGE_SIZE,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
      } catch (error) {
        throw new StoragePurgeError(bucket, dir, 'list', errorMessage(error));
      }
      const { data, error } = response;
      if (error || !Array.isArray(data)) {
        throw new StoragePurgeError(bucket, dir, 'list', error?.message ?? 'Missing directory listing');
      }
      for (const entry of data) {
        const full = `${dir}/${entry.name}`;
        // Supabase's virtual folders have null ids. A file may have no metadata.
        if (entry.id === null) stack.push(full);
        else out.push(full);
      }
      if (data.length < LIST_PAGE_SIZE) break;
      offset += data.length;
    }
  }
  return out;
}

export async function removeAll(admin: StorageAdmin, bucket: string, prefix: string): Promise<number> {
  if (!prefix || prefix === '/') throw new StoragePurgeError(bucket, prefix, 'list', 'A scoped prefix is required');
  const paths = await listAllPaths(admin, bucket, prefix);
  let removed = 0;
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REMOVE_BATCH_SIZE);
    let response: StorageResult<{ name: string }>;
    try {
      response = await admin.storage.from(bucket).remove(batch);
    } catch (error) {
      throw new StoragePurgeError(bucket, prefix, 'remove', errorMessage(error));
    }
    const { data, error } = response;
    if (error || !Array.isArray(data)) {
      throw new StoragePurgeError(bucket, prefix, 'remove', error?.message ?? 'Missing removal result');
    }
    removed += data.length;
  }
  // A success response that skipped objects (or a concurrent writer) is not a
  // completed erasure. The caller must retain auth and report cleanup failure.
  if (paths.length > 0 && (await listAllPaths(admin, bucket, prefix)).length > 0) {
    throw new StoragePurgeError(bucket, prefix, 'verify', 'Objects remain after removal');
  }
  return removed;
}

export async function purgeWorkspaceStorage(admin: StorageAdmin, orgIds: string[], projectIds: string[]): Promise<number> {
  let removed = 0;
  for (const orgId of orgIds) removed += await removeAll(admin, 'app-files', orgId);
  for (const projectId of projectIds) removed += await removeAll(admin, 'email-attachments', projectId);
  return removed;
}
