// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DrawingRegisterPanel from '../DrawingRegisterPanel';
import type { DrawingRegisterRow } from '@/hooks/useDrawingRegister';
let canEdit = true;
vi.mock('@/services/permissions', () => ({ usePermissions: () => ({ can: () => canEdit }) }));
vi.mock('@/hooks/useFeatureFlag', () => ({ useFlag: () => false }));
vi.mock('@/hooks/useDrawingRegister', () => ({ useDrawingRegister: () => ({ data: [] as DrawingRegisterRow[], isLoading: false }) }));
vi.mock('@/hooks/usePublishRevision', () => ({ usePublishRevision: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useDrawingWatch', () => ({
  useMyDrawingWatches: () => ({ data: new Set() }), useToggleDrawingWatch: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/components/shared/useAppSecurity', () => ({ useAppSecurity: () => ({ user: { id: 'user' } }) }));

const summary = { setId: 'set-1', sheetsChanged: 3 };
function mount(onOpenSummary = vi.fn()) {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}>
    <DrawingRegisterPanel projectId="p1" setPackages={[{
      key: 'set-1', setId: 'set-1', name: 'Main steel', parent: { id: 'set-1' },
      sheets: [], supersededSheets: [], submittals: [],
    }]} summariesBySet={new Map([['set-1', { summary, sheets_changed: 3 }]])}
      onOpenSummary={onOpenSummary} />
  </QueryClientProvider></MemoryRouter>);
  return onOpenSummary;
}

describe('Drawing register revision workflow discoverability', () => {
  beforeEach(() => { canEdit = true; });
  it('opens the existing saved summary through the set view', async () => {
    const onOpenSummary = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Sets & revisions' }));
    await userEvent.click(await screen.findByRole('button', { name: /revised · 3/i }));
    expect(onOpenSummary).toHaveBeenCalledWith(summary);
    expect(screen.getByRole('button', { name: 'New Rev' })).toBeEnabled();
  });
  it('lets viewers read saved summaries without offering revision writes', async () => {
    canEdit = false;
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Sets & revisions' }));
    expect(await screen.findByRole('button', { name: /revised · 3/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'New Rev' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload drawings/i })).not.toBeInTheDocument();
  });
});
