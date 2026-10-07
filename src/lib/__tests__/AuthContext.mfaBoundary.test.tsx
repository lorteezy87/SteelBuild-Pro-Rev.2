// @vitest-environment jsdom
import type { ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth, type AuthContextValue } from "../AuthContext";
import { getActiveOrgId, setActiveOrgId } from "../activeOrg";

type AalResult = {
  data: { currentLevel: "aal1" | "aal2"; nextLevel: "aal1" | "aal2" } | null;
  error: Error | null;
};
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), refreshSession: vi.fn(), aal: vi.fn(), clear: vi.fn(), signOut: vi.fn(),
  onChange: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "user" }, error: null }) }) }) }),
    auth: {
      getSession: mocks.getSession, refreshSession: mocks.refreshSession, signOut: mocks.signOut,
      mfa: { getAuthenticatorAssuranceLevel: mocks.aal },
      onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
        mocks.onChange = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
vi.mock("@/lib/query-client", () => ({ queryClientInstance: { clear: mocks.clear } }));
vi.mock("@/lib/field/blobStore", () => ({ clearPendingPhotos: vi.fn(async () => {}) }));
vi.mock("@/lib/native/platform", () => ({ isNativePlatform: () => false }));
vi.mock("@sentry/react", () => ({ setUser: vi.fn() }));

const satisfied: AalResult = { data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null };
function sessionFor(id: string, accessToken = "token-" + id): Session {
  return { access_token: accessToken, user: { id, email: id + "@example.test", user_metadata: {} } } as unknown as Session;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
function mount(observe?: (value: AuthContextValue) => void) {
  return renderHook(() => {
    const value = useAuth();
    observe?.(value);
    return value;
  }, {
    wrapper: ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.getSession.mockResolvedValue({ data: { session: sessionFor("a") }, error: null });
  mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.aal.mockResolvedValue(satisfied);
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
});
afterEach(cleanup);

it("keeps MFA pending until the AAL result is known, then requires the enrolled factor", async () => {
  const lookup = deferred<AalResult>();
  mocks.aal.mockReturnValueOnce(lookup.promise);
  const { result } = mount();
  await waitFor(() => expect(result.current.user?.id).toBe("a"));
  expect(result.current.isCheckingMfa).toBe(true);
  await act(async () => { lookup.resolve({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null }); });
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
  expect(result.current.mfaRequired).toBe(true);
});

it.each(["returned", "thrown"] as const)("fails closed on a %s AAL error", async (kind) => {
  if (kind === "returned") mocks.aal.mockResolvedValue({ data: null, error: new Error("offline") });
  else mocks.aal.mockRejectedValue(new Error("offline"));
  const { result } = mount();
  await waitFor(() => expect(result.current.mfaStatusDegraded).toBe(true));
  expect(result.current.mfaRequired).toBe(true);
  expect(result.current.isCheckingMfa).toBe(false);
});

it("does not let a previous user's MFA result replace the next user's status", async () => {
  const oldLookup = deferred<AalResult>();
  mocks.aal.mockReturnValueOnce(oldLookup.promise).mockResolvedValue(satisfied);
  const { result } = mount();
  await waitFor(() => expect(mocks.aal).toHaveBeenCalledTimes(1));
  await act(async () => { mocks.onChange?.("SIGNED_IN", sessionFor("b")); });
  await waitFor(() => expect(result.current.user?.id).toBe("b"));
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
  await act(async () => { oldLookup.resolve({ data: null, error: new Error("stale") }); });
  expect(result.current.user?.id).toBe("b");
  expect(result.current.mfaStatusDegraded).toBe(false);
  expect(result.current.mfaRequired).toBe(false);
});

it("clears cached projects and selections on sign-out without erasing local notes", async () => {
  const lookup = deferred<AalResult>();
  mocks.aal.mockReturnValueOnce(lookup.promise);
  const { result } = mount();
  await waitFor(() => expect(result.current.user?.id).toBe("a"));
  localStorage.setItem("sbp_projects_cache", JSON.stringify([{ id: "private", name: "A only" }]));
  localStorage.setItem("activeProjectId", "private");
  localStorage.setItem("sbp-tools-notes", "retain my local notes");
  setActiveOrgId("a-org");
  await act(async () => { mocks.onChange?.("SIGNED_OUT", null); });
  expect(result.current.isAuthenticated).toBe(false);
  expect(localStorage.getItem("sbp_projects_cache")).toBeNull();
  expect(localStorage.getItem("activeProjectId")).toBeNull();
  expect(localStorage.getItem("sbp-tools-notes")).toBe("retain my local notes");
  expect(getActiveOrgId()).toBeNull();
  expect(mocks.refreshSession).not.toHaveBeenCalled();
  await act(async () => { lookup.resolve(satisfied); });
  expect(result.current.isAuthenticated).toBe(false);
  expect(result.current.isCheckingMfa).toBe(false);
});

it("rechecks MFA when checkAppState accepts a session", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
  const lookup = deferred<AalResult>();
  mocks.aal.mockReturnValueOnce(lookup.promise);
  let refresh!: Promise<void>;
  await act(async () => { refresh = result.current.checkAppState(); });
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(true));
  await act(async () => {
    lookup.resolve({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    await refresh;
  });
  expect(result.current.mfaRequired).toBe(true);
});

it.each(["TOKEN_REFRESHED", "USER_UPDATED", "SIGNED_IN"] as const)(
  "preserves mounted app state while revalidating a verified identity on %s",
  async (event) => {
    const pendingRenders: boolean[] = [];
    const { result } = mount((value) => pendingRenders.push(value.isCheckingMfa));
    await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
    pendingRenders.length = 0;
    const lookup = deferred<AalResult>();
    mocks.aal.mockReturnValueOnce(lookup.promise);
    await act(async () => { mocks.onChange?.(event, sessionFor("a")); });
    await waitFor(() => expect(mocks.aal).toHaveBeenCalledTimes(2));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isCheckingMfa).toBe(false);
    expect(result.current.mfaStatusDegraded).toBe(false);
    expect(pendingRenders).not.toContain(true);
    await act(async () => { lookup.resolve(satisfied); });
    expect(result.current.isCheckingMfa).toBe(false);
    expect(pendingRenders).not.toContain(true);
  },
);

it("still blocks an identity change delivered through a token refresh event", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
  const lookup = deferred<AalResult>();
  mocks.aal.mockReturnValueOnce(lookup.promise);
  await act(async () => { mocks.onChange?.("TOKEN_REFRESHED", sessionFor("b")); });
  await waitFor(() => expect(result.current.user?.id).toBe("b"));
  expect(result.current.isCheckingMfa).toBe(true);
  await act(async () => { lookup.resolve(satisfied); });
});

it("blocks when a background renewal cannot confirm MFA and retry cannot inherit old proof", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
  mocks.aal.mockResolvedValueOnce({ data: null, error: new Error("offline") });
  await act(async () => { mocks.onChange?.("TOKEN_REFRESHED", sessionFor("a")); });
  await waitFor(() => expect(result.current.mfaStatusDegraded).toBe(true));
  const lookup = deferred<AalResult>();
  mocks.aal.mockReturnValueOnce(lookup.promise);
  await act(async () => { mocks.onChange?.("TOKEN_REFRESHED", sessionFor("a")); });
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(true));
  await act(async () => { lookup.resolve(satisfied); });
});

