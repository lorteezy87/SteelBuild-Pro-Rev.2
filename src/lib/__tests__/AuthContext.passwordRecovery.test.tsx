// @vitest-environment jsdom
import React from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth, type AuthContextValue } from "@/lib/AuthContext";
import AuthenticatedApp from "@/boot/AuthenticatedApp";
import { getPasswordRecoveryHold, clearPasswordRecoveryAfterSignOut, capturePasswordRecovery } from '@/lib/passwordRecovery';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn(), updateUser: vi.fn(), aal: vi.fn(),
  profile: vi.fn(), app: vi.fn(), challenge: vi.fn(),
  callback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
}));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  auth: {
    getSession: mocks.getSession, refreshSession: mocks.refreshSession, signOut: mocks.signOut,
    updateUser: mocks.updateUser,
    mfa: { getAuthenticatorAssuranceLevel: mocks.aal, challengeAndVerify: mocks.challenge,
      listFactors: async () => ({ data: { totp: [{ id: "factor-a", status: "verified" }] }, error: null as null }) },
    onAuthStateChange: (callback: typeof mocks.callback) => {
      mocks.callback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
} }));
vi.mock("@/lib/query-client", () => ({ queryClientInstance: { clear: vi.fn() } }));
vi.mock("@/lib/field/blobStore", () => ({ clearPendingPhotos: vi.fn(async () => {}) }));
vi.mock("@/lib/native/platform", () => ({ isNativePlatform: () => false }));
vi.mock("@sentry/react", () => ({ setUser: vi.fn() }));
vi.mock("@/components/shared/OrgContext", () => ({ OrgProvider: ({ children }: React.PropsWithChildren) => children, useOrg: () => ({ hasOrg: true, isLoadingOrgs: false }) }));
vi.mock("@/components/shared/ProjectContext", () => ({ ProjectProvider: ({ children }: React.PropsWithChildren) => children }));
vi.mock("@/lib/field/OutboxContext", () => ({ OutboxProvider: ({ children }: React.PropsWithChildren) => children }));
vi.mock("@/boot/AppRoutes", () => ({ default: () => { mocks.app(); return <p>PROJECT ROUTES</p>; } }));
vi.mock("@/pages/Landing", () => ({ default: () => <p>SIGN IN</p> }));

