// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useDrawingSetCreation } from '../useDrawingSetCreation';
import { useUploadWizardState } from '../useUploadWizardState';
const m = vi.hoisted(() => ({ prepare: vi.fn(), apply: vi.fn(), legacy: vi.fn() }));
vi.mock('@/lib/drawingCommands/useDrawingCommand', () => ({ useDrawingCommand: () => ({ state: 'reviewing', draft: null as null, prepare: m.prepare, apply: m.apply }) }));
vi.mock('@/api/client/drawingCommands', () => ({ getDrawingCommandCapabilities: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: { Drawing: { update: m.legacy }, DrawingSet: { create: m.legacy } } }));
vi.mock('@/services/cacheRegistry', () => ({ invalidateEntities: vi.fn() }));
it('obsolete cross-set confirmations cannot be quietly dropped or applied', async () => {
  const hook = renderHook(() => {
    const state = useUploadWizardState({ onClose: vi.fn() });
    return { state, ...useDrawingSetCreation({ meta: {}, activeProject: null, fileResults: [], onComplete: null, qc: {}, state }) };
  });
  await act(async () => { await hook.result.current.handleCreate([], { supersedeIds: ['old-sheet'] }); });
  expect(m.prepare).not.toHaveBeenCalled();
  expect(m.apply).not.toHaveBeenCalled();
  expect(m.legacy).not.toHaveBeenCalled();
});
