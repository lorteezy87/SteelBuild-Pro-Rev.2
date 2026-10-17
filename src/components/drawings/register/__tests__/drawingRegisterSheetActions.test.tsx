// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { DrawingRegisterGridPanelProps } from '../DrawingRegisterGridPanel';
import { DrawingRegisterGridPanel } from '../DrawingRegisterGridPanel';
let canDelete = true;
let recordedStage = "IFC";
vi.mock('@/pages/drawingSubmittalHub/format', () => ({ fmtDate: (value: string) => value }));
vi.mock('../registerProvision', () => ({ rowsNeedingProvisioning: () => [], provisionRegisterRevision: vi.fn() }));
vi.mock('@/hooks/useDrawingRegister', () => ({ useDrawingRegister: () => ({ data: [{ drawing_id: 'd1', project_id: 'p1', sheet_number: 'S101', stage: recordedStage, current_status: 'pending_review', current_revision_id: 'r1' }, { drawing_id: 'd2', project_id: 'p1', sheet_number: 'S102', stage: null, current_status: null }] }) }));
vi.mock('@/hooks/usePublishRevision', () => ({ usePublishRevision: () => ({}) }));
vi.mock('@/hooks/useDrawingWatch', () => ({ useMyDrawingWatches: () => ({}), useToggleDrawingWatch: () => ({}) }));
vi.mock('@/services/permissions', () => ({ usePermissions: () => ({ can: (action: string) => action === 'delete' && canDelete }) }));
vi.mock('@/components/shared/useAppSecurity', () => ({ useAppSecurity: () => ({ user: null }) }));
vi.mock('../SheetContextPanel', () => ({ SheetContextPanel: () => null }));
afterEach(() => { cleanup(); canDelete = true; recordedStage = "IFC"; });
function mount(onDeleteSheet = vi.fn(), props: Partial<DrawingRegisterGridPanelProps> = {}) {
 render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><DrawingRegisterGridPanel projectId="p1" onDeleteSheet={onDeleteSheet} {...props} /></QueryClientProvider></MemoryRouter>);
 return onDeleteSheet;
}
describe('drawing register sheet actions and status', () => {
 it('shows sheet status independently of distribution and leaves missing status unknown', () => {
  mount();
  const header = screen.getByRole('columnheader', { name: 'Status' });
  const headers = Array.from(header.parentElement!.children);
  const column = headers.indexOf(header);
  const row = screen.getByRole('link', { name: 'S101' }).closest('tr')!;
  expect(row.children[column]).toHaveTextContent('Recorded sheet: IFC');
  expect(row.children[column]).toHaveTextContent('Package workflow: Unknown');
  expect(row).toHaveTextContent('pending review');
  const unknownRow = screen.getByRole('link', { name: 'S102' }).closest('tr')!;
  expect(unknownRow.children[column]).toHaveTextContent('Recorded sheet: Unknown');
 });
 it('shows governing package workflow without disguising a stale recorded sheet stage as approval', () => {
  recordedStage = 'Not Started';
  mount(vi.fn(), { setPackages: [{ key: 's1', setId: 's1', name: 'Package', parent: { id: 's1' }, sheets: [{ id: 'd1', stage: 'Not Started' }], supersededSheets: [], submittals: [{ id: 'sub1', submittal_type: 'Shop Drawing', status: 'Released for Fabrication' }] }] });
  const row = screen.getByRole('link', { name: 'S101' }).closest('tr')!;
  expect(row).toHaveTextContent('Package workflow: Released');
  expect(row).toHaveTextContent('Recorded sheet: Not Started');
  expect(screen.getAllByTitle(/verify the server fabrication release gate/i)).toHaveLength(2);
 });
 it('preserves the existing manual erection marker alongside an R&R submittal without claiming gate clearance', () => {
  mount(vi.fn(), { setPackages: [{ key: 's1', setId: 's1', name: 'Package', parent: { id: 's1', detailing_state: 'Released for Erection' }, sheets: [{ id: 'd1', stage: 'IFC' }], supersededSheets: [], submittals: [{ id: 'sub1', submittal_type: 'Shop Drawing', status: 'Revise and Resubmit' }] }] });
  expect(screen.getByRole('link', { name: 'S101' }).closest('tr')).toHaveTextContent('Package workflow: Released for Erection');
  expect(screen.getAllByTitle(/verify the server fabrication release gate/i)).toHaveLength(2);
 });
 it('routes a row delete through the confirmation owner without deleting another row', () => {
  const onDelete = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Delete sheet S101' }));
  expect(onDelete).toHaveBeenCalledExactlyOnceWith('d1');
 });
 it('disables deleting sheets in a locked package', () => {
  mount(vi.fn(), { setPackages: [{ key: 's1', setId: 's1', name: 'Locked', parent: { id: 's1', is_locked: true }, sheets: [{ id: 'd1' }], supersededSheets: [], submittals: [] }] });
  expect(screen.getByRole('button', { name: 'Delete sheet S101' })).toBeDisabled();
 });
 it('does not offer deletion to read-only users', () => {
  canDelete = false;
  mount();
  expect(screen.queryByRole('button', { name: /Delete sheet/ })).not.toBeInTheDocument();
 });
});


