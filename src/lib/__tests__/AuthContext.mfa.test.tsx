// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// An account with a verified TOTP factor signs in at aal1 and must step up
// before entering the app (H23). The step-up check used to be fire-and-forget:
// the session handler marked the user authenticated and cleared the loader
// while the assurance-level lookup was still in flight, so the app rendered —
// and fetched tenant data — on a password alone. A lookup that RETURNED an
// error (supabase-js returns, it doesn't throw) also read as "no MFA needed".

type Aal = { data: { currentLevel: string; nextLevel: string } | null; error: { message: string } | null };

const { auth, deferAal } = vi.hoisted(() => {
  let resolveAal: (value: Aal) => void = () => {};
  const auth = {
    getSession: vi.fn(),
    refreshSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(),
    },
  };
  const deferAal = () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockImplementation(
      () => new Promise<Aal>((resolve) => { resolveAal = resolve; }),
    );
    return (value: Aal) => resolveAal(value);
  };
  return { auth, deferAal };
});

vi.mock("@/lib/supabase", () => {
  const profileQuery = {
    select: () => profileQuery,
    eq: () => profileQuery,
    maybeSingle: async () => ({ data: { role: "user" }, error: null }),
  };
  return { supabase: { auth, from: () => profileQuery } };
});
vi.mock("@/lib/query-client", () => ({ queryClientInstance: { clear: vi.fn() } }));
vi.mock("@/lib/field/blobStore", () => ({ clearPendingPhotos: vi.fn(async () => {}) }));
vi.mock("@sentry/react", () => ({ setUser: vi.fn() }));

import { AuthProvider, useAuth } from "../AuthContext";

type Snapshot = { loading: boolean; authenticated: boolean; mfaRequired: boolean; degraded: boolean };

function renderRecording() {
  const seen: Snapshot[] = [];
  function Probe() {
    const a = useAuth();
    seen.push({
      loading: a.isLoadingAuth,
      authenticated: a.isAuthenticated,
      mfaRequired: a.mfaRequired,
      degraded: a.mfaStatusDegraded,
    });
    return null;
  }
  render(<AuthProvider><Probe /></AuthProvider>);
  return seen;
}

// What AuthenticatedApp treats as "enter the app": signed in, loaded, no step-up.
const entersApp = (s: Snapshot) => s.authenticated && !s.loading && !s.mfaRequired;

const session = { user: { id: "user-1", email: "pm@example.com", user_metadata: {}, created_at: "2026-01-01" } };

describe("AuthProvider MFA gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue({ data: { session } });
  });

  it("never lets an aal1 session into the app while the MFA check is pending", async () => {
    const resolveAal = deferAal();
    const seen = renderRecording();

    await waitFor(() => expect(auth.mfa.getAuthenticatorAssuranceLevel).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(seen.filter(entersApp)).toEqual([]);

    await act(async () => { resolveAal({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null }); });

    await waitFor(() => expect(seen.at(-1)).toMatchObject({ loading: false, authenticated: true, mfaRequired: true }));
    expect(seen.filter(entersApp)).toEqual([]);
  });

  it("fails closed when the assurance-level lookup returns an error", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: "network down" } });
    const seen = renderRecording();

    await waitFor(() => expect(seen.at(-1)?.loading).toBe(false));
    expect(seen.at(-1)).toMatchObject({ mfaRequired: true, degraded: true });
    expect(seen.filter(entersApp)).toEqual([]);
  });

  it("lets an account without MFA in once the check confirms it", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    const seen = renderRecording();

    await waitFor(() => expect(seen.at(-1)).toMatchObject({ loading: false, authenticated: true, mfaRequired: false }));
  });
});
