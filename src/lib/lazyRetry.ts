import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * lazyWithRetry — code-split lazy() wrapper that survives stale-chunk 404s
 * after a deploy.
 *
 * After Vercel ships a new build, browsers that cached the previous index.html
 * will request chunk filenames that no longer exist on the CDN. The dynamic
 * import rejects with one of several browser-specific messages
 * ("Failed to fetch dynamically imported module", "Loading chunk N failed",
 * "Importing a module script failed"…). This wrapper:
 *
 *   1. Catches ONLY those stale-chunk errors (other errors pass through to the
 *      error boundary so real bugs aren't masked by an infinite reload loop).
 *   2. Triggers ONE page reload to re-fetch the new index.html and its fresh
 *      chunk URLs. A `sessionStorage` sentinel guards against multi-reload.
 *   3. Clears the sentinel on a *successful* import — i.e. only after we have
 *      proof the user is back in a good state. Clearing at module-init (the
 *      old behaviour) was too eager: the sentinel got wiped before the
 *      failure check on every page load, which meant a truly-missing chunk
 *      could re-trigger reloads forever.
 *   4. Wraps every sessionStorage call in try/catch — Safari Private mode and
 *      a few mobile browsers throw on the first access.
 *
 * History: this helper was previously duplicated in App.jsx (`lazyRetry`) and
 * src/config/routes.js (`lazyWithRetry`). They shared a key but drifted in
 * behaviour. Centralising them here is what fixed the reload-loop bug.
 */

const SESSION_RELOAD_KEY = "__steelbuild_chunk_reload";

const safeStorage = {
  get(): string | null {
    try {
      return typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(SESSION_RELOAD_KEY)
        : null;
    } catch {
      return null;
    }
  },
  set(value: string): void {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(SESSION_RELOAD_KEY, value);
      }
    } catch {
      /* private mode / quota — no-op */
    }
  },
  clear(): void {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(SESSION_RELOAD_KEY);
      }
    } catch {
      /* ignore */
    }
  },
};

/**
 * Stale-chunk errors look different across browsers. The patterns below cover
 * Chromium, Firefox, Safari, and the legacy webpack ChunkLoadError shape.
 * Anything that doesn't match should bubble up unchanged so the error boundary
 * can show a useful message.
 */
function isStaleChunkError(err: unknown): boolean {
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
  return lazy(() =>
    importFn().then(
      (mod) => {
        // Successful load — release the sentinel so a future deploy that
        // breaks new chunks can trigger ONE more reload. Doing this here
        // instead of at module-init means the sentinel survives the reload
        // itself, which is what prevents infinite reload loops on a chunk
        // that's truly gone.
        safeStorage.clear();
        return mod;
      },
      (err) => {
        if (!isStaleChunkError(err)) {
          // Real failure (syntax error, missing export, runtime crash in the
          // module body, etc.) — don't paper over it with a reload.
          throw err;
        }
        if (!safeStorage.get()) {
          safeStorage.set("1");
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
