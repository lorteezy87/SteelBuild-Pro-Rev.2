// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DesktopConnect from '../DesktopConnect';

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });
it('retires old deep links without collecting credentials or making a handoff request', () => {
  const fetch = vi.fn(() => { throw new Error('Retired flow made a request'); });
  vi.stubGlobal('fetch', fetch);
  window.history.replaceState({}, '', '/DesktopConnect?state=private&publicKey=private#challenge=private');
  render(<DesktopConnect />);
  expect(screen.getByRole('heading', { name: 'Desktop companion discontinued' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open SteelBuild Pro' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(window.location.search).toBe('');
  expect(window.location.hash).toBe('');
  expect(fetch).not.toHaveBeenCalled();
});
