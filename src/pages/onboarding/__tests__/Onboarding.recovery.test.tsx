// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const entities = Object.fromEntries([
    "WorkPackage", "ScheduleTask", "DrawingSet", "Drawing", "Submittal", "RFI", "Delivery",
    "DailyLog", "Photo", "PunchlistItem", "SafetyIncident", "Inspection", "QualityControlRecord",
  ].map((key) => [key, {
    bulkCreate: vi.fn(), create: vi.fn(),
  }]));
  return { entities, projectList: vi.fn(), projectCreate: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() };
});

vi.mock("@/api/supabaseClient", () => ({ entities: {
  ...mocks.entities, Project: { list: mocks.projectList, create: mocks.projectCreate },
} }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, warning: mocks.warning, error: mocks.error } }));
import Onboarding from "../../Onboarding";
import { setActiveOrgId } from "@/lib/activeOrg";

beforeEach(() => {
  setActiveOrgId(null);
  setActiveOrgId("onboarding-org-a");
  vi.clearAllMocks();
  mocks.projectList.mockResolvedValue([]);
  mocks.projectCreate.mockResolvedValue({ id: "project-1", name: "Demo Steel", start_date: "2026-06-01" });
  for (const entity of Object.values(mocks.entities)) {
    entity.bulkCreate.mockImplementation(async (rows: Record<string, unknown>[]) => rows.map((row, index) => ({ ...row, id: `row-${index}` })));
    entity.create.mockImplementation(async (row: Record<string, unknown>) => ({ ...row, id: "row" }));
  }
});

it("reuses a confirmed project and its seed receipts after reopening the same setup", async () => {
  mocks.entities.Delivery.bulkCreate.mockRejectedValue(new TypeError("reply lost"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const page = () => <QueryClientProvider client={client}><MemoryRouter><Onboarding /></MemoryRouter></QueryClientProvider>;
  const first = render(page());
  fireEvent.click(screen.getByRole("button", { name: /Load demo setup/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Create project$/i }));
  await waitFor(() => expect(mocks.warning).toHaveBeenCalledTimes(1));
  first.unmount();
  const reopened = render(page());
  fireEvent.click(screen.getByRole("button", { name: /Load demo setup/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Create project$/i }));
  await waitFor(() => expect(mocks.warning).toHaveBeenCalledTimes(2));
  expect(mocks.projectCreate).toHaveBeenCalledTimes(1);
  expect(mocks.entities.WorkPackage.bulkCreate).toHaveBeenCalledTimes(1);
  expect(mocks.entities.Delivery.bulkCreate).toHaveBeenCalledTimes(1);
  reopened.unmount();
  act(() => setActiveOrgId("onboarding-org-b"));
  render(page());
  fireEvent.click(screen.getByRole("button", { name: /Load demo setup/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Create project$/i }));
  await waitFor(() => expect(mocks.warning).toHaveBeenCalledTimes(3));
  expect(mocks.projectCreate).toHaveBeenCalledTimes(2);
});

it("shares the original in-flight project request after the setup view remounts", async () => {
  let finish!: (project: Record<string, unknown>) => void;
  mocks.projectCreate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const page = () => <QueryClientProvider client={client}><MemoryRouter><Onboarding /></MemoryRouter></QueryClientProvider>;
  const first = render(page());
  fireEvent.click(screen.getByRole("button", { name: /Load demo setup/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Create project$/i }));
  await waitFor(() => expect(mocks.projectCreate).toHaveBeenCalledTimes(1));
  first.unmount();
  render(page());
  fireEvent.click(screen.getByRole("button", { name: /Load demo setup/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Create project$/i }));
  await screen.findByRole("button", { name: "Creating..." });
  await act(async () => finish({ id: "pending-project", name: "Original project", start_date: "2026-06-01" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Creating..." })).not.toBeInTheDocument());
  expect(mocks.projectCreate).toHaveBeenCalledTimes(1);
  expect(mocks.entities.WorkPackage.bulkCreate).toHaveBeenCalledTimes(1);
});

it("does not retry retained project setup in a different workspace", async () => {
  mocks.entities.Delivery.bulkCreate.mockRejectedValue(new TypeError("reply lost"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><Onboarding /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /Load demo setup/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Create project$/i }));
  await screen.findByRole("button", { name: /Retry unfinished setup/i });
  act(() => { setActiveOrgId("onboarding-org-b"); });
  expect(screen.getByRole("button", { name: /Retry unfinished setup/i })).toBeDisabled();
});

it("reports incomplete seed setup and retries within the original project without replaying confirmed rows", async () => {
  mocks.entities.Delivery.bulkCreate.mockRejectedValue(new TypeError("reply lost"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><Onboarding /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /Load demo setup/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Create project$/i }));
  await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith(expect.stringMatching(/project created.*unconfirmed/i)));
  expect(mocks.success).not.toHaveBeenCalledWith("Onboarding project created");
  fireEvent.click(screen.getByRole("button", { name: /Retry unfinished setup/i }));
  await waitFor(() => expect(mocks.warning).toHaveBeenCalledTimes(2));
  expect(mocks.projectCreate).toHaveBeenCalledTimes(1);
  expect(mocks.entities.WorkPackage.bulkCreate).toHaveBeenCalledTimes(1);
  expect(mocks.entities.Delivery.bulkCreate).toHaveBeenCalledTimes(1);
  expect(mocks.entities.Delivery.create).not.toHaveBeenCalled();
});

it("requires fresh import approval after selecting a different project", async () => {
  mocks.projectList.mockResolvedValue([{ id: "p1", name: "First project" }, { id: "p2", name: "Second project" }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><Onboarding /></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("option", { name: "First project" });
  fireEvent.change(screen.getByLabelText("Apply to project"), { target: { value: "p1" } });
  const approval = screen.getByRole("checkbox", { name: /I reviewed the preview/i });
  fireEvent.click(approval);
  expect(approval).toBeChecked();
  fireEvent.change(screen.getByLabelText("Apply to project"), { target: { value: "p2" } });
  expect(approval).not.toBeChecked();
  expect(screen.getByRole("button", { name: /Commit 1 rows/i })).toBeDisabled();
});
