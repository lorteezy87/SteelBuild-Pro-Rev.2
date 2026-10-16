// @vitest-environment jsdom
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
const writes = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}), cascade: vi.fn().mockResolvedValue({ deletedChildCount: 1 }) }));
vi.mock('@/api/supabaseClient', () => ({ entities: { Drawing: writes, DrawingSet: { ...writes, deleteCascade: writes.cascade } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/autoScheduleDetailing', () => ({ autoCreateDetailingTasks: vi.fn() }));
import { useDrawingsPageController } from '../useDrawingsPageController';
it('holds rename, stage, approval and individual lifecycle while preserving metadata and set cascade', async () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: React.PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const state = Object.fromEntries(['setAdvanceTarget','setApprovalSet','setAttachBusy','setAttachPrompt','setBulkEditOpen','setBulkStage','setConfirmState','setContextMenu','setEditing','setMarkerSet','setRenameSet','setRevisionOpen','setSaving','setSavingApproval','setSavingRename','setSelected','setShowModal'].map(key => [key, vi.fn()]));
  Object.assign(state, { renameSet: { setId: 's', setName: 'Old', sheets: [{ id: 'd' }] }, selected: new Set(['d']), bulkStage: 'IFC' });
  const { result } = renderHook(() => useDrawingsPageController({ activeProject: { id: 'p' }, projectId: 'p', queryClient, navigate: vi.fn(), data: { drawings: [{ id: 'd', notes: 'old' }], drawingSetMap: {}, filtered: [], submittals: [], submittalsBySetId: {} }, state } as never), { wrapper });
  await act(async () => { await result.current.handleRenameSet('New'); await result.current.handleBulkStageApply(); await result.current.handleSetApproval({ status: 'approved' }); result.current.handleDelete('d'); result.current.handleBulkDelete(); });
  expect(writes.update).not.toHaveBeenCalled(); expect(writes.delete).not.toHaveBeenCalled(); expect(writes.create).not.toHaveBeenCalled();
  await act(async () => { await result.current.handleBulkEdit({ notes: 'safe' }); });
  expect(writes.update).toHaveBeenCalledWith('d', { notes: 'safe' });
});
