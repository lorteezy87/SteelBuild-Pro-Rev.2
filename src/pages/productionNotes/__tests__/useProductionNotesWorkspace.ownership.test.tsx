// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@/types/supabase';
const mocks = vi.hoisted(() => ({ update: vi.fn(), error: vi.fn(), success: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: { Project: { list: async (): Promise<Database['public']['Tables']['projects']['Row'][]> => [] }, ProductionNote: { filter: async (): Promise<Database['public']['Tables']['production_notes']['Row'][]> => [], update: mocks.update } } }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock('@/services/cacheRegistry', () => ({ invalidateEntity: mocks.invalidate }));
vi.mock('@/services/auditLogger', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/noteFolders/repository', () => ({ listVisibleNoteFolders: async () => ({ folders: [{ id: 'folder-a' }], general_notes_id: 'folder-a' }), createNoteFolder: vi.fn(), renameNoteFolder: vi.fn(), archiveNoteFolder: vi.fn(), setNoteFolderLinks: vi.fn() }));
import { setActiveOrgId } from '@/lib/activeOrg';
import { useProductionNotesWorkspace } from '../useProductionNotesWorkspace';
beforeEach(() => { vi.clearAllMocks(); setActiveOrgId('org-a'); });

it('does not restore old notes or show an error when a delayed write rejects after clearing identity', async () => {
  let reject!: (error: Error) => void;
  mocks.update.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  const { result, unmount } = renderHook(() => useProductionNotesWorkspace({ orgId: 'org-a', meetingDate: '2026-10-08', selectedFolderId: 'folder-a', onSelectedFolderArchived: vi.fn(), onLinksUpdated: vi.fn() }), { wrapper });
  await waitFor(() => expect(result.current.activeFolderId).toBe('folder-a'));
  const key = ['production-notes', '2026-10-08', 'folder-a'];
  qc.setQueryData(key, [{ id: 'note-a', content: 'Old private note' }]);
  act(() => result.current.updateNote.mutate({ id: 'note-a', data: { content: 'New' } }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
  unmount(); setActiveOrgId(null); qc.clear(); setActiveOrgId('org-b');
  await act(async () => reject(new Error('Access changed')));
  expect(qc.getQueryData(key)).toBeUndefined();
  expect(mocks.error).not.toHaveBeenCalled();
});
