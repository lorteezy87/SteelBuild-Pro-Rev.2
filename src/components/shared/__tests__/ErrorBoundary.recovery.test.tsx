// @vitest-environment jsdom
import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '../ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazyRetry';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ logError: vi.fn() }));
const reload = vi.fn();
const suppressExpectedError = (event: ErrorEvent) => event.preventDefault();

beforeEach(() => {
  reload.mockClear();
  // Simulate arriving after the automatic recovery allowance was already used.
  sessionStorage.setItem('__steelbuild_chunk_reload', '1');
  const realWindow = window;
  window.addEventListener('error', suppressExpectedError);
  vi.stubGlobal('window', new Proxy(realWindow, {
    get(target, key) { return key === 'location' ? { reload } : Reflect.get(target, key, target); },
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  window.removeEventListener('error', suppressExpectedError);
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('page boundary recovery action', () => {
  it('offers a user-initiated reload for a cached lazy import failure', async () => {
    const Page = lazyWithRetry(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
    await act(async () => {
      render(<ErrorBoundary label="Documents"><Suspense fallback={<p>Loading</p>}><Page /></Suspense></ErrorBoundary>);
    });
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('retries a recoverable render error without reloading the document', () => {
    let broken = true;
    function Section() {
      if (broken) throw new Error('Temporary section error');
      return <p>Section recovered</p>;
    }
    render(<ErrorBoundary label="Details"><Section /></ErrorBoundary>);
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Section recovered')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
