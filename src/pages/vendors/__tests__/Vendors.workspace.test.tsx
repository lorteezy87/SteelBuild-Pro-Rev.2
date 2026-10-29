// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ orgId: "org-second" as string | null, filterAll: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({ entities: { Vendor: mocks } }));
vi.mock("@/components/shared/ProjectContext", () => ({ useProjectContext: () => ({ activeProject: null as { id: string } | null }) }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: mocks.orgId ? { id: mocks.orgId } : null }) }));
vi.mock("@/pages/vendors/VendorControlCenter", () => ({ default: ({ onCreate }: { onCreate: () => void }) => <button onClick={onCreate}>Add vendor</button> }));
vi.mock("@/components/vendors/VendorFormModal", () => ({ default: ({ open, onSave }: { open: boolean; onSave: (data: object) => void }) => open ? <button onClick={() => onSave({ company_name: "Erector", org_id: "wrong-org" })}>Save vendor</button> : null }));
import Vendors from "@/pages/Vendors";
let client: QueryClient;
beforeEach(() => {
  mocks.orgId = "org-second";
  mocks.list.mockResolvedValue([]); mocks.filterAll.mockResolvedValue([]); mocks.create.mockResolvedValue({ id: "vendor" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.clearAllMocks(); });
it("reads and creates vendors only in the selected workspace", async () => {
  render(<QueryClientProvider client={client}><Vendors /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Add vendor" }));
  fireEvent.click(screen.getByRole("button", { name: "Save vendor" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ company_name: "Erector", org_id: "org-second" }));
  expect(mocks.filterAll).toHaveBeenCalledWith({ org_id: "org-second" }, "-is_preferred");
  expect(mocks.list).not.toHaveBeenCalled();
});

