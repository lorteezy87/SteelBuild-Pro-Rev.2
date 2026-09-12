// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DrawingRegisterPanel from '../DrawingRegisterPanel';
import type { DrawingRegisterRow } from '@/hooks/useDrawingRegister';
import type { DrawingReviewRow } from '@/hooks/useDrawingReviews';
let canEdit = true;
let registerRows: DrawingRegisterRow[] = [];
const reviewCalls = vi.hoisted(() => [] as (string | null)[]);
vi.mock('@/services/permissions', () => ({ usePermissions: () => ({ can: () => canEdit }) }));
vi.mock('@/hooks/useFeatureFlag', () => ({ useFlag: () => false }));
vi.mock('@/hooks/useDrawingRegister', () => ({ useDrawingRegister: () => ({ data: registerRows, isLoading: false }) }));
vi.mock('@/hooks/useDrawingReviews', () => ({
  useDrawingReviews: (projectId: string | null) => {
    reviewCalls.push(projectId);
    return { data: [] as DrawingReviewRow[], isLoading: false, error: null as Error | null };
  },
}));
vi.mock('@/hooks/usePublishRevision', () => ({ usePublishRevision: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useDrawingWatch', () => ({
  useMyDrawingWatches: () => ({ data: new Set() }), useToggleDrawingWatch: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/components/shared/useAppSecurity', () => ({ useAppSecurity: () => ({ user: { id: 'user' } }) }));
vi.mock('@/components/drawings/RevisionUploadModal', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>Finish revision upload</button>
  ),
}));

const HUB = '/DrawingSubmittalHub?hub_tab=drawings';

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="pathname">{location.pathname}</output>
      <output data-testid="search">{location.search}</output>
      <output data-testid="nav-type">{navigationType}</output>
      <button type="button" onClick={() => navigate(-1)}>probe-back</button>
    </div>
  );
}

const summary = { setId: 'set-1', sheetsChanged: 3 };
type OpenSummary = Mock<(summary: unknown) => void>;
type RevisionUploaded = Mock<(pkgKey: string) => void>;
function mount({
  onOpenSummary = vi.fn<(summary: unknown) => void>(),
  onRevisionUploaded = vi.fn<(pkgKey: string) => void>(),
  entries = [HUB],
}: {
  onOpenSummary?: OpenSummary;
  onRevisionUploaded?: RevisionUploaded;
  entries?: string[];
} = {}) {
  render(<MemoryRouter initialEntries={entries}><QueryClientProvider client={new QueryClient()}>
    <DrawingRegisterPanel projectId="p1" setPackages={[{
      key: 'set-1', setId: 'set-1', name: 'Main steel', parent: { id: 'set-1' },
      sheets: [{ id: 'dwg-1' }], supersededSheets: [], submittals: [],
    }]} activeProject={{ id: 'p1', name: 'Project One' }}
      drawingSets={[{ id: 'set-1', set_name: 'Main steel' }]}
      summariesBySet={new Map([['set-1', { summary, sheets_changed: 3 } as any]])}
      onRevisionUploaded={onRevisionUploaded} onOpenSummary={onOpenSummary} />
    <LocationProbe />
  </QueryClientProvider></MemoryRouter>);
  return { onOpenSummary, onRevisionUploaded };
}

