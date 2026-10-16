import { useCallback, useEffect, useRef, useState } from 'react';
import { getDrawingRevisionSources } from '@/api/client/drawingCommands';
import { validateDrawingSourcePath } from '@/lib/drawingCommands/requestBuilders';
import { getActiveOrgGeneration, subscribeActiveOrgChange } from '@/lib/activeOrg';
import type { DrawingSourceObject } from '@/lib/drawingCommands/types';

const EMPTY: readonly DrawingSourceObject[] = Object.freeze([]);
const freshReview = () => new Error('Source identity is unavailable or changed. Start a fresh review.');
const sameRoster = (sources: readonly DrawingSourceObject[], paths: readonly string[]) =>
  sources.length === paths.length && new Set(paths).size === paths.length
  && sources.every(source => paths.includes(source.path));

/** Capture before showing review; verify compares, and never adopts, a later source token. */
export function useDrawingSourceSnapshots(projectId: string | undefined) {
  const projectRef = useRef(projectId);
  projectRef.current = projectId;
  const [snapshots, setSnapshots] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const current = useRef({ sources: EMPTY, ready: false, generation: 0, pending: false });
  const invalidate = useCallback(() => {
    current.current.ready = false;
    current.current.generation++;
    current.current.pending = false;
    setReady(false);
  }, []);
  const reset = useCallback(() => {
    invalidate();
    current.current.sources = EMPTY;
    setSnapshots(EMPTY);
  }, [invalidate]);
  useEffect(() => { reset(); return reset; }, [projectId, reset]);
  useEffect(() => subscribeActiveOrgChange(invalidate), [invalidate]);

  const capture = useCallback(async (paths: readonly string[]): Promise<readonly DrawingSourceObject[]> => {
    const state = current.current;
    if (!projectId || projectId !== projectRef.current || !paths.length || paths.length > 250 || new Set(paths).size !== paths.length
      || paths.some(path => !validateDrawingSourcePath(path, projectId))) throw freshReview();
    if (state.sources.length) {
      if (state.ready && sameRoster(state.sources, paths)) return state.sources;
      throw freshReview();
    }
    if (state.pending) throw freshReview();
    state.pending = true;
    const generation = state.generation;
    const orgGeneration = getActiveOrgGeneration();
    // Copy before awaiting: caller mutation cannot alter the reviewed path roster.
    const roster = [...paths];
    try {
      const sources = await getDrawingRevisionSources(projectId, roster);
      if (generation !== state.generation || orgGeneration !== getActiveOrgGeneration()
        || !sameRoster(sources, roster) || new Set(sources.map(source => source.path)).size !== roster.length
        || sources.some(source => typeof source.token !== 'string' || !/^[0-9a-f]{64}$/.test(source.token))) throw freshReview();
      state.sources = Object.freeze(sources.map(source => Object.freeze({ path: source.path, token: source.token })));
      state.ready = true;
      setSnapshots(state.sources);
      setReady(true);
      return state.sources;
    } catch {
      if (generation === state.generation) invalidate();
      throw freshReview();
    } finally { if (generation === state.generation) state.pending = false; }
  }, [projectId, invalidate]);

  const verify = useCallback(async (paths: readonly string[]): Promise<boolean> => {
    const state = current.current;
    if (!projectId || projectId !== projectRef.current || !state.ready || !sameRoster(state.sources, paths)) { invalidate(); return false; }
    const generation = state.generation;
    const orgGeneration = getActiveOrgGeneration();
    const original = state.sources;
    try {
      const fresh = await getDrawingRevisionSources(projectId, original.map(source => source.path));
      if (generation !== state.generation || orgGeneration !== getActiveOrgGeneration() || !sameRoster(fresh, original.map(source => source.path))
        || new Set(fresh.map(source => source.path)).size !== original.length
        || !original.every(source => fresh.some(next => next.path === source.path && next.token === source.token))) throw freshReview();
      return true;
    } catch { if (generation === state.generation) invalidate(); return false; }
  }, [projectId, invalidate]);

  return { snapshots, ready, capture, verify, invalidate, reset };
}
