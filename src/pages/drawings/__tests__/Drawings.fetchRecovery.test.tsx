// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Drawings from '@/pages/Drawings';
const filters = vi.hoisted(() => Object.fromEntries(['Drawing', 'DrawingSet', 'Submittal', 'RFI'].map(name => [name, { filter: vi.fn(async () => []) }])));
vi.mock('@/api/supabaseClient', () => ({ entities: filters }));
vi.mock('@/components/shared/ProjectContext', () => ({ useProjectContext: () => ({ activeProject: { id: 'project-a', name: 'Project A' } }) }));
vi.mock('@/services/permissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('@/hooks/useFeatureFlag', () => ({ useFlag: () => false }));
vi.mock('../DrawingsPageToolbar', () => ({ default: () => <div>Workflow counts</div> }));
vi.mock('../DrawingsPageModals', () => ({ default: (): null => null }));
afterEach(() => { cleanup(); onlineManager.setOnline(true); vi.clearAllMocks(); });
for (const source of Object.keys(filters)) {
  it(`does not replace a failed ${source} read with empty counts; Retry recovers`, async () => {
    filters[source].filter.mockRejectedValueOnce(new Error('Read unavailable'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Drawings embedded /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('alert', { name: 'Drawings' })).toHaveTextContent('Unable to load drawings');
    expect(screen.queryByText('Workflow counts')).not.toBeInTheDocument();
    expect(screen.queryByText(/NO SHEETS YET/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/NO SHEETS YET/)).toBeVisible();
    expect(screen.getByText('Workflow counts')).toBeVisible();
  });
}

it('keeps a first read paused offline in a waiting state, not an empty register', async () => {
  onlineManager.setOnline(false);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter><Drawings embedded /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('status', { name: 'Drawings' })).toHaveTextContent('Loading drawings');
  expect(screen.queryByText('Workflow counts')).not.toBeInTheDocument();
  expect(screen.queryByText(/NO SHEETS YET/)).not.toBeInTheDocument();
  expect(filters.Drawing.filter).not.toHaveBeenCalled();
});
