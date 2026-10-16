// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
const repo = vi.hoisted(() => ({ fetchCrossSetSource: vi.fn().mockResolvedValue({ sets: [], drawings: [] }) }));
vi.mock('@/lib/crossSetSupersedeRepository', () => repo);
import ReviewStep from '../ReviewStep';
const original = { sheetNumber: 'S1', sheetTitle: 'Framing', revision: 'A', selected: true, pdfPage: 1 as number | null, sourceFile: 'plan.pdf', sourceFileUrl: 'path', reviewed: true, sourceReviewRequired: false, extractedText: 'old' as string | null, callouts: [{ text: 'old' }] as { text: string }[] | null, hyperlinks: ['old-link'] as string[] | null };
function mount(initialSheet: Partial<typeof original> = {}, pageCount: number | null = 3, sameName = false) {
  const onCreate = vi.fn();
  function Harness() {
    const [sheets, setSheets] = useState([{ ...original, ...initialSheet }, ...(sameName ? [{ ...original, sheetNumber: 'S2', sourceFileUrl: 'other-path', pdfPage: 2 }] : [])]);
    const [meta, setMeta] = useState({ setName: 'Set', revision: 'A', issueDate: '', issuedBy: '', discipline: 'Structural' });
    return <ReviewStep sheets={sheets} setSheets={setSheets} fileResults={[{ fileName: 'plan.pdf', fileUrl: 'path', pageCount }, ...(sameName ? [{ fileName: 'plan.pdf', fileUrl: 'other-path', pageCount: 1 }] : [])]} meta={meta} setMeta={setMeta} onBack={() => {}} onCreate={onCreate} projectId="p1" canSupersede commandAvailable />;
  }
  render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);
  return onCreate;
}
it('manualPageEditClearsOldHyperlinks and requires explicit re-review before Create', async () => {
  const onCreate = mount();
  const create = await screen.findByRole('button', { name: /Create 1 Entry/ });
  fireEvent.change(screen.getByRole('spinbutton', { name: /PDF page for S1/ }), { target: { value: '2' } });
  expect(create).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Reviewed S1/ }));
  expect(create).toBeEnabled();
  fireEvent.click(create);
  expect(onCreate.mock.calls[0][0][0]).toMatchObject({ pdfPage: 2, reviewed: true, sourceReviewRequired: false, extractedText: null, callouts: null, hyperlinks: null });
});
it('manual review after an AI outage resumes using known physical bounds without inventing extraction', async () => {
  const onCreate = mount({ sheetNumber: '', sheetTitle: '', revision: '', pdfPage: null, extractedText: null, callouts: null, hyperlinks: null, reviewed: false });
  const create = await screen.findByRole('button', { name: /Create 1 Entry/ });
  fireEvent.change(screen.getByRole('textbox', { name: 'Sheet number row 1' }), { target: { value: 'S2' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Sheet title row 1' }), { target: { value: 'Sections' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Revision code row 1' }), { target: { value: 'B' } });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
  expect(create).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Reviewed S2/ }));
  expect(create).toBeEnabled();
  fireEvent.click(create);
  expect(onCreate.mock.calls[0][0][0]).toMatchObject({ sheetNumber: 'S2', revision: 'B', pdfPage: 3, reviewed: true, extractedText: null, callouts: null });
});
it('unreadable physical PDF cannot be approved by manual page entry', async () => {
  mount({ reviewed: false }, null);
  const create = await screen.findByRole('button', { name: /Create 1 Entry/ });
  expect(screen.getByRole('checkbox', { name: /Reviewed S1/ })).toBeDisabled();
  expect(create).toBeDisabled();
});
it('doesNotRunCrossSetWrites: preview cannot confirm replacements', async () => {
  const onCreate = mount();
  expect(screen.getByText(/Cross-set supersession is unavailable/)).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: /Create 1 Entry/ }));
  expect(onCreate).toHaveBeenCalledWith([original]);
  expect(screen.queryByRole('checkbox', { name: /supersede/i })).toBeNull();
});
it('holds out-of-range physical pages even after attempted review', async () => {
  mount();
  const create = await screen.findByRole('button', { name: /Create 1 Entry/ });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } });
  expect(screen.getByRole('checkbox', { name: /Reviewed S1/ })).toBeDisabled();
  expect(create).toBeDisabled();
});
it('same filename rows retain independent physical bounds and visible source labels', async () => {
  mount({ pdfPage: 3 }, 3, true);
  const create = await screen.findByRole('button', { name: /Create 2 Entries/ });
  expect(create).toBeDisabled();
  expect(screen.getByRole('spinbutton', { name: 'PDF page for S1' })).toHaveAttribute('max', '3');
  expect(screen.getByRole('spinbutton', { name: 'PDF page for S2' })).toHaveAttribute('max', '1');
  expect(screen.getByRole('cell', { name: 'plan.pdf · source 1' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'plan.pdf · source 2' })).toBeInTheDocument();
});
