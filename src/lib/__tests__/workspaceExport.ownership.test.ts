import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ token: 'token-a', user: 'user-a' }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: auth.token, user: { id: auth.user } } }, error: null }) } } }));
vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'public-test-key' } }));
vi.mock('@/lib/native/fileExport', () => ({ presentGeneratedFile: vi.fn() }));
import { setActiveOrgId } from '@/lib/activeOrg';
import { beginWorkspaceExport } from '../workspaceExportOwner';
import { exportWorkspace, fetchWorkspaceProjects, downloadWorkspaceExport } from '../workspaceExport';
import { presentGeneratedFile } from '@/lib/native/fileExport';
import { PAGE_SIZE } from '../pagedQuery';
beforeEach(() => { vi.clearAllMocks(); auth.token = 'token-a'; auth.user = 'user-a'; setActiveOrgId('org-a'); });
afterEach(() => vi.unstubAllGlobals());

it('pins the original bearer at the actual Edge fetch even if SDK session state changes', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ export_version: 1, total_rows: 1 }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  const owner = await beginWorkspaceExport('org-a');
  auth.token = 'token-b'; auth.user = 'user-b';
  const bundle = await exportWorkspace([{ id: 'project-a' }], { owner });
  expect(bundle.project_count).toBe(1);
  expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer token-a');
  owner.dispose();
});

it('stops the export loop and suppresses final progress after a delayed old response', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn().mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal('fetch', fetch);
  const progress = vi.fn();
  const owner = await beginWorkspaceExport('org-a');
  const pending = exportWorkspace([{ id: 'a' }, { id: 'b' }], { owner, onProgress: progress });
  const rejected = expect(pending).rejects.toThrow(/Workspace changed/);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  setActiveOrgId(null); setActiveOrgId('org-a');
  resolve(new Response(JSON.stringify({ export_version: 1, total_rows: 2 }), { headers: { 'Content-Type': 'application/json' } }));
  await rejected;
  expect(fetch).toHaveBeenCalledOnce();
  expect(progress).toHaveBeenCalledTimes(1);
  owner.dispose();
});

it('does not request a second project page after the first page returns to a different owner', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn().mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal('fetch', fetch);
  const owner = await beginWorkspaceExport('org-a');
  const pending = fetchWorkspaceProjects('org-a', owner);
  const rejected = expect(pending).rejects.toThrow(/Workspace changed/);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  setActiveOrgId('org-b');
  resolve(new Response(JSON.stringify(Array.from({ length: PAGE_SIZE }, (_, id) => ({ id: String(id) }))), { headers: { 'Content-Type': 'application/json' } }));
  await rejected;
  expect(fetch).toHaveBeenCalledOnce();
  owner.dispose();
});

it('does not download an already-built old-owner bundle', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ total_rows: 1 }), { headers: { 'Content-Type': 'application/json' } })));
  const owner = await beginWorkspaceExport('org-a');
  const bundle = await exportWorkspace([{ id: 'a' }], { owner });
  setActiveOrgId('org-b');
  expect(await downloadWorkspaceExport(bundle)).toBe('cancelled');
  expect(presentGeneratedFile).not.toHaveBeenCalled();
  owner.dispose();
});
