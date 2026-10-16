// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue({}), setUpdate: vi.fn().mockResolvedValue({}), sheetRead: vi.fn().mockResolvedValue([{ id: 'd', project_id: 'p', sheet_number: 'OLD', title: 'old', file_url: 'old.pdf', pdf_page: 1 }]) }));
vi.mock('@/api/supabaseClient', () => ({ entities: { Drawing: { update: backend.update, filter: backend.sheetRead }, DrawingSet: { update: backend.setUpdate } }, resolveFileUrl: vi.fn().mockResolvedValue('pdf') }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({}), destroy: async () => {} }) }) }));
vi.mock('@/lib/pdfTitleblockText', () => ({ extractTextFromRect: async () => 'EXTRACTED NEW IDENTITY' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), message: vi.fn(), error: vi.fn() } }));
import TitleblockMarkerModal from '../TitleblockMarkerModal';
import RenameSetModal from '../RenameSetModal';
import BulkEditModal from '../BulkEditModal';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) })); });
it('titleblockPreviewDoesNotApplySource', async () => {
  const rect = { x: 0.1, y: 0.1, width: 0.2, height: 0.1 };
  render(<TitleblockMarkerModal set={{ id: 's', project_id: 'p', titleblock_title_rect: rect, titleblock_number_rect: rect }} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));
  await waitFor(() => expect(backend.setUpdate).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Template' })).not.toBeDisabled());
  expect(backend.update).not.toHaveBeenCalled();
  expect(backend.setUpdate).toHaveBeenCalledWith('s', { titleblock_title_rect: rect, titleblock_number_rect: rect, titleblock_revision_rect: null });
});
it('rename is explicitly held before invoking onSave', () => {
  const onSave = vi.fn(); render(<RenameSetModal open initialName="Old" onClose={vi.fn()} onSave={onSave} />);
  fireEvent.change(screen.getByPlaceholderText('e.g. 100% CD Set — Foundations'), { target: { value: 'New' } });
  fireEvent.keyDown(screen.getByPlaceholderText('e.g. 100% CD Set — Foundations'), { key: 'Enter' });
  expect(onSave).not.toHaveBeenCalled(); expect(screen.getByText(/rename.*held/i)).toBeInTheDocument();
});
it('bulk metadata editor does not offer revision stage routing or approval fields', () => {
  render(<BulkEditModal open onClose={vi.fn()} onApply={vi.fn()} selectedCount={2} />);
  expect(screen.queryByText('Revision #')).not.toBeInTheDocument();
  expect(screen.queryByText('Stage')).not.toBeInTheDocument();
  expect(screen.queryByText('Discipline')).not.toBeInTheDocument();
  expect(screen.getByText('Due Date')).toBeInTheDocument();
});
