// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ update: vi.fn(), guarded: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: { Drawing: { update: api.update, updateCalibration: api.guarded } } }));
vi.mock('sonner', () => ({ toast: { success: api.success, info: api.info, error: api.error } }));
import { useAutoScaleOnLoad } from '../useAutoScaleOnLoad';
import { setActiveOrgId } from '@/lib/activeOrg';
// Preserve the runtime hook while describing its legacy JS default-null input.
type CalibrationOptions = {
  activeDrawing: typeof drawing; pdfDoc: unknown; projectId: string; qc: typeof qc;
  actorId: string | null; currentPage: number; renderReady: boolean; canCalibrate: boolean;
};
const useCalibration = useAutoScaleOnLoad as unknown as (options: CalibrationOptions) => ReturnType<typeof useAutoScaleOnLoad>;
const drawing = { id: 'd', project_id: 'p', file_url: 'old.pdf', pdf_page: 2, revision_number: 'A', updated_at: '2026-10-15T00:00:00.123456Z', markup_scale: null as number | null };
const qc = { invalidateQueries: vi.fn() };
function pdf() { return { numPages: 3, getPage: vi.fn(async (page: number) => ({ getTextContent: async () => ({ items: [{ str: page === 2 ? `1/4" = 1'-0"` : `1/8" = 1'-0"` }] }) })) }; }
beforeEach(() => { vi.clearAllMocks(); setActiveOrgId('org'); api.guarded.mockImplementation(async (_id, scale, source) => ({ ...source, markup_scale: scale, updated_at: '2026-10-15T00:00:01.654321Z' })); });
it('calibrates only the reviewed physical page and healthy Undo uses the returned version', async () => {
  const doc = pdf();
  renderHook(() => useCalibration({ renderReady: true, activeDrawing: drawing, pdfDoc: doc, projectId: 'p', qc, canCalibrate: true, actorId: 'actor', currentPage: 2 }));
  await waitFor(() => expect(api.guarded).toHaveBeenCalledWith('d', 48, drawing));
  expect(doc.getPage).toHaveBeenCalledExactlyOnceWith(2);
  await waitFor(() => expect(api.success).toHaveBeenCalled());
  const undo = api.success.mock.calls[0][1].action.onClick;
  await act(async () => { await undo(); });
  expect(api.guarded).toHaveBeenLastCalledWith('d', null, { ...drawing, markup_scale: 48, updated_at: '2026-10-15T00:00:01.654321Z' });
  expect(api.update).not.toHaveBeenCalled();
});
it('drops completion of a PDF detection after source replacement', async () => {
  let finish!: (value: { items: Array<{ str: string }> }) => void;
  const doc = { numPages: 2, getPage: async () => ({ getTextContent: () => new Promise(resolve => { finish = resolve; }) }) };
  const { rerender } = renderHook(({ source, pdfDoc }) => useCalibration({ renderReady: true, activeDrawing: source, pdfDoc, projectId: 'p', qc, canCalibrate: true, actorId: 'actor', currentPage: 2 }), { initialProps: { source: drawing, pdfDoc: doc as unknown } });
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  rerender({ source: { ...drawing, file_url: 'new.pdf' }, pdfDoc: null });
  await act(async () => { finish({ items: [{ str: `1/4" = 1'-0"` }] }); });
  expect(api.guarded).not.toHaveBeenCalled(); expect(api.update).not.toHaveBeenCalled();
});
it('old Undo is held after source replacement or a workspace switch', async () => {
  const doc = pdf();
  const { rerender } = renderHook(({ source }) => useCalibration({ renderReady: true, activeDrawing: source, pdfDoc: doc, projectId: 'p', qc, canCalibrate: true, actorId: 'actor', currentPage: 2 }), { initialProps: { source: drawing } });
  await waitFor(() => expect(api.success).toHaveBeenCalled());
  const undo = api.success.mock.calls[0][1].action.onClick;
  rerender({ source: { ...drawing, file_url: 'new.pdf', markup_scale: 96 } });
  setActiveOrgId('other');
  await act(async () => { await undo(); });
  expect(api.guarded).toHaveBeenCalledTimes(1); expect(api.update).not.toHaveBeenCalled();
});
it.each([{ currentPage: 1, canCalibrate: true }, { currentPage: 2, canCalibrate: false }, { currentPage: 2, canCalibrate: true, renderReady: false }])('holds auto/manual calibration for page mismatch, incomplete render or insufficient metadata role %j', async options => {
  const doc = pdf();
  const { result } = renderHook(() => useCalibration({ renderReady: true, activeDrawing: drawing, pdfDoc: doc, projectId: 'p', qc, actorId: 'actor', ...options }));
  await act(async () => { await result.current.handleAutoDetectScale(); });
  await expect(result.current.saveCalibration(48)).rejects.toThrow(/page|permission|PM/i);
  expect(api.guarded).not.toHaveBeenCalled(); expect(api.update).not.toHaveBeenCalled();
});
it('normal authorized manual calibration uses the reviewed source', async () => {
  const calibrated = { ...drawing, markup_scale: 24 };
  const doc = pdf();
  const { result } = renderHook(() => useCalibration({ renderReady: true, activeDrawing: calibrated, pdfDoc: doc, projectId: 'p', qc, actorId: 'actor', currentPage: 2, canCalibrate: true }));
  await act(async () => { await result.current.saveCalibration(48); });
  expect(api.guarded).toHaveBeenCalledExactlyOnceWith('d', 48, calibrated);
});
it('healthy Undo survives the successful-save refetch but does not retry a newer manual scale', async () => {
  const doc = pdf();
  const { rerender } = renderHook(({ source }) => useCalibration({ renderReady: true, activeDrawing: source, pdfDoc: doc, projectId: 'p', qc, canCalibrate: true, actorId: 'actor', currentPage: 2 }), { initialProps: { source: drawing } });
  await waitFor(() => expect(api.success).toHaveBeenCalled());
  const undo = api.success.mock.calls[0][1].action.onClick;
  const saved = { ...drawing, markup_scale: 48, updated_at: '2026-10-15T00:00:01.654321Z' };
  rerender({ source: saved });
  await act(async () => { await undo(); });
  expect(api.guarded).toHaveBeenLastCalledWith('d', null, saved);
  api.guarded.mockRejectedValueOnce(new Error('Drawing source or calibration changed. Reload.'));
  rerender({ source: { ...saved, markup_scale: 96, updated_at: '2026-10-15T00:00:02.000001Z' } });
  await act(async () => { await undo(); });
  expect(api.guarded).toHaveBeenCalledTimes(3);
  expect(api.guarded).toHaveBeenLastCalledWith('d', null, saved);
  expect(api.error).toHaveBeenLastCalledWith(expect.stringMatching(/Undo held.*changed/));
});
it.each(['actor', 'unmount', 'workspace'])('drops delayed PDF completion after %s changes', async change => {
  let finish!: (value: { items: Array<{ str: string }> }) => void;
  const doc = { numPages: 2, getPage: async () => ({ getTextContent: () => new Promise(resolve => { finish = resolve; }) }) };
  const { rerender, unmount } = renderHook(({ actor }) => useCalibration({ renderReady: true, activeDrawing: drawing, pdfDoc: doc, projectId: 'p', qc, canCalibrate: true, actorId: actor, currentPage: 2 }), { initialProps: { actor: 'a' } });
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  if (change === 'actor') rerender({ actor: 'b' });
  if (change === 'unmount') unmount();
  if (change === 'workspace') setActiveOrgId('other');
  await act(async () => { finish({ items: [{ str: '1/4" = 1\'-0"' }] }); });
  expect(api.guarded).not.toHaveBeenCalled();
});
