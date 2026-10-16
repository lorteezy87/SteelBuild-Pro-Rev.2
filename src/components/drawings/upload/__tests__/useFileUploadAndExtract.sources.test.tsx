// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';
const m = vi.hoisted(() => ({ upload: vi.fn(), read: vi.fn(), extract: vi.fn() }));
vi.mock('@/api/client/uploads', () => ({ UploadDrawingFile: m.upload }));
vi.mock('@/api/client/drawingCommands', () => ({ getDrawingRevisionSources: m.read }));
vi.mock('@/api/supabaseClient', () => ({ entities: { DrawingSet: { filter: async (): Promise<unknown[]> => [] } }, integrations: { Core: { UploadFile: m.upload } } }));
vi.mock('@/lib/pdfSheetExtractor', () => ({ EMPTY_SET_META: {}, parseFilename: () => ({ sheetNumber: 'S101', revision: 'A' }) }));
vi.mock('../../drawingSetUploadHelpers', () => ({ validateAndExtract: m.extract, makeProgressSteps: (): unknown[] => [], mergeAiSetMetadata: (prev: unknown) => ({ merged: prev, aiFilled: {} }) }));
import { useFileUploadAndExtract } from '../useFileUploadAndExtract';

const PROJECT = '22222222-2222-4222-8222-222222222222';
const PATH = '11111111-1111-4111-8111-111111111111/uploads/' + PROJECT + '/33333333-3333-4333-8333-333333333333.pdf';
const source = { path: PATH, token: 'a'.repeat(64) };
beforeEach(() => {
  setActiveOrgId('11111111-1111-4111-8111-111111111111');
  vi.clearAllMocks();
  m.upload.mockResolvedValue({ path: PATH, file_url: 'signed-url-must-not-be-persisted' });
  m.read.mockResolvedValue([source]);
  m.extract.mockResolvedValue({ sheets: [{ sheetNumber: 'S1', sheetTitle: 'PLAN', revision: 'A', pdfPage: 1 }], pageCount: 1 });
});
afterEach(() => { vi.useRealTimers(); });
function setup() {
  const state = {
    setProcessError: vi.fn(), setStep: vi.fn(), setUploadBatchId: vi.fn(), setProcessingStatus: vi.fn(),
    setMeta: vi.fn(), setAiFilledFields: vi.fn(), setSheets: vi.fn(), setFileResults: vi.fn(), cancelledRef: { current: false },
  };
  const file = new File(['%PDF-1.4'], 'S101-A.pdf', { type: 'application/pdf' });
  const { result, rerender, unmount } = renderHook(({ projectId, selectedFile = file }: { projectId: string; selectedFile?: File }) => useFileUploadAndExtract({ files: [selectedFile], meta: {}, activeProject: { id: projectId }, state }), { initialProps: { projectId: PROJECT } });
  return { result, state, file, rerender, unmount };
}
it('captures authoritative path/token before showing review and persists the path', async () => {
  const { result, state, file } = setup();
  await act(async () => { await result.current.handleUploadAndProcess(); });
  expect(m.upload).toHaveBeenCalledWith(expect.objectContaining({ file, projectId: PROJECT, pathId: expect.stringMatching(/^[a-f0-9-]{36}$/) }));
  expect(m.read).toHaveBeenCalledWith(PROJECT, [PATH]);
  expect(state.setSheets.mock.lastCall?.[0][0]).toMatchObject({ sourceFileUrl: PATH, sourceSnapshot: source });
  expect(Object.isFrozen(state.setSheets.mock.lastCall?.[0][0].sourceSnapshot)).toBe(true);
  expect(state.setFileResults.mock.lastCall?.[0][0]).toMatchObject({ fileUrl: PATH, sourceSnapshot: source });
  expect(state.setStep).toHaveBeenLastCalledWith(4);
});
it('unavailable source identity holds review even if extraction succeeded', async () => {
  m.read.mockRejectedValue(new Error('source unavailable'));
  const { result, state } = setup();
  await act(async () => { await result.current.handleUploadAndProcess(); });
  expect(state.setStep).not.toHaveBeenCalledWith(4);
  expect(state.setProcessError).toHaveBeenCalledWith(expect.stringMatching(/source|review/i));
});
it('AI outage keeps manual recovery without manufacturing sheet identity or page', async () => {
  m.extract.mockRejectedValue(new Error('AI unavailable'));
  const { result, state } = setup();
  await act(async () => { await result.current.handleUploadAndProcess(); });
  expect(state.setSheets.mock.lastCall?.[0][0]).toMatchObject({ sheetNumber: '', revision: '', pdfPage: null, extractedText: null, callouts: null, sourceSnapshot: source });
  expect(state.setStep).toHaveBeenLastCalledWith(4);
});
it('page edit clears source-bound evidence but retains the original token for explicit manual re-review', async () => {
  const { result, state } = setup();
  await act(async () => { await result.current.handleUploadAndProcess(); });
  const original = { ...state.setSheets.mock.lastCall?.[0][0], extractedText: 'old-page', callouts: ['old-callout'], hyperlinks: ['old-link'], reviewed: true };
  Object.assign(state, { sheets: [original] });
  act(() => result.current.setReviewedSheets((sheets: typeof original[]) => sheets.map(sheet => ({ ...sheet, pdfPage: 2 }))));
  expect(state.setSheets.mock.lastCall?.[0][0]).toMatchObject({ pdfPage: 2, extractedText: null, callouts: null, hyperlinks: null, reviewed: false, sourceReviewRequired: true });
  expect(state.setSheets.mock.lastCall?.[0][0].sourceSnapshot).toBe(original.sourceSnapshot);
  expect(result.current.sourceSnapshots.ready).toBe(true);
});
it('project changes during extraction cannot publish an old-project source review', async () => {
  let resolve!: (value: unknown) => void;
  m.extract.mockReturnValue(new Promise(r => { resolve = r; }));
  const { result, state, rerender } = setup();
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handleUploadAndProcess(); await Promise.resolve(); });
  rerender({ projectId: '44444444-4444-4444-8444-444444444444' });
  await act(async () => { resolve({ sheets: [{ sheetNumber: 'S1', pdfPage: 1 }] }); await pending; });
  expect(m.read).not.toHaveBeenCalled();
  expect(state.setStep).not.toHaveBeenCalledWith(4);
});
it('the upload retry fence refuses a changed active project before any further attempt', async () => {
  const { result, rerender } = setup();
  await act(async () => { await result.current.handleUploadAndProcess(); });
  const fence = m.upload.mock.calls[0][0].assertActive;
  rerender({ projectId: '44444444-4444-4444-8444-444444444444' });
  expect(() => fence()).toThrow(/project|review.*changed/i);
});

