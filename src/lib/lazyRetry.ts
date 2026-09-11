import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Recover stale route chunks with one automatic reload per importer. Markers
 * survive page boots and only that importer's successful load clears them.
 * Storage must confirm the marker before reloading; otherwise the original
 * error reaches the page boundary instead of risking an automatic reload loop.
 */
const LEGACY_RELOAD_KEY = "__steelbuild_chunk_reload";
const RELOAD_KEY_PREFIX = `${LEGACY_RELOAD_KEY}:v2:`;

function reserveReload(key: string): boolean {
  try {
    if (typeof sessionStorage === "undefined") return false;
    // An old build did not record which importer failed. Preserve its sentinel
    // for this tab session: clearing it could restart an existing reload loop.
    if (sessionStorage.getItem(LEGACY_RELOAD_KEY) !== null) return false;
    if (sessionStorage.getItem(key) !== null) return false;
    sessionStorage.setItem(key, "1");
    // Some embedded/private storage implementations silently discard writes.
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function clearReload(key: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {
    // Keeping a marker is safe: future failures still reach the boundary.
  }
}

/**
 * Stale-chunk errors look different across browsers. The patterns below cover
 * Chromium, Firefox, Safari, and the legacy webpack ChunkLoadError shape.
 * Anything that doesn't match should bubble up unchanged so the error boundary
 * can show a useful message.
 */
export function isStaleChunkError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "ChunkLoadError") return true;
  const msg = e.message || "";
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk [\w-]+ failed/i.test(msg)
  );
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  // Route importers contain a literal import path (a hashed chunk URL after
  // bundling). Their source is stable across boots of the same build, unlike
  // an in-memory counter or function object identity. Store the full source to
  // avoid hash collisions; identical importers intentionally share recovery.
  const reloadKey = RELOAD_KEY_PREFIX + Function.prototype.toString.call(importFn);
  return lazy(() =>
    importFn().then(
      (mod) => {
        clearReload(reloadKey);
        return mod;
      },
      (err) => {
        if (!isStaleChunkError(err)) {
          // Real failure (syntax error, missing export, runtime crash in the
          // module body, etc.) — don't paper over it with a reload.
          throw err;
        }
        if (reserveReload(reloadKey)) {
          const msg = (err as { message?: string } | undefined)?.message ?? String(err);
          console.warn(
            "[lazyWithRetry] Chunk load failed, reloading page for fresh assets:",
            msg,
          );
          window.location.reload();
          // Never resolves; the reload tears the document down.
          return new Promise<{ default: T }>(() => {});
        }
        // Already reloaded once — let the error boundary catch it so the user
        // sees something instead of looping silently.
        throw err;
      },
    ),
  );
}