it("requires fresh MFA proof for a new session belonging to the same user", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
  const lookup = deferred<AalResult>();
  mocks.aal.mockReturnValueOnce(lookup.promise);
  await act(async () => { mocks.onChange?.("SIGNED_IN", sessionFor("a", "new-login-token")); });
  await waitFor(() => expect(mocks.aal).toHaveBeenCalledTimes(2));
  expect(result.current.isCheckingMfa).toBe(true);
  await act(async () => { lookup.resolve(satisfied); });
});

it.each(["returned", "thrown"] as const)("keeps the session and tenant cache on a %s sign-out failure and retries safely", async (kind) => {
  const { result } = mount();
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
  const signedInUser = result.current.user;
  const cachedProjects = JSON.stringify([{ id: "private", name: "A only" }]);
  localStorage.setItem("sbp_projects_cache", cachedProjects);
  localStorage.setItem("activeProjectId", "private");
  localStorage.setItem("sbp:field:outbox:private", "pending field capture");
  localStorage.setItem("sbp-tools-notes", "retain my local notes");
  setActiveOrgId("a-org");
  mocks.clear.mockClear();

  const failure = new Error("private server details must not be rendered");
  if (kind === "returned") mocks.signOut.mockResolvedValueOnce({ error: failure });
  else mocks.signOut.mockRejectedValueOnce(failure);
  await act(async () => {
    await expect(result.current.logout()).resolves.toBeUndefined();
  });

  expect(result.current.user).toBe(signedInUser);
  expect(result.current.isAuthenticated).toBe(true);
  expect(result.current.isCheckingMfa).toBe(false);
  expect(localStorage.getItem("sbp_projects_cache")).toBe(cachedProjects);
  expect(localStorage.getItem("activeProjectId")).toBe("private");
  expect(localStorage.getItem("sbp:field:outbox:private")).toBe("pending field capture");
  expect(getActiveOrgId()).toBe("a-org");
  expect(mocks.clear).not.toHaveBeenCalled();
  const alert = screen.getByRole("alert", { name: "Sign-out failed" });
  expect(alert).toHaveTextContent("You are still signed in");
  expect(alert).not.toHaveTextContent(failure.message);

  const retry = deferred<{ error: Error | null }>();
  mocks.signOut.mockReturnValueOnce(retry.promise);
  fireEvent.click(screen.getByRole("button", { name: "Retry sign out" }));
  expect(screen.getByRole("button", { name: "Signing out…" })).toBeDisabled();
  await act(async () => {
    await result.current.logout();
  });
  expect(mocks.signOut).toHaveBeenCalledTimes(2);
  await act(async () => { retry.resolve({ error: null }); });

  expect(result.current.isAuthenticated).toBe(false);
  expect(result.current.user).toBeNull();
  expect(screen.queryByRole("alert", { name: "Sign-out failed" })).not.toBeInTheDocument();
  expect(localStorage.getItem("sbp_projects_cache")).toBeNull();
  expect(localStorage.getItem("activeProjectId")).toBeNull();
  expect(localStorage.getItem("sbp:field:outbox:private")).toBeNull();
  expect(localStorage.getItem("sbp-tools-notes")).toBe("retain my local notes");
  expect(getActiveOrgId()).toBeNull();
  expect(mocks.clear).toHaveBeenCalledTimes(1);
});

