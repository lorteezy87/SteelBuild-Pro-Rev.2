// @vitest-environment jsdom
import React, { Component, Suspense, type ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lazyWithRetry } from '../lazyRetry';

const LEGACY_KEY = '__steelbuild_chunk_reload';
const staleError = new TypeError('Failed to fetch dynamically imported module');
const reload = vi.fn();
let pageError: unknown;
let records: Map<string, string>;
let storage: Storage;
let failure: Error | null;
const suppressExpectedError = (event: ErrorEvent) => event.preventDefault();

function Page() { return <div>Page loaded</div>; }
function brokenPageImport() {
  return failure ? Promise.reject(failure) : Promise.resolve({ default: Page });
}
function healthyPageImport() { return Promise.resolve({ default: Page }); }

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown) { pageError = error; }
  render() {
    return this.state.error ? <div role="alert">Page unavailable</div> : this.props.children;
  }
}

async function openPage(importer = brokenPageImport, factory = lazyWithRetry) {
  const LazyPage = factory(importer);
  await act(async () => {
    render(<Boundary><Suspense fallback={<div>Loading page</div>}><LazyPage /></Suspense></Boundary>);
  });
}

beforeEach(() => {
  failure = staleError;
  pageError = undefined;
  reload.mockClear();
  records = new Map();
  storage = {
    get length() { return records.size; },
    clear: () => records.clear(),
    key: (index) => [...records.keys()][index] ?? null,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); },
    removeItem: (key) => { records.delete(key); },
  };
  window.addEventListener('error', suppressExpectedError);
  const realWindow = window;
  vi.stubGlobal('window', new Proxy(realWindow, {
    get(target, key) {
      return key === 'location' ? { reload } : Reflect.get(target, key, target);
    },
  }));
  vi.stubGlobal('sessionStorage', storage);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // React/jsdom log expected errors even when the boundary handles them.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  window.removeEventListener('error', suppressExpectedError);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lazy route recovery', () => {
  it('reloads once on the first stale import with a persisted marker', async () => {
    await openPage();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(records.size).toBe(1);
    expect(screen.getByText('Loading page')).toBeTruthy();
  });

  it('retains the failed importer marker through another module boot', async () => {
    await openPage();
    cleanup();
    vi.resetModules();
    const nextBoot = await import('../lazyRetry');
    await openPage(brokenPageImport, nextBoot.lazyWithRetry);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(pageError).toBe(staleError);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('does not let another successful import reset a failed importer', async () => {
    await openPage();
    cleanup();
    await openPage(healthyPageImport);
    expect(screen.getByText('Page loaded')).toBeTruthy();
    cleanup();
    await openPage();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(pageError).toBe(staleError);
  });

  it('allows recovery again only after the same importer actually succeeds', async () => {
    await openPage();
    cleanup();
    failure = null;
    await openPage();
    expect(screen.getByText('Page loaded')).toBeTruthy();
    expect(records.size).toBe(0);
    cleanup();
    failure = staleError;
    await openPage();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it.each(['missing', 'read throws', 'write throws', 'write ignored', 'readback throws'])(
    'shows the existing boundary instead of reloading when storage is %s', async (mode) => {
      if (mode === 'missing') vi.stubGlobal('sessionStorage', undefined);
      if (mode === 'read throws') storage.getItem = () => { throw new Error('denied'); };
      if (mode === 'write throws') storage.setItem = () => { throw new Error('quota'); };
      if (mode === 'write ignored') storage.setItem = () => {};
      if (mode === 'readback throws') {
        storage.setItem = (key, value) => {
          records.set(key, value);
          storage.getItem = () => { throw new Error('denied'); };
        };
      }
      await openPage();
      expect(reload).not.toHaveBeenCalled();
      expect(pageError).toBe(staleError);
      expect(screen.getByRole('alert')).toBeTruthy();
    },
  );

  it('preserves an old global marker because its failed importer is unknown', async () => {
    records.set(LEGACY_KEY, '1');
    await openPage(healthyPageImport);
    cleanup();
    await openPage();
    expect(reload).not.toHaveBeenCalled();
    expect(records.get(LEGACY_KEY)).toBe('1');
    expect(pageError).toBe(staleError);
  });

  it('passes non-chunk exceptions unchanged to the boundary', async () => {
    failure = new SyntaxError('Unexpected token in route code');
    await openPage();
    expect(pageError).toBe(failure);
    expect(reload).not.toHaveBeenCalled();
    expect(records.size).toBe(0);
  });

  it.each([
    new TypeError('Importing a module script failed'),
    new Error('Loading chunk page-123 failed'),
    new Error('Loading CSS chunk styles-456 failed'),
    Object.assign(new Error('browser specific message'), { name: 'ChunkLoadError' }),
  ])('retains stale chunk recognition for $message', async (error) => {
    failure = error;
    await openPage();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
