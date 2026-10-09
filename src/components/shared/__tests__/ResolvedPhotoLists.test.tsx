// @vitest-environment jsdom
import { createContext, type ComponentType } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ resolveFileUrl: mocks.resolve, entities: {} }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }));
vi.mock('@/lib/AuthContext', () => ({ AuthContext: createContext({ isAuthenticated: true, user: { id: 'user' }, isLoadingAuth: false }) }));
import DailyLogsList from '@/components/fieldops/DailyLogsList';
import PunchlistList from '@/components/punchlist/PunchlistList';

const Daily = DailyLogsList as ComponentType<{ logs: Record<string, unknown>[] }>;
const Punch = PunchlistList as ComponentType<{ items: Record<string, unknown>[] }>;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function mount(kind: string, file: string) {
  const photos = [{ file_url: file, name: 'Job photo' }];
  if (kind === 'daily') {
    render(<Daily logs={[{ id: 'log', date: '2026-10-08', photos }]} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
  } else {
    render(<Punch items={[{ id: 'punch', description: 'Bolt check', photos }]} />);
    fireEvent.click(screen.getByText('Bolt check'));
  }
}
describe.each(['daily', 'punch'])('%s photo list authorization boundary', kind => {
  it.each(['javascript:alert(1)', 'data:image/svg+xml,evil', '//outside.example/photo', 'https://outside.example/photo'])('does not bind rejected raw URL %s', async url => {
    mocks.resolve.mockResolvedValue(null); mount(kind, url);
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(url));
    expect(screen.queryByRole('link')).toBeNull(); expect(screen.queryByRole('img')).toBeNull();
  });
  it('does not fall back to a stored path after signing failure', async () => {
    mocks.resolve.mockRejectedValue(new Error('forbidden')); mount(kind, 'org/projects/project/uploads/photo.png');
    await waitFor(() => expect(screen.getByTitle('Photo unavailable')).toBeTruthy());
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('uses the resolver output for both the photo and link', async () => {
    mocks.resolve.mockResolvedValue('https://trusted.example/signed'); mount(kind, 'org/projects/project/uploads/photo.png');
    await waitFor(() => expect(screen.getByRole('link').getAttribute('href')).toBe('https://trusted.example/signed'));
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://trusted.example/signed');
  });
});