const KEY = "sbp:password-recovery:v1:";
const stored = () => Object.keys(localStorage).filter(key => key.startsWith(KEY));
const session = (id = "a", token = `token-${id}`) => ({ access_token: token, user: { id, email: `${id}@example.test`, user_metadata: {} } }) as unknown as Session;
let auth: AuthContextValue;
function Probe() { auth = useAuth(); return <AuthenticatedApp />; }
function mount() { return render(<MemoryRouter><AuthProvider><Probe /></AuthProvider></MemoryRouter>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function recover() {
  await act(async () => { mocks.callback?.("PASSWORD_RECOVERY", session()); });
  await screen.findByRole("dialog", { name: "Set a new password" });
}
async function submit() {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-long-password" } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-long-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState({}, "", "/");
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  mocks.refreshSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  mocks.updateUser.mockReset().mockResolvedValue({ data: { user: session().user }, error: null });
  mocks.profile.mockReset().mockResolvedValue({ data: { role: "user" }, error: null });
  mocks.aal.mockReset().mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
});
afterEach(async () => {
  // An actual SDK SIGNED_OUT event is the only supported release signal.
  await act(async () => { mocks.callback?.("SIGNED_OUT", null); });
  cleanup();
  // Isolate the singleton between tests, including an intentionally retained
  // marker owned by a previous identity in the stale-response scenario.
  const record = getPasswordRecoveryHold();
  if (record) clearPasswordRecoveryAfterSignOut(record.id);
});

describe("password recovery containment through the real provider and app gate", () => {
  it("restores recovery after a reload without another PASSWORD_RECOVERY event", async () => {
    const view = mount(); await recover();
    expect(stored().length).toBeGreaterThan(0);
    view.unmount();
    mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    mount();
    await screen.findByRole("dialog", { name: "Set a new password" });
    await waitFor(() => expect(auth.isLoadingAuth).toBe(false));
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it.each(["returned", "thrown"])("Cancel keeps the recovery screen when sign-out fails (%s)", async (kind) => {
    mount(); await recover();
    if (kind === "returned") mocks.signOut.mockResolvedValue({ error: new Error("offline") });
    else mocks.signOut.mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    await screen.findByRole("alert", { name: "Sign-out failed" });
    expect(auth.isPasswordRecovery).toBe(true);
    expect(stored().length).toBeGreaterThan(0);
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it("keeps recovery throughout pending sign-out, then returns to sign in", async () => {
    const pending = deferred<{ error: null }>();
    mocks.signOut.mockReturnValue(pending.promise);
    mount(); await recover();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    expect(auth.isPasswordRecovery).toBe(true);
    expect(mocks.app).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ error: null }); });
    await screen.findByText("SIGN IN");
    expect(stored()).toHaveLength(0);
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it("persists password-updated/sign-out-needed across a failed logout and reload", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("offline") });
    const view = mount(); await recover(); await submit();
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    expect(auth.isPasswordRecovery).toBe(true);
    expect(mocks.app).not.toHaveBeenCalled();
    view.unmount();
    mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    mount();
    await screen.findByText(/password has been updated/i);
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    mocks.signOut.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole("button", { name: /Finish signing out/i }));
    await screen.findByText("SIGN IN");
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it("keeps failed password updates in recovery without signing out", async () => {
    mocks.updateUser.mockResolvedValue({ error: new Error("Password rejected") });
    mount(); await recover(); await submit();
    await screen.findByText("Password rejected");
    expect(auth.isPasswordRecovery).toBe(true);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it("allows enrolled MFA before password recovery without mounting project routes", async () => {
    mocks.aal.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    mocks.challenge.mockResolvedValue({ data: session("a", "aal2-token"), error: null });
    mount();
    await act(async () => { mocks.callback?.("PASSWORD_RECOVERY", session()); });
    await screen.findByRole("dialog", { name: "Two-factor verification" });
    expect(auth.isPasswordRecovery).toBe(true);
    mocks.aal.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
    fireEvent.change(screen.getByLabelText("Authentication code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByRole("dialog", { name: "Set a new password" });
    expect(auth.isPasswordRecovery).toBe(true);
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it("does not advance or sign out a new identity when an old password request completes", async () => {
    const pending = deferred<{ error: null }>();
    mocks.updateUser.mockReturnValue(pending.promise);
    mount(); await recover(); await submit();
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalled());
    await act(async () => { mocks.callback?.("SIGNED_IN", session("b")); });
    await waitFor(() => expect(auth.user?.id).toBe("b"));
    await act(async () => { pending.resolve({ error: null }); });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(auth.user?.id).toBe("b");
  });

  it("leaves ordinary Settings password rotation signed in", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    mount(); await screen.findByText("PROJECT ROUTES");
    await act(async () => { expect(await auth.updatePassword("new-long-password")).toEqual({ success: true }); });
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.isPasswordRecovery).toBe(false);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each(['INITIAL_SESSION', 'TOKEN_REFRESHED', 'SIGNED_IN'] as AuthChangeEvent[])("retains recovery on %s with the same identity", async event => {
    mount(); await recover();
    await act(async () => { mocks.callback?.(event, session('a', 'renewed-token')); });
    await screen.findByRole('dialog', { name: 'Set a new password' });
    expect(auth.isPasswordRecovery).toBe(true);
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it('never mounts project routes when a different tab changes the marker before Auth changes identity', async () => {
    mount(); await recover();
    const other = { ...getPasswordRecoveryHold(), id: 'other-tab', userId: 'b', createdAt: Date.now() + 1 };
    await act(async () => {
      localStorage.setItem(`${KEY}${other.id}`, JSON.stringify(other));
      window.dispatchEvent(new StorageEvent('storage', { key: `${KEY}${other.id}`, newValue: JSON.stringify(other) }));
    });
    await screen.findByText(/recovery session could not be confirmed/i);
    expect(auth.user?.id).toBe('a');
    expect(auth.isPasswordRecovery).toBe(true);
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it('allows an unresolved recovery with no session to exit only after confirmed sign-out', async () => {
    capturePasswordRecovery(null);
    mocks.signOut.mockResolvedValue({ error: new Error('offline') });
    mount();
    await screen.findByText(/recovery session could not be confirmed/i);
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Finish signing out/ }));
    await screen.findByRole('alert', { name: 'Sign-out failed' });
    expect(auth.isPasswordRecovery).toBe(true);
    mocks.signOut.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Retry sign out' }));
    await screen.findByText('SIGN IN');
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it('does not briefly mount project routes during an SDK SIGNED_OUT event inside successful logout', async () => {
    mocks.signOut.mockImplementation(async () => {
      mocks.callback?.('SIGNED_OUT', null);
      await Promise.resolve();
      return { error: null };
    });
    mount(); await recover(); await submit();
    await screen.findByText('SIGN IN');
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it('keeps recovery held when the MFA check fails', async () => {
    mocks.aal.mockResolvedValue({ error: new Error('offline') });
    mount();
    await act(async () => { mocks.callback?.('PASSWORD_RECOVERY', session()); });
    await screen.findByText('Verify your sign-in');
    expect(auth.isPasswordRecovery).toBe(true);
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it('ignores a late password result after a same-user token change', async () => {
    const pending = deferred<{ error: null }>();
    mocks.updateUser.mockReturnValue(pending.promise);
    mount(); await recover(); await submit();
    await act(async () => { mocks.callback?.('SIGNED_IN', session('a', 'other-login')); });
    await act(async () => { pending.resolve({ error: null }); });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(auth.passwordRecoveryPhase).toBe('password');
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it.each(['a', 'b'])('keeps a newer recovery for %s when an older sign-out emits SIGNED_OUT late', async (nextUserId) => {
    const pending = deferred<{ error: null }>();
    mocks.signOut.mockReturnValue(pending.promise);
    mount(); await recover();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    await act(async () => { mocks.callback?.('PASSWORD_RECOVERY', session(nextUserId, 'new-recovery-token')); });
    await waitFor(() => expect(auth.user?.id).toBe(nextUserId));
    expect(auth.passwordRecoveryPhase).toBe(nextUserId === 'a' ? 'password' : 'unresolved');
    await act(async () => {
      mocks.callback?.('SIGNED_OUT', null);
      await Promise.resolve();
      mocks.callback?.('SIGNED_IN', session(nextUserId, 'new-recovery-token'));
    });
    await act(async () => { pending.resolve({ error: null }); });
    await waitFor(() => expect(auth.user?.id).toBe(nextUserId));
    expect(auth.isPasswordRecovery).toBe(true);
    expect(getPasswordRecoveryHold()).not.toBeNull();
    expect(mocks.app).not.toHaveBeenCalled();
  });
});
