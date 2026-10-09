import { useEffect, useState, useSyncExternalStore } from 'react';
import { resolveFileUrl } from '@/api/supabaseClient';
import { getActiveOrgGeneration, getActiveOrgId, subscribeActiveOrgChange } from '@/lib/activeOrg';

// Reauthorize well before Storage's one-hour signed URL expiry. This only
// limits reuse in this UI; an already-issued URL keeps its server expiry.
const CACHE_LIFETIME_MS = 5 * 60 * 1000;
const CACHE_ENTRY_LIMIT = 256;
type CachedFile = { url: string; expiresAt: number };
type Resolution = {
  fileUrl: string;
  generation: number;
  url: string | null;
  expiresAt: number;
  error: unknown;
};
const cache = new Map<string, CachedFile>();
let cacheGeneration = -1;

function readCache(fileUrl: string, generation: number): CachedFile | undefined {
  if (cacheGeneration !== generation) {
    cache.clear();
    cacheGeneration = generation;
  }
  const cached = cache.get(fileUrl);
  if (cached && cached.expiresAt > Date.now()) return cached;
  cache.delete(fileUrl);
  return undefined;
}

export function useResolvedFileUrl(fileUrl: string | null | undefined): {
  url: string | null; loading: boolean; error: unknown;
} {
  const generation = useSyncExternalStore(subscribeActiveOrgChange, getActiveOrgGeneration, getActiveOrgGeneration);
  const active = Boolean(fileUrl && getActiveOrgId());
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!active || !fileUrl) {
      setResolution(null);
      return;
    }
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !cancelled && getActiveOrgGeneration() === generation;
    const publish = (url: string | null, expiresAt: number, error: unknown = null) => {
      if (!current()) return;
      setResolution({ fileUrl, generation, url, expiresAt, error });
      if (Number.isFinite(expiresAt)) {
        refreshTimer = setTimeout(() => {
          if (current()) setRefresh(value => value + 1);
        }, Math.max(0, expiresAt - Date.now()));
      }
    };

    const cached = readCache(fileUrl, generation);
    if (cached) {
      publish(cached.url, cached.expiresAt);
    } else {
      setResolution(null);
      // Full URLs follow the existing trust boundary, but cannot be refreshed
      // from an object path here and must never enter the private-path cache.
      const cacheable = !/^https?:\/\//.test(fileUrl);
      const expiresAt = cacheable ? Date.now() + CACHE_LIFETIME_MS : Infinity;
      void resolveFileUrl(fileUrl).then(url => {
        if (!current()) return;
        if (url && cacheable && expiresAt > Date.now()) {
          // Another mounted preview may have cleared the previous generation.
          readCache(fileUrl, generation);
          if (cache.size >= CACHE_ENTRY_LIMIT) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          cache.set(fileUrl, { url, expiresAt });
        }
        publish(url, url ? expiresAt : Infinity);
      }).catch((error: unknown) => publish(null, Infinity, error));
    }
    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    };
  }, [fileUrl, generation, active, refresh]);

  // A dependency can change before the effect runs. Never expose the previous
  // file/workspace's URL during that render, including a batched A -> null -> A.
  const currentResolution = active && resolution?.fileUrl === fileUrl &&
    resolution.generation === generation && resolution.expiresAt > Date.now()
    ? resolution : null;
  return {
    url: currentResolution?.url ?? null,
    loading: active && !currentResolution,
    error: currentResolution?.error ?? null,
  };
}
