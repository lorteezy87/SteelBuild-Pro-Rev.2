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
// Honours `open` like the real modal does. The panel now also mounts
// DrawingsPageModals (the workbench's dialog host), which renders this modal
// closed at all times until "New revision" is clicked — a mock that ignored
// `open` put two of these in the tree and made every query for it ambiguous.
vi.mock('@/components/drawings/RevisionUploadModal', () => ({
  default: ({ open, onComplete }: { open?: boolean; onComplete: () => void }) =>
    open === false ? null : (
      <button type="button" onClick={onComplete}>Finish revision upload</button>
    ),
}));
vi.mock('@/components/drawings/TitleblockMarkerModal', () => ({
  default: ({ set, onClose }: {
    set: { id: string; project_id: string; file_url: string; titleblock_title_rect: unknown };
    onClose: () => void;
  }) => <div role="dialog" aria-label="Titleblock marker" data-set-id={set.id}
    data-project-id={set.project_id} data-file={set.file_url}
    data-title-rect={JSON.stringify(set.titleblock_title_rect)}>
    <button type="button" onClick={onClose}>Close marker</button>
  </div>,
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
  locked = false,
}: {
  onOpenSummary?: OpenSummary;
  onRevisionUploaded?: RevisionUploaded;
  entries?: string[];
  locked?: boolean;
} = {}) {
  const parent = { id: 'set-1', project_id: 'p1', set_name: 'Main steel', is_locked: locked,
    file_url: 'p1/main-steel.pdf', titleblock_title_rect: { x: 0.7, y: 0.8, width: 0.2, height: 0.1 } };
  const sheet = { id: 'dwg-1', project_id: 'p1', drawing_set_id: 'set-1',
    drawing_set_name: 'Main steel', sheet_number: 'S101', title: 'Framing', file_url: parent.file_url };
  const client = new QueryClient();
  client.setQueryData(['drawing_sets', 'p1'], [parent]);
  client.setQueryData(['drawings', 'p1'], [sheet]);
  client.setQueryData(['rfis', 'p1'], []);
  client.setQueryData(['submittals', 'p1'], []);
  render(<MemoryRouter initialEntries={entries}><QueryClientProvider client={client}>
    <DrawingRegisterPanel projectId="p1" setPackages={[{
      key: 'set-1', setId: 'set-1', name: 'Main steel', parent,
      sheets: [sheet], supersededSheets: [], submittals: [],
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
      drawing_set_id: 'set-1',
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

describe('Drawing register workbench — the retired "full editor"', () => {
  beforeEach(() => {
    canEdit = true;
    registerRows = [{
      drawing_id: 'dwg-1', project_id: 'p1', sheet_number: 'S101', sheet_title: 'Framing',
      drawing_set_id: 'set-1',
      discipline: 'S', drawing_set_name: 'Main steel', stage: 'IFC', current_revision_id: 'rev-1',
      current_revision: 'A', current_status: 'released_for_shop', current_issued_at: null,
      open_impact_count: 0, pending_review_count: 0, rfi_count: 0, work_package_count: 0,
      last_activity: null,
    }];
    reviewCalls.length = 0;
  });

  it('offers the editing actions on the register, with no link off to /Drawings', () => {
    mount();
    for (const name of [/Upload set/i, /New revision/i, /Add sheet/i, /Import log/i, /Fab release/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    // The whole point: nothing sends the user to a second register any more.
    expect(screen.queryByRole('link', { name: /full editor/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/full editor/i)).not.toBeInTheDocument();
  });

  it.each(['sheets', 'sets'])('opens the existing titleblock marker directly from the %s register', async (view) => {
    mount({ entries: [`${HUB}&hub_view=${view}`] });
    await userEvent.click(await screen.findByRole('button', { name: 'Mark Titleblock for Main steel' }));
    const marker = screen.getByRole('dialog', { name: 'Titleblock marker' });
    expect(marker).toHaveAttribute('data-set-id', 'set-1');
    expect(marker).toHaveAttribute('data-project-id', 'p1');
    expect(marker).toHaveAttribute('data-file', 'p1/main-steel.pdf');
    expect(JSON.parse(marker.getAttribute('data-title-rect')!)).toEqual({ x: 0.7, y: 0.8, width: 0.2, height: 0.1 });
    expect(screen.queryByText('Upload Drawing Set')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close marker' }));
    expect(screen.queryByRole('dialog', { name: 'Titleblock marker' })).not.toBeInTheDocument();
  });

  it.each(['sheets', 'sets'])('keeps titleblock writes disabled for locked sets in the %s register', async (view) => {
    mount({ entries: [`${HUB}&hub_view=${view}`], locked: true });
    expect(await screen.findByRole('button', { name: 'Mark Titleblock for Main steel' })).toBeDisabled();
  });

  it.each(['sheets', 'sets'])('does not offer titleblock writes to viewers in the %s register', async (view) => {
    canEdit = false;
    mount({ entries: [`${HUB}&hub_view=${view}`] });
    expect(await screen.findByRole('button', { name: /revised · 3/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Mark Titleblock/i })).not.toBeInTheDocument();
  });

  it('keeps Bulk edit inert until sheets are actually selected', async () => {
    mount();
    const bulk = screen.getByRole('button', { name: /Bulk edit/i });
    expect(bulk).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /Select sheet S101/i }));
    expect(screen.getByRole('button', { name: /Bulk edit \(1\)/i })).toBeEnabled();
  });

  it('select-all covers only the rows the register is showing', async () => {
    // The filters belong to the register, not to the workbench, so select-all
    // must be driven by the visible rows — otherwise it would silently select
    // sheets that are filtered out and Bulk edit would write to them.
    registerRows = [
      registerRows[0],
      { ...registerRows[0], drawing_id: 'dwg-2', sheet_number: 'A201', sheet_title: 'Elevations' },
    ];
    mount();

    // Both sheets visible: select-all takes both.
    await userEvent.click(screen.getByRole('checkbox', { name: /Select all visible sheets/i }));
    expect(screen.getByRole('button', { name: /Bulk edit \(2\)/i })).toBeEnabled();

    // Clear, then filter down to one and select-all again.
    await userEvent.click(screen.getByRole('checkbox', { name: /Select all visible sheets/i }));
    expect(screen.getByRole('button', { name: /Bulk edit/i })).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText(/Filter sheet, title, discipline, set/i),
      'A201',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Select all visible sheets/i }));
    expect(screen.getByRole('button', { name: /Bulk edit \(1\)/i })).toBeEnabled();
  });

  it('shows no selection column on the Reviews queue', async () => {
    mount({ entries: [`${HUB}&hub_view=reviews`] });
    expect(await screen.findByRole('heading', { name: 'Review Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Select all visible sheets/i })).not.toBeInTheDocument();
  });
});
