// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrgProvider, useOrg } from "../OrgContext";
import { getActiveOrgId } from "@/lib/activeOrg";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "alice" } }) }));
vi.mock("@/lib/org/repository", () => ({
  listMyMemberships: async () => [
    { organization: { id: "org-a", name: "Fabricator A" }, role: "owner" },
    { organization: { id: "org-b", name: "Erector B" }, role: "owner" },
  ],
}));
const renders: Array<{ org: string | undefined; loading: boolean; cached: unknown }> = [];
let client: QueryClient;
function Probe() {
  const { currentOrg, isLoadingOrgs, setCurrentOrg } = useOrg();
  renders.push({ org: currentOrg?.id, loading: isLoadingOrgs, cached: client.getQueryData(["projects"]) });
  if (isLoadingOrgs) return <span>Resolving workspace</span>;
  return <button onClick={() => setCurrentOrg("org-b")}>{currentOrg?.name}</button>;
}
beforeEach(() => {
  localStorage.clear();
  renders.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });

it("clears old workspace queries before opening the next workspace gate", async () => {
  render(<QueryClientProvider client={client}><OrgProvider><Probe /></OrgProvider></QueryClientProvider>);
  await screen.findByRole("button", { name: "Fabricator A" });
  client.setQueryData(["projects"], [{ id: "private-a" }]);
  fireEvent.click(screen.getByRole("button", { name: "Fabricator A" }));
  await screen.findByRole("button", { name: "Erector B" });
  expect(client.getQueryData(["projects"])).toBeUndefined();
  expect(client.getQueryData(["my-orgs", "alice"])).toBeDefined();
  expect(renders.some((state) => state.org === "org-b" && !state.loading && state.cached !== undefined)).toBe(false);
  expect(getActiveOrgId()).toBe("org-b");
});

it("clears the non-React upload scope when the provider unmounts", async () => {
  const view = render(<QueryClientProvider client={client}><OrgProvider><Probe /></OrgProvider></QueryClientProvider>);
  await waitFor(() => expect(getActiveOrgId()).toBe("org-a"));
  view.unmount();
  expect(getActiveOrgId()).toBeNull();
});
