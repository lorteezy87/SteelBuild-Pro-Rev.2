// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ releasePrivacy: undefined as undefined | (() => void), failTerms: false }));
// Keep actual routing, Suspense, lazy imports and error recovery. Providers and
// page contents are isolated because this is the boot contract, not an auth test.
vi.mock('@/boot/AppProviders', () => ({
  default: ({ children }: { children: ReactNode }) => <BrowserRouter>{children}</BrowserRouter>,
}));
vi.mock('@/boot/AuthenticatedApp', () => ({ default: () => <h1>Sign in</h1> }));
vi.mock('@/pages/Privacy', async () => {
  await new Promise<void>(resolve => { state.releasePrivacy = resolve; });
  return { default: () => <h1>Privacy policy</h1> };
});
vi.mock('@/pages/Terms', () => ({ default: () => {
  if (state.failTerms) throw new Error('Temporary terms render failure');
  return <h1>Terms of service</h1>;
} }));
vi.mock('@/pages/Security', () => ({ default: () => <h1>Security</h1> }));
vi.mock('@/pages/Subprocessors', () => ({ default: () => <h1>Subprocessors</h1> }));
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ logError: vi.fn() }));

import App from '@/App';

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const suppressExpectedError = (event: ErrorEvent) => {
  if (event.message.includes('Temporary terms render failure')) event.preventDefault();
};

beforeEach(() => {
  window.addEventListener('error', suppressExpectedError);
  state.failTerms = false;
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  window.removeEventListener('error', suppressExpectedError);
  vi.restoreAllMocks();
});

describe('public page boot recovery', () => {
  it('shows accessible progress instead of blank content during a public page import', async () => {
    window.history.replaceState({}, '', '/privacy');
    render(<App />);
    try {
      expect(screen.getByRole('status', { name: 'Loading page' })).toHaveAttribute('aria-busy', 'true');
    } finally {
      await act(async () => {
        await vi.waitFor(() => expect(state.releasePrivacy).toBeTypeOf('function'));
        state.releasePrivacy?.();
      });
    }
    expect(await screen.findByRole('heading', { name: 'Privacy policy' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('contains a public page error and retries without restarting authentication', async () => {
    state.failTerms = true;
    window.history.replaceState({}, '', '/terms');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
    state.failTerms = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Terms of service' })).toBeInTheDocument();
  });

  it('clears an errored page boundary when navigating to a different public page', async () => {
    state.failTerms = true;
    window.history.replaceState({}, '', '/terms');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    await act(async () => navigate('/security'));
    expect(await screen.findByRole('heading', { name: 'Security' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('matches case and trailing slash while leaving other routes to authentication', async () => {
    window.history.replaceState({}, '', '/SUBPROCESSORS/');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Subprocessors' })).toBeInTheDocument();
    await act(async () => navigate('/private-project'));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