describe('Drawing register revision workflow discoverability', () => {
  beforeEach(() => {
    canEdit = true;
    registerRows = [];
  });
  it('opens the existing saved summary through the set view', async () => {
    const { onOpenSummary } = mount();
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
  it('forwards revision upload and summary callbacks from the canonical sheet grid', async () => {
    registerRows = [{
      drawing_id: 'dwg-1', project_id: 'p1', sheet_number: 'S101', sheet_title: 'Framing',
      discipline: 'S', drawing_set_name: 'Main steel', stage: 'IFC', current_revision_id: 'rev-1',
      current_revision: 'A', current_status: 'released_for_shop', current_issued_at: null,
      open_impact_count: 0, pending_review_count: 0, rfi_count: 0, work_package_count: 0,
      last_activity: null,
    }];
    const onOpenSummary = vi.fn<(summary: unknown) => void>();
    const onRevisionUploaded = vi.fn<(pkgKey: string) => void>();
    mount({ onOpenSummary, onRevisionUploaded });

    await userEvent.click(screen.getByRole('button', { name: /revised · 3/i }));
    expect(onOpenSummary).toHaveBeenCalledWith(summary);

    await userEvent.click(screen.getByRole('button', { name: 'Upload revision for Main steel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Finish revision upload' }));
    expect(onRevisionUploaded).toHaveBeenCalledWith('set-1');
  });
});

describe('Drawing register views (?hub_view=)', () => {
  beforeEach(() => {
    canEdit = true;
    registerRows = [];
    reviewCalls.length = 0;
  });

  it('opens on the sheet register when there is no hub_view', () => {
    mount();
    expect(screen.getByRole('group', { name: 'Drawing register view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sheets' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByPlaceholderText(/Filter sheet, title, discipline, set/i)).toBeInTheDocument();
  });

  it('opens Sets & revisions from ?hub_view=sets', async () => {
    mount({ entries: [`${HUB}&hub_view=sets`] });
    expect(await screen.findByRole('button', { name: /revised · 3/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sets & revisions' })).toHaveAttribute('aria-pressed', 'true');
  });

  it("opens the Review Queue from ?hub_view=reviews, for the panel's project", async () => {
    mount({ entries: [`${HUB}&hub_view=reviews`] });
    expect(await screen.findByRole('heading', { name: 'Review Queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reviews' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByPlaceholderText(/Filter sheet, title, discipline, set/i)).not.toBeInTheDocument();
    expect(reviewCalls).toContain('p1');
  });

  it('treats an unknown hub_view as the sheet register', () => {
    mount({ entries: [`${HUB}&hub_view=bogus`] });
    expect(screen.getByRole('button', { name: 'Sheets' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByPlaceholderText(/Filter sheet, title, discipline, set/i)).toBeInTheDocument();
  });

  it('switches views by rewriting the current entry, never adding history', async () => {
    const user = userEvent.setup();
    mount({ entries: ['/start', `${HUB}&keep=1`] });

    await user.click(screen.getByRole('button', { name: 'Reviews' }));
    expect(await screen.findByRole('heading', { name: 'Review Queue' })).toBeInTheDocument();
    expect(screen.getByTestId('search').textContent).toBe('?hub_tab=drawings&keep=1&hub_view=reviews');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');

    await user.click(screen.getByRole('button', { name: 'Sets & revisions' }));
    expect(await screen.findByRole('button', { name: /revised · 3/i })).toBeInTheDocument();
    expect(screen.getByTestId('search').textContent).toBe('?hub_tab=drawings&keep=1&hub_view=sets');

    // The default view is written as no hub_view at all.
    await user.click(screen.getByRole('button', { name: 'Sheets' }));
    expect(screen.getByTestId('search').textContent).toBe('?hub_tab=drawings&keep=1');
    expect(screen.getByRole('button', { name: 'Sheets' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');

    // Three switches and no new entries: Back leaves the register.
    await user.click(screen.getByRole('button', { name: 'probe-back' }));
    expect(screen.getByTestId('pathname').textContent).toBe('/start');
  });

  it('does nothing when the current view is clicked again', async () => {
    const user = userEvent.setup();
    mount({ entries: [`${HUB}&hub_view=sets`] });
    await user.click(screen.getByRole('button', { name: 'Sets & revisions' }));
    expect(screen.getByTestId('nav-type')).toHaveTextContent('POP');
    expect(screen.getByTestId('search').textContent).toBe('?hub_tab=drawings&hub_view=sets');
  });
});
