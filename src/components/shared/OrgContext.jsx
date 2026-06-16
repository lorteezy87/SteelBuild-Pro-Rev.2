/**
 * OrgContext — the current organization/workspace (multi-tenant SaaS).
 *
 * Fetches the orgs the signed-in user belongs to and exposes the active one +
 * the user's role in it. Sits ABOVE ProjectProvider: a project belongs to an
 * org, and the org is the billing/invite/grouping unit.
 *
 * Fail-open by design: if the org fetch errors, `hasOrg` is true so an existing
 * user is never trapped on the onboarding gate by a transient error.
 */

import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { listMyMemberships } from "@/lib/org/repository";
import { setActiveOrgId } from "@/lib/activeOrg";

const OrgContext = createContext(undefined);
const LS_KEY = "sbp:current-org";

export function OrgProvider({ children }) {
  const { user } = useAuth();
  const {
    data: memberships = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["my-orgs", user?.id],
    queryFn: () => listMyMemberships(user.id),
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const orgs = useMemo(() => memberships.map((m) => m.organization), [memberships]);

  const [currentId, setCurrentId] = useState(() => {
    try { return localStorage.getItem(LS_KEY); } catch { return null; }
  });

  // Default to the first org once loaded (or when the stored id is no longer valid).
  useEffect(() => {
    if (orgs.length > 0 && (!currentId || !orgs.some((o) => o.id === currentId))) {
      setCurrentId(orgs[0].id);
    }
  }, [orgs, currentId]);

  const setCurrentOrg = useCallback((id) => {
    setCurrentId(id);
    try { localStorage.setItem(LS_KEY, id); } catch { /* ignore */ }
  }, []);

  const currentOrg = orgs.find((o) => o.id === currentId) || orgs[0] || null;
  const currentRole = memberships.find((m) => m.organization.id === currentOrg?.id)?.role || null;

  // Publish the active org id for non-React consumers — the file uploader
  // (api/supabaseClient UploadFile) scopes storage paths by it. Reuses this
  // known-good resolution instead of a separate (flaky) query in the uploader.
  useEffect(() => { setActiveOrgId(currentOrg?.id ?? null); }, [currentOrg?.id]);

  const value = useMemo(
    () => ({
      orgs,
      currentOrg,
      currentRole,
      isLoadingOrgs: isLoading,
      // Fail-open: a fetch error must not strand an existing user on onboarding.
      hasOrg: isError ? true : orgs.length > 0,
      setCurrentOrg,
      refetchOrgs: refetch,
    }),
    [orgs, currentOrg, currentRole, isLoading, isError, setCurrentOrg, refetch],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within an OrgProvider");
  return ctx;
}
