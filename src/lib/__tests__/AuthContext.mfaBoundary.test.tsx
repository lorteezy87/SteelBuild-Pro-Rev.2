// @vitest-environment jsdom
import type { ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth, type AuthContextValue } from "../AuthContext";
import { getActiveOrgId, setActiveOrgId } from "../activeOrg";

type AalResult = {
  data: { currentLevel: "aal1" | "aal2"; nextLevel: "aal1" | "aal2" } | null;
  error: Error | null;
};
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), refreshSession: vi.fn(), aal: vi.fn(), clear: vi.fn(),
  onChange: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "user" }, error: null }) }) }) }),
    auth: {
      getSession: mocks.getSession, refreshSession: mocks.refreshSession,
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
