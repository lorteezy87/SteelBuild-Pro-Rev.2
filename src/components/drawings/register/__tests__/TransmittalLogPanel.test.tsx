// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { TransmittalRow } from "@/hooks/useTransmittals";

const drawingTransmittalCreate = vi.fn();
const drawingTransmittalUpdate = vi.fn();
const drawingTransmittalDelete = vi.fn();
const drawingTransmittalItemCreate = vi.fn();
const drawingTransmittalItemDelete = vi.fn();
const can = vi.fn();

let transmittals: TransmittalRow[] = [];
let register: DrawingRegisterRow[] = [];

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DrawingTransmittal: {
      create: (...args: unknown[]) => drawingTransmittalCreate(...args),
      update: (...args: unknown[]) => drawingTransmittalUpdate(...args),
      delete: (...args: unknown[]) => drawingTransmittalDelete(...args),
    },
    DrawingTransmittalItem: {
      create: (...args: unknown[]) => drawingTransmittalItemCreate(...args),
      delete: (...args: unknown[]) => drawingTransmittalItemDelete(...args),
    },
  },
}));

vi.mock("@/hooks/useTransmittals", () => ({
  useTransmittals: () => ({ data: transmittals, isLoading: false, error: null }),
}));

vi.mock("@/hooks/useDrawingRegister", () => ({
  useDrawingRegister: () => ({ data: register, isLoading: false, error: null }),
}));

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ can }),
}));

vi.mock("@/pages/drawingSubmittalHub/format", () => ({
  fmtDate: (value: string) => value,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TransmittalLogPanel } from "../TransmittalLogPanel";

function registerRow(overrides: Partial<DrawingRegisterRow> = {}): DrawingRegisterRow {
  return {
    drawing_id: "drawing-1",
    project_id: "project-1",
    sheet_number: "S101",
    sheet_title: "First Floor Framing",
    discipline: "S",
    drawing_set_name: "IFC Set",
    stage: "IFC",
    current_revision_id: "revision-1",
    current_revision: "A",
    current_status: "released_for_fabrication",
    current_issued_at: "2026-07-01",
    open_impact_count: 0,
    pending_review_count: 0,
    rfi_count: 0,
    work_package_count: 0,
    last_activity: "2026-07-02",
    ...overrides,
  };
}

function transmittalRow(overrides: Partial<TransmittalRow> = {}): TransmittalRow {
  return {
    id: "transmittal-1",
    project_id: "project-1",
    transmittal_number: "T-001",
    direction: "incoming",
    source_company: null,
    received_from: "General Contractor",
    sent_to: null,
    subject: "IFC release",
    date_sent: null,
    date_received: "2026-07-02",
    notes: "Issued for coordination",
    created_at: "2026-07-02T12:00:00Z",
    is_deleted: false,
    items: [{
      id: "item-1",
      drawing_revision_id: "revision-1",
      drawing_id: "drawing-1",
      sheet_number: "S101",
      sheet_title: "First Floor Framing",
      revision_code: "A",
    }],
    item_count: 1,
    ...overrides,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransmittalLogPanel projectId="project-1" />
    </QueryClientProvider>,
  );
}

describe("TransmittalLogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transmittals = [transmittalRow()];
    register = [
      registerRow(),
      registerRow({
        drawing_id: "drawing-2",
        sheet_number: "S102",
        sheet_title: "Roof Framing",
        current_revision_id: "revision-2",
        current_revision: "B",
      }),
    ];
    drawingTransmittalCreate.mockResolvedValue({ id: "transmittal-new" });
    drawingTransmittalUpdate.mockResolvedValue({});
    drawingTransmittalDelete.mockResolvedValue({ success: true });
    drawingTransmittalItemCreate.mockResolvedValue({ id: "item-new" });
    drawingTransmittalItemDelete.mockResolvedValue({ success: true });
  });

  afterEach(cleanup);

  it("lets a read-only user view notes and attached revision details without mutation controls", async () => {
    can.mockImplementation((action: string) => action === "view");
    renderPanel();

    expect(screen.queryByRole("button", { name: /log transmittal/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View T-001" }));

    expect(screen.getByText("Issued for coordination")).toBeInTheDocument();
    expect(screen.getByText("S101")).toBeInTheDocument();
    expect(screen.getByText("Rev A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("edits header fields and reconciles attached revisions", async () => {
    can.mockReturnValue(true);
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "View T-001" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const subject = screen.getByRole("textbox", { name: "Subject" });
    await userEvent.clear(subject);
    await userEvent.type(subject, "Revised IFC release");
    await userEvent.click(screen.getByRole("checkbox", { name: "Attach S101 revision A" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Attach S102 revision B" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(drawingTransmittalUpdate).toHaveBeenCalledWith(
      "transmittal-1",
      expect.objectContaining({
        transmittal_number: "T-001",
        direction: "incoming",
        received_from: "General Contractor",
        sent_to: null,
        subject: "Revised IFC release",
        date_received: "2026-07-02",
        date_sent: null,
        notes: "Issued for coordination",
      }),
    ));
    await waitFor(() => expect(drawingTransmittalItemDelete).toHaveBeenCalledWith("item-1"));
    expect(drawingTransmittalItemCreate).toHaveBeenCalledWith({
      project_id: "project-1",
      transmittal_id: "transmittal-1",
      drawing_revision_id: "revision-2",
    });
  });

  it("soft-deletes only after exact-number confirmation so attached history remains", async () => {
    can.mockReturnValue(true);
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "View T-001" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmButton = screen.getByRole("button", { name: "Confirm delete" });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox", { name: "Type T-001 to confirm deletion" }), "T-001");
    expect(confirmButton).toBeEnabled();
    await userEvent.click(confirmButton);

    await waitFor(() => expect(drawingTransmittalUpdate).toHaveBeenCalledWith("transmittal-1", { is_deleted: true }));
    expect(drawingTransmittalDelete).not.toHaveBeenCalled();
    expect(drawingTransmittalItemDelete).not.toHaveBeenCalled();
  });

  it("keeps the existing create workflow functional with revision attachments", async () => {
    can.mockReturnValue(true);
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Log transmittal" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Transmittal number" }), "T-002");
    await userEvent.click(screen.getByRole("checkbox", { name: "Attach S102 revision B" }));
    await userEvent.click(screen.getByRole("button", { name: "Save transmittal" }));

    await waitFor(() => expect(drawingTransmittalCreate).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "project-1",
      transmittal_number: "T-002",
      direction: "incoming",
    })));
    await waitFor(() => expect(drawingTransmittalItemCreate).toHaveBeenCalledWith({
      project_id: "project-1",
      transmittal_id: "transmittal-new",
      drawing_revision_id: "revision-2",
    }));
  });
});
