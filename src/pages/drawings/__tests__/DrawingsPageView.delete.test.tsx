// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DrawingsPageView from '../DrawingsPageView';
import type { ComponentProps } from 'react';
const modal = vi.hoisted(() => ({ confirm: null as null | (() => Promise<void>) }));
vi.mock('../DrawingsPageModals', () => ({ default: (props: { onConfirmDelete: () => Promise<void> }) => { modal.confirm = props.onConfirmDelete; return null; } }));
vi.mock('../DrawingsPageToolbar', () => ({ default: () => null }));
vi.mock('@/components/drawings/DrawingsToolbar', () => ({ DisciplineChips: () => null, FilterBar: () => null, BulkActionsBar: () => null }));
vi.mock('@/components/drawings/ActiveFilterPills', () => ({ default: () => null }));
vi.mock('@/components/drawings/DrawingContextMenu', () => ({ default: () => null }));
vi.mock('@/components/drawings/DrawingsTable', () => ({ default: () => null }));
vi.mock('@/components/drawings/DrawingsGrid', () => ({ default: () => null }));
vi.mock('@/components/submittals/AttachRevisionToSubmittalModal', () => ({ default: () => null }));

type Props = ComponentProps<typeof DrawingsPageView>;
function mount(run: () => Promise<void>) {
 const close = vi.fn();
 render(<DrawingsPageView activeProject={{ id: 'p1' } as Props['activeProject']} embedded revisionAiEnabled={false} canCreateDrawing canEditDrawing canDeleteDrawing navigate={vi.fn()}
  data={{ drawings: [], filtered: [], drawingSetRecords: [], existingSetNames: [], revisionAlerts: [] } as unknown as Props['data']}
  state={{ selected: new Set(), confirmState: { run }, setConfirmState: close } as unknown as Props['state']}
  controller={{} as Props['controller']} />);
 return close;
}
it('propagates denied deletion to the confirmation dialog and leaves it open', async () => {
 const close = mount(async () => { throw new Error('Not authorized'); });
 await expect(modal.confirm!()).rejects.toThrow('Not authorized');
 expect(close).not.toHaveBeenCalled();
});
it('closes the standalone confirmation only after deletion finishes', async () => {
 let finish!: () => void;
 const close = mount(() => new Promise<void>((resolve) => { finish = resolve; }));
 const pending = modal.confirm!();
 expect(close).not.toHaveBeenCalled();
 finish(); await pending;
 expect(close).toHaveBeenCalledWith(null);
});
