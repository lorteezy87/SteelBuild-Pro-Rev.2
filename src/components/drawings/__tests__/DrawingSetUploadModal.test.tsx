// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from 'fake-indexeddb';
import { setActiveOrgId } from '@/lib/activeOrg';
import { saveDrawingCommand, loadDrawingCommands } from '@/lib/drawingCommands/journal';
import type { useUploadWizardState } from "../upload/useUploadWizardState";
import { AuthContext, type AuthContextValue } from '@/lib/AuthContext';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { createTestDrawingLocks, deferred, draftFixture, owner, resultFixture } from "@/lib/drawingCommands/__tests__/fixtures";
const m = vi.hoisted(() => ({
  role: "pm", review: {} as Record<string, unknown>, creation: {} as Record<string, unknown>,
  command: { state: "reviewing", draft: null as ReturnType<typeof draftFixture> | null, error: null as { message: string } | null },
  create: vi.fn(), recover: vi.fn(), discard: vi.fn(), reviewedSetter: vi.fn(), resetSources: vi.fn(),
  org: { id: "org" } as { id: string } | null, wizard: null as ReturnType<typeof useUploadWizardState> | null,
  realCommand: false, forceReview: true, rpc: vi.fn(), getUser: vi.fn(), invalidate: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: m.rpc, auth: { getUser: m.getUser, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }));
vi.mock('@/services/cacheRegistry', () => ({ invalidateEntities: m.invalidate }));
vi.mock("@/services/permissions", () => ({ usePermissions: () => ({ can: () => m.role === "pm" }) }));
vi.mock("@/lib/AuthContext", async () => ({ AuthContext: (await import('react')).createContext(undefined) }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => { if (!m.org) throw new Error('missing org provider'); return { currentOrg: m.org }; }, useOptionalOrg: () => m.org ? { currentOrg: m.org } : null }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../upload/useUploadWizardState", async importOriginal => {
  const actual = await importOriginal<typeof import('../upload/useUploadWizardState')>();
  return { useUploadWizardState: (args: NonNullable<Parameters<typeof actual.useUploadWizardState>[0]>) => {
    m.wizard = actual.useUploadWizardState(args);
    return m.forceReview ? { ...m.wizard, step: 4 } : m.wizard;
  } };
});
vi.mock("../upload/useFileUploadAndExtract", () => ({ useFileUploadAndExtract: () => ({
  handleUploadAndProcess: vi.fn(), setReviewedSheets: m.reviewedSetter,
  sourceSnapshots: { snapshots: [] as unknown[], ready: true, verify: vi.fn(), reset: m.resetSources },
}) }));
vi.mock("../upload/useDrawingSetCreation", async importOriginal => {
  const actual = await importOriginal<typeof import('../upload/useDrawingSetCreation')>();
  return { useDrawingSetCreation: (args: NonNullable<Parameters<typeof actual.useDrawingSetCreation>[0]>) => {
    m.creation = { owner: args.owner, sourceSnapshots: args.sourceSnapshots };
    if (m.realCommand) return actual.useDrawingSetCreation(args);
    return { handleCreate: m.create, handleRecover: m.recover, handleDiscardSaved: m.discard, command: m.command, available: !!args.owner, preparing: false, refreshReadiness: vi.fn() };
  } };
});
vi.mock("../uploadSteps/ReviewStep", () => ({ default: (props: Record<string, unknown>) => { m.review = props; return <div>Review current form</div>; } }));
vi.mock("../uploadSteps/ChoiceStep", () => ({ default: (): null => null }));
vi.mock("../uploadSteps/SetInfoStep", () => ({ default: (): null => null }));
vi.mock("../uploadSteps/FileDropStep", () => ({ default: (): null => null }));
vi.mock("../uploadSteps/ProcessingStep", () => ({ default: (): null => null }));
import DrawingSetUploadModal from "../DrawingSetUploadModal";
function mount() {
  return render(<AuthContext.Provider value={{ user: { id: 'actor' } } as AuthContextValue}><QueryClientProvider client={new QueryClient()}><DrawingSetUploadModal open onClose={() => {}} onComplete={() => {}} activeProject={{ id: "project" }} onNewRevision={() => {}} /></QueryClientProvider></AuthContext.Provider>);
}
beforeEach(() => { vi.clearAllMocks(); m.realCommand = false; m.forceReview = true; m.role = "pm"; m.org = { id: "org" }; m.command = { state: "reviewing", draft: null, error: null }; });
it("wires original-source-aware setter and actor/org/project owner", () => {
  mount();
  expect(m.review.setSheets).toBe(m.reviewedSetter);
  expect(m.review.commandAvailable).toBe(true);
  expect(m.creation.owner).toEqual({ actorId: "actor", orgId: "org", projectId: "project" });
  expect(m.creation.sourceSnapshots).toMatchObject({ ready: true });
  expect(m.resetSources).not.toHaveBeenCalled();
});
it("field permission keeps Create held", () => {
  m.role = "field"; mount();
  expect(m.review.commandAvailable).toBe(false);
});
it("remount exposes original saved payload and explicit receipt reconciliation", () => {
  m.command.draft = draftFixture(); mount();
  expect(screen.queryByText("Review current form")).toBeNull();
  expect(screen.getByText(/Original reviewed request/)).toBeInTheDocument();
  expect(screen.getByText(/Retained project text/)).toBeInTheDocument();
  expect(m.recover).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reconcile saved request" }));
  expect(m.recover).toHaveBeenCalledOnce();
  expect(m.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check receipt and discard local review" }));
  expect(m.discard).toHaveBeenCalledOnce();
});
it("missing workspace provider holds the standalone modal with no command owner", () => {
  m.org = null; m.realCommand = true; mount();
  expect(m.creation.owner).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Atomic drawing intake is held');
  expect(m.review.commandAvailable).toBe(false);
  expect(m.create).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
});
it('missing auth provider holds the standalone modal without an invented actor', () => {
  m.realCommand = true;
  render(<QueryClientProvider client={new QueryClient()}><DrawingSetUploadModal open onClose={() => {}} onComplete={() => {}} activeProject={{ id: 'project' }} onNewRevision={() => {}} /></QueryClientProvider>);
  expect(m.creation.owner).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Atomic drawing intake is held');
  expect(m.review.commandAvailable).toBe(false);
  expect(m.create).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("real wizard review survives rerenders and resets only on open/project transitions", () => {
  const client = new QueryClient();
  const view = (open: boolean, id: string) => <AuthContext.Provider value={{ user: { id: 'actor' } } as AuthContextValue}><QueryClientProvider client={client}><DrawingSetUploadModal open={open} onClose={() => {}} onComplete={() => {}} activeProject={{ id }} onNewRevision={() => {}} /></QueryClientProvider></AuthContext.Provider>;
  const rendered = render(view(true, 'project'));
  const reset = m.wizard!.reset;
  act(() => { m.wizard!.setMeta((previous: Record<string, unknown>) => ({ ...previous, setName: 'Reviewed title' })); m.wizard!.setSheets([{ sheetNumber: 'S1' }]); m.wizard!.setStep(3); });
  rendered.rerender(view(true, 'project'));
  expect(m.wizard!.meta.setName).toBe('Reviewed title');
  expect(m.wizard!.sheets).toHaveLength(1);
  expect(m.wizard!.step).toBe(3);
  expect(m.wizard!.reset).toBe(reset);
  expect(m.resetSources).not.toHaveBeenCalled();
  rendered.rerender(view(true, 'other-project'));
  expect(m.wizard!.meta.setName).toBe('');
  expect(m.wizard!.sheets).toEqual([]);
  expect(m.resetSources).toHaveBeenCalledTimes(1);
  rendered.rerender(view(false, 'other-project'));
  rendered.rerender(view(true, 'other-project'));
  expect(m.resetSources).toHaveBeenCalledTimes(3);
});
it('known committed modal stays truthful and busy during follow-up receipt retry', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('navigator', { locks: createTestDrawingLocks() });
  setActiveOrgId(owner.orgId);
  await saveDrawingCommand(draftFixture());
  m.realCommand = true; m.forceReview = false; m.org = { id: owner.orgId };
  m.getUser.mockResolvedValue({ data: { user: { id: owner.actorId } }, error: null });
  m.invalidate.mockRejectedValue(new Error('cache failed'));
  m.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_capabilities'
    ? { contract_version: 1, new_set: true, revision: true, write_boundary: true, source_protection: true, receipt_lookup: true }
    : { state: 'committed', result: resultFixture() } }));
  render(<AuthContext.Provider value={{ user: { id: owner.actorId } } as AuthContextValue}><QueryClientProvider client={new QueryClient()}><DrawingSetUploadModal open onClose={() => {}} onComplete={() => {}} activeProject={{ id: owner.projectId }} onNewRevision={() => {}} /></QueryClientProvider></AuthContext.Provider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Reconcile saved request' }));
  expect(await screen.findByRole('heading', { name: 'Drawing save committed' })).toBeInTheDocument();
  const retry = await screen.findByRole('button', { name: 'Reconcile committed receipt' });
  await waitFor(() => expect(retry).toBeEnabled());
  const reply = deferred<{ data: { state: 'pending' }; error: null }>();
  m.rpc.mockClear(); m.rpc.mockReturnValue(reply.promise);
  fireEvent.click(retry);
  expect(screen.getByRole('heading', { name: 'Drawing save committed' })).toBeInTheDocument();
  expect(screen.getByText('1 Drawing Log entry created.')).toBeInTheDocument();
  expect(retry).toBeDisabled();
  fireEvent.click(retry);
  await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(1));
  await act(async () => { reply.resolve({ data: { state: 'pending' }, error: null }); });
  expect(screen.getByText('1 Drawing Log entry created.')).toBeInTheDocument();
  expect(screen.getByText(/Automatic schedule linking was not performed/)).toBeInTheDocument();
  await waitFor(() => expect(retry).toBeEnabled());
  expect(m.rpc).toHaveBeenCalledTimes(1);
  expect(m.rpc.mock.calls[0][0]).toBe('get_drawing_command_receipt');
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
});