it("preserves the mounted app draft when sign-out fails", async () => {
  function AppProbe() {
    const auth = useAuth();
    if (!auth.isAuthenticated || auth.isCheckingMfa) return <span>Checking session</span>;
    return (
      <div>
        <input aria-label="Unsaved weld inspection" defaultValue="" />
        <button type="button" onClick={() => { void auth.logout(); }}>Sign out</button>
      </div>
    );
  }
  mocks.signOut.mockResolvedValueOnce({ error: new Error("offline") });
  render(<AuthProvider><AppProbe /></AuthProvider>);
  const draft = await screen.findByRole("textbox", { name: "Unsaved weld inspection" });
  fireEvent.change(draft, { target: { value: "Bay 3 weld inspection pending" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("alert", { name: "Sign-out failed" });
  expect(screen.getByRole("textbox", { name: "Unsaved weld inspection" })).toBe(draft);
  expect(draft).toHaveValue("Bay 3 weld inspection pending");
});

it("clears a prior sign-out error when another identity signs in", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
  mocks.signOut.mockResolvedValueOnce({ error: new Error("offline") });
  await act(async () => { await result.current.logout(); });
  expect(screen.getByRole("alert", { name: "Sign-out failed" })).toBeInTheDocument();
  await act(async () => { mocks.onChange?.("SIGNED_IN", sessionFor("b")); });
  await waitFor(() => expect(result.current.user?.id).toBe("b"));
  expect(screen.queryByRole("alert", { name: "Sign-out failed" })).not.toBeInTheDocument();
});

it("ignores a late sign-out failure from a previous identity", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.isCheckingMfa).toBe(false));
  const pending = deferred<{ error: Error | null }>();
  mocks.signOut.mockReturnValueOnce(pending.promise);
  let signOut!: Promise<void>;
  await act(async () => { signOut = result.current.logout(); });
  await act(async () => { mocks.onChange?.("SIGNED_IN", sessionFor("b")); });
  await waitFor(() => expect(result.current.user?.id).toBe("b"));
  await act(async () => {
    pending.resolve({ error: new Error("old identity") });
    await signOut;
  });
  expect(result.current.user?.id).toBe("b");
  expect(result.current.isAuthenticated).toBe(true);
  expect(screen.queryByRole("alert", { name: "Sign-out failed" })).not.toBeInTheDocument();
});