it.each(['project', 'workspace', 'file', 'reset', 'snapshot reset', 'unmount'])('holds %s changes after capture but before the delayed review transition', async mode => {
  vi.useFakeTimers();
  const { result, state, rerender, unmount } = setup();
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handleUploadAndProcess(); await vi.advanceTimersByTimeAsync(0); });
  expect(m.read).toHaveBeenCalledTimes(1);
  expect(result.current.sourceSnapshots.ready).toBe(true);
  expect(state.setSheets.mock.lastCall?.[0]).toHaveLength(1);
  if (mode === 'project') rerender({ projectId: '44444444-4444-4444-8444-444444444444' });
  else if (mode === 'file') rerender({ projectId: PROJECT, selectedFile: new File(['other'], 'other.pdf') });
  else if (mode === 'workspace') act(() => setActiveOrgId('44444444-4444-4444-8444-444444444444'));
  else if (mode === 'reset') state.cancelledRef.current = true;
  else if (mode === 'snapshot reset') act(() => result.current.sourceSnapshots.reset());
  else unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(600); await pending; });
  expect(state.setStep).not.toHaveBeenCalledWith(4);
  if (['project', 'workspace', 'file'].includes(mode)) expect(state.setSheets.mock.lastCall?.[0]).toEqual([]);
});

it('a newer run clearing shared cancellation cannot revive an older run or its progress callback', async () => {
  vi.useFakeTimers();
  const { result, state } = setup();
  let older!: Promise<void>;
  await act(async () => { older = result.current.handleUploadAndProcess(); await vi.advanceTimersByTimeAsync(0); });
  let finishExtraction!: (value: unknown) => void;
  m.extract.mockReturnValueOnce(new Promise(resolve => { finishExtraction = resolve; }));
  state.cancelledRef.current = true;
  let newer!: Promise<void>;
  await act(async () => { newer = result.current.handleUploadAndProcess(); await vi.advanceTimersByTimeAsync(0); });
  expect(state.cancelledRef.current).toBe(false);
  const progressCalls = state.setProcessingStatus.mock.calls.length;
  act(() => m.extract.mock.calls[0][1].onStatus({ phase: 'llm-calling' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(600); await older; });
  expect(state.setStep).not.toHaveBeenCalledWith(4);
  expect(state.setProcessingStatus).toHaveBeenCalledTimes(progressCalls);
  await act(async () => {
    finishExtraction({ sheets: [{ sheetNumber: 'S-NEW', pdfPage: 1 }] });
    await vi.advanceTimersByTimeAsync(600);
    await newer;
  });
  expect(state.setStep.mock.calls.filter(([step]) => step === 4)).toHaveLength(1);
  expect(state.setSheets.mock.lastCall?.[0][0].sheetNumber).toBe('S-NEW');
});

it('a stale source-read catch cannot replace a newer run error/status state', async () => {
  vi.useFakeTimers();
  let rejectOldSource!: (error: Error) => void;
  m.read.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOldSource = reject; }));
  const { result, state } = setup();
  let older!: Promise<void>;
  await act(async () => { older = result.current.handleUploadAndProcess(); await vi.advanceTimersByTimeAsync(0); });
  let newer!: Promise<void>;
  await act(async () => { newer = result.current.handleUploadAndProcess(); await vi.advanceTimersByTimeAsync(0); });
  const errorCalls = state.setProcessError.mock.calls.length;
  await act(async () => { rejectOldSource(new Error('stale source unavailable')); await older; });
  expect(state.setProcessError).toHaveBeenCalledTimes(errorCalls);
  await act(async () => { await vi.advanceTimersByTimeAsync(600); await newer; });
  expect(state.setStep.mock.calls.filter(([step]) => step === 4)).toHaveLength(1);
});
